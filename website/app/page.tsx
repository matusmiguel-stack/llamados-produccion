"use client"

import { useEffect, useRef, useState, ViewTransition } from "react"
import { useRouter } from "next/navigation"
import VideoModal from "@/components/VideoModal"
import styles from "./home.module.css"

const REEL_VIMEO_ID = "1228977530"

export default function Home() {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  // Cambia al cerrar el modal para remontar el iframe de fondo y que vuelva a arrancar
  const [bgKey, setBgKey] = useState(0)
  const navigatingRef = useRef(false)

  function closeModal() {
    setShowModal(false)
    setBgKey(k => k + 1)
  }

  // Scroll o swipe hacia abajo → ir a proyectos con transición
  useEffect(() => {
    function goToProyectos() {
      if (navigatingRef.current) return
      navigatingRef.current = true
      router.push("/proyectos", { transitionTypes: ["nav-forward"] })
    }

    function onWheel(e: WheelEvent) {
      if (e.deltaY > 60) goToProyectos()
    }

    let touchStartY: number | null = null
    function onTouchStart(e: TouchEvent) { touchStartY = e.touches[0].clientY }
    function onTouchEnd(e: TouchEvent) {
      if (touchStartY === null) return
      if (touchStartY - e.changedTouches[0].clientY > 60) goToProyectos()
      touchStartY = null
    }

    window.addEventListener("wheel", onWheel, { passive: true })
    window.addEventListener("touchstart", onTouchStart, { passive: true })
    window.addEventListener("touchend", onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener("wheel", onWheel)
      window.removeEventListener("touchstart", onTouchStart)
      window.removeEventListener("touchend", onTouchEnd)
    }
  }, [router])

  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", default: "none" }}
      exit={{ "nav-forward": "nav-forward", default: "none" }}
      default="none"
    >
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
    </ViewTransition>
  )
}
