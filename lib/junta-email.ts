import { Resend } from "resend"
import { createAdminClient } from "./supabase-admin"

let _resend: Resend | null = null
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

const FROM = process.env.RESEND_FROM || "Retro Casa <noreply@retrocasa.com>"

// ── ICS generator ─────────────────────────────────────────────────────────────

function generateICS(junta: {
  id: string
  tipo: string
  fecha: string
  hora_inicio: string
  hora_fin?: string | null
  notas?: string | null
  link?: string | null
}): string {
  const stamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z"

  const dtDate = junta.fecha.replace(/-/g, "")
  const dtStart = junta.hora_inicio
    ? `DTSTART;TZID=America/Mexico_City:${dtDate}T${junta.hora_inicio.replace(":", "")}00`
    : `DTSTART;VALUE=DATE:${dtDate}`

  const endTime = junta.hora_fin || junta.hora_inicio
  const dtEnd = junta.hora_inicio
    ? `DTEND;TZID=America/Mexico_City:${dtDate}T${endTime.replace(":", "")}00`
    : `DTEND;VALUE=DATE:${dtDate}`

  const icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Retro Casa Productora//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:junta-${junta.id}@retrocasa.com`,
    `DTSTAMP:${stamp}`,
    dtStart,
    dtEnd,
    `SUMMARY:${(junta as any).titulo ? `${junta.tipo}: ${(junta as any).titulo}` : junta.tipo} — Retro Casa Productora`,
    junta.link ? `LOCATION:${junta.link}` : null,
    junta.notas
      ? `DESCRIPTION:${junta.notas.replace(/\n/g, "\\n").replace(/,/g, "\\,")}`
      : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n")

  return icsLines
}

// ── Email HTML builder ────────────────────────────────────────────────────────

function buildEmailHtml(junta: {
  tipo: string
  fecha: string
  hora_inicio: string
  hora_fin?: string | null
  notas?: string | null
  link?: string | null
}): string {
  const emoji = junta.tipo === "Brief" ? "📋" : junta.tipo === "PPM" ? "🎬" : "🤝"

  const [year, month, day] = junta.fecha.split("-")
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"]
  const fechaLabel = `${parseInt(day)} de ${meses[parseInt(month) - 1]} de ${year}`

  const horaLabel = junta.hora_fin
    ? `${junta.hora_inicio} – ${junta.hora_fin} hrs`
    : `${junta.hora_inicio} hrs`

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#131a2e;border:1px solid rgba(148,163,184,0.15);border-radius:16px;overflow:hidden;max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e1b4b,#0f172a);padding:28px 32px;text-align:center;">
            <p style="margin:0;color:#a78bfa;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Retro Casa Productora</p>
            <h1 style="margin:8px 0 0;color:#f8fafc;font-size:26px;font-weight:700;">${emoji} ${junta.tipo}</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:28px 32px;">

            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:12px 16px;background:rgba(255,255,255,0.04);border-radius:10px;border-left:3px solid #a78bfa;">
                  <p style="margin:0;color:#64748b;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Fecha</p>
                  <p style="margin:4px 0 0;color:#f8fafc;font-size:16px;font-weight:600;">${fechaLabel}</p>
                </td>
              </tr>
              <tr><td style="height:10px;"></td></tr>
              <tr>
                <td style="padding:12px 16px;background:rgba(255,255,255,0.04);border-radius:10px;border-left:3px solid #38bdf8;">
                  <p style="margin:0;color:#64748b;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Hora</p>
                  <p style="margin:4px 0 0;color:#f8fafc;font-size:16px;font-weight:600;">${horaLabel}</p>
                </td>
              </tr>
              ${junta.link ? `
              <tr><td style="height:10px;"></td></tr>
              <tr>
                <td style="text-align:center;padding-top:6px;">
                  <a href="${junta.link}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:700;">🔗 Unirse a la reunión</a>
                </td>
              </tr>` : ""}
              ${junta.notas ? `
              <tr><td style="height:16px;"></td></tr>
              <tr>
                <td style="padding:12px 16px;background:rgba(255,255,255,0.03);border-radius:10px;border:1px solid rgba(148,163,184,0.10);">
                  <p style="margin:0;color:#64748b;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Notas</p>
                  <p style="margin:6px 0 0;color:#cbd5e1;font-size:14px;line-height:1.6;">${junta.notas.replace(/\n/g, "<br>")}</p>
                </td>
              </tr>` : ""}
            </table>

            <p style="margin:24px 0 0;color:#475569;font-size:12px;text-align:center;">
              Este evento fue creado en el sistema interno de Retro Casa Productora.<br>
              El archivo adjunto (.ics) te permite agregarlo a tu calendario.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid rgba(148,163,184,0.10);text-align:center;">
            <p style="margin:0;color:#334155;font-size:11px;">Retro Casa Productora · Sistema de Producción</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ── Main send function ────────────────────────────────────────────────────────

export async function sendJuntaInvites(params: {
  junta: {
    id: string
    tipo: string
    fecha: string
    hora_inicio: string
    hora_fin?: string | null
    notas?: string | null
    link?: string | null
    external_emails?: string[] | null
  }
  attendeeEmployeeIds: string[]
}) {
  const { junta, attendeeEmployeeIds } = params
  const admin = createAdminClient()

  // 1. Collect employee emails
  const employeeEmails: string[] = []
  if (attendeeEmployeeIds.length > 0) {
    const { data: emps, error: empsError } = await admin
      .from("employees")
      .select("email")
      .in("id", attendeeEmployeeIds)
    console.log("[junta-email] employees query:", { emps, empsError })
    for (const e of emps || []) {
      if (e.email) employeeEmails.push(e.email)
    }
  }

  // 2. External emails
  const externalEmails = (junta.external_emails || []).filter((e) => e.includes("@"))

  const allRecipients = [...new Set([...employeeEmails, ...externalEmails])]
  console.log("[junta-email] recipients:", allRecipients)
  if (!allRecipients.length) return { sent: 0 }

  // 3. Build ICS + HTML
  const icsContent = generateICS(junta)
  const html       = buildEmailHtml(junta)

  const emoji = junta.tipo === "Brief" ? "📋" : junta.tipo === "PPM" ? "🎬" : "🤝"
  const [year, month, day] = junta.fecha.split("-")
  const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]
  const subjectLabel = (junta as any).titulo || junta.tipo
  const subject = `${emoji} ${subjectLabel} · ${parseInt(day)} ${meses[parseInt(month)-1]} ${year} — Retro Casa`

  // 4. Send one email per recipient (Resend free tier doesn't support BCC well)
  let sent = 0
  for (const email of allRecipients) {
    try {
      await getResend().emails.send({
        from: FROM,
        to: email,
        subject,
        html,
        attachments: [
          {
            filename: `junta-${junta.tipo.toLowerCase().replace(/ /g, "-")}.ics`,
            content: Buffer.from(icsContent).toString("base64"),
          },
        ],
      })
      sent++
    } catch { /* continue with next */ }
  }

  return { sent }
}
