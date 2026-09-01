// Plantillas de correo para solicitudes de vacaciones.
// Mismo estilo que el resto de avisos de la app (tabla centrada, 560px).

import { describirRango, formatFechaLarga } from "./vacaciones"

export const VACACIONES_FROM = "Retro Casa Productora <news@retrocasaproductora.com>"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.retrocasaproductora.com"

export const urlSolicitudes = () => `${APP_URL}/solicitudes-vacaciones`
export const urlPerfil = () => `${APP_URL}/perfil`

function shell(params: {
  headerBg: string
  eyebrowColor: string
  titleColor: string
  eyebrow: string
  titulo: string
  intro: string
  filas: string
  ctaBg: string
  ctaColor: string
  ctaHref: string
  ctaLabel: string
  cierre?: string
}): string {
  const { headerBg, eyebrowColor, titleColor, eyebrow, titulo, intro, filas, ctaBg, ctaColor, ctaHref, ctaLabel, cierre } = params
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:${headerBg};padding:28px 32px;">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:${eyebrowColor};">${eyebrow}</p>
            <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:${titleColor};">${titulo}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 0;">
            <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">${intro}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;border-radius:8px;overflow:hidden;">
              ${filas}
            </table>
          </td>
        </tr>
        ${cierre ? `<tr><td style="padding:20px 32px 0;"><p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">${cierre}</p></td></tr>` : ""}
        <tr>
          <td style="padding:24px 32px;">
            <a href="${ctaHref}" style="display:inline-block;background:${ctaBg};color:${ctaColor};text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px;">${ctaLabel}</a>
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

function fila(label: string, value: string): string {
  return `
              <tr>
                <td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;width:38%;vertical-align:top;">
                  <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">${label}</span>
                </td>
                <td style="padding:12px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:600;color:#0f172a;">${value}</td>
              </tr>`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

// Los días se listan como rangos legibles ("12 al 16 de mayo") separados por <br>
export function listaDias(rangos: { start_date: string; end_date: string }[]): string {
  return rangos.map((r) => describirRango(r.start_date, r.end_date)).join("<br>")
}

export function htmlNuevaSolicitud(params: {
  solicitante: string
  dias: number
  rangos: { start_date: string; end_date: string }[]
  restantes: number | null
  nota: string | null
}): string {
  const { solicitante, dias, rangos, restantes, nota } = params
  return shell({
    headerBg: "#1e3a8a",
    eyebrowColor: "#bfdbfe",
    titleColor: "#eff6ff",
    eyebrow: "Retro Casa Productora",
    titulo: "Nueva solicitud de vacaciones 🏖️",
    intro: `<strong style="color:#334155;">${escapeHtml(solicitante)}</strong> solicitó vacaciones y está esperando respuesta.`,
    filas: [
      fila("Solicitante", escapeHtml(solicitante)),
      fila("Días solicitados", `${dias} día${dias !== 1 ? "s" : ""} hábil${dias !== 1 ? "es" : ""}`),
      fila("Fechas", listaDias(rangos)),
      restantes != null ? fila("Le quedarían", `${restantes} día${restantes !== 1 ? "s" : ""}`) : "",
      nota ? fila("Nota", escapeHtml(nota)) : "",
    ].join(""),
    ctaBg: "#1e3a8a",
    ctaColor: "#eff6ff",
    ctaHref: urlSolicitudes(),
    ctaLabel: "Revisar solicitud →",
  })
}

export function htmlResolucion(params: {
  solicitante: string
  aprobada: boolean
  dias: number
  rangos: { start_date: string; end_date: string }[]
  motivo: string | null
  resueltoPor: string
  restantes: number | null
  reseteoISO: string | null
}): string {
  const { solicitante, aprobada, dias, rangos, motivo, resueltoPor, restantes, reseteoISO } = params
  const nombre = escapeHtml(solicitante.split(" ")[0] || solicitante)

  return shell({
    headerBg: aprobada ? "#064e3b" : "#7f1d1d",
    eyebrowColor: aprobada ? "#6ee7b7" : "#fecaca",
    titleColor: aprobada ? "#ecfdf5" : "#fef2f2",
    eyebrow: "Retro Casa Productora",
    titulo: aprobada ? "Vacaciones aprobadas ✓" : "Vacaciones declinadas",
    intro: aprobada
      ? `Hola ${nombre}, tu solicitud de vacaciones fue <strong style="color:#059669;">aprobada</strong> y ya quedó bloqueada en el calendario.`
      : `Hola ${nombre}, tu solicitud de vacaciones fue <strong style="color:#dc2626;">declinada</strong>.`,
    filas: [
      fila("Días solicitados", `${dias} día${dias !== 1 ? "s" : ""} hábil${dias !== 1 ? "es" : ""}`),
      fila("Fechas", listaDias(rangos)),
      fila(aprobada ? "Aprobó" : "Declinó", escapeHtml(resueltoPor)),
      !aprobada && motivo ? fila("Motivo", escapeHtml(motivo)) : "",
      aprobada && restantes != null ? fila("Días que te quedan", `${restantes}`) : "",
      aprobada && reseteoISO ? fila("Se reinician el", formatFechaLarga(reseteoISO).replace(/^\w+,?\s*/, "")) : "",
    ].join(""),
    ctaBg: aprobada ? "#064e3b" : "#7f1d1d",
    ctaColor: aprobada ? "#ecfdf5" : "#fef2f2",
    ctaHref: urlPerfil(),
    ctaLabel: aprobada ? "Ver mi perfil →" : "Solicitar otras fechas →",
    cierre: !aprobada && !motivo ? "No se registró un motivo. Habla con Adriana o Miguel para más detalle." : undefined,
  })
}
