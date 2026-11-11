// Complementos de pago (CFDI tipo P) de facturas PPD. Lo comparten el
// complemento automático (al marcar pagada una línea de Ingresos) y el manual
// (cuando finanzas lo necesite, con su propio monto, fecha y forma de pago).
//
// La factura se identifica por su folio fiscal (UUID) y puede venir de
// Ingresos (timbrada en la app o subida de Orderly) o de las facturas
// independientes. Total, serie, folio y receptor salen siempre de su XML.
import type { SupabaseClient } from "@supabase/supabase-js"
import { parseCfdiResumen, parseUuidFiscal } from "./cfdi"
import { crearComplementoPago, descargarFactura } from "./facturapi"

const r2 = (n: number) => Math.round(n * 100) / 100

// Error con mensaje para el usuario (las rutas lo responden con 400)
export class ComplementoError extends Error {}

export type ReceptorFiscal = {
  id: string
  rfc: string
  razon_social: string
  regimen_fiscal: string
  cp: string
  email: string | null
}

export type FacturaPPD = {
  uuid: string
  empresa: string
  numero: string
  origen: "ingreso" | "independiente"
  fecha: string | null
  total: number
  ivaTasa: number
  serie: string | null
  folio: string | null
  moneda: string
  receptor: ReceptorFiscal
}

export async function cargarFacturaPPD(admin: SupabaseClient, uuidRaw: string): Promise<FacturaPPD> {
  const uuid = String(uuidRaw || "").trim().toUpperCase()
  if (!/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(uuid)) {
    throw new ComplementoError("El folio fiscal de la factura no es válido")
  }

  let empresa = ""
  let numero = ""
  let origen: FacturaPPD["origen"] = "ingreso"
  let receptorId: string | null = null
  let xmlText = ""

  const { data: fi } = await admin
    .from("facturas_independientes")
    .select("id, empresa, numero, estatus, facturapi_id, xml_path, receptor_fiscal_id")
    .eq("uuid", uuid)
    .maybeSingle()

  if (fi) {
    if (fi.estatus === "cancelada") throw new ComplementoError(`La factura ${fi.numero || ""} está cancelada`)
    empresa = fi.empresa
    numero = fi.numero || ""
    origen = "independiente"
    receptorId = fi.receptor_fiscal_id
    if (fi.xml_path) {
      const { data: file } = await admin.storage.from("facturas").download(fi.xml_path)
      if (file) xmlText = await file.text()
    }
    if (!xmlText) xmlText = (await descargarFactura(fi.empresa, fi.facturapi_id, "xml")).toString("utf8")
  } else {
    const { data: ings } = await admin
      .from("ingresos")
      .select("id, empresa, numero_factura, factura_xml_path, receptor_fiscal_id")
      .eq("factura_uuid", uuid)
      .not("factura_xml_path", "is", null)
      .order("created_at", { ascending: true })
      .limit(1)
    const ing = ings?.[0]
    if (!ing) throw new ComplementoError("No se encontró la factura (¿se canceló?)")
    empresa = ing.empresa
    numero = ing.numero_factura || ""
    receptorId = ing.receptor_fiscal_id
    const { data: file, error } = await admin.storage.from("facturas").download(ing.factura_xml_path!)
    if (error || !file) throw new Error("No se pudo leer el XML de la factura")
    xmlText = await file.text()
  }

  const cfdi = parseCfdiResumen(xmlText)
  const nombre = numero || `${cfdi.serie || ""}${cfdi.folio || ""}` || uuid.slice(0, 8)
  const uuidXml = parseUuidFiscal(xmlText)
  if (uuidXml && uuidXml !== uuid) throw new Error(`El XML guardado de la factura ${nombre} no corresponde a su folio fiscal`)
  if (cfdi.metodoPago !== "PPD") {
    throw new ComplementoError(`La factura ${nombre} es ${cfdi.metodoPago || "PUE"} (pagada en una exhibición); no lleva complemento de pago`)
  }
  if (cfdi.total == null || !(cfdi.total > 0)) throw new ComplementoError(`No se pudo leer el total de la factura ${nombre}`)

  // Receptor: el de la factura (RFC del XML) y, si no, el ligado en la app
  let receptor: ReceptorFiscal | null = null
  if (cfdi.receptor.rfc) {
    receptor = (await admin.from("receptores_fiscales").select("id, rfc, razon_social, regimen_fiscal, cp, email").eq("rfc", cfdi.receptor.rfc).maybeSingle()).data
  }
  if (!receptor && receptorId) {
    receptor = (await admin.from("receptores_fiscales").select("id, rfc, razon_social, regimen_fiscal, cp, email").eq("id", receptorId).maybeSingle()).data
  }
  if (!receptor) {
    throw new ComplementoError(
      `Faltan los datos fiscales de ${cfdi.receptor.nombre || cfdi.receptor.rfc || "el cliente"}. Captúralos en 🧾 Datos fiscales y vuelve a intentarlo.`,
    )
  }

  const ratio = cfdi.subtotal ? cfdi.total / cfdi.subtotal : 1.16
  return {
    uuid,
    empresa,
    numero: nombre,
    origen,
    fecha: cfdi.fecha,
    total: r2(cfdi.total),
    ivaTasa: Math.abs(ratio - 1) < 0.005 ? 0 : 0.16,
    serie: cfdi.serie,
    folio: cfdi.folio,
    moneda: cfdi.moneda || "MXN",
    receptor,
  }
}

export type ComplementoVigente = {
  id: string
  numero: string | null
  monto: number
  parcialidad: number
  fecha_pago: string
  forma_pago: string
  origen: string
}

