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

// ─── Editar un pago ya registrado ────────────────────────────────────────────
// Diana (o quien sea) a veces sube un archivo equivocado al pagar un anticipo.
// En vez de borrar y volver a registrar, el pago se puede corregir: monto,
// fecha, de dónde salió y los tres archivos (XML, PDF y comprobante).
//
// Los archivos reemplazados NO se borran de Storage: la auditoría
// (activity_log) guarda las rutas anteriores, así que un reemplazo equivocado
// se puede deshacer.

type PagoTipo = "anticipo" | "comprobacion" | "pago"

// Busca el egreso y la factura (pago) ligada. Los editores no pueden leer
// facturas por RLS, por eso todo pasa por aquí con el cliente admin.
async function cargarPago(admin: ReturnType<typeof createAdminClient>, itemId: string) {
  const { data: item } = await admin
    .from("quote_items")
    .select("id, description, pago_tipo, pago_estado, pago_fecha, monto_comprobado, factura_id")
    .eq("id", itemId)
    .maybeSingle()
  if (!item || item.pago_estado !== "pagado") return null

  const cols = "id, origen, status, subtotal, total, forma_pago, fecha_pago, paid_at, concepto, codigo_proyecto, project_id, xml_path, pdf_path, comprobante_path, uuid_fiscal, quote_item_id"
  let factura: any = null
  if (item.factura_id) {
    const { data } = await admin.from("facturas").select(cols).eq("id", item.factura_id).maybeSingle()
    factura = data
  }
  if (!factura) {
    // Pago normal registrado desde el proveedor: la factura apunta al egreso.
    const { data } = await admin.from("facturas").select(cols)
      .eq("quote_item_id", itemId).eq("status", "pagada")
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
    factura = data
  }
  if (!factura) return null

  // Solo los pagos registrados desde la app (no las facturas de proveedor que
  // Finanzas marcó pagadas: su monto es el del CFDI y no se edita aquí).
  const tipo: PagoTipo | null =
    item.pago_tipo === "anticipo" || item.pago_tipo === "comprobacion" || item.pago_tipo === "pago"
      ? item.pago_tipo
      : factura.origen === "anticipo" || factura.origen === "comprobacion" ? factura.origen
      : factura.origen === "pago_directo" ? "pago"
      : null
  if (!tipo) return null
  return { item, factura, tipo }
}

// Nombre legible del archivo: sin la carpeta ni el prefijo "anticipo-<ts>-".
function nombreArchivo(path: string | null): string | null {
  if (!path) return null
  const base = path.split("/").pop() || path
  return base.replace(/^(anticipo|pago|comprobante)-\d+-/, "")
}

