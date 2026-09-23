import { ViewTransition } from "react"
import { getShowcaseVideos } from "@/lib/vimeo"
import ScrollProjects from "@/components/ScrollProjects"

export const metadata = {
  title: "Proyectos — Retro Casa Productora",
  description: "Catálogo de proyectos de producción audiovisual",
}

export default async function ProyectosPage() {
  const videos = await getShowcaseVideos()
  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", default: "none" }}
      exit={{ "nav-forward": "nav-forward", default: "none" }}
      default="none"
    >
      <ScrollProjects videos={videos} />
    </ViewTransition>
  )
}
