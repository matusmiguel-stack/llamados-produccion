import { NextResponse, type NextRequest } from "next/server"
import { getProjects, progressiveLink, REEL } from "@/lib/vimeo"

/* Redirige a un MP4 fresco de Vimeo (las ligas firmadas caducan).
   Solo para los videos del showcase y el reel: el token puede sacar
   archivos de toda la cuenta. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; q: string }> }) {
  const { id, q } = await params
  if (!/^\d+$/.test(id) || !/^\d{3,4}p$/.test(q)) return new NextResponse(null, { status: 400 })

  const allowed = new Set([REEL.id, ...(await getProjects()).map((p) => p.id)])
  if (!allowed.has(id)) return new NextResponse(null, { status: 404 })

  const link = await progressiveLink(id, q)
  if (!link) return new NextResponse(null, { status: 404 })

  const res = NextResponse.redirect(link, 302)
  res.headers.set("Cache-Control", "public, max-age=0, s-maxage=1800")
  return res
}

export const HEAD = GET
