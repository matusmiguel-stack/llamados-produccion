"use client"

import PageTransition from "@/components/PageTransition"
import { useScrollExit } from "@/components/useScrollExit"

export default function LiveContent() {
  // Scroll o swipe: abajo → Contacto, arriba → regresa a Films (mismo orden que el menú)
  useScrollExit("/contacto", "/films")

  return (
    <PageTransition>
      <main style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh" }}>
        <p style={{ fontFamily: "Georgia, serif", fontStyle: "italic", opacity: 0.3, fontSize: 18 }}>
          Próximamente
        </p>
      </main>
    </PageTransition>
  )
}
