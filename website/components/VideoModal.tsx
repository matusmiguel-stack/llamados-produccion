"use client"

import { useEffect } from "react"
import styles from "./VideoModal.module.css"

type Props = {
  videoId: string
  onClose: () => void
}

export default function VideoModal({ videoId, onClose }: Props) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [])

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.frame} onClick={(e) => e.stopPropagation()}>
        <iframe
          src={`https://player.vimeo.com/video/${videoId}?autoplay=1&color=D0342C&title=0&byline=0&portrait=0`}
          className={styles.iframe}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
      <button className={styles.close} onClick={onClose} aria-label="Cerrar">
        ✕
      </button>
    </div>
  )
}
