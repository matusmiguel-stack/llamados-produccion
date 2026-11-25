import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getProjects } from "@/lib/vimeo"

type Props = { params: Promise<{ slug: string }> }

async function find(slug: string) {
  return (await getProjects()).find((p) => p.slug === slug)
}

export async function generateStaticParams() {
  return (await getProjects()).map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await find((await params).slug)
  if (!p) return {}
  return {
    title: p.title,
    openGraph: { title: p.title, images: [{ url: p.posterLarge, width: 1920, height: 1080 }] },
  }
}

export default async function ProjectPage({ params }: Props) {
  const p = await find((await params).slug)
  if (!p) notFound()
  return <h1 className="sr-only">{p.title}</h1>
}
