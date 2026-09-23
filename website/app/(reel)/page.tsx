"use client"

import PageTransition from "@/components/PageTransition"
import { useScrollExit } from "@/components/useScrollExit"
import styles from "./home.module.css"

export default function Home() {
  // Scroll o swipe hacia abajo → sigue el orden del menú (Nosotros es lo primero)
  useScrollExit("/nosotros")

  return (
    <PageTransition>
      <div className={styles.bottom}>
        <span className={styles.scroll}>Desplazar ↓</span>
      </div>
    </PageTransition>
  )
}
