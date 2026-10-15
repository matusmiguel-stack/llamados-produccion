import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiUser } from "../../../../lib/api-auth"
import { parseUuidFiscal } from "../../../../lib/cfdi"

const STAFF_ROLES = ["admin", "editor", "editor_premium"]
// Finanzas también puede registrar el pago normal de un egreso (desde el
// detalle del proveedor); anticipos y comprobaciones siguen siendo de staff.
const PAGO_ROLES = [...STAFF_ROLES, "finanzas"]

// Formas de pago que sí obligan a adjuntar la factura del anticipo.
// Debe coincidir con FORMAS_CON_FACTURA en EgresosPanel.tsx.
const FORMAS_CON_FACTURA = ["Retro Studio", "Retro Films"]

async function requireStaff(req: Request) {
  const user = await verifyApiUser(req)
  if (!user) return null
  // admin client con el actor → atribuye los egresos al usuario en la auditoría
  const admin = createAdminClient(user.id)
  const { data: profile } = await admin
    .from("profiles").select("role").eq("id", user.id).single()
  if (!profile || !PAGO_ROLES.includes(profile.role)) return null
  return { user, admin, role: profile.role as string }
}

function todayISO(): string {
  return new Date().toLocaleDateString("sv", { timeZone: "America/Mexico_City" })
}

