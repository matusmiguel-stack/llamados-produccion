"use client"

import { useState } from "react"
import VideoModal from "@/components/VideoModal"
import styles from "./reel-bg.module.css"

const REEL_VIMEO_ID = "1228977530"

/* Video de fondo compartido por Home y Nosotros: al navegar entre ambas
   páginas este layout no se desmonta, así que el reel sigue reproduciéndose
   sin cortes — sólo el contenido (children) cambia con la transición. */
export default function ReelLayout({ children }: { children: React.ReactNode }) {
  const [showModal, setShowModal] = useState(false)
  // Cambia al cerrar el modal para remontar el iframe de fondo y que vuelva a arrancar
  const [bgKey, setBgKey] = useState(0)

  function closeModal() {
    setShowModal(false)
    setBgKey(k => k + 1)
  }

  return (
    <div className={styles.root}>
      <div
        className={styles.videoBg}
        onClick={() => setShowModal(true)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowModal(true) } }}
        role="button"
        tabIndex={0}
        aria-label="Reproducir reel con sonido"
        data-cursor="play"
      >
        <div className={styles.fallback} aria-hidden />
        <iframe
          key={bgKey}
          className={styles.video}
          src={`https://player.vimeo.com/video/${REEL_VIMEO_ID}?background=1&autoplay=1&muted=1&loop=1&controls=0&byline=0&title=0&portrait=0&dnt=1`}
          allow="autoplay"
          tabIndex={-1}
          aria-hidden
        />
        <div className={styles.overlay} aria-hidden />
      </div>

      <div className={styles.content}>{children}</div>

      {showModal && <VideoModal videoId={REEL_VIMEO_ID} onClose={closeModal} />}
    </div>
  )
}
