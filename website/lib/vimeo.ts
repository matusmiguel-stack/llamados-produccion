/* Datos de Vimeo para el sitio. Solo corre en el servidor (usa VIMEO_TOKEN). */

export type Project = {
  id: string
  slug: string
  title: string
  client: string
  name: string
  embedUrl: string
  width: number
  height: number
  poster: string
  posterLarge: string
  peek?: string
  peekPhone?: string
}

export const REEL = {
  id: "1228977530",
  h: "0b90ec8591",
  poster: "https://i.vimeocdn.com/video/2203522220-0ff0084d8b5cec49fa19d538604936419b7e6e432bc607d57e798e19281e56ae-d_1920x1080?region=us",
}

const API = "https://api.vimeo.com"
const FIELDS = "uri,name,width,height,player_embed_url,pictures.base_link"

export const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

/* Las miniaturas de i.vimeocdn.com aceptan un tamaño pegado al path
   (…-d_1280x720?region=us) y mandan CORS abierto, así que sirven como texturas. */
function pictureAt(base: string | undefined, w: number, h: number) {
  if (!base) return ""
  const [path, query] = base.split("?")
  return `${path}_${w}x${h}${query ? `?${query}` : ""}`
}

/* "Atún Dolores - Cuaresma 2026" → cliente arriba, proyecto abajo */
function splitTitle(title: string) {
  const i = title.indexOf(" - ")
  if (i < 0) return { client: title.trim(), name: "" }
  return { client: title.slice(0, i).trim(), name: title.slice(i + 3).trim() }
}

function headers(token: string) {
  return { Authorization: `bearer ${token}`, Accept: "application/vnd.vimeo.*+json;version=3.4" }
}

/* Con un token que tenga el permiso "video_files", Vimeo entrega MP4 directos;
   entonces el reel se reproduce en <video> y las tarjetas muestran un preview. */
export async function hasFileAccess(): Promise<boolean> {
  // Un error pasajero de Vimeo (429, 5xx, red) truena a propósito: en ISR se
  // conserva la última página buena en vez de guardar una sin previews.
  return !!(await progressiveInfo(REEL.id)).list.length
}

/* Una categoría = un showcase de Vimeo; el botón lleva el título del showcase. */
export type Category = { id: string; label: string; ids: string[] }
export type Catalog = { projects: Project[]; categories: Category[] }

/* VIMEO_SHOWCASE_ID acepta varios showcases separados por comas; el primero es
   la categoría que se ve al entrar. Cada uno puede llevar el nombre del botón:
   "11351579,12472234=Food & Drinks,12375422=Kids". Sin nombre se usa el
   título del showcase en Vimeo. */
function showcaseIds() {
  return (process.env.VIMEO_SHOWCASE_ID ?? "")
    .split(/[,\n]/)
    .map((entry) => {
      const [id, ...label] = entry.split("=")
      return { id: id.trim(), label: label.join("=").trim() }
    })
    .filter((s, i, all) => /^\d+$/.test(s.id) && all.findIndex((o) => o.id === s.id) === i)
}

// Si Vimeo falla, mejor tronar: en ISR se queda la última versión buena
async function vimeoJson(path: string, token: string) {
  const res = await fetch(`${API}${path}`, { headers: headers(token), next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`Vimeo respondió ${res.status} en ${path.split("?")[0]}`)
  return res.json()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function showcaseVideos(album: string, token: string): Promise<any[]> {
  // Vimeo entrega máximo 100 por página: se piden todas las páginas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const videos: any[] = []
  for (let page = 1; page <= 20; page++) {
    const data = await vimeoJson(`/me/albums/${album}/videos?per_page=100&page=${page}&fields=${FIELDS}`, token)
    videos.push(...(data.data ?? []))
    if (!data.paging?.next || (data.data ?? []).length < 100) break
  }
  return videos
}

export async function getCatalog(): Promise<Catalog> {
  const token = process.env.VIMEO_TOKEN
  const albums = showcaseIds()
  if (!token || !albums.length) {
    if (process.env.NODE_ENV === "production") throw new Error("Faltan VIMEO_TOKEN o VIMEO_SHOWCASE_ID")
    return { projects: [], categories: [] }
  }

  const [files, ...showcases] = await Promise.all([
    hasFileAccess(),
    ...albums.map(async ({ id: album, label }) => {
      const [meta, videos] = await Promise.all([
        label ? null : vimeoJson(`/me/albums/${album}?fields=name`, token),
        showcaseVideos(album, token),
      ])
      return { album, name: label || String(meta?.name ?? "").trim(), videos }
    }),
  ])

  // Un mismo video puede estar en varios showcases: se guarda una sola vez
  const byId = new Map<string, Project>()
  const seen = new Set<string>()
  const categories: Category[] = []
  for (const sc of showcases) {
    const ids: string[] = []
    for (const v of sc.videos) {
      const id = String(v.uri).split("/").pop() as string
      if (!byId.has(id)) {
        const title = String(v.name)
        let slug = slugify(title) || id
        if (seen.has(slug)) slug = `${slug}-${id}`
        seen.add(slug)
        const base = v.pictures?.base_link as string | undefined
        byId.set(id, {
          id,
          slug,
          title,
          ...splitTitle(title),
          embedUrl: v.player_embed_url || `https://player.vimeo.com/video/${id}`,
          width: v.width || 1920,
          height: v.height || 1080,
          poster: pictureAt(base, 1280, 720),
          posterLarge: pictureAt(base, 1920, 1080),
          ...(files ? { peek: `/api/vimeo/${id}/540p`, peekPhone: `/api/vimeo/${id}/360p` } : {}),
        })
      }
      if (!ids.includes(id)) ids.push(id)
    }
    if (ids.length) categories.push({ id: sc.album, label: sc.name || "Proyectos", ids })
  }
  return { projects: [...byId.values()], categories }
}

export async function getProjects(): Promise<Project[]> {
  return (await getCatalog()).projects
}

type Progressive = { rendition: string; height: number; link: string }

/* MP4 disponibles de un video (vacío si el token no tiene permiso de archivos
   o si el video no es de la cuenta del token). */
export async function progressiveInfo(id: string, { fresh = false } = {}) {
  const token = process.env.VIMEO_TOKEN
  if (!token) return { list: [] as Progressive[], status: "sin-token", owner: "" }
  // Las ligas firmadas caducan: la ruta de MP4 siempre pide una nueva (fresh)
  // y deja que solo la CDN la guarde un rato.
  const res = await fetch(`${API}/videos/${id}?fields=play,user.uri`, {
    headers: headers(token),
    ...(fresh ? { cache: "no-store" as const } : { next: { revalidate: 1800 } }),
  })
  if (res.status === 429 || res.status >= 500) throw new Error(`Vimeo respondió ${res.status}`)
  if (!res.ok) return { list: [] as Progressive[], status: `vimeo-${res.status}`, owner: "" }
  const data = await res.json()
  const list = (Array.isArray(data?.play?.progressive) ? data.play.progressive : []) as Progressive[]
  return { list, status: String(data?.play?.status ?? ""), owner: String(data?.user?.uri ?? "") }
}

/* Liga directa a un MP4 (solo con token con permiso de archivos). */
export function pickProgressive(list: Progressive[], quality: string): string | null {
  if (!list.length) return null
  const want = parseInt(quality, 10) || 540
  const sorted = [...list].sort((a, b) => b.height - a.height)
  return (sorted.find((f) => f.height <= want) ?? sorted[sorted.length - 1]).link
}
