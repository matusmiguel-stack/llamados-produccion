import { NextResponse, type NextRequest } from "next/server"
import { getProjects, pickProgressive, progressiveInfo, REEL } from "@/lib/vimeo"

/* Redirige a un MP4 fresco de Vimeo (las ligas firmadas caducan).
   Solo para los videos del showcase y el reel: el token puede sacar
   archivos de toda la cuenta. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; q: string }> }) {
  const { id, q } = await params
  if (!/^\d+$/.test(id) || !/^\d{3,4}p$/.test(q)) return new NextResponse(null, { status: 400 })

  const allowed = new Set([REEL.id, ...(await getProjects()).map((p) => p.id)])
  if (!allowed.has(id)) return notFound("fuera-del-showcase")

  const info = await progressiveInfo(id, { fresh: true })
  const link = pickProgressive(info.list, q)
  // El motivo va en un header para poder diagnosticar sin ver los logs
  if (!link) return notFound(`sin-archivos;play=${info.status};owner=${info.owner}`)

  const res = NextResponse.redirect(link, 302)
  res.headers.set("Cache-Control", "public, max-age=0, s-maxage=1800")
  return res
}

function notFound(reason: string) {
  return new NextResponse(null, { status: 404, headers: { "x-retro-reason": reason, "Cache-Control": "no-store" } })
}

export const HEAD = GET