// POST con FormData → registrar un pago (anticipo o comprobación) desde el control de egresos
export async function POST(req: Request) {
  try {
    const auth = await requireStaff(req)
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const { admin, role } = auth

    const form = await req.formData()
    const itemId = String(form.get("itemId") || "")
    // 'anticipo' | 'comprobacion' (control de egresos) | 'pago' (pago normal del
    // egreso a un proveedor que no factura por el portal; factura opcional)
    const tipo = String(form.get("tipo") || "")
    const monto = parseFloat(String(form.get("monto") || "0"))
    const concepto = String(form.get("concepto") || "").trim()
    const proveedorId = String(form.get("proveedorId") || "") || null
    const projectId = String(form.get("projectId") || "") || null
    const codigoProyecto = String(form.get("codigo") || "").trim() || null
    const formaPago = String(form.get("formaPago") || "").trim() || null
    const montoReal = parseFloat(String(form.get("montoReal") || "0")) || 0
    const sectionId = String(form.get("sectionId") || "") || null
    const fechaPago = String(form.get("fechaPago") || "").trim()
    const xmlFile = form.get("xml") as File | null
    const pdfFile = form.get("pdf") as File | null
    const compRaw = form.get("comprobante")
    const compFile = compRaw instanceof File && compRaw.size > 0 ? compRaw : null
    // Ruta del comprobante ya subido a Storage con URL firmada (los archivos
    // grandes no pueden viajar por Vercel: corta requests > 4.5 MB)
    const compPathParam = String(form.get("comprobantePath") || "").trim() || null

    if (!["anticipo", "comprobacion", "pago"].includes(tipo)) {
      return NextResponse.json({ error: "Tipo de pago no válido" }, { status: 400 })
    }
    if (tipo !== "pago" && !STAFF_ROLES.includes(role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }
    if (!itemId || !tipo || !monto || monto <= 0) {
      return NextResponse.json({ error: "Faltan datos del pago" }, { status: 400 })
    }
    if (!formaPago) {
      return NextResponse.json({ error: "Indica de dónde salió el pago" }, { status: 400 })
    }
    // Fecha real del pago — obligatoria para anticipo y comprobación.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) {
      return NextResponse.json({ error: "Indica la fecha en que se realizó el pago" }, { status: 400 })
    }
    // El anticipo solo exige factura cuando el pago sale de una de las empresas.
    // En efectivo (o por Konfio/Banregio) es opcional, pero si la suben se guarda.
    if (tipo === "anticipo" && FORMAS_CON_FACTURA.includes(formaPago) && (!xmlFile || !pdfFile)) {
      return NextResponse.json(
        { error: `Para un anticipo pagado por ${formaPago}, el XML y el PDF de la factura son obligatorios` },
        { status: 400 },
      )
    }
    // Comprobante de pago del banco — obligatorio salvo que el pago haya sido
    // en efectivo (ahí no siempre hay un respaldo bancario que subir).
    if (formaPago !== "Efectivo" && !compFile && !compPathParam) {
      return NextResponse.json({ error: "Sube el comprobante de pago del banco (PDF o JPG)" }, { status: 400 })
    }
    if (compFile && !["application/pdf", "image/jpeg", "image/jpg", "image/png"].includes(compFile.type)) {
      return NextResponse.json({ error: "El comprobante debe ser PDF, JPG o PNG" }, { status: 400 })
    }

    // Pago normal: no pagar dos veces el mismo egreso, y si suben el XML que no
    // sea una factura ya registrada (p.ej. que después llegue por el portal).
    let uuidFiscal: string | null = null
    if (tipo === "pago") {
      const { data: item } = await admin.from("quote_items").select("pago_estado").eq("id", itemId).maybeSingle()
      if (!item) return NextResponse.json({ error: "No se encontró el egreso" }, { status: 404 })
      if (item.pago_estado === "pagado") {
        return NextResponse.json({ error: "Este egreso ya está marcado como pagado" }, { status: 409 })
      }
      if (xmlFile && xmlFile.size > 0) {
        if (!/\.xml$/i.test(xmlFile.name)) {
          return NextResponse.json({ error: "La factura XML debe ser un archivo .xml" }, { status: 400 })
        }
        uuidFiscal = parseUuidFiscal(await xmlFile.text())
        if (uuidFiscal) {
          const { data: dup } = await admin.from("facturas").select("id").eq("uuid_fiscal", uuidFiscal).neq("status", "rechazada").limit(1)
          if (dup && dup.length > 0) {
            return NextResponse.json({ error: `Esta factura (folio fiscal ${uuidFiscal}) ya está registrada` }, { status: 409 })
          }
        }
      }
      if (pdfFile && pdfFile.size > 0 && !/\.pdf$/i.test(pdfFile.name)) {
        return NextResponse.json({ error: "La factura PDF debe ser un archivo .pdf" }, { status: 400 })
      }
    }

    // Email del proveedor (para el registro en facturas)
    let proveedorEmail: string | null = null
    if (proveedorId) {
      const { data: prov } = await admin.from("proveedores").select("email").eq("id", proveedorId).maybeSingle()
      proveedorEmail = prov?.email || null
    }

    // Subir archivos
    const stamp = Date.now()
    const safe = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_")
    const folder = codigoProyecto || projectId || "sin-codigo"

    let xmlPath: string | null = null
    let pdfPath: string | null = null
    if (tipo === "anticipo" && xmlFile && pdfFile) {
      const xmlUp = await admin.storage.from("facturas")
        .upload(`${folder}/anticipo-${stamp}-${safe(xmlFile.name)}`, Buffer.from(await xmlFile.arrayBuffer()), { contentType: "text/xml" })
      if (!xmlUp.error) xmlPath = xmlUp.data.path
      const pdfUp = await admin.storage.from("facturas")
        .upload(`${folder}/anticipo-${stamp}-${safe(pdfFile.name)}`, Buffer.from(await pdfFile.arrayBuffer()), { contentType: "application/pdf" })
      if (!pdfUp.error) pdfPath = pdfUp.data.path
    }
    // Pago normal: la factura es opcional y se puede subir solo XML, solo PDF o ambos.
    if (tipo === "pago") {
      if (xmlFile && xmlFile.size > 0) {
        const up = await admin.storage.from("facturas")
          .upload(`${folder}/pago-${stamp}-${safe(xmlFile.name)}`, Buffer.from(await xmlFile.arrayBuffer()), { contentType: "text/xml" })
        if (up.error) return NextResponse.json({ error: `No se pudo guardar el XML: ${up.error.message}` }, { status: 500 })
        xmlPath = up.data.path
      }
      if (pdfFile && pdfFile.size > 0) {
        const up = await admin.storage.from("facturas")
          .upload(`${folder}/pago-${stamp}-${safe(pdfFile.name)}`, Buffer.from(await pdfFile.arrayBuffer()), { contentType: "application/pdf" })
        if (up.error) return NextResponse.json({ error: `No se pudo guardar el PDF: ${up.error.message}` }, { status: 500 })
        pdfPath = up.data.path
      }
    }

    // Comprobante de pago del banco (obligatorio salvo efectivo, validado arriba)
    let comprobantePath: string | null = null
    if (compPathParam) {
      const { error: checkErr } = await admin.storage.from("facturas").createSignedUrl(compPathParam, 60)
      if (checkErr) {
        return NextResponse.json({ error: "El comprobante no se encontró en el storage; vuelve a subirlo" }, { status: 400 })
      }
      comprobantePath = compPathParam
    } else if (compFile) {
      const compUp = await admin.storage.from("facturas")
        .upload(`${folder}/comprobante-${stamp}-${safe(compFile.name)}`, Buffer.from(await compFile.arrayBuffer()), { contentType: compFile.type })
      if (compUp.error) {
        return NextResponse.json({ error: `No se pudo guardar el comprobante: ${compUp.error.message}` }, { status: 500 })
      }
      comprobantePath = compUp.data.path
    }

    // Crear el registro en facturas como pago realizado
    const { data: factura, error: facErr } = await admin
      .from("facturas")
      .insert({
        proveedor_id: proveedorId,
        project_id: projectId,
        proveedor_email: proveedorEmail,
        codigo_proyecto: codigoProyecto,
        concepto: concepto || null,
        subtotal: monto,
        total: monto, // pago interno: el monto capturado es el que sale de caja
        status: "pagada",
        // Pago normal con factura = factura del proveedor (subida por nosotros);
        // sin factura (p.ej. efectivo) queda como "pago sin factura".
        origen: tipo === "pago" ? (xmlPath || pdfPath ? "proveedor" : "pago_directo") : tipo,
        ...(tipo === "pago" ? { quote_item_id: itemId, uuid_fiscal: uuidFiscal } : {}),
        forma_pago: formaPago,
        // Fecha real del pago (puede ser días antes de hoy).
        fecha_pago: fechaPago,
        paid_at: new Date(fechaPago + "T12:00:00").toISOString(),
        xml_path: xmlPath,
        pdf_path: pdfPath,
        comprobante_path: comprobantePath,
      })
      .select("id")
      .single()
    if (facErr) return NextResponse.json({ error: facErr.message }, { status: 500 })

    // Marcar el egreso original como pagado (conserva su monto original).
    const updatePayload: Record<string, unknown> = {
      pago_tipo: tipo, pago_estado: "pagado", factura_id: factura.id, pago_fecha: fechaPago,
    }
    if (tipo === "comprobacion") updatePayload.monto_comprobado = montoReal || monto
    const { error: updErr } = await admin
      .from("quote_items")
      .update(updatePayload)
      .eq("id", itemId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    // Comprobación con excedente → línea de reembolso (nuevo egreso + factura por pagar)
    let reembolso = 0
    if (tipo === "comprobacion" && montoReal > monto + 0.009 && sectionId) {
      reembolso = Math.round((montoReal - monto) * 100) / 100

      // Orden al final de la sección
      const { data: ordRows } = await admin
        .from("quote_items").select("order_index").eq("section_id", sectionId)
      const maxOrder = Math.max(0, ...(ordRows || []).map((r: any) => r.order_index || 0))

      // Nueva línea de gasto (reembolso) — cuenta como gasto real en la liberación
      const { data: nuevoItem } = await admin
        .from("quote_items")
        .insert({
          section_id: sectionId,
          description: `Reembolso — ${concepto || "comprobación"}`,
          qty: 0, days: 0, unit_price: 0,
          released_expense: 0, real_expense: 0,
          order_index: maxOrder + 1,
          is_extra: true,
          actual_qty: 1, actual_days: 1, actual_unit_price: reembolso,
          actual_supplier_id: proveedorId,
        })
        .select("id")
        .single()

      // Registro en Finanzas como REEMBOLSO por pagar
      const { data: facReemb } = await admin
        .from("facturas")
        .insert({
          proveedor_id: proveedorId,
          project_id: projectId,
          proveedor_email: proveedorEmail,
          codigo_proyecto: codigoProyecto,
          concepto: `Reembolso — ${concepto || ""}`.trim(),
          subtotal: reembolso,
          total: reembolso,
          status: "aceptada",      // por pagar
          origen: "reembolso",
          fecha_pago: todayISO(),
        })
        .select("id")
        .single()

      if (nuevoItem && facReemb) {
        await admin.from("quote_items").update({ factura_id: facReemb.id }).eq("id", nuevoItem.id)
      }
    }

    return NextResponse.json({ ok: true, facturaId: factura.id, pago_estado: "pagado", reembolso })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
