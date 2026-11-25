import Link from "next/link"
import { getProjects } from "@/lib/vimeo"

export const metadata = {
  title: "Proyectos",
  description: "Catálogo de proyectos de producción audiovisual",
}

export default async function ProyectosPage() {
  const projects = await getProjects()
  return (
    <nav className="sr-only" aria-label="Proyectos">
      <h1>Proyectos</h1>
      <ul>
        {projects.map((p) => (
          <li key={p.id}>
            <Link href={`/proyectos/${p.slug}`} scroll={false}>{p.title}</Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
