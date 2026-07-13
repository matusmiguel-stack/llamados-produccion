import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import { createAdminClient } from "../../../../lib/supabase-admin"

const FROM = "Retro Casa Productora <news@retrocasaproductora.com>"

// Equipo que siempre recibe el aviso de proyecto aprobado.
const EQUIPO_EMAILS = [
  "miguel@retrocasaproductora.com",
  "rodrigo@retrocasaproductora.com",
  "araceli@retrocasaproductora.com",
  "marco@retrocasaproductora.com",
  "adriana@retrocasaproductora.com",
]

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.retrocasaproductora.com"

const EMPRESA_LABEL: Record<string, string> = {
  retro_studio: "Retro Studio",
  retro_films: "Retro Films",
}

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

function fmtMx(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
}

function buildHtml(params: {
  codigo: string
  nombre: string
  cliente: string
  responsable: string
  empresaLabel: string
  costo: string
  projectUrl: string
}) {
  const { codigo, nombre, cliente, responsable, empresaLabel, costo, projectUrl } = params
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
          <td style="background:#0f172a;padding:28px 32px;">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;">Retro Casa Productora</p>
            <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:#f1f5f9;">Proyecto aprobado ✓</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 0;">
            <p style="margin:0;font-size:15px;color:#334155;">Hola equipo,</p>
            <p style="margin:12px 0 0;font-size:14px;color:#64748b;line-height:1.6;">
              Se acaba de cerrar este proyecto:
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;border-radius:8px;overflow:hidden;">
              ${row("Código de proyecto", codigo, true)}
              ${row("Nombre", nombre)}
              ${row("Cliente", cliente)}
              ${row("Responsable", responsable)}
              ${row("Empresa", empresaLabel)}
              <tr>
                <td style="padding:12px 18px;background:#ecfdf5;width:42%;">
                  <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#059669;">Costo (antes de IVA)</span>
                </td>
                <td style="padding:12px 18px;background:#ecfdf5;font-size:16px;font-weight:700;color:#065f46;font-family:monospace;">${costo}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px;">
            <a href="${projectUrl}" style="display:inline-block;background:#0f172a;color:#f1f5f9;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px;">Ver proyecto →</a>
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

    const {
      projectId,
      projectCode,
      projectName,
      clientName,
      responsableNombre,
      empresa,
      costoSinIva,
    } = await req.json()

    const admin = createAdminClient()

    // Cliente: usar el que venga en el body o resolverlo desde el proyecto
    // (projects.client_id → clients.name), para que el correo aclare de qué
    // cliente es el proyecto aprobado.
    let cliente: string | null = clientName || null
    if (!cliente && projectId) {
      const { data: proj } = await admin
        .from("projects").select("client_id").eq("id", projectId).single()
      if (proj?.client_id) {
        const { data: cli } = await admin
          .from("clients").select("name").eq("id", proj.client_id).single()
        cliente = cli?.name ?? null
      }
    }

    // Email del responsable — buscar por nombre en employees (flexible: con y sin apellido materno)
    let responsableEmail: string | null = null
    if (responsableNombre) {
      const { data: empRows } = await admin
        .from("employees")
        .select("email, nombre, apellido_paterno, apellido_materno")
      const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      const target = norm(responsableNombre)
      const match = (empRows || []).find((e: any) => {
        const full3 = norm([e.nombre, e.apellido_paterno, e.apellido_materno].filter(Boolean).join(" "))
        const full2 = norm([e.nombre, e.apellido_paterno].filter(Boolean).join(" "))
        return full3 === target || full2 === target
      })
      responsableEmail = match?.email ?? null
    }

    // Destinatarios: equipo fijo + responsable (sin duplicados)
    const to = [...new Set([...EQUIPO_EMAILS, ...(responsableEmail ? [responsableEmail] : [])])]

    const costoNum = typeof costoSinIva === "number" ? costoSinIva : parseFloat(costoSinIva) || 0
    const empresaLabel = EMPRESA_LABEL[empresa] || empresa || "—"
    const projectUrl = projectId ? `${APP_URL}/proyectos/${projectId}` : APP_URL

    const html = buildHtml({
      codigo: projectCode || "—",
      nombre: projectName || "—",
      cliente: cliente || "—",
      responsable: responsableNombre || "—",
      empresaLabel,
      costo: fmtMx(costoNum),
      projectUrl,
    })

    const resend = getResend()
    const { error: sendErr } = await resend.emails.send({
      from: FROM,
      to,
      subject: `Proyecto aprobado ✓ — ${[projectCode, projectName].filter(Boolean).join(" ")}`,
      html,
    })
    if (sendErr) return NextResponse.json({ error: sendErr.message }, { status: 500 })

    return NextResponse.json({ ok: true, sentTo: to })
  } catch (err: any) {
    console.error("[notify-aprobado] error:", err?.message)
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 })
  }
}
