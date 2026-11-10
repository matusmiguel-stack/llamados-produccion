// Acceso a datos del plan de rodaje desde el navegador (cliente de Supabase con
// la sesión del usuario: las políticas de las tablas rodaje_* deciden qué puede
// hacer). Lo que necesita la llave de servicio o la IA pasa por /api/rodaje/*.

import { supabase } from "../supabase"
import { siguientePos } from "./orden"
import {
  COLUMNAS_ESCENA,
  type Etiqueta,
  type IndiceIA,
  type LineaGuion,
  type RodajeArchivo,
  type RodajeDia,
  type RodajeEscena,
  type RodajeGuion,
  type RodajePlan,
  type RodajeSeparador,
} from "./tipos"

export type DatosPlan = {
  plan: RodajePlan
  archivos: RodajeArchivo[]
  guiones: RodajeGuion[]
  dias: RodajeDia[]
  escenas: RodajeEscena[]
  seps: RodajeSeparador[]
}

/** Trae todas las filas de un plan, de mil en mil (el tope por consulta de Supabase). */
async function todas<T>(tabla: string, columnas: string, planId: string, orden: string): Promise<T[]> {
  const out: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from(tabla)
      .select(columnas)
      .eq("plan_id", planId)
      .order(orden, { ascending: true })
      .order("id", { ascending: true })
      .range(desde, desde + 999)
    if (error) throw new Error(error.message)
    const filas = (data || []) as unknown as T[]
    out.push(...filas)
    if (filas.length < 1000) break
  }
  return out
}

/** El plan del proyecto con todo lo suyo, o null si todavía no se genera. */
export async function cargarPlan(projectId: string): Promise<DatosPlan | null> {
  const { data: plan, error } = await supabase
    .from("rodaje_planes")
    .select("id, project_id, etiqueta, created_at")
    .eq("project_id", projectId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!plan) return null

  const [archivos, guiones, dias, escenas, seps] = await Promise.all([
    todas<RodajeArchivo>("rodaje_archivos", "*", plan.id, "created_at"),
    todas<RodajeGuion>("rodaje_guiones", "id, plan_id, archivo_id, orden, numero, titulo, resumen, notas, unidad", plan.id, "orden"),
    todas<RodajeDia>("rodaje_dias", "id, plan_id, fecha, nota, created_at", plan.id, "created_at"),
    todas<RodajeEscena>("rodaje_escenas", COLUMNAS_ESCENA, plan.id, "orden"),
    todas<RodajeSeparador>("rodaje_separadores", "id, plan_id, dia_id, titulo, pos", plan.id, "pos"),
  ])
  return { plan: plan as RodajePlan, archivos, guiones, dias, escenas, seps }
}

export async function crearPlan(projectId: string, userId: string | null): Promise<void> {
  const { error } = await supabase
    .from("rodaje_planes")
    .insert({ project_id: projectId, created_by: userId })
  // 23505 = ya existe (otra persona lo creó al mismo tiempo): no es un error.
  if (error && error.code !== "23505") throw new Error(error.message)
}

// ── API del servidor ──────────────────────────────────────────────────────────

export class ErrorApi extends Error {
  codigo: string
  status: number
  constructor(mensaje: string, codigo: string, status: number) {
    super(mensaje)
    this.codigo = codigo
    this.status = status
  }
}

