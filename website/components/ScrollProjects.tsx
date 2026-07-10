"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import styles from "./ScrollProjects.module.css"

const PROJECTS = [
  {
    num: "01",
    title: "Retrato editorial",
    category: "Fotografía",
    year: "2025",
    duration: "4:12",
    slug: "retrato-editorial",
    gradient: "g0",
  },
  {
    num: "02",
    title: "Campaña verano Kia",
    category: "Video",
    year: "2025",
    duration: "1:30",
    slug: "campana-verano-kia",
    gradient: "g1",
  },
  {
    num: "03",
    title: "Sin título (2024)",
    category: "Cortometraje",
    year: "2024",
    duration: "18:44",
    slug: "sin-titulo-2024",
    gradient: "g2",
  },
  {
    num: "04",
    title: "Live · Auditorio Nacional",
    category: "En vivo",
    year: "2024",
    duration: "2:05:30",
    slug: "live-auditorio-nacional",
    gradient: "g3",
  },
  {
    num: "05",
    title: "Reel 2024",
    category: "Demo reel",
    year: "2024",
    duration: "2:30",
    slug: "reel-2024",
    gradient: "g4",
  },
]

export default function ScrollProjects() {
  const outerRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [intra, setIntra] = useState(0)
  const prevActive = useRef(0)

  useEffect(() => {
    const outer = outerRef.current
    if (!outer) return

    function onScroll() {
      if (!outer) return
      const rect = outer.getBoundingClientRect()
      const scrolled = Math.max(0, -rect.top)
      const total = outer.offsetHeight - window.innerHeight
      if (total <= 0) return

      const progress = Math.min(1, scrolled / total)
      const raw = progress * PROJECTS.length
      const idx = Math.min(PROJECTS.length - 1, Math.floor(raw))
      const intraVal = raw - Math.floor(raw)

      setActive(idx)
      setIntra(idx === PROJECTS.length - 1 ? 1 : intraVal)
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  function jumpTo(idx: number) {
    const outer = outerRef.current
    if (!outer) return
    const rect = outer.getBoundingClientRect()
    const total = outer.offsetHeight - window.innerHeight
    const target = window.scrollY + rect.top + (total / PROJECTS.length) * idx
    window.scrollTo({ top: target, behavior: "smooth" })
  }

  const trackPct = ((active + intra) / PROJECTS.length) * 100

  return (
    <>
      {/* Page header — above the sticky section */}
      <div className={styles.pageHeader}>
        <span className={styles.pgLabel}>Portafolio de video</span>
        <h1 className={styles.pgTitle}>Proyectos</h1>
      </div>

      {/* Scroll outer — sets the scroll range */}
      <div
        ref={outerRef}
        className={styles.outer}
        style={{ height: `${PROJECTS.length * 100 + 100}vh` }}
      >
        {/* Sticky inner — stays in viewport while scrolling */}
        <div className={styles.inner}>

          {/* ── Left: project list ── */}
          <div className={styles.left}>

            {/* Vertical scroll progress track */}
            <div className={styles.track}>
              <div
                className={styles.trackFill}
                style={{ height: `${trackPct}%` }}
              />
              <div
                className={styles.trackDot}
                style={{ top: `${trackPct}%` }}
              />
            </div>

            <div className={styles.items}>
              {PROJECTS.map((p, i) => {
                const isOn = active === i
                const progPct =
                  i < active ? 100 : isOn ? intra * 100 : 0

                return (
                  <button
                    key={p.slug}
                    className={`${styles.item} ${isOn ? styles.itemOn : ""}`}
                    onClick={() => jumpTo(i)}
                    aria-label={`Ir a ${p.title}`}
                  >
                    {/* Thumbnail */}
                    <div className={styles.thumbWrap}>
                      <div className={`${styles.thumb} ${styles[p.gradient]}`} />
                      {isOn && <div className={styles.thumbDot} />}
                    </div>

                    {/* Info */}
                    <div className={styles.itemBody}>
                      <div className={styles.itemRow}>
                        <span className={styles.itemNum}>{p.num}</span>
                        <span className={styles.itemCat}>{p.category}</span>
                        <span className={styles.itemDur}>{p.duration}</span>
                      </div>
                      <h3 className={styles.itemTitle}>{p.title}</h3>
                      {/* Progress bar */}
                      <div className={styles.progTrack}>
                        <div
                          className={styles.prog}
                          style={{ transform: `scaleX(${progPct / 100})` }}
                        />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <Link href="/proyectos" className={styles.listCta}>
              Ver portafolio completo →
            </Link>
          </div>

          {/* ── Right: preview panels ── */}
          <div className={styles.right}>
            {PROJECTS.map((p, i) => {
              const isOn = active === i
              const progPct =
                i < active ? 100 : isOn ? intra * 100 : 0

              return (
                <div
                  key={p.slug}
                  className={`${styles.panel} ${isOn ? styles.panelOn : ""}`}
                >
                  <div className={`${styles.panelBg} ${styles[p.gradient]}`} />
                  <div className={styles.panelShade} />
                  <div className={styles.ghost} aria-hidden>
                    {p.title.split(" ").slice(0, 2).join("\n")}
                  </div>

                  <div className={styles.badge}>
                    {p.category} · {p.year}
                  </div>
                  <div className={styles.counter}>
                    {p.num} / {String(PROJECTS.length).padStart(2, "0")}
                  </div>

                  <div className={styles.panelBot}>
                    <div>
                      <span className={styles.panelYear}>{p.year}</span>
                      <div className={styles.panelTitle}>{p.title}</div>
                    </div>
                    <Link href={`/proyectos/${p.slug}`} className={styles.panelCta}>
                      Ver proyecto ↗
                    </Link>
                  </div>

                  {/* Vertical progress bar on left edge */}
                  <div className={styles.vprog}>
                    <div
                      className={styles.vprogFill}
                      style={{ height: `${progPct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

        </div>
      </div>
    </>
  )
}
