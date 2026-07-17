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
