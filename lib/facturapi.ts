// Cliente mínimo de la API de Facturapi (PAC) para timbrar CFDI 4.0.
// Cada empresa emisora es una "organización" en Facturapi con su propia llave
// secreta; la llave define también el ambiente (sk_test_… = pruebas,
// sk_live_… = timbrado real).

const BASE = "https://www.facturapi.io/v2"

const ENV_KEY: Record<string, string> = {
  retro_studio: "FACTURAPI_KEY_RETRO_STUDIO",
  retro_films: "FACTURAPI_KEY_RETRO_FILMS",
}

export function facturapiKey(empresa: string): string | null {
  const name = ENV_KEY[empresa]
  return (name && process.env[name]?.trim()) || null
}

export function esModoPruebas(empresa: string): boolean {
  return (facturapiKey(empresa) || "").startsWith("sk_test")
}

async function call(empresa: string, method: string, path: string, body?: unknown): Promise<Response> {
  const key = facturapiKey(empresa)
  if (!key) throw new Error(`Falta configurar la llave de Facturapi para ${empresa === "retro_films" ? "Retro Films" : "Retro Studio"}`)
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  })
  if (!res.ok) {
    let msg = `Facturapi respondió ${res.status}`
    try {
      const j = await res.json()
      if (j?.message) msg = j.message
    } catch {}
    throw new Error(msg)
  }
  return res
}

export type FacturaInput = {
  receptor: { rfc: string; razon_social: string; regimen_fiscal: string; cp: string; email?: string | null }
  conceptos: { descripcion: string; clave_prod_serv: string; clave_unidad: string; precio: number; cantidad?: number }[]
  ivaTasa: number                 // 0.16 o 0
  retencionIva?: number | null    // p. ej. 0.106667
  retencionIsr?: number | null    // p. ej. 0.10 o 0.0125
  uso: string
  formaPago: string
  metodoPago: "PUE" | "PPD"
  serie?: string | null
  idempotencyKey?: string
}

export type FacturaEmitida = {
  id: string
  uuid: string
  series: string | null
  folio_number: number | null
  total: number
}

export async function crearFactura(empresa: string, f: FacturaInput): Promise<FacturaEmitida> {
  const taxes: any[] = [{ type: "IVA", rate: f.ivaTasa }]
  if (f.retencionIva) taxes.push({ type: "IVA", rate: f.retencionIva, withholding: true })
  if (f.retencionIsr) taxes.push({ type: "ISR", rate: f.retencionIsr, withholding: true })

  const body = {
    type: "I",
    customer: {
      legal_name: f.receptor.razon_social,
      tax_id: f.receptor.rfc,
      tax_system: f.receptor.regimen_fiscal,
      address: { zip: f.receptor.cp },
      ...(f.receptor.email ? { email: f.receptor.email } : {}),
    },
    items: f.conceptos.map(c => ({
      quantity: c.cantidad ?? 1,
      product: {
        description: c.descripcion,
        product_key: c.clave_prod_serv,
        unit_key: c.clave_unidad,
        price: c.precio,
        tax_included: false,
        taxes,
      },
    })),
    use: f.uso,
    payment_form: f.metodoPago === "PPD" ? "99" : f.formaPago,
    payment_method: f.metodoPago,
    ...(f.serie ? { series: f.serie } : {}),
    ...(f.idempotencyKey ? { idempotency_key: f.idempotencyKey } : {}),
  }
  const res = await call(empresa, "POST", "/invoices", body)
  const j = await res.json()
  return { id: j.id, uuid: String(j.uuid || "").toUpperCase(), series: j.series ?? null, folio_number: j.folio_number ?? null, total: Number(j.total) }
}

// Complemento de pago (CFDI tipo P) de una factura PPD
export async function crearComplementoPago(empresa: string, c: {
  receptor: FacturaInput["receptor"]
  formaPago: string
  fecha: string                 // YYYY-MM-DD
  factura: { uuid: string; serie: string | null; folio: string | null; moneda: string }
  monto: number                 // importe pagado, con IVA
  parcialidad: number
  saldoAnterior: number
  ivaTasa: number
  serie?: string | null
}): Promise<FacturaEmitida> {
  const base = Math.round((c.monto / (1 + c.ivaTasa)) * 100) / 100
  const folioNum = c.factura.folio && /^\d+$/.test(c.factura.folio) ? Number(c.factura.folio) : undefined
  const body = {
    type: "P",
    customer: {
      legal_name: c.receptor.razon_social,
      tax_id: c.receptor.rfc,
      tax_system: c.receptor.regimen_fiscal,
      address: { zip: c.receptor.cp },
      ...(c.receptor.email ? { email: c.receptor.email } : {}),
    },
    ...(c.serie ? { series: c.serie } : {}),
    complements: [{
      type: "pago",
      data: [{
        payment_form: c.formaPago,
        // Mediodía en CDMX para que la fecha no se corra de día
        date: `${c.fecha}T12:00:00-06:00`,
        currency: c.factura.moneda || "MXN",
        related_documents: [{
          uuid: c.factura.uuid,
          amount: c.monto,
          installment: c.parcialidad,
          last_balance: c.saldoAnterior,
          ...(c.factura.serie ? { series: c.factura.serie } : {}),
          ...(folioNum != null ? { folio_number: folioNum } : {}),
          taxes: [{ base, type: "IVA", rate: c.ivaTasa }],
        }],
      }],
    }],
  }
  const res = await call(empresa, "POST", "/invoices", body)
  const j = await res.json()
  return { id: j.id, uuid: String(j.uuid || "").toUpperCase(), series: j.series ?? null, folio_number: j.folio_number ?? null, total: Number(j.total) }
}

export async function obtenerFactura(empresa: string, id: string): Promise<FacturaEmitida & { status: string }> {
  const res = await call(empresa, "GET", `/invoices/${encodeURIComponent(id)}`)
  const j = await res.json()
  return { id: j.id, uuid: String(j.uuid || "").toUpperCase(), series: j.series ?? null, folio_number: j.folio_number ?? null, total: Number(j.total), status: j.status }
}

export async function descargarFactura(empresa: string, id: string, formato: "xml" | "pdf"): Promise<Buffer> {
  const res = await call(empresa, "GET", `/invoices/${encodeURIComponent(id)}/${formato}`)
  return Buffer.from(await res.arrayBuffer())
}

export async function cancelarFactura(empresa: string, id: string, motivo: string): Promise<{ status: string; cancellation_status?: string }> {
  const res = await call(empresa, "DELETE", `/invoices/${encodeURIComponent(id)}?motive=${encodeURIComponent(motivo)}`)
  const j = await res.json()
  return { status: j.status, cancellation_status: j.cancellation_status }
}

export async function enviarFacturaPorCorreo(empresa: string, id: string, email: string): Promise<void> {
  await call(empresa, "POST", `/invoices/${encodeURIComponent(id)}/email`, { email })
}
