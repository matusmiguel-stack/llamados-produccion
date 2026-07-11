export type VimeoVideo = {
  id: string
  title: string
  year: string
  duration: string
  thumbnail: string
  gradient: string
}

const GRADIENTS = ["g0", "g1", "g2", "g3", "g4"]

function fmtDuration(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

export async function getShowcaseVideos(): Promise<VimeoVideo[]> {
  const token = process.env.VIMEO_TOKEN
  const showcaseId = process.env.VIMEO_SHOWCASE_ID

  if (!token || !showcaseId) return FALLBACK_VIDEOS

  try {
    const res = await fetch(
      `https://api.vimeo.com/me/albums/${showcaseId}/videos?per_page=50&fields=uri,name,release_time,duration,pictures`,
      {
        headers: { Authorization: `bearer ${token}` },
        next: { revalidate: 3600 },
      }
    )
    if (!res.ok) return FALLBACK_VIDEOS

    const data = await res.json()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.data.map((v: any, i: number) => ({
      id: v.uri.split("/").pop() as string,
      title: v.name as string,
      year: new Date(v.release_time).getFullYear().toString(),
      duration: fmtDuration(v.duration as number),
      thumbnail:
        // prefer 1280w, fallback to whatever's biggest
        (v.pictures?.sizes as { width: number; link: string }[])
          ?.sort((a, b) => b.width - a.width)
          .find((s) => s.width <= 1280)?.link ?? "",
      gradient: GRADIENTS[i % GRADIENTS.length],
    }))
  } catch {
    return FALLBACK_VIDEOS
  }
}

const FALLBACK_VIDEOS: VimeoVideo[] = [
  { id: "", title: "Retrato editorial",           year: "2025", duration: "4:12",    thumbnail: "", gradient: "g0" },
  { id: "", title: "Campaña verano Kia",          year: "2025", duration: "1:30",    thumbnail: "", gradient: "g1" },
  { id: "", title: "Sin título (2024)",            year: "2024", duration: "18:44",   thumbnail: "", gradient: "g2" },
  { id: "", title: "Live · Auditorio Nacional",    year: "2024", duration: "2:05:30", thumbnail: "", gradient: "g3" },
  { id: "", title: "Reel 2024",                   year: "2024", duration: "2:30",    thumbnail: "", gradient: "g4" },
]
