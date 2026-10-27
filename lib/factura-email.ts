// Correo al cliente con su factura (PDF + XML adjuntos), enviado por la app
// con Resend en lugar del correo genérico de Facturapi. Mismo estilo que el
// resto de avisos de la app (tabla centrada, 560px).
import { Resend } from "resend"

const EMPRESA_NOMBRE: Record<string, string> = { retro_studio: "Retro Studio", retro_films: "Retro Films" }
// Las respuestas del cliente le llegan a finanzas, que además recibe copia
const FINANZAS = "finanzas@retrocasaproductora.com"

const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;")
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

function html(p: { emisor: string; numero: string; receptor: string; total: number; uuid: string | null }): string {
  const titulo = `Factura ${escapeHtml(p.numero)}`
  const intro = `Te compartimos la factura de <strong style="color:#334155;">${escapeHtml(p.emisor)}</strong>. Adjuntamos el PDF y el XML.`
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr>
          <td style="background:#0f172a;padding:28px 32px;">
            <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;">${escapeHtml(p.emisor)}</p>
            <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:#f1f5f9;">${titulo}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 0;">
            <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">Hola,</p>
            <p style="margin:12px 0 0;font-size:14px;color:#64748b;line-height:1.6;">${intro}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;border-radius:8px;overflow:hidden;">
              ${fila("Folio", escapeHtml(p.numero))}
              ${fila("Facturado a", escapeHtml(p.receptor))}
              ${fila("Total", money(p.total))}
              ${p.uuid ? fila("Folio fiscal", `<span style="font-family:monospace;font-size:12px;">${escapeHtml(p.uuid)}</span>`) : ""}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 28px;">
            <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">Cualquier duda, responde a este correo.</p>
            <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">— ${escapeHtml(p.emisor)} · Retro Casa Productora</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// `para` acepta varios correos separados por coma o punto y coma.
export async function enviarFacturaCliente(p: {
  para: string
  empresa: string
  numero: string
  receptor: string
  total: number
  uuid: string | null
  pdf: Buffer
  xml: Buffer
}): Promise<void> {
  const to = p.para.split(/[,;]/).map(s => s.trim()).filter(Boolean)
  if (to.length === 0) throw new Error("Sin destinatario")
  const emisor = EMPRESA_NOMBRE[p.empresa] || "Retro Casa Productora"
  const archivo = p.numero.replace(/[^a-zA-Z0-9._-]/g, "_")
  const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: `${emisor} <news@retrocasaproductora.com>`,
    to,
    cc: [FINANZAS],
    replyTo: FINANZAS,
    subject: `Factura ${p.numero} · ${emisor}`,
    html: html({ emisor, numero: p.numero, receptor: p.receptor, total: p.total, uuid: p.uuid }),
    attachments: [
      { filename: `${archivo}.pdf`, content: p.pdf.toString("base64") },
      { filename: `${archivo}.xml`, content: p.xml.toString("base64") },
    ],
  })
  if (error) throw new Error(error.message)
}
