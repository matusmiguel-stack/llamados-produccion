"use client"

import PageTransition from "@/components/PageTransition"
import SectionTitle from "@/components/SectionTitle"
import { useScrollExit } from "@/components/useScrollExit"

export default function FilmsContent() {
  // Scroll o swipe: abajo → Live, arriba → regresa a Proyectos
  useScrollExit("/live", "/proyectos")

  return (
    <PageTransition>
      <main style={{ position: "relative", minHeight: "100dvh" }}>
        <SectionTitle>Films</SectionTitle>
      </main>
    </PageTransition>
  )
}
