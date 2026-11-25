import Stage from "@/components/stage/Stage"
import { getCatalog, hasFileAccess, REEL } from "@/lib/vimeo"

/* El escenario (reel + carrusel + reproductor) vive en este layout para que
   no se desmonte al moverse entre el inicio, Proyectos, un proyecto y Nosotros. */
export default async function StageLayout({ children }: { children: React.ReactNode }) {
  const [{ projects, categories }, files] = await Promise.all([getCatalog(), hasFileAccess()])
  return (
    <Stage
      projects={projects}
      categories={categories}
      reel={REEL}
      reelVideo={files ? `/api/vimeo/${REEL.id}/1080p` : undefined}
    >
      {children}
    </Stage>
  )
}
