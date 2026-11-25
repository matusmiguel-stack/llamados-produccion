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
  const token = process.env.VIMEO_TOKEN
  if (!token) return false
  try {
    const res = await fetch(`${API}/videos/${REEL.id}?fields=play.progressive.rendition`, {
      headers: headers(token),
      next: { revalidate: 3600 },
    })
    if (!res.ok) return false
    const data = await res.json()
    return Array.isArray(data?.play?.progressive) && data.play.progressive.length > 0
  } catch {
    return false
  }
}

export async function getProjects(): Promise<Project[]> {
  const token = process.env.VIMEO_TOKEN
  const showcase = process.env.VIMEO_SHOWCASE_ID
  if (!token || !showcase) {
    if (process.env.NODE_ENV === "production") throw new Error("Faltan VIMEO_TOKEN o VIMEO_SHOWCASE_ID")
    return []
  }

  const res = await fetch(`${API}/me/albums/${showcase}/videos?per_page=50&fields=${FIELDS}`, {
    headers: headers(token),
    next: { revalidate: 3600 },
  })
  // Si Vimeo falla, mejor tronar: en ISR se queda la última versión buena
  if (!res.ok) throw new Error(`Vimeo respondió ${res.status}`)
  const data = await res.json()
  const files = await hasFileAccess()

  const seen = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.data as any[]).map((v) => {
    const id = String(v.uri).split("/").pop() as string
    const title = String(v.name)
    let slug = slugify(title) || id
    if (seen.has(slug)) slug = `${slug}-${id}`
    seen.add(slug)
    const base = v.pictures?.base_link as string | undefined
    return {
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
    }
  })
}

/* Liga directa a un MP4 (solo con token con permiso de archivos). */
export async function progressiveLink(id: string, quality: string): Promise<string | null> {
  const token = process.env.VIMEO_TOKEN
  if (!token) return null
  const res = await fetch(`${API}/videos/${id}?fields=play.progressive`, {
    headers: headers(token),
    next: { revalidate: 1800 },
  })
  if (!res.ok) return null
  const data = await res.json()
  const list = (data?.play?.progressive ?? []) as { rendition: string; height: number; link: string }[]
  if (!list.length) return null
  const want = parseInt(quality, 10) || 540
  const sorted = [...list].sort((a, b) => b.height - a.height)
  return (sorted.find((f) => f.height <= want) ?? sorted[sorted.length - 1]).link
}
