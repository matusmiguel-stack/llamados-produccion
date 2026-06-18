import { NextResponse } from "next/server"
import { Resend } from "resend"
import { createAdminClient } from "../../../../lib/supabase-admin"

const FROM = "Retro Casa Productora <news@retrocasaproductora.com>"
const CC_EMAILS = ["finanzas@retrocasaproductora.com", "miguel@retrocasaproductora.com"]

// Tolerancia de centavos al comparar montos
const MONTO_TOLERANCIA = 1.0

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

// ── Fechas ────────────────────────────────────────────────────────────────────

function todayInMexico(): Date {
  // Fecha actual en CDMX como Date local (solo fecha)
  const s = new Date().toLocaleDateString("sv", { timeZone: "America/Mexico_City" })
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

// Modo pruebas: poner en true para abrir el sistema cualquier día/hora. Mantener en false en producción.
const FORCE_OPEN = false

// Recepción abierta solo jueves de 10:00 a 19:00 hora CDMX
const RECEPCION_DIA = 4        // jueves
const RECEPCION_HORA_INICIO = 10
const RECEPCION_HORA_FIN = 19  // 7pm (exclusivo a partir de las 19:00)

function isFacturasOpen(): boolean {
  if (FORCE_OPEN) return true
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date())
  const weekday = parts.find((p) => p.type === "weekday")?.value
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10)
  const isThursday = weekday === "Thu"
  return isThursday && hour >= RECEPCION_HORA_INICIO && hour < RECEPCION_HORA_FIN
}

function addBusinessDays(start: Date, days: number): Date {
  const d = new Date(start)
  let added = 0
  while (added < days) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return d
}

function rollToFriday(d: Date): Date {
  const r = new Date(d)
  while (r.getDay() !== 5) r.setDate(r.getDate() + 1)
  return r
}

function plazoDias(subtotal: number): number {
  if (subtotal <= 10000.99) return 30
  if (subtotal <= 30000.99) return 60
  return 75
}

function fechaLarga(d: Date): string {
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "full" }).format(d)
}

function fechaISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// ── Emails ────────────────────────────────────────────────────────────────────

