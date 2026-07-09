import { NextResponse } from "next/server"
import { Resend } from "resend"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiUser } from "../../../../lib/api-auth"

const FROM = "Retro Casa Productora <news@retrocasaproductora.com>"
const CC_EMAILS = ["finanzas@retrocasaproductora.com", "miguel@retrocasaproductora.com"]

async function requireFinanzasRole(req: Request) {
  const user = await verifyApiUser(req)
  if (!user) return null
  // admin client con el actor: atribuye los movimientos (marcar pago, etc.)
  // al usuario real en el historial de auditoría.
  const admin = createAdminClient(user.id)
  const { data: profile } = await admin
    .from("profiles").select("role").eq("id", user.id).single()
  if (!profile || !["admin", "finanzas"].includes(profile.role)) return null
  return { user, admin }
}

// GET → lista de facturas con datos del proveedor y proyecto
export async function GET(req: Request) {
  const auth = await requireFinanzasRole(req)
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { data: facturas, error } = await auth.admin
    .from("facturas")
    .select(`
      id, proveedor_id, project_id, proveedor_email, codigo_proyecto, subtotal, total, status, motivo_rechazo,
      fecha_pago, paid_at, uuid_fiscal, xml_path, pdf_path, comprobante_path, created_at,
      concepto, origen, forma_pago,
      proveedores ( nombre, apellido, empresa ),
      projects ( name, code )
    `)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ facturas: facturas || [] })
}

const COMPROBANTE_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
}

// POST → acciones: marcar pagada (multipart, con comprobante), generar link de descarga
export async function POST(req: Request) {
  const auth = await requireFinanzasRole(req)
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  let action: string, facturaId: string | null = null, path: string | null = null
  let comprobante: File | null = null
  let comprobantePathParam: string | null = null
  const contentType = req.headers.get("content-type") || ""
  if (contentType.includes("multipart/form-data")) {
    const fd = await req.formData()
    action = String(fd.get("action") || "")
    facturaId = fd.get("facturaId") ? String(fd.get("facturaId")) : null
    const file = fd.get("comprobante")
    comprobante = file instanceof File && file.size > 0 ? file : null
  } else {
    const body = await req.json()
    ;({ action, facturaId, path } = body)
    comprobantePathParam = body.comprobantePath ? String(body.comprobantePath) : null
  }

  if (action === "download" && path) {
    const { data, error } = await auth.admin.storage
      .from("facturas")
      .createSignedUrl(path, 60 * 10) // 10 minutos
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ url: data.signedUrl })
  }

  if (action === "mark-paid" && facturaId) {
    const { data: factura, error: facErr } = await auth.admin
      .from("facturas")
      .select("id, status, subtotal, proveedor_email, codigo_proyecto, proveedores ( nombre, apellido, empresa ), projects ( name, code )")
      .eq("id", facturaId)
      .single()
    if (facErr || !factura) return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    if (factura.status !== "aceptada") {
      return NextResponse.json({ error: "Solo se pueden marcar como pagadas las facturas aceptadas" }, { status: 400 })
    }

    // Comprobante de pago del banco: obligatorio para marcar pagada.
    // Llega como ruta de Storage (subida directa con URL firmada — los
    // archivos grandes truenan si viajan por Vercel) o como archivo chico.
    let comprobantePath: string
    if (comprobantePathParam) {
      const { error: checkErr } = await auth.admin.storage
        .from("facturas").createSignedUrl(comprobantePathParam, 60)
      if (checkErr) {
        return NextResponse.json({ error: "El comprobante no se encontró en el storage; vuelve a subirlo" }, { status: 400 })
      }
      comprobantePath = comprobantePathParam
    } else if (comprobante) {
      if (!COMPROBANTE_TYPES[comprobante.type]) {
        return NextResponse.json({ error: "El comprobante debe ser PDF, JPG o PNG" }, { status: 400 })
      }
      const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_")
      const folder = factura.codigo_proyecto || "sin-codigo"
      const compUpload = await auth.admin.storage
        .from("facturas")
        .upload(`${folder}/comprobante-${Date.now()}-${safeName(comprobante.name)}`,
          Buffer.from(await comprobante.arrayBuffer()), { contentType: comprobante.type })
      if (compUpload.error) {
        return NextResponse.json({ error: `No se pudo guardar el comprobante: ${compUpload.error.message}` }, { status: 500 })
      }
      comprobantePath = compUpload.data.path
    } else {
      return NextResponse.json({ error: "Sube el comprobante de pago del banco (PDF o JPG) para marcar la factura como pagada" }, { status: 400 })
    }

    const { error: updErr } = await auth.admin
      .from("facturas")
      .update({ status: "pagada", paid_at: new Date().toISOString(), comprobante_path: comprobantePath })
      .eq("id", facturaId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    // Aviso al proveedor
    const prov: any = factura.proveedores
    const proj: any = factura.projects
    const provNombre = prov?.empresa || `${prov?.nombre || ""} ${prov?.apellido || ""}`.trim() || "Proveedor"
    const proyectoLabel = proj ? `${proj.code || ""} ${proj.name || ""}`.trim() : factura.codigo_proyecto || ""
    const fmtMx = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)

    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: FROM,
        to: factura.proveedor_email,
        cc: CC_EMAILS,
        subject: `Pago realizado — ${proyectoLabel}`,
        html: `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:#0f172a;padding:28px 32px;">
          <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;">Retro Casa Productora</p>
          <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:#f1f5f9;">Pago Realizado 💸</p>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0;font-size:15px;color:#334155;">Hola <strong>${provNombre}</strong>,</p>
          <p style="margin:12px 0 0;font-size:14px;color:#64748b;line-height:1.7;">
            Te informamos que el pago de tu factura del proyecto <strong>${proyectoLabel}</strong> por
            <strong>${fmtMx(Number(factura.subtotal || 0))} + IVA</strong> ya fue realizado.
            Recuerda enviar tu complemento de pago (CFDI) con el folio fiscal (UUID) correspondiente a
            <a href="mailto:finanzas@retrocasaproductora.com" style="color:#0ea5e9;text-decoration:none;">finanzas@retrocasaproductora.com</a>.
          </p>
          <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;">— Retro Casa Productora</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
      })
    } catch { /* el pago ya quedó marcado; el correo es secundario */ }

    return NextResponse.json({ ok: true, comprobante_path: comprobantePath })
  }

  return NextResponse.json({ error: "Acción inválida" }, { status: 400 })
}
