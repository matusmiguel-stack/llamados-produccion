import { getShowcaseVideos } from "@/lib/vimeo"
import ScrollProjects from "@/components/ScrollProjects"

export const metadata = {
  title: "Proyectos — Retro Casa Productora",
  description: "Catálogo de proyectos de producción audiovisual",
}

export default async function ProyectosPage() {
  const videos = await getShowcaseVideos()
  return <ScrollProjects videos={videos} />
}