function emailShell(titulo: string, inner: string) {
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
            <p style="margin:6px 0 0;font-size:20px;font-weight:700;color:#f1f5f9;">${titulo}</p>
          </td>
        </tr>
        ${inner}
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">
              Si tienes alguna duda, escribe a <a href="mailto:finanzas@retrocasaproductora.com" style="color:#0ea5e9;text-decoration:none;">finanzas@retrocasaproductora.com</a> o al productor del proyecto.
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

function buildAceptadaHtml(params: { proveedorNombre: string; proyectoLabel: string; subtotal: string; fechaPago: string }) {
  const { proveedorNombre, proyectoLabel, subtotal, fechaPago } = params
  return emailShell("Factura Recibida ✓", `
        <tr>
          <td style="padding:28px 32px 0;">
            <p style="margin:0;font-size:15px;color:#334155;">Hola <strong>${proveedorNombre}</strong>,</p>
            <p style="margin:12px 0 0;font-size:14px;color:#64748b;line-height:1.6;">
              Tu factura fue revisada y es <strong style="color:#059669;">correcta</strong>. Quedó programada para pago.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;border-radius:8px;overflow:hidden;">
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Proyecto</p>
                  <p style="margin:6px 0 0;font-size:15px;font-weight:700;color:#0f172a;">${proyectoLabel}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
                  <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Subtotal facturado</p>
                  <p style="margin:6px 0 0;font-size:15px;font-weight:700;color:#0f172a;font-family:monospace;">${subtotal} <span style="font-size:12px;font-weight:400;color:#64748b;">sin IVA</span></p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;background:#ecfdf5;">
                  <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#059669;">Fecha estimada de pago</p>
                  <p style="margin:6px 0 0;font-size:17px;font-weight:700;color:#065f46;">${fechaPago}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`)
}

function buildRechazadaHtml(params: { proveedorNombre: string; proyectoLabel: string; motivo: string }) {
  const { proveedorNombre, proyectoLabel, motivo } = params
  return emailShell("Factura Rechazada", `
        <tr>
          <td style="padding:28px 32px 0;">
            <p style="margin:0;font-size:15px;color:#334155;">Hola <strong>${proveedorNombre}</strong>,</p>
            <p style="margin:12px 0 0;font-size:14px;color:#64748b;line-height:1.6;">
              Revisamos tu factura${proyectoLabel ? ` para el proyecto <strong>${proyectoLabel}</strong>` : ""} y lamentablemente <strong style="color:#dc2626;">no pudo ser aceptada</strong>.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0;">
            <div style="padding:16px 18px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">
              <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#dc2626;">Motivo del rechazo</p>
              <p style="margin:8px 0 0;font-size:14px;color:#7f1d1d;line-height:1.7;">${motivo}</p>
            </div>
            <p style="margin:16px 0 0;font-size:14px;color:#64748b;line-height:1.6;">
              Por favor corrige la factura y vuelve a subirla el próximo <strong>jueves</strong>, que es el día de recepción de facturas.
            </p>
          </td>
        </tr>`)
}

// ── Parseo de CFDI ────────────────────────────────────────────────────────────

function parseSubtotal(xml: string): number | null {
  // CFDI 3.3 / 4.0: atributo SubTotal en cfdi:Comprobante
  const m = xml.match(/<(?:cfdi:)?Comprobante[^>]*\sSubTotal="([\d.]+)"/i)
  if (!m) return null
  const n = parseFloat(m[1])
  return Number.isFinite(n) ? n : null
}

function parseReceptorRfc(xml: string): string | null {
  const m = xml.match(/<(?:cfdi:)?Receptor[^>]*\sRfc="([A-Z0-9&Ñ]{12,13})"/i)
  return m ? m[1].toUpperCase() : null
}

function parseUuidFiscal(xml: string): string | null {
  // TimbreFiscalDigital → UUID (folio fiscal)
  const m = xml.match(/UUID="([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})"/i)
  return m ? m[1].toUpperCase() : null
}

const RFC_POR_EMPRESA: Record<string, string> = {
  retro_studio: "RST070309F47",
  retro_films:  "RFI1303229I4",
}

// ── Rate limiting básico (por instancia serverless) ──────────────────────────
const rateMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 10          // intentos
const RATE_WINDOW = 60 * 60e3  // por hora

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW })
    return false
  }
  entry.count++
  return entry.count > RATE_LIMIT
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    // 0. Rate limiting por IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    if (rateLimited(ip)) {
      return NextResponse.json(
        { error: "Demasiados intentos. Espera una hora y vuelve a intentarlo." },
        { status: 429 }
      )
    }

    // 1. Solo jueves
    if (!isFacturasOpen()) {
      return NextResponse.json(
        { error: "La recepción de facturas solo está abierta los jueves de 10:00 a 19:00 hrs (CDMX)." },
        { status: 403 }
      )
    }

    const form = await req.formData()
    const email = String(form.get("email") || "").trim().toLowerCase()
    const codigoInput = String(form.get("codigo") || "").trim().toUpperCase()
    const xmlFile = form.get("xml") as File | null
    const pdfFile = form.get("pdf") as File | null

    if (!email || !codigoInput || !xmlFile || !pdfFile) {
      return NextResponse.json({ error: "Faltan datos: email, código de proyecto, XML y PDF de la factura son obligatorios." }, { status: 400 })
    }

    const codeMatch = codigoInput.match(/RS\d+/)
    const codigo = codeMatch ? codeMatch[0] : codigoInput

    const admin = createAdminClient()

    // 2. Identificar proveedor por email
    const { data: prov } = await admin
      .from("proveedores")
      .select("id, nombre, apellido, empresa, email")
      .ilike("email", email)
      .maybeSingle()

    if (!prov) {
      return NextResponse.json(
        { error: "No encontramos un proveedor registrado con ese email. Verifica que sea el mismo con el que te dimos de alta." },
        { status: 404 }
      )
    }

    const proveedorNombre = prov.empresa || `${prov.nombre} ${prov.apellido}`
    const xmlText = await xmlFile.text()
    const resend = getResend()

    // Helper para registrar + responder + mandar correo de rechazo
    async function rechazar(motivo: string, projectId: string | null, proyectoLabel: string, subtotal: number | null) {
      await admin.from("facturas").insert({
        proveedor_id: prov!.id, project_id: projectId, proveedor_email: email,
        codigo_proyecto: codigo, subtotal, status: "rechazada", motivo_rechazo: motivo,
      })
      await resend.emails.send({
        from: FROM, to: prov!.email, cc: CC_EMAILS,
        subject: `Factura rechazada${proyectoLabel ? ` — ${proyectoLabel}` : ""}`,
        html: buildRechazadaHtml({ proveedorNombre, proyectoLabel, motivo }),
      })
      return NextResponse.json({ ok: true, status: "rechazada", motivo })
    }

    // 3. Buscar proyecto por código
    const { data: project } = await admin
      .from("projects")
      .select("id, name, code, empresa")
      .eq("code", codigo)
      .maybeSingle()

    if (!project) {
      return rechazar(
        `El código de proyecto "${codigo}" no existe en nuestro sistema. Verifica el código que te enviamos en las instrucciones de facturación.`,
        null, "", null
      )
    }

    const proyectoLabel = `${project.code} ${project.name}`

    // 4. Verificar que el XML contenga el código de proyecto
    if (!xmlText.toUpperCase().includes(codigo)) {
      return rechazar(
        `La factura no contiene el código de proyecto ${codigo}. El código debe ir incluido en la descripción del concepto de tu CFDI.`,
        project.id, proyectoLabel, null
      )
    }

    // 5. Extraer subtotal del CFDI
    const subtotal = parseSubtotal(xmlText)
    if (subtotal == null) {
      return rechazar(
        "No pudimos leer el subtotal de tu factura. Asegúrate de subir el archivo XML del CFDI (no el PDF renombrado).",
        project.id, proyectoLabel, null
      )
    }

    // 5b. Verificar RFC del receptor (la factura debe estar emitida a la empresa correcta)
    const receptorRfc = parseReceptorRfc(xmlText)
    let empresaProyecto: string | null = project.empresa || null
    if (!empresaProyecto) {
      // Fallback: inferir del ingreso aprobado
      const { data: ingreso } = await admin
        .from("ingresos").select("empresa")
        .eq("project_id", project.id).limit(1).maybeSingle()
      empresaProyecto = ingreso?.empresa || null
    }

    if (receptorRfc) {
      const rfcsValidos = empresaProyecto
        ? [RFC_POR_EMPRESA[empresaProyecto]]
        : Object.values(RFC_POR_EMPRESA) // empresa desconocida: aceptar cualquiera de las dos
      if (!rfcsValidos.includes(receptorRfc)) {
        const empresaEsperada = empresaProyecto === "retro_films" ? "Retro Films (RFC RFI1303229I4)" : "Retro Studio (RFC RST070309F47)"
        return rechazar(
          `La factura está emitida al RFC ${receptorRfc}, pero este proyecto se factura a ${empresaEsperada}. Verifica los datos de facturación que te enviamos.`,
          project.id, proyectoLabel, subtotal
        )
      }
    }

    // 5c. Rechazar facturas duplicadas (mismo folio fiscal UUID)
    const uuidFiscal = parseUuidFiscal(xmlText)
    if (uuidFiscal) {
      const { data: dup } = await admin
        .from("facturas")
        .select("id, status")
        .eq("uuid_fiscal", uuidFiscal)
        .in("status", ["aceptada", "pagada"])
        .maybeSingle()
      if (dup) {
        return rechazar(
          `Esta factura (folio fiscal ${uuidFiscal}) ya fue recibida y aceptada anteriormente. No es necesario volver a enviarla.`,
          project.id, proyectoLabel, subtotal
        )
      }
    }

    // 6. Reunir el monto de CADA concepto (egreso) del proveedor en este proyecto.
    //    Cada factura debe cubrir un concepto individual — no la suma de todos.
    const { data: quotes } = await admin
      .from("quotes").select("id")
      .eq("project_id", project.id).eq("released", true)

    const fmtMx = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
    const lineItems: { id: string; monto: number }[] = []
    for (const quote of quotes || []) {
      const { data: sections } = await admin
        .from("quote_sections").select("id").eq("quote_id", quote.id)
      for (const section of sections || []) {
        const { data: rows } = await admin
          .from("quote_items")
          .select("id,qty,days,unit_price,actual_qty,actual_days,actual_unit_price,actual_supplier_id")
          .eq("section_id", section.id)
          .eq("actual_supplier_id", prov.id)
        for (const r of rows || []) {
          const hasActual = r.actual_qty != null || r.actual_days != null || r.actual_unit_price != null
          if (!hasActual) continue
          const q = r.actual_qty        ?? Math.max(r.qty  || 0, 1)
          const d = r.actual_days       ?? Math.max(r.days || 0, 1)
          const p = r.actual_unit_price ?? r.unit_price
          const monto = Math.round(q * d * p * 100) / 100
          if (monto > 0) lineItems.push({ id: r.id, monto })
        }
      }
    }
    const lineAmounts = lineItems.map((l) => l.monto)

    if (lineAmounts.length === 0) {
      return rechazar(
        `No tienes conceptos asignados en el control de egresos del proyecto ${proyectoLabel}. Contacta al productor del proyecto.`,
        project.id, proyectoLabel, subtotal
      )
    }

    // ¿El subtotal coincide con algún concepto individual?
    const conceptosCoinciden = lineAmounts.filter((m) => Math.abs(subtotal - m) <= MONTO_TOLERANCIA)
    if (conceptosCoinciden.length === 0) {
      const montosUnicos = [...new Set(lineAmounts)].sort((a, b) => a - b).map(fmtMx).join(", ")
      return rechazar(
        `El subtotal de tu factura (${fmtMx(subtotal)}) no coincide con ningún concepto autorizado en el control de egresos. Recuerda enviar una factura por concepto. Montos autorizados (antes de IVA): ${montosUnicos}.`,
        project.id, proyectoLabel, subtotal
      )
    }

    // Evitar sobre-facturación: no aceptar más facturas de ese monto que conceptos existentes.
    const { data: facturasPrevias } = await admin
      .from("facturas")
      .select("subtotal, quote_item_id")
      .eq("proveedor_id", prov.id)
      .eq("project_id", project.id)
      .in("status", ["aceptada", "pagada"])
    const yaFacturadasMismoMonto = (facturasPrevias || []).filter(
      (f: any) => f.subtotal != null && Math.abs(Number(f.subtotal) - subtotal) <= MONTO_TOLERANCIA
    ).length
    if (yaFacturadasMismoMonto >= conceptosCoinciden.length) {
      return rechazar(
        `Ya recibimos ${yaFacturadasMismoMonto} factura(s) por ${fmtMx(subtotal)} en este proyecto, que es el número de conceptos autorizados con ese monto. Si crees que es un error, contacta al productor.`,
        project.id, proyectoLabel, subtotal
      )
    }

    // Elegir el egreso (quote_item) que cubre esta factura: el que coincide en
    // monto y aún no tiene factura vinculada (preferentemente).
    const yaVinculados = new Set(
      (facturasPrevias || []).map((f: any) => f.quote_item_id).filter(Boolean)
    )
    const coincidentes = lineItems.filter((l) => Math.abs(l.monto - subtotal) <= MONTO_TOLERANCIA)
    const matchedItem = coincidentes.find((l) => !yaVinculados.has(l.id)) || coincidentes[0]
    const quoteItemId = matchedItem?.id || null

    // 7. Factura correcta → calcular fecha de pago
    const dias = plazoDias(subtotal)
    const base = addBusinessDays(todayInMexico(), dias)
    const fechaPago = rollToFriday(base)

    // 8. Guardar archivos en storage
    const stamp = Date.now()
    const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_")
    let xmlPath: string | null = null
    let pdfPath: string | null = null

    const xmlUpload = await admin.storage.from("facturas")
      .upload(`${project.code}/${stamp}-${safeName(xmlFile.name)}`, Buffer.from(await xmlFile.arrayBuffer()), { contentType: "text/xml" })
    if (!xmlUpload.error) xmlPath = xmlUpload.data.path

    if (pdfFile) {
      const pdfUpload = await admin.storage.from("facturas")
        .upload(`${project.code}/${stamp}-${safeName(pdfFile.name)}`, Buffer.from(await pdfFile.arrayBuffer()), { contentType: "application/pdf" })
      if (!pdfUpload.error) pdfPath = pdfUpload.data.path
    }

    // 9. Registrar factura aceptada (vinculada a su egreso)
    await admin.from("facturas").insert({
      proveedor_id: prov.id, project_id: project.id, proveedor_email: email,
      codigo_proyecto: codigo, subtotal, status: "aceptada",
      fecha_pago: fechaISO(fechaPago), xml_path: xmlPath, pdf_path: pdfPath,
      uuid_fiscal: uuidFiscal, quote_item_id: quoteItemId,
    })

    // 10. Correo de confirmación
    await resend.emails.send({
      from: FROM, to: prov.email, cc: CC_EMAILS,
      subject: `Factura recibida ✓ — ${proyectoLabel}`,
      html: buildAceptadaHtml({
        proveedorNombre,
        proyectoLabel,
        subtotal: fmtMx(subtotal),
        fechaPago: fechaLarga(fechaPago),
      }),
    })

    return NextResponse.json({
      ok: true, status: "aceptada",
      fechaPago: fechaLarga(fechaPago),
      subtotal: fmtMx(subtotal),
    })
  } catch (err: any) {
    console.error("[facturas-submit] error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// El front consulta este endpoint para saber si está abierto
export async function GET() {
  return NextResponse.json({ open: isFacturasOpen() })
}
