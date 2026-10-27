// Lectura de campos de un CFDI (XML del SAT). Compartido por la subida de
// facturas de proveedores y por "marcar facturado" en ingresos.

export function parseSubtotal(xml: string): number | null {
  // CFDI 3.3 / 4.0: atributo SubTotal en cfdi:Comprobante
  const m = xml.match(/<(?:cfdi:)?Comprobante[^>]*\sSubTotal="([\d.]+)"/i)
  if (!m) return null
  const n = parseFloat(m[1])
  return Number.isFinite(n) ? n : null
}

// Monto final a pagar del CFDI: Comprobante@Total = SubTotal + IVA trasladado
// − retenciones (ISR/IVA). Correcto tanto para factura como para honorarios.
export function parseTotal(xml: string): number | null {
  const m = xml.match(/<(?:cfdi:)?Comprobante[^>]*\sTotal="([\d.]+)"/i)
  if (!m) return null
  const n = parseFloat(m[1])
  return Number.isFinite(n) ? n : null
}

export function parseReceptorRfc(xml: string): string | null {
  const m = xml.match(/<(?:cfdi:)?Receptor[^>]*\sRfc="([A-Z0-9&Ñ]{12,13})"/i)
  return m ? m[1].toUpperCase() : null
}

export function parseUuidFiscal(xml: string): string | null {
  // TimbreFiscalDigital → UUID (folio fiscal)
  const m = xml.match(/UUID="([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})"/i)
  return m ? m[1].toUpperCase() : null
}

// Número de factura tal como se captura en Ingresos: Serie + Folio pegados
// (p. ej. Serie="F" Folio="3777" → "F3777"). Si el CFDI no trae Serie, queda
// solo el Folio.
export function parseNumeroFactura(xml: string): string | null {
  const comprobante = xml.match(/<(?:cfdi:)?Comprobante[^>]*>/i)?.[0]
  if (!comprobante) return null
  const serie = comprobante.match(/\sSerie="([^"]*)"/i)?.[1]?.trim() ?? ""
  const folio = comprobante.match(/\sFolio="([^"]*)"/i)?.[1]?.trim() ?? ""
  const numero = `${serie}${folio}`.trim()
  return numero || null
}

// Atributo de la primera etiqueta <cfdi:Tag …> (con o sin prefijo)
function attrOf(xml: string, tag: string, attr: string): string | null {
  const el = xml.match(new RegExp(`<(?:cfdi:)?${tag}\\s[^>]*>`, "i"))?.[0]
  if (!el) return null
  const v = el.match(new RegExp(`\\s${attr}="([^"]*)"`, "i"))?.[1]
  return v != null ? decodeXmlEntities(v.trim()) : null
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
}

// Lo que se aprovecha de un CFDI emitido para llenar los datos fiscales de
// emisores y receptores (importación de las facturas que venían de Orderly).
export type CfdiResumen = {
  fecha: string | null
  serie: string | null
  folio: string | null
  moneda: string | null
  subtotal: number | null
  total: number | null
  formaPago: string | null
  metodoPago: string | null
  lugarExpedicion: string | null
  emisor: { rfc: string | null; nombre: string | null; regimen: string | null }
  receptor: { rfc: string | null; nombre: string | null; regimen: string | null; cp: string | null; uso: string | null }
  concepto: { claveProdServ: string | null; claveUnidad: string | null; descripcion: string | null }
}

export function parseCfdiResumen(xml: string): CfdiResumen {
  return {
    fecha: attrOf(xml, "Comprobante", "Fecha"),
    serie: attrOf(xml, "Comprobante", "Serie"),
    folio: attrOf(xml, "Comprobante", "Folio"),
    moneda: attrOf(xml, "Comprobante", "Moneda"),
    subtotal: parseSubtotal(xml),
    total: parseTotal(xml),
    formaPago: attrOf(xml, "Comprobante", "FormaPago"),
    metodoPago: attrOf(xml, "Comprobante", "MetodoPago"),
    lugarExpedicion: attrOf(xml, "Comprobante", "LugarExpedicion"),
    emisor: {
      rfc: attrOf(xml, "Emisor", "Rfc")?.toUpperCase() ?? null,
      nombre: attrOf(xml, "Emisor", "Nombre"),
      regimen: attrOf(xml, "Emisor", "RegimenFiscal"),
    },
    receptor: {
      rfc: attrOf(xml, "Receptor", "Rfc")?.toUpperCase() ?? null,
      nombre: attrOf(xml, "Receptor", "Nombre"),
      regimen: attrOf(xml, "Receptor", "RegimenFiscalReceptor"),
      cp: attrOf(xml, "Receptor", "DomicilioFiscalReceptor"),
      uso: attrOf(xml, "Receptor", "UsoCFDI"),
    },
    concepto: {
      claveProdServ: attrOf(xml, "Concepto", "ClaveProdServ"),
      claveUnidad: attrOf(xml, "Concepto", "ClaveUnidad"),
      descripcion: attrOf(xml, "Concepto", "Descripcion"),
    },
  }
}
