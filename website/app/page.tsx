"use client"

import { useState } from "react"
import VideoModal from "@/components/VideoModal"
import PageTransition from "@/components/PageTransition"
import { useScrollExit } from "@/components/useScrollExit"
import styles from "./home.module.css"

const REEL_VIMEO_ID = "1228977530"

export default function Home() {
  const [showModal, setShowModal] = useState(false)
  // Cambia al cerrar el modal para remontar el iframe de fondo y que vuelva a arrancar
  const [bgKey, setBgKey] = useState(0)

  function closeModal() {
    setShowModal(false)
    setBgKey(k => k + 1)
  }

  // Scroll o swipe hacia abajo → sigue el orden del menú (Nosotros es lo primero)
  useScrollExit("/nosotros")

  return (
    <PageTransition>
    <main className={styles.root}>
      {/* Fullscreen video background — clic para reproducir con sonido */}
      <div
        className={styles.videoBg}
        onClick={() => setShowModal(true)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowModal(true) } }}
        role="button"
        tabIndex={0}
        aria-label="Reproducir reel con sonido"
        data-cursor="play"
      >
        {/* Fallback gradient shown while the iframe loads */}
        <div className={styles.fallback} aria-hidden />
        <iframe
          key={bgKey}
          className={styles.video}
          src={`https://player.vimeo.com/video/${REEL_VIMEO_ID}?background=1&autoplay=1&muted=1&loop=1&controls=0&byline=0&title=0&portrait=0&dnt=1`}
          allow="autoplay"
          tabIndex={-1}
          aria-hidden
        />
        {/* Subtle dark overlay so text is readable */}
        <div className={styles.overlay} aria-hidden />
      </div>

      {/* Bottom bar */}
      <div className={styles.bottom}>
        <span className={styles.scroll}>Desplazar ↓</span>
      </div>

      {showModal && <VideoModal videoId={REEL_VIMEO_ID} onClose={closeModal} />}
    </main>
    </PageTransition>
  )
}
