import { supabase } from "./supabase"

// Control de egresos por código de aprobación.
//
// Un proyecto puede tener varias cotizaciones aprobadas: la primera con el
// código del proyecto (RS3007) y las siguientes con uno consecutivo (RS3007-1,
// RS3007-2…, ver lib/codigo-aprobacion.ts). Cada código lleva su control de
// egresos aparte: sus gastos, pagos, instrucciones de facturación, facturas de
// proveedores y reportes, con su propia empresa y responsable.
//
// Las cotizaciones sin código (viejas, o la contenedora de egresos directos)
// pertenecen al código del proyecto.

export type GrupoEgresos = {
  codigo: string | null        // RS3007 / RS3007-1 (null si el proyecto aún no tiene código)
  nombre: string               // "Banamex Branding" / "Resizing"
  quoteIds: string[]
  empresa: "retro_studio" | "retro_films" | null
  responsable: string | null
  adicional: boolean           // true = sub-código (RS3007-1)
}

/** ¿Es un sub-código de aprobación adicional (RS3007-1)? */
export function esSubcodigo(codigo: string | null | undefined): boolean {
  return !!codigo && /^RS\d+-\d+$/i.test(codigo.trim())
}

type QuoteCodigo = {
  id: string
  name: string
  codigo: string | null
  codigo_nombre: string | null
  empresa: "retro_studio" | "retro_films" | null
  responsable: string | null
}

type ProyectoBase = {
  code: string | null
  name: string
  empresa: "retro_studio" | "retro_films" | null
  responsable: string | null
}

export function agruparPorCodigo(quotes: QuoteCodigo[], proyecto: ProyectoBase): GrupoEgresos[] {
  const base: GrupoEgresos = {
    codigo: proyecto.code, nombre: proyecto.name, quoteIds: [],
    empresa: proyecto.empresa, responsable: proyecto.responsable, adicional: false,
  }
  const subs = new Map<string, GrupoEgresos>()
  for (const q of quotes) {
    if (esSubcodigo(q.codigo)) {
      const codigo = q.codigo!.trim().toUpperCase()
      const g = subs.get(codigo) || {
        codigo, nombre: q.codigo_nombre?.trim() || q.name, quoteIds: [],
        empresa: q.empresa || proyecto.empresa, responsable: q.responsable || proyecto.responsable,
        adicional: true,
      }
      g.quoteIds.push(q.id)
      subs.set(codigo, g)
    } else {
      base.quoteIds.push(q.id)
    }
  }
  const sufijo = (c: string | null) => Number((c || "").split("-")[1] || 0)
  return [base, ...[...subs.values()].sort((a, b) => sufijo(a.codigo) - sufijo(b.codigo))]
}

/** Cotizaciones liberadas del proyecto agrupadas por código (control de egresos). */
export async function gruposDeEgresos(projectId: string, proyecto: ProyectoBase): Promise<GrupoEgresos[]> {
  const { data, error } = await supabase
    .from("quotes")
    .select("id,name,codigo,codigo_nombre,empresa,responsable")
    .eq("project_id", projectId).eq("released", true)
    .order("created_at", { ascending: true })
  if (error) throw error
  return agruparPorCodigo((data || []) as QuoteCodigo[], proyecto)
}
