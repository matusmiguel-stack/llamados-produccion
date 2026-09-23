"use client"

import PageTransition from "@/components/PageTransition"
import { useScrollExit } from "@/components/useScrollExit"

export default function FilmsContent() {
  // Scroll o swipe hacia abajo → sigue con Live (mismo orden que el menú)
  useScrollExit("/live")

  return (
    <PageTransition>
      <main style={{ minHeight: "100dvh", paddingTop: 80, paddingInline: 48 }}>
        <p style={{ fontFamily: "var(--fm)", fontSize: 9, letterSpacing: "0.28em", textTransform: "uppercase", color: "var(--red)", marginBottom: 12 }}>Próximamente</p>
        <h1 style={{ fontFamily: "var(--fd)", fontStyle: "italic", fontSize: "clamp(32px, 6vw, 72px)", fontWeight: 400 }}>Films</h1>
      </main>
    </PageTransition>
  )
}