async function api<T>(ruta: string, init: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  let res: Response
  try {
    res = await fetch(ruta, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${session?.access_token}`,
      },
    })
  } catch {
    throw new ErrorApi("No hay conexión con el servidor. Revisa tu internet y vuelve a intentar.", "red", 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) {
    // 504 sin cuerpo = Vercel cortó la función por tiempo.
    const codigo = data.codigo || (res.status === 504 ? "tiempo" : "otro")
    const mensaje =
      data.error ||
      (res.status === 504
        ? "La lectura tardó demasiado."
        : `El servidor respondió con un error (${res.status}).`)
    throw new ErrorApi(mensaje, codigo, res.status)
  }
  return data as T
}

const MIME_POR_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
}

/** Registra el archivo y lo sube directo a Storage. Devuelve su fila. */
export async function subirArchivo(planId: string, file: File): Promise<RodajeArchivo> {
  const ext = file.name.toLowerCase().split(".").pop() || ""
  const tipo = file.type || MIME_POR_EXTENSION[ext] || ""
  const r = await api<{ archivo: RodajeArchivo; path: string; token: string; mime: string }>(
    "/api/rodaje/archivos",
    {
      method: "POST",
      body: JSON.stringify({ planId, fileName: file.name, contentType: tipo, size: file.size }),
    }
  )
  const up = await supabase.storage
    .from("guiones")
    .uploadToSignedUrl(r.path, r.token, file, { contentType: r.mime })
  if (up.error) {
    await descartarArchivo(r.archivo.id).catch(() => {})
    const red = /failed to fetch|network|load failed/i.test(up.error.message)
    throw new Error(
      red
        ? "No se pudo subir el archivo: se cortó la conexión. Vuelve a intentar."
        : `No se pudo subir el archivo: ${up.error.message}`
    )
  }
  return r.archivo
}

export async function descartarArchivo(archivoId: string): Promise<void> {
  await api(`/api/rodaje/archivos?id=${encodeURIComponent(archivoId)}`, { method: "DELETE" })
}

export async function ligaArchivo(archivoId: string): Promise<string> {
  const r = await api<{ url: string }>(`/api/rodaje/archivos?id=${encodeURIComponent(archivoId)}`, { method: "GET" })
  return r.url
}

/** La IA lee el archivo y devuelve piezas y escenas (tarda de segundos a un par de minutos). */
export async function leerIndiceArchivo(archivoId: string): Promise<IndiceIA> {
  const r = await api<{ indice: IndiceIA }>("/api/rodaje/leer", {
    method: "POST",
    body: JSON.stringify({ archivoId, modo: "indice" }),
  })
  return r.indice
}

/** La IA transcribe el texto de un grupo de escenas. */
export async function leerTextoEscenas(
  archivoId: string,
  escenaIds: string[]
): Promise<{ leidas: string[]; faltan: string[] }> {
  return api("/api/rodaje/leer", {
    method: "POST",
    body: JSON.stringify({ archivoId, modo: "texto", escenaIds }),
  })
}

export async function textoDeEscena(escenaId: string): Promise<LineaGuion[] | null> {
  const { data, error } = await supabase
    .from("rodaje_escenas")
    .select("texto")
    .eq("id", escenaId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.texto as LineaGuion[] | null) ?? null
}

// ── Aplicar lo que leyó la IA ─────────────────────────────────────────────────

function uuid(): string {
  return crypto.randomUUID()
}

/**
 * Convierte la lectura revisada en guiones y escenas del plan. Las escenas
 * entran en "Sin día asignado", al final, en el orden del guion.
 */
export async function aplicarIndice(opciones: {
  datos: DatosPlan
  archivo: RodajeArchivo
  indice: IndiceIA
  etiqueta: Etiqueta
}): Promise<void> {
  const { datos, archivo, indice, etiqueta } = opciones
  const planId = datos.plan.id
  const ordenBase = datos.guiones.reduce((m, g) => Math.max(m, g.orden), -1) + 1
  let pos = siguientePos(null, datos.escenas, datos.seps)

  const guiones = indice.guiones.map((g, i) => ({
    id: uuid(),
    plan_id: planId,
    archivo_id: archivo.id,
    orden: ordenBase + i,
    numero: g.numero,
    titulo: g.titulo,
    resumen: g.resumen,
    notas: g.notas,
  }))

  const escenas = indice.guiones.flatMap((g, gi) =>
    g.escenas.map((e, ei) => ({
      id: uuid(),
      plan_id: planId,
      guion_id: guiones[gi].id,
      orden: ei,
      numero: e.numero,
      encabezado: e.encabezado,
      ie: e.ie,
      locacion: e.locacion,
      momento: e.momento,
      descripcion: e.descripcion,
      personajes: e.personajes,
      pagina: e.pagina > 0 ? e.pagina : null,
      dia_id: null,
      pos: pos++,
    }))
  )

  if (!datos.guiones.length && datos.plan.etiqueta !== etiqueta) {
    const { error } = await supabase.from("rodaje_planes").update({ etiqueta }).eq("id", planId)
    if (error) throw new Error(error.message)
  }

  const { error: errG } = await supabase.from("rodaje_guiones").insert(guiones)
  if (errG) throw new Error(errG.message)

  for (let i = 0; i < escenas.length; i += 200) {
    const { error } = await supabase.from("rodaje_escenas").insert(escenas.slice(i, i + 200))
    if (error) {
      // Deja el plan como estaba: al borrar los guiones se van sus escenas.
      await supabase.from("rodaje_guiones").delete().in("id", guiones.map((g) => g.id))
      throw new Error(error.message)
    }
  }

  const { error: errA } = await supabase
    .from("rodaje_archivos")
    .update({ estado: "aplicado" })
    .eq("id", archivo.id)
  if (errA) throw new Error(errA.message)
}
