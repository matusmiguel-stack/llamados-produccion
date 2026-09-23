"use client"

import PageTransition from "@/components/PageTransition"
import { useScrollExit } from "@/components/useScrollExit"

export default function LiveContent() {
  // Live es el último de la secuencia — no hay siguiente página
  useScrollExit(null)

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
