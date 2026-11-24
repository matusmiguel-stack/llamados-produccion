// Tipos del módulo Plan de rodaje (tablas rodaje_* en Supabase).

// Roles que pueden editar el plan. Admin, Editor Post (rol "productor") y
// Editor Premium. Debe coincidir con la función SQL rodaje_puede_editar().
export const ROLES_EDITAN_RODAJE = ["admin", "productor", "editor_premium"]

export function puedeEditarRodaje(role?: string | null): boolean {
  return !!role && ROLES_EDITAN_RODAJE.includes(role)
}

export type Etiqueta = "guion" | "video" | "capitulo" | "episodio"

export const ETIQUETAS: Record<Etiqueta, { uno: string; varios: string; genero: "m" | "f" }> = {
  guion:    { uno: "Guion",    varios: "Guiones",   genero: "m" },
  video:    { uno: "Video",    varios: "Videos",    genero: "m" },
  capitulo: { uno: "Capítulo", varios: "Capítulos", genero: "m" },
  episodio: { uno: "Episodio", varios: "Episodios", genero: "m" },
}

export type TipoLinea =
  | "accion"
  | "personaje"
  | "dialogo"
  | "acotacion"
  | "super"
  | "transicion"
  | "nota"

export const TIPOS_LINEA: TipoLinea[] = [
  "accion", "personaje", "dialogo", "acotacion", "super", "transicion", "nota",
]

export type LineaGuion = { t: TipoLinea; x: string }

export type RodajePlan = {
  id: string
  project_id: string
  etiqueta: Etiqueta
  created_at: string
}

export type UsoIA = {
  entrada?: number
  salida?: number
  cache_lectura?: number
  cache_escritura?: number
  modelo?: string
}

export type RodajeArchivo = {
  id: string
  plan_id: string
  nombre: string
  ruta: string
  mime: string
  tamano: number | null
  estado: "subido" | "leido" | "aplicado" | "error"
  indice: IndiceIA | null
  error: string | null
  uso: UsoIA
  created_at: string
}

/** Una pieza del plan: un guion (o video, capítulo…) o una lista de fotos. */
export type TipoPieza = "guion" | "fotos"

export type RodajeGuion = {
  id: string
  plan_id: string
  archivo_id: string | null
  orden: number
  numero: string
  titulo: string
  resumen: string
  notas: string[]
  tipo: TipoPieza
}

export type TipoUnidad = "video" | "foto"

/** Una unidad de rodaje (video, segunda unidad, foto…) con su propio plan de trabajo. */
export type RodajeUnidad = {
  id: string
  plan_id: string
  nombre: string
  tipo: TipoUnidad
  orden: number
  created_at: string
}

export const MAX_UNIDADES = 8

/** Cómo se dice que algo ya se hizo: video "filma", foto "hace". */
export function palabras(tipo: TipoUnidad | undefined) {
  return tipo === "foto"
    ? { hecha: "Hecha", hechas: "hechas", unaHecha: "hecha", marcar: "Marcar hecha", pendientes: "Por hacer" }
    : { hecha: "Filmada", hechas: "filmadas", unaHecha: "filmada", marcar: "Marcar filmada", pendientes: "Por filmar" }
}

/** "Video 3", "Capítulo 2"… o "Fotos" si la pieza es una lista de fotos. */
export function nombrePieza(etq: { uno: string }, g: Pick<RodajeGuion, "numero" | "tipo"> | undefined): string {
  if (!g) return etq.uno
  return g.tipo === "fotos" ? "Fotos" : `${etq.uno} ${g.numero}`
}

export type RodajeDia = {
  id: string
  plan_id: string
  fecha: string | null
  nota: string
  created_at: string
}

/** Lo que dice la escena (igual para todas las unidades). */
export type EscenaBase = {
  id: string
  plan_id: string
  guion_id: string
  orden: number
  numero: string
  encabezado: string
  ie: string
  locacion: string
  momento: string
  descripcion: string
  personajes: string[]
  pagina: number | null
  /** true cuando la IA ya transcribió el texto de la escena */
  tiene_texto: boolean
  /** No viene en la lista del plan; se pide al abrir el guion de la escena */
  texto?: LineaGuion[] | null
}

/** Dónde va la escena en el plan de UNA unidad, y si esa unidad ya la hizo. */
export type LugarEscena = {
  dia_id: string | null
  pos: number
  filmada: boolean
  filmada_at: string | null
  filmada_por: string | null
}

/** Una escena vista desde el plan de una unidad. */
export type RodajeEscena = EscenaBase & LugarEscena

/** Fila de rodaje_asignaciones: una escena dentro del plan de una unidad. */
export type RodajeAsignacion = LugarEscena & {
  id: string
  plan_id: string
  escena_id: string
  unidad_id: string
}

/** Nota de llamado de un día para una unidad. */
export type RodajeNotaDia = {
  dia_id: string
  unidad_id: string
  plan_id: string
  nota: string
}

export type RodajeSeparador = {
  id: string
  plan_id: string
  dia_id: string
  unidad_id: string | null
  titulo: string
  pos: number
}

/** Un emplazamiento calificado de una escena: cuál toma es la buena y cuál la protección. */
export type RodajeToma = {
  id: string
  plan_id: string
  escena_id: string
  unidad_id: string | null
  orden: number
  emplazamiento: string
  buena: string
  proteccion: string
  notas: string
  updated_by: string | null
  updated_at: string
}

/** Lo que se captura en el formulario de tomas (id solo si el renglón ya existía). */
export type FilaToma = Pick<RodajeToma, "emplazamiento" | "buena" | "proteccion" | "notas"> & { id?: string }

export const MAX_TOMAS_POR_ESCENA = 30

// ── Lo que devuelve la IA al leer un guion ────────────────────────────────────

export type EscenaIA = {
  numero: string
  encabezado: string
  ie: string
  locacion: string
  momento: string
  descripcion: string
  personajes: string[]
  pagina: number
}

export type GuionIA = {
  numero: string
  titulo: string
  resumen: string
  notas: string[]
  escenas: EscenaIA[]
}

export type IndiceIA = {
  tipo_unidad: Etiqueta
  guiones: GuionIA[]
}

export const TIPOS_ARCHIVO_GUION: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "text/plain": "Texto",
}

export const MAX_BYTES_GUION = 30 * 1024 * 1024

/**
 * Columnas de rodaje_escenas que carga el plan: lo que dice la escena, sin el
 * texto. El día, el orden y el "filmada" ya no se leen de aquí sino de
 * rodaje_asignaciones (uno por unidad).
 */
export const COLUMNAS_ESCENA =
  "id, plan_id, guion_id, orden, numero, encabezado, ie, locacion, momento, descripcion, " +
  "personajes, pagina, tiene_texto"

export const COLUMNAS_ASIGNACION =
  "id, plan_id, escena_id, unidad_id, dia_id, pos, filmada, filmada_at, filmada_por"
