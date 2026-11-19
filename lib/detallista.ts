// Complemento Detallista del SAT (http://www.sat.gob.mx/detallista), el que
// piden tiendas departamentales como Liverpool para recibir facturas.
//
// Se arma igual que lo hacía Orderly (ver F3786/F3808 a Liverpool):
// SimpleInvoiceType 1.3.1 / AMC8.1, total con letra (ZZZ), pedido (ON) que
// también va como nota de entrega, GLN de comprador y vendedor y el número de
// proveedor que la tienda le asignó a la empresa.

export const DETALLISTA_NS = {
  prefix: "detallista",
  uri: "http://www.sat.gob.mx/detallista",
  schema_location: "http://www.sat.gob.mx/sitio_internet/cfd/detallista/detallista.xsd",
}

export type DetallistaInput = {
  pedido: string          // número de orden de compra (ON)
  entrega?: string | null // nota de entrega / folio de recepción; si no, el pedido
  glnComprador: string
  glnVendedor: string
  numProveedor: string
}

/** Lo que se recuerda por cliente en receptores_fiscales.detallista */
export type DetallistaGuardado = {
  activo: boolean
  gln_comprador: string
  gln_vendedor: string
  num_proveedor: string
}

/** Limpia y valida lo capturado. Devuelve el error a mostrar, o los datos. */
export function validarDetallista(raw: unknown): { datos: DetallistaInput | null; error: string | null } {
  if (!raw || typeof raw !== "object") return { datos: null, error: null }
  const r = raw as Record<string, unknown>
  const t = (v: unknown) => String(v ?? "").trim()
  const datos: DetallistaInput = {
    pedido: t(r.pedido),
    entrega: t(r.entrega) || null,
    glnComprador: t(r.glnComprador),
    glnVendedor: t(r.glnVendedor),
    numProveedor: t(r.numProveedor),
  }
  if (!datos.pedido) return { datos: null, error: "Complemento Detallista: falta el número de pedido (orden de compra)" }
  if (!/^\d{13}$/.test(datos.glnComprador)) return { datos: null, error: "Complemento Detallista: el GLN del comprador debe tener 13 dígitos" }
  if (!/^\d{13}$/.test(datos.glnVendedor)) return { datos: null, error: "Complemento Detallista: el GLN del vendedor debe tener 13 dígitos" }
  if (!datos.numProveedor) return { datos: null, error: "Complemento Detallista: falta el número de proveedor" }
  if ([datos.pedido, datos.entrega || "", datos.numProveedor].some(v => v.length > 35)) {
    return { datos: null, error: "Complemento Detallista: pedido, entrega y proveedor deben tener máximo 35 caracteres" }
  }
  return { datos, error: null }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")

/** Nodo <detallista:detallista> listo para el complemento "custom" de Facturapi. */
export function detallistaXml(d: DetallistaInput, total: number): string {
  const p = DETALLISTA_NS.prefix
  const n = (tag: string, body: string, attrs = "") => `<${p}:${tag}${attrs}>${body}</${p}:${tag}>`
  return (
    `<${p}:detallista xmlns:${p}="${DETALLISTA_NS.uri}" type="SimpleInvoiceType" contentVersion="1.3.1" documentStatus="ORIGINAL" documentStructureVersion="AMC8.1">` +
    n("requestForPaymentIdentification", n("entityType", "INVOICE")) +
    n("specialInstruction", n("text", esc(totalConLetra(total))), ` code="ZZZ"`) +
    n("orderIdentification", n("referenceIdentification", esc(d.pedido), ` type="ON"`)) +
    n("AdditionalInformation", `<${p}:referenceIdentification type="ACE"/>`) +
    n("DeliveryNote", n("referenceIdentification", esc(d.entrega || d.pedido))) +
    n("buyer", n("gln", esc(d.glnComprador))) +
    n("seller",
      n("gln", esc(d.glnVendedor)) +
      n("alternatePartyIdentification", esc(d.numProveedor), ` type="SELLER_ASSIGNED_IDENTIFIER_FOR_A_PARTY"`)) +
    `</${p}:detallista>`
  )
}

/** Resumen para el PDF (Facturapi solo pone los complementos en el XML). */
export function detallistaPdfHtml(d: DetallistaInput): string {
  const entrega = d.entrega && d.entrega !== d.pedido ? ` · Entrega ${esc(d.entrega)}` : ""
  return `<p><b>Complemento Detallista</b> · Pedido ${esc(d.pedido)}${entrega} · Proveedor ${esc(d.numProveedor)} · GLN comprador ${esc(d.glnComprador)}</p>`
}

// ── Importe con letra: "DOSCIENTOS TREINTA Y UN MIL NOVECIENTOS NOVENTA Y NUEVE PESOS, 64/100 M.N." ──

const UNIDADES = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE",
  "VEINTE", "VEINTIÚN", "VEINTIDÓS", "VEINTITRÉS", "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"]
const DECENAS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"]
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"]

function menosDeMil(n: number): string {
  if (n === 0) return ""
  if (n === 100) return "CIEN"
  const c = Math.floor(n / 100), r = n % 100
  let s = CENTENAS[c]
  if (r > 0) {
    let dec: string
    if (r < 30) dec = UNIDADES[r]
    else {
      const d = Math.floor(r / 10), u = r % 10
      dec = DECENAS[d] + (u ? ` Y ${UNIDADES[u]}` : "")
    }
    s = s ? `${s} ${dec}` : dec
  }
  return s
}

export function enteroConLetra(n: number): string {
  if (n === 0) return "CERO"
  const partes: string[] = []
  const millones = Math.floor(n / 1_000_000)
  const miles = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000
  if (millones) partes.push(millones === 1 ? "UN MILLÓN" : `${enteroConLetra(millones)} MILLONES`)
  if (miles) partes.push(miles === 1 ? "MIL" : `${menosDeMil(miles)} MIL`)
  if (resto) partes.push(menosDeMil(resto))
  return partes.join(" ")
}

export function totalConLetra(total: number): string {
  const centavosTot = Math.round(total * 100)
  const pesos = Math.floor(centavosTot / 100)
  const cent = centavosTot % 100
  // "UN MILLÓN DE PESOS" / "DOS MILLONES DE PESOS" cuando no sigue nada más
  const letra = enteroConLetra(pesos)
  const de = pesos > 0 && pesos % 1_000_000 === 0 ? " DE" : ""
  const moneda = pesos === 1 ? "PESO" : "PESOS"
  return `${letra}${de} ${moneda}, ${String(cent).padStart(2, "0")}/100 M.N.`
}

/** Qué guardar en receptores_fiscales.detallista después de timbrar. */
export function detallistaParaGuardar(usado: DetallistaInput | null, previo: DetallistaGuardado | null): DetallistaGuardado | null {
  if (usado) return { activo: true, gln_comprador: usado.glnComprador, gln_vendedor: usado.glnVendedor, num_proveedor: usado.numProveedor }
  return previo ? { ...previo, activo: false } : null
}
