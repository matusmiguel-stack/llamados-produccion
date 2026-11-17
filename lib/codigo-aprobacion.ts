import { supabase } from "./supabase"

// Código con el que se aprueba una cotización (y con el que se nombra su línea
// en Ingresos):
//   - Primera aprobación del proyecto → el código del proyecto (RS3007),
//     generándolo si todavía no tiene.
//   - Aprobaciones siguientes (otra cotización del MISMO proyecto, p. ej. unos
//     resizings) → RS3007-1, RS3007-2… consecutivos. Así cada cotización tiene
//     su propia línea en Ingresos sin moverla de carpeta.
//
// El sufijo solo vive en `ingresos.proyecto`; `projects.code` se queda como
// RS3007 (egresos, facturas de proveedores y next_project_code siguen igual).

export type CodigoAprobacion = {
  codigo: string | null // null = se genera al confirmar (proyecto sin código)
  adicional: boolean    // true = el proyecto ya tenía ingresos → código con sufijo
}

async function etiquetasDeIngresos(projectId: string): Promise<string[]> {
  const { data, error } = await supabase.from("ingresos").select("proyecto").eq("project_id", projectId)
  if (error) throw error
  return (data || []).map((r: { proyecto: string | null }) => r.proyecto || "")
}

function siguienteSubcodigo(base: string, etiquetas: string[]): string {
  const escapado = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(`^${escapado}-(\\d+)\\b`)
  let max = 0
  for (const e of etiquetas) {
    const m = e.trim().match(re)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${base}-${max + 1}`
}

/** Vista previa para el modal: no genera ni guarda nada. */
export async function previewCodigoAprobacion(projectId: string, projectCode: string | null): Promise<CodigoAprobacion> {
  const etiquetas = await etiquetasDeIngresos(projectId)
  if (etiquetas.length === 0) return { codigo: projectCode, adicional: false }
  return { codigo: projectCode ? siguienteSubcodigo(projectCode, etiquetas) : null, adicional: true }
}

/** Al confirmar: genera el código del proyecto si hace falta y devuelve el definitivo. */
export async function resolverCodigoAprobacion(
  projectId: string,
  projectCode: string | null,
): Promise<CodigoAprobacion & { codigoProyecto: string | null }> {
  let base = projectCode
  if (!base) {
    const { data } = await supabase.rpc("next_project_code")
    if (data) {
      base = data as string
      await supabase.from("projects").update({ code: base }).eq("id", projectId)
    }
  }
  const etiquetas = await etiquetasDeIngresos(projectId)
  if (etiquetas.length === 0 || !base) return { codigo: base, adicional: false, codigoProyecto: base }
  return { codigo: siguienteSubcodigo(base, etiquetas), adicional: true, codigoProyecto: base }
}

/** ¿Esta cotización ya tiene su línea en Ingresos? */
export async function cotizacionYaAprobada(
  quoteId: string,
  quoteStatus: string | null,
  projectId: string | null,
): Promise<boolean> {
  const { count } = await supabase
    .from("ingresos").select("id", { count: "exact", head: true }).eq("quote_id", quoteId)
  if ((count || 0) > 0) return true
  // Ingresos viejos se capturaron sin quote_id: si la cotización ya está marcada
  // como aprobada y el proyecto ya tiene ingresos, se asume que es la suya.
  if (quoteStatus === "approved" && projectId) {
    const { count: delProyecto } = await supabase
      .from("ingresos").select("id", { count: "exact", head: true }).eq("project_id", projectId)
    return (delProyecto || 0) > 0
  }
  return false
}
