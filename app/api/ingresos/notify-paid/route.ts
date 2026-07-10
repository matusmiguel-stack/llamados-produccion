import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import { createAdminClient } from "../../../../lib/supabase-admin"

const FROM = "Retro Casa Productora <news@retrocasaproductora.com>"

// Equipo que recibe el aviso cuando se marca un ingreso como pagado.
const EQUIPO_EMAILS = [
  "miguel@retrocasaproductora.com",
  "rodrigo@retrocasaproductora.com",
  "araceli@retrocasaproductora.com",
  "marco@retrocasaproductora.com",
]

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.retrocasaproductora.com"

const EMPRESA_LABEL: Record<string, string> = {
  retro_studio: "Retro Studio",
  retro_films: "Retro Films",
}

function fmtMx(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "—"
  const [y, m, d] = iso.split("T")[0].split("-").map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })
}

function buildHtml(params: {
  proyecto: string
  cliente: string
  empresaLabel: string
  factura: string
  subtotal: string
  totalConIva: string
  fechaPago: string
  marcadoPor: string
  ingresosUrl: string
}): string {
  const { proyecto, cliente, empresaLabel, factura, subtotal, totalConIva, fechaPago, marcadoPor, ingresosUrl } = params
  const row = (label: string, value: string, mono = false) => `
              <tr>
                <td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;width:42%;">
                  <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">${label}</span>
                </td>
                <td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;font-size:15px;font-weight:600;color:#0f172a;${mono ? "font-family:monospace;" : ""}">${value}</td>
              </tr>`
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:#064e3b;padding:28px 32px;">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6ee7b7;">Retro Casa Productora</p>
            <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:#ecfdf5;">Ingreso pagado ✓</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 0;">
            <p style="margin:0;font-size:15px;color:#334155;">Hola equipo,</p>
            <p style="margin:12px 0 0;font-size:14px;color:#64748b;line-height:1.6;">
              Se marcó como <strong style="color:#059669;">pagado</strong> el siguiente ingreso:
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;border-radius:8px;overflow:hidden;">
              ${row("Proyecto", proyecto)}
              ${row("Cliente / Agencia", cliente)}
              ${row("Empresa", empresaLabel)}
              ${row("Factura", factura, true)}
              ${row("Monto (antes de IVA)", subtotal, true)}
              <tr>
                <td style="padding:12px 18px;background:#ecfdf5;width:42%;">
                  <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#059669;">Total con IVA</span>
                </td>
                <td style="padding:12px 18px;background:#ecfdf5;font-size:16px;font-weight:700;color:#065f46;font-family:monospace;">${totalConIva}</td>
              </tr>
              ${row("Fecha de pago", fechaPago)}
              ${row("Marcado por", marcadoPor)}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px;">
            <a href="${ingresosUrl}" style="display:inline-block;background:#064e3b;color:#ecfdf5;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px;">Ver ingresos →</a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 28px;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">— Retro Casa Productora</p>
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
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { ingresoId } = await req.json()
    if (!ingresoId) return NextResponse.json({ error: "Falta ingresoId" }, { status: 400 })

    const admin = createAdminClient()

    // Fuente de verdad: releer el ingreso desde la BD
    const { data: ing, error: ingErr } = await admin
      .from("ingresos")
      .select("id, empresa, estatus, cliente_agencia, proyecto, numero_factura, subtotal, iva, fecha_pago, project_id")
      .eq("id", ingresoId)
      .single()
    if (ingErr || !ing) return NextResponse.json({ error: "Ingreso no encontrado" }, { status: 404 })
    if (ing.estatus !== "pagado") {
      return NextResponse.json({ error: "El ingreso no está marcado como pagado" }, { status: 400 })
    }

    // Etiquetas de proyecto/cliente: si está vinculado, tomar código/nombre y
    // cliente de la carpeta del proyecto (igual que la vista de ingresos).
    let proyecto = ing.proyecto || "—"
    let cliente = ing.cliente_agencia || "—"
    if (ing.project_id) {
      const { data: proj } = await admin
        .from("projects").select("name, code, client_id").eq("id", ing.project_id).single()
      if (proj) {
        proyecto = proj.code ? `${proj.code} ${proj.name}` : proj.name
        if (proj.client_id) {
          const { data: cli } = await admin
            .from("clients").select("name").eq("id", proj.client_id).single()
          if (cli?.name) cliente = cli.name
        }
      }
    }

    // Nombre de quien marcó el pago
    const { data: profile } = await admin
      .from("profiles").select("full_name, email").eq("id", user.id).single()
    const marcadoPor = profile?.full_name || profile?.email || user.email || "—"

    const subtotal = Number(ing.subtotal || 0)
    const iva = Number(ing.iva || 0)

    const html = buildHtml({
      proyecto,
      cliente,
      empresaLabel: EMPRESA_LABEL[ing.empresa] || ing.empresa || "—",
      factura: ing.numero_factura || "—",
      subtotal: fmtMx(subtotal),
      totalConIva: fmtMx(subtotal + iva),
      fechaPago: fmtFecha(ing.fecha_pago),
      marcadoPor,
      ingresosUrl: `${APP_URL}/ingresos`,
    })

    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error: sendErr } = await resend.emails.send({
      from: FROM,
      to: EQUIPO_EMAILS,
      subject: `Ingreso pagado ✓ — ${proyecto}`,
      html,
    })
    if (sendErr) return NextResponse.json({ error: sendErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, sentTo: EQUIPO_EMAILS })
  } catch (err: any) {
    console.error("[ingresos/notify-paid] error:", err?.message)
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 })
  }
}
