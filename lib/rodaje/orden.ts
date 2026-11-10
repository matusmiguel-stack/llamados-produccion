// Lógica pura del plan de rodaje: cómo se ordenan días, escenas y separadores,
// qué escenas forman un bloque y qué renglones cambian al mover algo.
// No toca Supabase ni React, para poder probarla sola.

import type { RodajeDia, RodajeEscena, RodajeGuion, RodajeSeparador } from "./tipos"

export const SIN_DIA = "sin-dia"

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

/** "2026-11-10" → "martes 10 nov". Sin zonas horarias: la fecha es la del llamado. */
export function fmtFecha(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "")
  if (!m) return ""
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
  return `${DIAS_SEMANA[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`
}

export function hoyISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Días por fecha (los que no tienen fecha van al final) y luego por creación. */
export function ordenarDias(dias: RodajeDia[]): RodajeDia[] {
  return [...dias].sort((a, b) => {
    const fa = a.fecha || "", fb = b.fecha || ""
    if (!!fa !== !!fb) return fa ? -1 : 1
    if (fa !== fb) return fa < fb ? -1 : 1
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1
    return a.id < b.id ? -1 : 1
  })
}

export type DiaVista = {
  /** id real del día, o null para "Sin día asignado" */
  id: string | null
  clave: string
  n: number | null
  titulo: string
  corto: string
  fecha: string | null
  nota: string
}

/** Los días numerados Día 1, Día 2… más el cajón final "Sin día asignado". */
export function diasVista(dias: RodajeDia[]): DiaVista[] {
  const out: DiaVista[] = ordenarDias(dias).map((d, i) => ({
    id: d.id,
    clave: d.id,
    n: i + 1,
    titulo: `Día ${i + 1}` + (d.fecha ? ` · ${fmtFecha(d.fecha)}` : ""),
    corto: `D${i + 1}`,
    fecha: d.fecha,
    nota: d.nota || "",
  }))
  out.push({ id: null, clave: SIN_DIA, n: null, titulo: "Sin día asignado", corto: "s/día", fecha: null, nota: "" })
  return out
}

export function claveDia(diaId: string | null | undefined): string {
  return diaId || SIN_DIA
}

/** Orden del guion: primero por pieza, luego por escena dentro de la pieza. */
export function comparadorGuion(guiones: RodajeGuion[]) {
  const ord = new Map(guiones.map((g) => [g.id, g.orden]))
  return (a: RodajeEscena, b: RodajeEscena) =>
    (ord.get(a.guion_id) ?? 0) - (ord.get(b.guion_id) ?? 0) ||
    a.orden - b.orden ||
    (a.id < b.id ? -1 : 1)
}

export type Item =
  | { t: "e"; e: RodajeEscena }
  | { t: "s"; s: RodajeSeparador }

/** Escenas y separadores de un día, en el orden en que se filman. */
export function secuenciaDia(
  diaId: string | null,
  escenas: RodajeEscena[],
  seps: RodajeSeparador[],
  guiones: RodajeGuion[]
): Item[] {
  const cmp = comparadorGuion(guiones)
  const items: Item[] = [
    ...escenas.filter((e) => (e.dia_id || null) === diaId).map((e) => ({ t: "e" as const, e })),
    ...(diaId ? seps.filter((s) => s.dia_id === diaId).map((s) => ({ t: "s" as const, s })) : []),
  ]
  const pos = (i: Item) => (i.t === "e" ? i.e.pos : i.s.pos)
  return items.sort((a, b) => {
    if (pos(a) !== pos(b)) return pos(a) - pos(b)
    if (a.t !== b.t) return a.t === "s" ? -1 : 1
    if (a.t === "e" && b.t === "e") return cmp(a.e, b.e)
    if (a.t === "s" && b.t === "s") return a.s.id < b.s.id ? -1 : 1
    return 0
  })
}

export type Corrida = { clave: string; guionId: string; escenas: RodajeEscena[] }

