"use client"

import { useEffect, useRef, useState } from "react"
import VideoModal from "./VideoModal"
import styles from "./ScrollProjects.module.css"
import type { VimeoVideo } from "@/lib/vimeo"

export default function ScrollProjects({ videos }: { videos: VimeoVideo[] }) {
  const outerRef  = useRef<HTMLDivElement>(null)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [progresses, setProgresses] = useState<number[]>(() =>
    videos.map((_, i) => (i === 0 ? 1 : 0))
  )
  const [activeIdx,  setActiveIdx]  = useState(0)
  const [showInfo,   setShowInfo]   = useState(false)
  const [modal,      setModal]      = useState<string | null>(null)

  useEffect(() => {
    const outer = outerRef.current
    if (!outer) return

    function onScroll() {
      if (!outer) return
      const rect    = outer.getBoundingClientRect()
      const scrolled = Math.max(0, -rect.top)
      const total   = outer.offsetHeight - window.innerHeight
      if (total <= 0 || videos.length <= 1) return

      const segH = total / (videos.length - 1)

      const next = videos.map((_, i) => {
        if (i === 0) return 1
        return Math.min(1, Math.max(0, (scrolled - (i - 1) * segH) / segH))
      })

      setProgresses(next)

      // Topmost card that has started entering
      let ai = 0
      next.forEach((p, i) => { if (p > 0) ai = i })
      setActiveIdx(ai)

      // Show info, hide 900 ms after scroll stops
      setShowInfo(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setShowInfo(false), 900)
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [videos.length])

  return (
    <>
      <div
        ref={outerRef}
        className={styles.outer}
        style={{ height: `${videos.length * 150 + 100}vh` }}
      >
        <div className={styles.stage}>
          {videos.map((v, i) => {
            const p        = progresses[i]
            const isActive = i === activeIdx

            // clip-path: top inset shrinks 100→0 (card grows upward from bottom)
            // side insets also shrink for a "portal opening" feel
            const clipT    = (1 - p) * 100
            const clipS    = (1 - p) * 6

            return (
              <div
                key={v.id || i}
                className={styles.card}
                style={{
                  zIndex:    i + 1,
                  clipPath:  p >= 1
                    ? "none"
                    : `inset(${clipT}% ${clipS}% 0 ${clipS}%)`,
                }}
                onClick={() => v.id && setModal(v.id)}
                data-cursor={v.id ? "play" : undefined}
              >
                {/* ── Media ── */}
                <div className={styles.media}>
                  {/* Thumbnail with parallax shift */}
                  {v.thumbnail ? (
                    <div
                      className={styles.thumb}
                      style={{
                        backgroundImage: `url(${v.thumbnail})`,
                        transform: `translateY(${(1 - p) * 14}%)`,
                      }}
                    />
                  ) : (
                    <div
                      className={`${styles.thumb} ${styles[v.gradient as keyof typeof styles] ?? styles.g0}`}
                      style={{ transform: `translateY(${(1 - p) * 14}%)` }}
                    />
                  )}

                  {/* Vimeo iframe — always mounted so it buffers immediately */}
                  {v.id && (
                    <iframe
                      className={styles.iframe}
                      src={`https://player.vimeo.com/video/${v.id}?background=1&autoplay=1&muted=1&loop=1&controls=0&byline=0&title=0&portrait=0&dnt=1`}
                      allow="autoplay"
                      style={{ opacity: isActive ? 1 : 0 }}
                    />
                  )}
                </div>

                {/* ── Gradient shade ── */}
                <div className={styles.shade} />

                {/* ── Info overlay — visible during scroll, fades when idle ── */}
                <div
                  className={styles.info}
                  style={{ opacity: isActive && showInfo ? 1 : 0 }}
                >
                  <div className={styles.infoTop}>
                    <span className={styles.counter}>
                      {String(i + 1).padStart(2, "0")}
                      <span className={styles.counterSep}> / </span>
                      {String(videos.length).padStart(2, "0")}
                    </span>
                    <span className={styles.dur}>{v.duration}</span>
                  </div>

                  <div className={styles.infoBot}>
                    {v.year && <span className={styles.year}>{v.year}</span>}
                    <h2 className={styles.title}>{v.title}</h2>
                    {v.id && (
                      <span className={styles.cta}>Ver proyecto ↗</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {modal && <VideoModal videoId={modal} onClose={() => setModal(null)} />}
    </>
  )
}
