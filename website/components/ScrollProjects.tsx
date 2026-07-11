"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import VideoModal from "./VideoModal"
import styles from "./ScrollProjects.module.css"
import type { VimeoVideo } from "@/lib/vimeo"

export default function ScrollProjects({ videos }: { videos: VimeoVideo[] }) {
  const outerRef  = useRef<HTMLDivElement>(null)
  const [active, setActive]   = useState(0)
  const [intra,  setIntra]    = useState(0)
  const [hovered, setHovered] = useState<number | null>(null)
  const [modal,   setModal]   = useState<string | null>(null)

  // Scroll-driven logic
  useEffect(() => {
    const outer = outerRef.current
    if (!outer) return

    function onScroll() {
      if (!outer) return
      const rect    = outer.getBoundingClientRect()
      const scrolled = Math.max(0, -rect.top)
      const total    = outer.offsetHeight - window.innerHeight
      if (total <= 0) return

      const progress = Math.min(1, scrolled / total)
      const raw      = progress * videos.length
      const idx      = Math.min(videos.length - 1, Math.floor(raw))
      const intraVal = raw - Math.floor(raw)

      setActive(idx)
      setIntra(idx === videos.length - 1 ? 1 : intraVal)
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener("scroll", onScroll)
  }, [videos.length])

  function jumpTo(idx: number) {
    const outer = outerRef.current
    if (!outer) return
    const rect  = outer.getBoundingClientRect()
    const total = outer.offsetHeight - window.innerHeight
    window.scrollTo({ top: window.scrollY + rect.top + (total / videos.length) * idx, behavior: "smooth" })
  }

  const trackPct = ((active + intra) / videos.length) * 100

  return (
    <>
      <div className={styles.pageHeader}>
        <span className={styles.pgLabel}>Portafolio de video</span>
        <h1 className={styles.pgTitle}>Proyectos</h1>
      </div>

      <div ref={outerRef} className={styles.outer} style={{ height: `${videos.length * 100 + 100}vh` }}>
        <div className={styles.inner}>

          {/* ── LEFT: list ── */}
          <div className={styles.left}>
            <div className={styles.track}>
              <div className={styles.trackFill} style={{ height: `${trackPct}%` }} />
              <div className={styles.trackDot}  style={{ top:    `${trackPct}%` }} />
            </div>

            <div className={styles.items}>
              {videos.map((v, i) => {
                const isOn    = active === i
                const progPct = i < active ? 100 : isOn ? intra * 100 : 0

                return (
                  <button key={v.id || i} className={`${styles.item} ${isOn ? styles.itemOn : ""}`}
                    onClick={() => jumpTo(i)} aria-label={`Ir a ${v.title}`}>

                    {/* Thumbnail */}
                    <div className={styles.thumbWrap}>
                      {v.thumbnail
                        ? <img src={v.thumbnail} alt={v.title} className={styles.thumbImg} />
                        : <div className={`${styles.thumb} ${styles[v.gradient]}`} />
                      }
                      {isOn && <div className={styles.thumbDot} />}
                    </div>

                    <div className={styles.itemBody}>
                      <div className={styles.itemRow}>
                        <span className={styles.itemNum}>{String(i + 1).padStart(2, "0")}</span>
                        <span className={styles.itemDur}>{v.duration}</span>
                      </div>
                      <h3 className={styles.itemTitle}>{v.title}</h3>
                      <div className={styles.progTrack}>
                        <div className={styles.prog} style={{ transform: `scaleX(${progPct / 100})` }} />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <Link href="#" className={styles.listCta}>Ver portafolio completo →</Link>
          </div>

          {/* ── RIGHT: preview panels ── */}
          <div className={styles.right}>
            {videos.map((v, i) => {
              const isOn    = active === i
              const progPct = i < active ? 100 : isOn ? intra * 100 : 0
              const isHovered = hovered === i

              return (
                <div key={v.id || i}
                  className={`${styles.panel} ${isOn ? styles.panelOn : ""}`}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => v.id && setModal(v.id)}
                  data-cursor={v.id ? "play" : undefined}
                >
                  {/* Static bg: thumbnail or gradient — fades out on hover */}
                  {v.thumbnail
                    ? <div className={styles.panelBg}
                           style={{ backgroundImage: `url(${v.thumbnail})`, opacity: isHovered ? 0 : 1 }} />
                    : <div className={`${styles.panelBg} ${styles[v.gradient]}`}
                           style={{ opacity: isHovered ? 0 : 1 }} />
                  }

                  {/* Vimeo iframe: siempre montado (todos los videos buffereando desde carga) */}
                  {v.id && (
                    <iframe
                      className={styles.vimeoBg}
                      src={`https://player.vimeo.com/video/${v.id}?background=1&autoplay=1&muted=1&loop=1&controls=0&byline=0&title=0&portrait=0&dnt=1`}
                      allow="autoplay"
                      style={{ opacity: isHovered ? 1 : 0 }}
                    />
                  )}

                  {/* Hover play hint */}
                  {isHovered && v.id && (
                    <div className={styles.playHint}>
                      <div className={styles.playIcon}>▶</div>
                      <span>Ver proyecto</span>
                    </div>
                  )}

                  <div className={styles.panelShade} />
                  <div className={styles.ghost} aria-hidden>
                    {v.title.split(" ").slice(0, 2).join("\n")}
                  </div>

                  <div className={styles.counter}>{String(i + 1).padStart(2, "0")} / {String(videos.length).padStart(2, "0")}</div>

                  <div className={styles.panelBot}>
                    <div>
                      <span className={styles.panelYear}>{v.year}</span>
                      <div className={styles.panelTitle}>{v.title}</div>
                    </div>
                    {v.id && (
                      <button className={styles.panelCta} onClick={(e) => { e.stopPropagation(); setModal(v.id) }}>
                        Ver proyecto ↗
                      </button>
                    )}
                  </div>

                  <div className={styles.vprog}>
                    <div className={styles.vprogFill} style={{ height: `${progPct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>

        </div>
      </div>

      {/* Fullscreen modal */}
      {modal && <VideoModal videoId={modal} onClose={() => setModal(null)} />}
    </>
  )
}
