// Unidades de rodaje: cómo se pasa de lo que hay en la base (escenas por un
// lado, y por otro su lugar en el plan de cada unidad) al plan de UNA unidad,
// que es lo que pintan las vistas. Lógica pura, sin Supabase ni React.

import type { CambioOrden } from "./orden"
import type {
  EscenaBase, RodajeArchivo, RodajeAsignacion, RodajeDia, RodajeEscena, RodajeGuion, RodajeNotaDia,
  RodajePlan, RodajeSeparador, RodajeToma, RodajeUnidad,
} from "./tipos"

/** Todo lo que se carga de un plan, tal como está en la base. */
export type DatosCrudos = {
  plan: RodajePlan
  archivos: RodajeArchivo[]
  guiones: RodajeGuion[]
  dias: RodajeDia[]
  escenas: EscenaBase[]
  seps: RodajeSeparador[]
  tomas: RodajeToma[]
  unidades: RodajeUnidad[]
  asignaciones: RodajeAsignacion[]
  notas: RodajeNotaDia[]
}

/** El plan visto desde una unidad. */
export type DatosPlan = {
  plan: RodajePlan
  archivos: RodajeArchivo[]
  guiones: RodajeGuion[]
  /** Los días son de todo el plan; la nota es la de esta unidad */
  dias: RodajeDia[]
  /** Solo las escenas que esta unidad trabaja, con su día, orden y avance */
  escenas: RodajeEscena[]
  seps: RodajeSeparador[]
  tomas: RodajeToma[]
  /** La unidad desde la que se ve el plan */
  unidad: RodajeUnidad
  /** Todas las unidades del plan, en orden */
  unidades: RodajeUnidad[]
  /** Todas las escenas del plan, estén o no en esta unidad */
  todas: EscenaBase[]
  /** El lugar de cada escena en cada unidad (de todas las unidades) */
  asignaciones: RodajeAsignacion[]
  /** Las tomas calificadas por todas las unidades */
  tomasTodas: RodajeToma[]
}

export function ordenarUnidades(unidades: RodajeUnidad[]): RodajeUnidad[] {
  return [...unidades].sort(
    (a, b) =>
      a.orden - b.orden ||
      (a.created_at === b.created_at ? 0 : a.created_at < b.created_at ? -1 : 1) ||
      (a.id < b.id ? -1 : 1)
  )
}

/** La unidad pedida o, si ya no existe, la primera. */
export function unidadActual(unidades: RodajeUnidad[], id: string | null | undefined): RodajeUnidad | undefined {
  const orden = ordenarUnidades(unidades)
  return orden.find((u) => u.id === id) || orden[0]
}

// Un plan siempre tiene al menos una unidad; esto solo cubre el instante en que
// todavía no se crea.
const UNIDAD_VACIA: RodajeUnidad = { id: "", plan_id: "", nombre: "Unidad 1", tipo: "video", orden: 0, created_at: "" }

/** Separadores y tomas viejos sin unidad cuentan como de la primera. */
function esDeUnidad(unidadId: string | null, u: RodajeUnidad, primera: RodajeUnidad | undefined): boolean {
  return unidadId ? unidadId === u.id : !!primera && primera.id === u.id
}

export function proyectar(c: DatosCrudos, unidadId: string | null | undefined): DatosPlan {
  const unidades = ordenarUnidades(c.unidades)
  const unidad = unidades.find((u) => u.id === unidadId) || unidades[0] || { ...UNIDAD_VACIA, plan_id: c.plan.id }
  const primera = unidades[0]

  const porEscena = new Map(c.escenas.map((e) => [e.id, e]))
  const escenas: RodajeEscena[] = []
  for (const a of c.asignaciones) {
    if (a.unidad_id !== unidad.id) continue
    const e = porEscena.get(a.escena_id)
    if (!e) continue
    escenas.push({
      ...e,
      dia_id: a.dia_id,
      pos: a.pos,
      filmada: a.filmada,
      filmada_at: a.filmada_at,
      filmada_por: a.filmada_por,
    })
  }

  const notas = new Map(c.notas.filter((n) => n.unidad_id === unidad.id).map((n) => [n.dia_id, n.nota]))

  return {
    plan: c.plan,
    archivos: c.archivos,
    guiones: c.guiones,
    dias: c.dias.map((d) => ({ ...d, nota: notas.get(d.id) || "" })),
    escenas,
    seps: c.seps.filter((s) => esDeUnidad(s.unidad_id, unidad, primera)),
    tomas: c.tomas.filter((t) => esDeUnidad(t.unidad_id, unidad, primera)),
    unidad,
    unidades: unidades.length ? unidades : [unidad],
    todas: c.escenas,
    asignaciones: c.asignaciones,
    tomasTodas: c.tomas,
  }
}

