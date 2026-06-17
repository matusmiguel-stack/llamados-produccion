import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiUser } from "../../../../lib/api-auth"

const STAFF_ROLES = ["admin", "editor", "editor_premium"]

async function requireStaff(req: Request) {
  const user = await verifyApiUser(req)
  if (!user) return null
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles").select("role").eq("id", user.id).single()
  if (!profile || !STAFF_ROLES.includes(profile.role)) return null
  return { user, admin }
}

function todayISO(): string {
  return new Date().toLocaleDateString("sv", { timeZone: "America/Mexico_City" })
}

// POST con FormData → registrar un pago (anticipo o comprobación) desde el control de egresos
export async function POST(req: Request) {
  try {
    const auth = await requireStaff(req)
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const { admin } = auth

    const form = await req.formData()
    const itemId = String(form.get("itemId") || "")
    const tipo = String(form.get("tipo") || "")            // 'anticipo' | 'comprobacion'
    const monto = parseFloat(String(form.get("monto") || "0"))
    const concepto = String(form.get("concepto") || "").trim()
    const proveedorId = String(form.get("proveedorId") || "") || null
    const projectId = String(form.get("projectId") || "") || null
    const codigoProyecto = String(form.get("codigo") || "").trim() || null
    const formaPago = String(form.get("formaPago") || "").trim() || null
    const xmlFile = form.get("xml") as File | null
    const pdfFile = form.get("pdf") as File | null

    if (!itemId || !tipo || !monto || monto <= 0) {
      return NextResponse.json({ error: "Faltan datos del pago" }, { status: 400 })
    }
    if (!formaPago) {
      return NextResponse.json({ error: "Indica de dónde salió el pago" }, { status: 400 })
    }
    if (tipo === "anticipo" && (!xmlFile || !pdfFile)) {
      return NextResponse.json({ error: "Para anticipo, el XML y el PDF de la factura son obligatorios" }, { status: 400 })
    }

    // Email del proveedor (para el registro en facturas)
    let proveedorEmail: string | null = null
    if (proveedorId) {
      const { data: prov } = await admin.from("proveedores").select("email").eq("id", proveedorId).maybeSingle()
      proveedorEmail = prov?.email || null
    }

    // Subir archivos (solo anticipo)
    let xmlPath: string | null = null
    let pdfPath: string | null = null
    if (tipo === "anticipo" && xmlFile && pdfFile) {
      const stamp = Date.now()
      const safe = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_")
      const folder = codigoProyecto || projectId || "sin-codigo"
      const xmlUp = await admin.storage.from("facturas")
        .upload(`${folder}/anticipo-${stamp}-${safe(xmlFile.name)}`, Buffer.from(await xmlFile.arrayBuffer()), { contentType: "text/xml" })
      if (!xmlUp.error) xmlPath = xmlUp.data.path
      const pdfUp = await admin.storage.from("facturas")
        .upload(`${folder}/anticipo-${stamp}-${safe(pdfFile.name)}`, Buffer.from(await pdfFile.arrayBuffer()), { contentType: "application/pdf" })
      if (!pdfUp.error) pdfPath = pdfUp.data.path
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
        status: "pagada",
        origen: tipo,
        forma_pago: formaPago,
        fecha_pago: todayISO(),
        paid_at: new Date().toISOString(),
        xml_path: xmlPath,
        pdf_path: pdfPath,
      })
      .select("id")
      .single()
    if (facErr) return NextResponse.json({ error: facErr.message }, { status: 500 })

    // Marcar el egreso. Ambos quedan pagados en un solo paso; para comprobación
    // el monto capturado es el real, así que actualizamos el gasto en la liberación.
    const updatePayload: Record<string, unknown> = {
      pago_tipo: tipo, pago_estado: "pagado", factura_id: factura.id,
    }
    if (tipo === "comprobacion") {
      updatePayload.monto_comprobado = monto
      updatePayload.actual_qty = 1
      updatePayload.actual_days = 1
      updatePayload.actual_unit_price = monto
    }
    const { error: updErr } = await admin
      .from("quote_items")
      .update(updatePayload)
      .eq("id", itemId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, facturaId: factura.id, pago_estado: "pagado" })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
