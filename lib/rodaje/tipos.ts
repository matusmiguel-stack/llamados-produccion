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

export type RodajeGuion = {
  id: string
  plan_id: string
  archivo_id: string | null
  orden: number
  numero: string
  titulo: string
  resumen: string
  notas: string[]
  unidad: 1 | 2 | null
}

export type RodajeDia = {
  id: string
  plan_id: string
  fecha: string | null
  nota: string
  created_at: string
}

export type RodajeEscena = {
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
  dia_id: string | null
  pos: number
  filmada: boolean
  filmada_at: string | null
  filmada_por: string | null
}

export type RodajeSeparador = {
  id: string
  plan_id: string
  dia_id: string
  titulo: string
  pos: number
}

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

/** Columnas de rodaje_escenas que carga el plan (todas menos el texto). */
export const COLUMNAS_ESCENA =
  "id, plan_id, guion_id, orden, numero, encabezado, ie, locacion, momento, descripcion, " +
  "personajes, pagina, tiene_texto, dia_id, pos, filmada, filmada_at, filmada_por"
