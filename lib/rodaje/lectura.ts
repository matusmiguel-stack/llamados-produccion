// Lectura del texto de las escenas por tandas (para el botón GUION).
// Corre en el navegador de quien subió el guion: pide tandas chicas a
// /api/rodaje/leer para que ninguna llamada se acerque al tope de tiempo.

import { ErrorApi, leerTextoEscenas } from "./datos"
import type { RodajeEscena, RodajeGuion } from "./tipos"

export type Tanda = { archivoId: string; ids: string[]; reintento?: boolean }

const MAX_ESCENAS = 8
const MAX_PAGINAS = 6

/** Escenas a las que les falta el texto y cuyo archivo original sigue disponible. */
export function escenasSinTexto(escenas: RodajeEscena[], guiones: RodajeGuion[]): RodajeEscena[] {
  const conArchivo = new Set(guiones.filter((g) => g.archivo_id).map((g) => g.id))
  return escenas.filter((e) => !e.tiene_texto && conArchivo.has(e.guion_id))
}

/**
 * Parte las escenas pendientes en tandas por archivo, en el orden del guion.
 * Cada tanda lleva hasta 8 escenas o unas 6 páginas, lo que llegue primero.
 */
export function armarTandas(escenas: RodajeEscena[], guiones: RodajeGuion[]): Tanda[] {
  const tandas: Tanda[] = []
  const porGuion = [...guiones]
    .filter((g) => g.archivo_id)
    .sort((a, b) => a.orden - b.orden)

  let actual: Tanda | null = null
  let paginas = 0
  const cerrar = () => {
    if (actual && actual.ids.length) tandas.push(actual)
    actual = null
    paginas = 0
  }

  for (const g of porGuion) {
    const delGuion = escenas.filter((e) => e.guion_id === g.id).sort((a, b) => a.orden - b.orden)
    for (let i = 0; i < delGuion.length; i++) {
      const e = delGuion[i]
      if (e.tiene_texto) continue
      const sig = delGuion[i + 1]
      // Cuánto ocupa la escena: hasta donde empieza la siguiente.
      const largo =
        e.pagina && sig?.pagina && sig.pagina >= e.pagina ? Math.max(sig.pagina - e.pagina, 0.3) : 1

      if (actual && actual.archivoId !== g.archivo_id) cerrar()
      if (!actual) actual = { archivoId: g.archivo_id as string, ids: [] }
      actual.ids.push(e.id)
      paginas += largo
      if (actual.ids.length >= MAX_ESCENAS || paginas >= MAX_PAGINAS) cerrar()
    }
  }
  cerrar()
  return tandas
}

export type Progreso = { total: number; leidas: number; fallidas: number }

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Lee todas las tandas. La primera va sola (deja el archivo en caché de la IA)
 * y las demás de dos en dos. Si una tanda no cabe o tarda demasiado, se parte
 * a la mitad y se reintenta.
 */
export async function leerTandas(opciones: {
  tandas: Tanda[]
  alAvanzar: (p: Progreso) => void
  cancelado: () => boolean
}): Promise<Progreso & { error: string | null }> {
  const cola = [...opciones.tandas]
  const total = cola.reduce((n, t) => n + t.ids.length, 0)
  let leidas = 0
  let fallidas = 0
  let errorFatal: string | null = null
  let ultimoError: string | null = null

  const avisar = () => opciones.alAvanzar({ total, leidas, fallidas })

  async function procesar(t: Tanda, intento = 0): Promise<void> {
    if (opciones.cancelado() || errorFatal) return
    try {
      const r = await leerTextoEscenas(t.archivoId, t.ids)
      leidas += r.leidas.length
      if (r.faltan.length) {
        if (t.reintento) fallidas += r.faltan.length
        else cola.push({ archivoId: t.archivoId, ids: r.faltan, reintento: true })
      }
    } catch (err) {
      const e = err instanceof ErrorApi ? err : new ErrorApi((err as Error)?.message || "Error", "otro", 0)
      ultimoError = e.message
      if (e.codigo === "truncado" || e.codigo === "tiempo") {
        if (t.ids.length > 1) {
          const mitad = Math.ceil(t.ids.length / 2)
          cola.unshift(
            { archivoId: t.archivoId, ids: t.ids.slice(0, mitad), reintento: t.reintento },
            { archivoId: t.archivoId, ids: t.ids.slice(mitad), reintento: t.reintento }
          )
        } else if (intento < 1) {
          return procesar(t, intento + 1)
        } else {
          fallidas += 1
        }
      } else if ((e.codigo === "limite" || e.codigo === "red") && intento < 2) {
        await espera(e.codigo === "limite" ? 20_000 : 5_000)
        return procesar(t, intento + 1)
      } else if (e.codigo === "config" || e.codigo === "limite" || e.status === 401 || e.status === 403) {
        errorFatal = e.message
      } else {
        fallidas += t.ids.length
      }
    }
    avisar()
  }

  avisar()
  const primera = cola.shift()
  if (primera) await procesar(primera)

  async function trabajador() {
    for (;;) {
      if (opciones.cancelado() || errorFatal) return
      const t = cola.shift()
      if (!t) return
      await procesar(t)
    }
  }
  // Dos a la vez; si una tanda se parte y vuelve a la cola, se retoma.
  while (cola.length && !errorFatal && !opciones.cancelado()) {
    await Promise.all([trabajador(), trabajador()])
  }

  return { total, leidas, fallidas, error: errorFatal || (fallidas ? ultimoError : null) }
}