export type Bloque =
  | { t: "sep"; s: RodajeSeparador }
  | { t: "corrida"; c: Corrida }

/**
 * Agrupa las escenas seguidas de una misma pieza en "corridas". Un separador o
 * una escena de otra pieza corta la corrida.
 */
export function bloquesDia(items: Item[]): Bloque[] {
  const out: Bloque[] = []
  let actual: Corrida | null = null
  for (const it of items) {
    if (it.t === "s") {
      actual = null
      out.push({ t: "sep", s: it.s })
      continue
    }
    if (actual && actual.guionId === it.e.guion_id) {
      actual.escenas.push(it.e)
    } else {
      actual = { clave: "c:" + it.e.id, guionId: it.e.guion_id, escenas: [it.e] }
      out.push({ t: "corrida", c: actual })
    }
  }
  return out
}

// ── Modo ordenar ──────────────────────────────────────────────────────────────

export type Fila =
  | { k: "dia"; clave: string; diaId: string | null }
  | { k: "sep"; clave: string; id: string }
  | { k: "esc"; clave: string; id: string }
  | { k: "blk"; clave: string; guionId: string; ids: string[] }

/**
 * La lista plana que se ve en modo ordenar: encabezado de día, y debajo sus
 * renglones. Las escenas seguidas de una pieza salen como un solo bloque (aunque
 * sea de una escena), salvo que esa pieza esté en `separados`.
 */
export function construirFilas(
  dias: DiaVista[],
  escenas: RodajeEscena[],
  seps: RodajeSeparador[],
  guiones: RodajeGuion[],
  separados: Set<string>
): Fila[] {
  const filas: Fila[] = []
  for (const d of dias) {
    filas.push({ k: "dia", clave: "dia:" + d.clave, diaId: d.id })
    for (const b of bloquesDia(secuenciaDia(d.id, escenas, seps, guiones))) {
      if (b.t === "sep") {
        filas.push({ k: "sep", clave: "sep:" + b.s.id, id: b.s.id })
      } else if (!separados.has(b.c.guionId)) {
        filas.push({
          k: "blk",
          clave: "blk:" + b.c.escenas[0].id,
          guionId: b.c.guionId,
          ids: b.c.escenas.map((e) => e.id),
        })
      } else {
        for (const e of b.c.escenas) filas.push({ k: "esc", clave: "esc:" + e.id, id: e.id })
      }
    }
  }
  return filas
}

/** Un separador no puede quedar en "Sin día asignado". */
function esValida(filas: Fila[]): boolean {
  if (!filas.length || filas[0].k !== "dia") return false
  let dia: string | null = null
  for (const f of filas) {
    if (f.k === "dia") dia = f.diaId
    else if (f.k === "sep" && dia === null) return false
  }
  return true
}

/**
 * Mueve un renglón a la posición `destino` (índice en la lista ya sin él).
 * Nunca queda arriba del primer encabezado de día. Devuelve la misma lista si
 * el movimiento no es válido o no cambia nada.
 */
export function moverFila(filas: Fila[], clave: string, destino: number): Fila[] {
  const desde = filas.findIndex((f) => f.clave === clave)
  if (desde < 0 || filas[desde].k === "dia") return filas
  const resto = filas.filter((_, i) => i !== desde)
  const en = Math.max(1, Math.min(destino, resto.length))
  if (en === desde) return filas
  const nueva = [...resto.slice(0, en), filas[desde], ...resto.slice(en)]
  return esValida(nueva) ? nueva : filas
}

/** ▲ / ▼: un lugar arriba o abajo; al cruzar un encabezado cambia de día. */
export function moverUnPaso(filas: Fila[], clave: string, dir: -1 | 1): Fila[] {
  const desde = filas.findIndex((f) => f.clave === clave)
  if (desde < 0) return filas
  return moverFila(filas, clave, desde + dir)
}

