"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import styles from "./home.module.css"

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    // Ensure autoplay works after mount
    videoRef.current?.play().catch(() => {})
  }, [])

  return (
    <main className={styles.root}>
      {/* Fullscreen video background */}
      <div className={styles.videoBg}>
        <video
          ref={videoRef}
          className={styles.video}
          src="/reel.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
        {/* Fallback gradient shown while video loads or if no video file yet */}
        <div className={styles.fallback} aria-hidden />
        {/* Subtle dark overlay so text is readable */}
        <div className={styles.overlay} aria-hidden />
      </div>

      {/* Wordmark */}
      <div className={styles.wordmark}>
        <p className={styles.eyebrow}>Casa productora · Ciudad de México</p>
        <h1 className={styles.title}>
          <span className={styles.line}>Retro</span>
          <span className={styles.line}>Casa</span>
          <span className={styles.line}>Productora</span>
        </h1>
      </div>

      {/* Bottom bar */}
      <div className={styles.bottom}>
        <Link href="/proyectos" className={styles.enter}>
          Ver proyectos →
        </Link>
        <span className={styles.scroll}>Desplazar ↓</span>
      </div>
    </main>
  )
}
