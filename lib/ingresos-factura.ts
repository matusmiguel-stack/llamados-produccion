import type { SupabaseClient } from "@supabase/supabase-js"
import { nombreLiquidacion } from "./liquidacion"

// Columnas del ingreso que se necesitan para registrar su factura
export const INGRESO_FACTURA_COLS =
  "id, proyecto, estatus, subtotal, iva, empresa, cliente_agencia, responsable, mes_cierre, created_at, project_id, liquidacion_project_id"

export type IngresoParaFactura = {
  id: string
  proyecto: string | null
  subtotal: number | null
  iva: number | null
  empresa: string
  cliente_agencia: string | null
  responsable: string | null
  mes_cierre: string | null
  created_at: string
  project_id: string | null
  liquidacion_project_id: string | null
}

// Valida el monto parcial (sin IVA) contra el subtotal del ingreso.
// Devuelve null si se factura todo, o un mensaje de error.
export function validarParcial(raw: string, subtotalOriginal: number): { parcial: number | null; error?: string } {
  if (!raw) return { parcial: null }
  const parcial = Math.round(parseFloat(raw) * 100) / 100
  if (!Number.isFinite(parcial) || parcial <= 0) return { parcial: null, error: "El monto parcial no es válido" }
  if (parcial >= subtotalOriginal) {
    return {
      parcial: null,
      error: "El monto parcial debe ser menor al subtotal del ingreso; para facturar todo deja la parcialidad vacía",
    }
  }
  return { parcial }
}

// Guarda XML y PDF en storage, marca el ingreso como facturado y, si la
// factura es parcial, crea la línea del remanente ("… - Liquidación").
// Lo comparten "subir XML/PDF" (facturas de Orderly) y "timbrar en la app".
export async function registrarFacturaIngreso(
  admin: SupabaseClient,
  ingreso: IngresoParaFactura,
  opts: {
    xml: Buffer
    pdf: Buffer
    xmlName: string
    pdfName: string
    numeroFactura: string
    uuidFiscal: string | null
    parcial: number | null
    label: string
    extra?: Record<string, unknown>   // columnas adicionales del ingreso (facturapi_id…)
  },
): Promise<{ remanente: { proyecto: string; subtotal: number } | null }> {
  const { numeroFactura, parcial } = opts
  const subtotalOriginal = Number(ingreso.subtotal ?? 0)
  const ivaOriginal = Number(ingreso.iva ?? 0)

  // Guardar archivos
  const stamp = Date.now()
  const safe = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_")
  const folder = `ingresos/${safe(numeroFactura)}`

  const xmlUp = await admin.storage.from("facturas")
    .upload(`${folder}/${stamp}-${safe(opts.xmlName)}`, opts.xml, { contentType: "text/xml" })
  if (xmlUp.error) throw new Error(`No se pudo guardar el XML: ${xmlUp.error.message}`)
  const pdfUp = await admin.storage.from("facturas")
    .upload(`${folder}/${stamp}-${safe(opts.pdfName)}`, opts.pdf, { contentType: "application/pdf" })
  if (pdfUp.error) throw new Error(`No se pudo guardar el PDF: ${pdfUp.error.message}`)

  // Parcial: el IVA se prorratea para que las dos líneas sumen el original
  const ivaParcial = parcial != null && subtotalOriginal > 0
    ? Math.round(ivaOriginal * (parcial / subtotalOriginal) * 100) / 100
    : null

  const { error: updErr } = await admin
    .from("ingresos")
    .update({
      estatus: "facturado",
      numero_factura: numeroFactura,
      factura_uuid: opts.uuidFiscal,
      factura_xml_path: xmlUp.data.path,
      factura_pdf_path: pdfUp.data.path,
      ...(parcial != null ? { subtotal: parcial, iva: ivaParcial } : {}),
      ...(opts.extra || {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", ingreso.id)
  if (updErr) throw new Error(updErr.message)

  // Crear la línea del remanente ("… - Liquidación"). Va DESVINCULADA de
  // proyecto y cotización: solo vive en el control de ingresos, así no toca
  // egresos ni cotizaciones, y finanzas puede corregirla como ingreso manual.
  if (parcial == null) return { remanente: null }
  const nombreBase = opts.label || ingreso.proyecto || ""
  const nombreRem = nombreLiquidacion(nombreBase)
  const subtotalRem = Math.round((subtotalOriginal - parcial) * 100) / 100
  const ivaRem = Math.round((ivaOriginal - (ivaParcial ?? 0)) * 100) / 100
  // created_at un segundo antes del original: la lista ordena por fecha
  // descendente, así el remanente queda justo ABAJO de la línea facturada.
  const createdRem = new Date(new Date(ingreso.created_at).getTime() - 1000).toISOString()
  const { error: insErr } = await admin.from("ingresos").insert({
    empresa: ingreso.empresa,
    cliente_agencia: ingreso.cliente_agencia,
    responsable: ingreso.responsable,
    proyecto: nombreRem,
    // Hipervínculo al proyecto de origen (o el heredado, si esto ya es una
    // Liquidación encadenada). NO es project_id: la línea sigue siendo manual.
    liquidacion_project_id: ingreso.project_id ?? ingreso.liquidacion_project_id ?? null,
    subtotal: subtotalRem,
    iva: ivaRem,
    estatus: "en_produccion",
    mes_cierre: ingreso.mes_cierre,
    notas: `Remanente de la factura ${numeroFactura}`,
    created_at: createdRem,
    updated_at: new Date().toISOString(),
  })
  if (insErr) {
    throw new Error(`La factura se guardó, pero no se pudo crear la línea de liquidación: ${insErr.message}`)
  }
  return { remanente: { proyecto: nombreRem, subtotal: subtotalRem } }
}