/** Manda un renglón al final del día indicado. */
export function moverADia(filas: Fila[], clave: string, diaId: string | null): Fila[] {
  const desde = filas.findIndex((f) => f.clave === clave)
  if (desde < 0 || filas[desde].k === "dia") return filas
  const resto = filas.filter((_, i) => i !== desde)
  const cab = resto.findIndex((f) => f.k === "dia" && f.diaId === diaId)
  if (cab < 0) return filas
  let fin = cab + 1
  while (fin < resto.length && resto[fin].k !== "dia") fin++
  const nueva = [...resto.slice(0, fin), filas[desde], ...resto.slice(fin)]
  return esValida(nueva) ? nueva : filas
}

/** Día en el que está un renglón dentro de la lista. */
export function diaDeFila(filas: Fila[], clave: string): string | null {
  let dia: string | null = null
  for (const f of filas) {
    if (f.k === "dia") dia = f.diaId
    else if (f.clave === clave) return dia
  }
  return null
}

export type CambioOrden = { t: "e" | "s"; id: string; dia: string | null; pos: number }

/**
 * Compara la lista con lo guardado y devuelve solo los renglones cuyo día o
 * posición cambió (es lo que se manda a rodaje_guardar_orden).
 */
export function cambiosDeFilas(
  filas: Fila[],
  escenas: RodajeEscena[],
  seps: RodajeSeparador[]
): CambioOrden[] {
  const porEsc = new Map(escenas.map((e) => [e.id, e]))
  const porSep = new Map(seps.map((s) => [s.id, s]))
  const out: CambioOrden[] = []
  let dia: string | null = null
  let pos = 0
  for (const f of filas) {
    if (f.k === "dia") {
      dia = f.diaId
      pos = 0
      continue
    }
    if (f.k === "sep") {
      const s = porSep.get(f.id)
      if (s && dia && (s.dia_id !== dia || s.pos !== pos)) out.push({ t: "s", id: f.id, dia, pos })
      pos++
      continue
    }
    for (const id of f.k === "blk" ? f.ids : [f.id]) {
      const e = porEsc.get(id)
      if (e && ((e.dia_id || null) !== dia || e.pos !== pos)) out.push({ t: "e", id, dia, pos })
      pos++
    }
  }
  return out
}

/** Aplica los cambios en memoria (para pintar antes de que conteste el servidor). */
export function aplicarCambios(
  escenas: RodajeEscena[],
  seps: RodajeSeparador[],
  cambios: CambioOrden[]
): { escenas: RodajeEscena[]; seps: RodajeSeparador[] } {
  const ce = new Map(cambios.filter((c) => c.t === "e").map((c) => [c.id, c]))
  const cs = new Map(cambios.filter((c) => c.t === "s").map((c) => [c.id, c]))
  return {
    escenas: escenas.map((e) => {
      const c = ce.get(e.id)
      return c ? { ...e, dia_id: c.dia, pos: c.pos } : e
    }),
    seps: seps.map((s) => {
      const c = cs.get(s.id)
      return c && c.dia ? { ...s, dia_id: c.dia, pos: c.pos } : s
    }),
  }
}

/** Siguiente posición libre al final de un día. */
export function siguientePos(
  diaId: string | null,
  escenas: RodajeEscena[],
  seps: RodajeSeparador[]
): number {
  let max = -1
  for (const e of escenas) if ((e.dia_id || null) === diaId && e.pos > max) max = e.pos
  if (diaId) for (const s of seps) if (s.dia_id === diaId && s.pos > max) max = s.pos
  return max + 1
}

// ── Texto ─────────────────────────────────────────────────────────────────────

/** Minúsculas y sin acentos, para buscar. */
export function norm(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
}

/** "INT. CASA / SALA · DÍA" a partir de los campos de la escena. */
export function slugEscena(e: Pick<RodajeEscena, "ie" | "locacion" | "momento" | "encabezado">): string {
  const loc = [e.ie ? e.ie + "." : "", e.locacion].filter(Boolean).join(" ")
  const base = loc || e.encabezado || "Sin locación"
  return e.momento ? `${base} · ${e.momento}` : base
}