// GET ?itemId= → detalle del pago registrado + ligas (10 min) a sus archivos
export async function GET(req: Request) {
  try {
    const auth = await requireStaff(req)
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const { admin, role } = auth

    const itemId = new URL(req.url).searchParams.get("itemId") || ""
    if (!itemId) return NextResponse.json({ error: "Falta el egreso" }, { status: 400 })

    const pago = await cargarPago(admin, itemId)
    if (!pago) return NextResponse.json({ error: "No se encontró el pago registrado de este egreso" }, { status: 404 })
    if (pago.tipo !== "pago" && !STAFF_ROLES.includes(role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }
    const { item, factura, tipo } = pago

    const liga = async (path: string | null) => {
      if (!path) return null
      const { data } = await admin.storage.from("facturas").createSignedUrl(path, 60 * 10)
      return { nombre: nombreArchivo(path), url: data?.signedUrl || null }
    }
    const fechaPago = factura.fecha_pago
      || (factura.paid_at ? new Date(factura.paid_at).toLocaleDateString("sv", { timeZone: "America/Mexico_City" }) : null)
      || item.pago_fecha
      || null

    return NextResponse.json({
      pago: {
        facturaId: factura.id,
        tipo,
        monto: Number(factura.subtotal ?? factura.total ?? 0),
        montoReal: item.monto_comprobado != null ? Number(item.monto_comprobado) : null,
        formaPago: factura.forma_pago || "",
        fechaPago: fechaPago ? String(fechaPago).split("T")[0] : "",
        concepto: factura.concepto || item.description,
        archivos: {
          xml: await liga(factura.xml_path),
          pdf: await liga(factura.pdf_path),
          comprobante: await liga(factura.comprobante_path),
        },
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH con FormData → corregir un pago registrado (monto, fecha, forma y archivos)
export async function PATCH(req: Request) {
  try {
    const auth = await requireStaff(req)
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const { admin, role } = auth

    const form = await req.formData()
    const itemId = String(form.get("itemId") || "")
    const monto = parseFloat(String(form.get("monto") || "0"))
    const montoReal = parseFloat(String(form.get("montoReal") || "0")) || 0
    const formaPago = String(form.get("formaPago") || "").trim()
    const fechaPago = String(form.get("fechaPago") || "").trim()
    const archivo = (campo: string): File | null => {
      const f = form.get(campo)
      return f instanceof File && f.size > 0 ? f : null
    }
    const xmlFile = archivo("xml")
    const pdfFile = archivo("pdf")
    const compFile = archivo("comprobante")
    const compPathParam = String(form.get("comprobantePath") || "").trim() || null
    const quitar = (campo: string) => String(form.get(campo) || "") === "1"

    if (!itemId) return NextResponse.json({ error: "Falta el egreso" }, { status: 400 })
    const pago = await cargarPago(admin, itemId)
    if (!pago) return NextResponse.json({ error: "No se encontró el pago registrado de este egreso" }, { status: 404 })
    const { factura, tipo } = pago
    if (tipo !== "pago" && !STAFF_ROLES.includes(role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    // Mismas reglas que al registrar el pago.
    if (!monto || monto <= 0) return NextResponse.json({ error: "Indica el monto del pago" }, { status: 400 })
    if (tipo === "comprobacion" && (!montoReal || montoReal <= 0)) {
      return NextResponse.json({ error: "Indica el monto real comprobado" }, { status: 400 })
    }
    if (!formaPago) return NextResponse.json({ error: "Indica de dónde salió el pago" }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) {
      return NextResponse.json({ error: "Indica la fecha en que se realizó el pago" }, { status: 400 })
    }
    if (xmlFile && !/\.xml$/i.test(xmlFile.name)) {
      return NextResponse.json({ error: "La factura XML debe ser un archivo .xml" }, { status: 400 })
    }
    if (pdfFile && !/\.pdf$/i.test(pdfFile.name)) {
      return NextResponse.json({ error: "La factura PDF debe ser un archivo .pdf" }, { status: 400 })
    }
    if (compFile && !["application/pdf", "image/jpeg", "image/jpg", "image/png"].includes(compFile.type)) {
      return NextResponse.json({ error: "El comprobante debe ser PDF, JPG o PNG" }, { status: 400 })
    }

    // Cómo quedan los archivos: nuevo → reemplaza; "quitar" → se va; si no, se conserva.
    const tendraXml  = !!xmlFile  || (!quitar("quitarXml") && !!factura.xml_path)
    const tendraPdf  = !!pdfFile  || (!quitar("quitarPdf") && !!factura.pdf_path)
    const tendraComp = !!compFile || !!compPathParam || (!quitar("quitarComprobante") && !!factura.comprobante_path)
    if (tipo === "anticipo" && FORMAS_CON_FACTURA.includes(formaPago) && (!tendraXml || !tendraPdf)) {
      return NextResponse.json(
        { error: `Para un anticipo pagado por ${formaPago}, el XML y el PDF de la factura son obligatorios` },
        { status: 400 },
      )
    }
    if (formaPago !== "Efectivo" && !tendraComp) {
      return NextResponse.json({ error: "Sube el comprobante de pago del banco (PDF o JPG)" }, { status: 400 })
    }

    // Pago normal con XML nuevo: que no sea una factura ya registrada.
    let uuidFiscal: string | null | undefined = undefined
    if (tipo === "pago" && xmlFile) {
      uuidFiscal = parseUuidFiscal(await xmlFile.text())
      if (uuidFiscal) {
        const { data: dup } = await admin.from("facturas").select("id")
          .eq("uuid_fiscal", uuidFiscal).neq("status", "rechazada").neq("id", factura.id).limit(1)
        if (dup && dup.length > 0) {
          return NextResponse.json({ error: `Esta factura (folio fiscal ${uuidFiscal}) ya está registrada` }, { status: 409 })
        }
      }
    } else if (tipo === "pago" && quitar("quitarXml") && !xmlFile) {
      uuidFiscal = null
    }

    // Subir lo nuevo (misma carpeta y nombres que al registrar).
    const stamp = Date.now()
    const safe = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_")
    const folder = factura.codigo_proyecto || factura.project_id || "sin-codigo"
    const prefijo = tipo === "pago" ? "pago" : "anticipo"
    const subir = async (file: File, nombre: string, contentType: string) => {
      const up = await admin.storage.from("facturas")
        .upload(`${folder}/${nombre}`, Buffer.from(await file.arrayBuffer()), { contentType })
      if (up.error) throw new Error(`No se pudo guardar ${file.name}: ${up.error.message}`)
      return up.data.path
    }

    let xmlPath: string | null = quitar("quitarXml") ? null : factura.xml_path
    let pdfPath: string | null = quitar("quitarPdf") ? null : factura.pdf_path
    let comprobantePath: string | null = quitar("quitarComprobante") ? null : factura.comprobante_path
    if (xmlFile) xmlPath = await subir(xmlFile, `${prefijo}-${stamp}-${safe(xmlFile.name)}`, "text/xml")
    if (pdfFile) pdfPath = await subir(pdfFile, `${prefijo}-${stamp}-${safe(pdfFile.name)}`, "application/pdf")
    if (compPathParam) {
      const { error: checkErr } = await admin.storage.from("facturas").createSignedUrl(compPathParam, 60)
      if (checkErr) {
        return NextResponse.json({ error: "El comprobante no se encontró en el storage; vuelve a subirlo" }, { status: 400 })
      }
      comprobantePath = compPathParam
    } else if (compFile) {
      comprobantePath = await subir(compFile, `comprobante-${stamp}-${safe(compFile.name)}`, compFile.type)
    }

    const facturaPayload: Record<string, unknown> = {
      subtotal: monto,
      total: monto, // pago interno: el monto capturado es el que salió de caja
      forma_pago: formaPago,
      fecha_pago: fechaPago,
      paid_at: new Date(fechaPago + "T12:00:00").toISOString(),
      xml_path: xmlPath,
      pdf_path: pdfPath,
      comprobante_path: comprobantePath,
    }
    if (tipo === "pago") {
      // Con factura adjunta es factura de proveedor; sin ella, pago sin factura.
      facturaPayload.origen = xmlPath || pdfPath ? "proveedor" : "pago_directo"
      if (uuidFiscal !== undefined) facturaPayload.uuid_fiscal = uuidFiscal
    }
    const { error: facErr } = await admin.from("facturas").update(facturaPayload).eq("id", factura.id)
    if (facErr) return NextResponse.json({ error: facErr.message }, { status: 500 })

    // El egreso: fecha real del pago y, en comprobación, el monto real.
    // (No se tocan los reales ni el monto original del egreso.)
    const itemPayload: Record<string, unknown> = { pago_fecha: fechaPago }
    if (tipo === "comprobacion") itemPayload.monto_comprobado = montoReal
    const { error: updErr } = await admin.from("quote_items").update(itemPayload).eq("id", itemId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
