import { NextResponse } from "next/server"
import { Resend } from "resend"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { createClient } from "@supabase/supabase-js"

const FROM = "Retro Casa Productora <news@retrocasaproductora.com>"

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

const EMPRESA_LABELS: Record<string, { name: string; rfc: string; direccion: string }> = {
  retro_studio: {
    name: "Retro Studio S.A. de C.V.",
    rfc: "RST000000XXX",   // ← actualizar con RFC real
    direccion: "Ciudad de México, México",
  },
  retro_films: {
    name: "Retro Films S.A. de C.V.",
    rfc: "RFI000000XXX",   // ← actualizar con RFC real
    direccion: "Ciudad de México, México",
  },
}

function buildHtml(params: {
  proveedorNombre: string
  proyectoLabel: string
  empresaLabel: string
  empresaRfc: string
  empresaDireccion: string
  itemDescription: string
  monto: string
}) {
  const { proveedorNombre, proyectoLabel, empresaLabel, empresaRfc, empresaDireccion, itemDescription, monto } = params
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

        <!-- Header -->
        <tr>
          <td style="background:#0f172a;padding:28px 32px;">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;">Retro Casa Productora</p>
            <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:#f1f5f9;">Instrucciones de Facturación</p>
          </td>
        </tr>

        <!-- Saludo -->
        <tr>
          <td style="padding:28px 32px 0;">
            <p style="margin:0;font-size:15px;color:#334155;">Hola <strong>${proveedorNombre}</strong>,</p>
            <p style="margin:12px 0 0;font-size:14px;color:#64748b;line-height:1.6;">
              A continuación encontrarás los datos necesarios para emitir tu factura correspondiente al proyecto:
            </p>
          </td>
        </tr>

        <!-- Proyecto -->
        <tr>
          <td style="padding:20px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;border-radius:8px;overflow:hidden;">
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Proyecto</p>
                  <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#0f172a;">${proyectoLabel}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Concepto</p>
                  <p style="margin:4px 0 0;font-size:14px;color:#1e293b;">${itemDescription}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Monto a facturar</p>
                  <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#0f172a;">${monto} <span style="font-size:12px;font-weight:400;color:#64748b;">+ IVA</span></p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Datos de facturación -->
        <tr>
          <td style="padding:20px 32px 0;">
            <p style="margin:0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Facturar a nombre de</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
              <tr>
                <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;font-size:11px;color:#94a3b8;">Razón social</p>
                  <p style="margin:3px 0 0;font-size:14px;font-weight:600;color:#0f172a;">${empresaLabel}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;font-size:11px;color:#94a3b8;">RFC</p>
                  <p style="margin:3px 0 0;font-size:14px;font-weight:600;color:#0f172a;">${empresaRfc}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 18px;">
                  <p style="margin:0;font-size:11px;color:#94a3b8;">Domicilio fiscal</p>
                  <p style="margin:3px 0 0;font-size:14px;color:#1e293b;">${empresaDireccion}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Instrucciones -->
        <tr>
          <td style="padding:20px 32px 0;">
            <p style="margin:0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Instrucciones para facturar</p>
            <div style="margin-top:10px;padding:16px 18px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;">
              <p style="margin:0;font-size:14px;color:#92400e;line-height:1.7;">
                [INSTRUCCIONES DE FACTURACIÓN — PRÓXIMAMENTE]<br>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aquí irán las instrucciones de facturación específicas para proveedores.
              </p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">
              Si tienes alguna duda, responde a este correo o contáctanos directamente.
            </p>
            <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">— Retro Casa Productora</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function POST(req: Request) {
  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { proveedorId, itemDescription, monto, proyectoLabel, empresa } = await req.json()
    if (!proveedorId) return NextResponse.json({ error: "Falta proveedorId" }, { status: 400 })

    const admin = createAdminClient()
    const { data: prov, error: provErr } = await admin
      .from("proveedores")
      .select("nombre, apellido, empresa, email")
      .eq("id", proveedorId)
      .single()

    if (provErr || !prov) return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 })
    if (!prov.email) return NextResponse.json({ error: "El proveedor no tiene email registrado" }, { status: 400 })

    const empresaInfo = EMPRESA_LABELS[empresa] || EMPRESA_LABELS.retro_studio
    const proveedorNombre = prov.empresa
      ? `${prov.empresa} (${prov.nombre} ${prov.apellido})`
      : `${prov.nombre} ${prov.apellido}`

    const html = buildHtml({
      proveedorNombre,
      proyectoLabel,
      empresaLabel: empresaInfo.name,
      empresaRfc: empresaInfo.rfc,
      empresaDireccion: empresaInfo.direccion,
      itemDescription,
      monto,
    })

    const resend = getResend()
    const { error: sendErr } = await resend.emails.send({
      from: FROM,
      to: prov.email,
      subject: `Datos de facturación — ${proyectoLabel}`,
      html,
    })

    if (sendErr) return NextResponse.json({ error: sendErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, sentTo: prov.email })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