// Lo ya pagado con complementos VIGENTES (los cancelados no cuentan), el saldo
// pendiente y el número de la siguiente parcialidad.
export async function saldoFactura(admin: SupabaseClient, f: { uuid: string; total: number }) {
  const { data, error } = await admin
    .from("complementos_pago")
    .select("id, numero, monto, parcialidad, fecha_pago, forma_pago, origen")
    .eq("factura_uuid", f.uuid)
    .eq("estatus", "vigente")
    .order("created_at", { ascending: true })
  if (error) throw new Error(error.message)
  const complementos = ((data || []) as ComplementoVigente[]).map(c => ({ ...c, monto: Number(c.monto) }))
  const pagado = r2(complementos.reduce((s, c) => s + c.monto, 0))
  return { complementos, pagado, saldo: r2(f.total - pagado), parcialidad: complementos.length + 1 }
}

// Baja de Facturapi el XML y el PDF del complemento, los guarda en storage y
// anota las rutas.
export async function guardarArchivosComplemento(
  admin: SupabaseClient,
  c: { id: string; empresa: string; facturapi_id: string; numero: string | null },
): Promise<{ xml_path: string; pdf_path: string }> {
  const [xml, pdf] = await Promise.all([
    descargarFactura(c.empresa, c.facturapi_id, "xml"),
    descargarFactura(c.empresa, c.facturapi_id, "pdf"),
  ])
  const nombre = (c.numero || c.facturapi_id).replace(/[^a-zA-Z0-9._-]/g, "_")
  const folder = `ingresos/complementos/${nombre}`
  const stamp = Date.now()
  const x = await admin.storage.from("facturas").upload(`${folder}/${stamp}-${nombre}.xml`, xml, { contentType: "text/xml" })
  if (x.error) throw new Error(`No se pudo guardar el XML del complemento: ${x.error.message}`)
  const p = await admin.storage.from("facturas").upload(`${folder}/${stamp}-${nombre}.pdf`, pdf, { contentType: "application/pdf" })
  if (p.error) throw new Error(`No se pudo guardar el PDF del complemento: ${p.error.message}`)
  const rutas = { xml_path: x.data.path, pdf_path: p.data.path }
  const { error } = await admin.from("complementos_pago").update(rutas).eq("id", c.id)
  if (error) throw new Error(error.message)
  return rutas
}

export type ComplementoEmitido = {
  id: string
  numero: string
  parcialidad: number
  saldoAnterior: number
  monto: number
  saldoInsoluto: number
}

// Timbra el complemento de un pago de la factura y lo registra. `monto` es lo
// recibido CON IVA; no puede pasar del saldo pendiente.
export async function emitirComplementoPago(
  admin: SupabaseClient,
  p: {
    factura: FacturaPPD
    monto: number
    fecha: string          // YYYY-MM-DD
    formaPago: string
    ingresoId: string | null
    origen: "auto" | "manual"
    createdBy: string | null
  },
): Promise<ComplementoEmitido> {
  const f = p.factura
  if (!/^\d{2}$/.test(p.formaPago) || p.formaPago === "99") {
    throw new ComplementoError("Elige cómo se recibió el pago (transferencia, cheque…)")
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha)) throw new ComplementoError("Fecha de pago no válida")
  const pedido = r2(p.monto)
  if (!(pedido > 0)) throw new ComplementoError("El pago no tiene importe")

  const { saldo, parcialidad } = await saldoFactura(admin, f)
  if (!(saldo > 0.005)) {
    throw new ComplementoError(`La factura ${f.numero} ya está pagada por completo con sus complementos de pago`)
  }
  if (pedido > saldo + 0.05) {
    throw new ComplementoError(`El pago (${pedido.toFixed(2)}) es mayor al saldo pendiente de la factura ${f.numero} (${saldo.toFixed(2)})`)
  }
  const monto = Math.min(pedido, saldo)

  const comp = await crearComplementoPago(f.empresa, {
    receptor: f.receptor,
    formaPago: p.formaPago,
    fecha: p.fecha,
    factura: { uuid: f.uuid, serie: f.serie, folio: f.folio, moneda: f.moneda },
    monto,
    parcialidad,
    saldoAnterior: saldo,
    ivaTasa: f.ivaTasa,
  })
  const numero = `${comp.series || ""}${comp.folio_number ?? ""}`

  // Se registra en cuanto se timbra (aunque falle la descarga) para no duplicar
  const { data: fila, error: insErr } = await admin.from("complementos_pago").insert({
    ingreso_id: p.ingresoId,
    empresa: f.empresa,
    factura_uuid: f.uuid,
    factura_numero: f.numero,
    receptor_nombre: f.receptor.razon_social,
    facturapi_id: comp.id,
    uuid: comp.uuid || null,
    numero,
    monto,
    parcialidad,
    saldo_anterior: saldo,
    fecha_pago: p.fecha,
    forma_pago: p.formaPago,
    origen: p.origen,
    created_by: p.createdBy,
  }).select("id").single()
  if (insErr || !fila) {
    throw new Error(`El complemento ${numero} SÍ se timbró, pero no se pudo registrar en la app (${insErr?.message}). Búscalo en Facturapi; no lo vuelvas a emitir.`)
  }

  try {
    await guardarArchivosComplemento(admin, { id: fila.id, empresa: f.empresa, facturapi_id: comp.id, numero })
  } catch (e) {
    console.error("[complementos-pago] archivos:", e instanceof Error ? e.message : e)
  }

  return { id: fila.id, numero, parcialidad, saldoAnterior: saldo, monto, saldoInsoluto: r2(saldo - monto) }
}