/** Siguiente posición libre al final de un día, en el plan de una unidad. */
export function siguientePosEn(c: DatosCrudos, unidadId: string, diaId: string | null): number {
  let max = -1
  for (const a of c.asignaciones) {
    if (a.unidad_id === unidadId && (a.dia_id || null) === diaId && a.pos > max) max = a.pos
  }
  if (diaId) {
    for (const s of c.seps) if (s.unidad_id === unidadId && s.dia_id === diaId && s.pos > max) max = s.pos
  }
  return max + 1
}

/** Aplica en memoria un reordenamiento del plan de una unidad. */
export function aplicarOrden(
  c: DatosCrudos,
  unidadId: string,
  cambios: CambioOrden[]
): Pick<DatosCrudos, "asignaciones" | "seps"> {
  const ce = new Map(cambios.filter((x) => x.t === "e").map((x) => [x.id, x]))
  const cs = new Map(cambios.filter((x) => x.t === "s").map((x) => [x.id, x]))
  return {
    asignaciones: c.asignaciones.map((a) => {
      const x = a.unidad_id === unidadId ? ce.get(a.escena_id) : undefined
      return x ? { ...a, dia_id: x.dia, pos: x.pos } : a
    }),
    seps: c.seps.map((s) => {
      const x = cs.get(s.id)
      return x && x.dia ? { ...s, dia_id: x.dia, pos: x.pos } : s
    }),
  }
}

/** Escenas del plan que ninguna unidad tiene (por ejemplo, tras borrar su unidad). */
export function escenasSinUnidad(d: Pick<DatosPlan, "todas" | "asignaciones">): EscenaBase[] {
  const con = new Set(d.asignaciones.map((a) => a.escena_id))
  return d.todas.filter((e) => !con.has(e.id))
}

/** Escenas que al menos una unidad ya marcó como hechas. */
export function escenasHechas(asignaciones: RodajeAsignacion[]): Set<string> {
  return new Set(asignaciones.filter((a) => a.filmada).map((a) => a.escena_id))
}

/** "Unidad 3": el primer nombre libre para una unidad nueva. */
export function nombreUnidadNueva(unidades: RodajeUnidad[], tipo: RodajeUnidad["tipo"]): string {
  const usados = new Set(unidades.map((u) => u.nombre.trim().toLowerCase()))
  if (tipo === "foto") {
    if (!usados.has("foto")) return "Foto"
    for (let n = 2; ; n++) if (!usados.has(`foto ${n}`)) return `Foto ${n}`
  }
  for (let n = unidades.length + 1; ; n++) if (!usados.has(`unidad ${n}`)) return `Unidad ${n}`
}

/** Siguiente número de pieza para una lista de fotos: "F", "F2", "F3"… */
export function numeroListaFotos(guiones: RodajeGuion[]): string {
  const usados = new Set(guiones.map((g) => g.numero.trim().toUpperCase()))
  if (!usados.has("F")) return "F"
  for (let n = 2; ; n++) if (!usados.has(`F${n}`)) return `F${n}`
}

/** Un renglón pegado → una foto. Quita viñetas y numeración ("1.", "-", "•"). */
export function lineasDeFotos(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-–—•*·]+|\d{1,3}\s*[.)\-:])\s*/, "").trim())
    .filter(Boolean)
}
