"use client"

import { useEffect, useRef, useState } from "react"
import VideoModal from "./VideoModal"
import styles from "./ScrollProjects.module.css"
import type { VimeoVideo } from "@/lib/vimeo"

/* Numeral romano para el contador (I, II, III…) */
function roman(n: number): string {
  const map: [number, string][] = [
    [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ]
  let out = ""
  for (const [v, s] of map) while (n >= v) { out += s; n -= v }
  return out
}

/* Distancia envuelta más corta en un loop de N slots → [-N/2, N/2) */
function wrapDist(d: number, n: number): number {
  d = ((d % n) + n) % n
  if (d >= n / 2) d -= n
  return d
}

type Phase = "moving" | "visible" | "idle"

const TRAVEL_VH  = 230   // recorrido vertical de cada item (en vh) por slot
const PARALLAX   = 0.9   // el título contra-viaja a 0.9 → velocidad neta 0.1x
const LERP       = 0.075 // factor de suavizado del scroll virtual
const SNAP_MS    = 150   // sin input durante esto → snap al proyecto más cercano
const IDLE_MS    = 1300  // sin input durante esto → se esconde el UI

export default function ScrollProjects({ videos }: { videos: VimeoVideo[] }) {
  const N = videos.length

  const stageRef  = useRef<HTMLElement>(null)
  const itemRefs  = useRef<(HTMLDivElement | null)[]>([])
  const titleRefs = useRef<(HTMLDivElement | null)[]>([])
  const lineRef   = useRef<HTMLDivElement>(null)

  const targetRef  = useRef(0)
  const currentRef = useRef(0)
  const lastInput  = useRef(Date.now())
  const phaseRef   = useRef<Phase>("visible")
  const activeRef  = useRef(0)
  const touchY     = useRef<number | null>(null)

  const [active, setActive] = useState(0)
  const [phase,  setPhase]  = useState<Phase>("visible")
  const [modal,  setModal]  = useState<string | null>(null)
  // Iframes montados: ventana alrededor del activo, acumulativa (una vez cargado, se queda)
  const [mounted, setMounted] = useState<Set<number>>(
    () => new Set(Array.from({ length: Math.min(3, N) }, (_, i) => i).concat(N > 3 ? [N - 1] : []))
  )

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || N < 1) return

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    function onWheel(e: WheelEvent) {
      lastInput.current = Date.now()
      let t = targetRef.current + e.deltaY * 0.0011
      // no permitir vuelos de más de 3 proyectos de golpe
      t = Math.max(currentRef.current - 3, Math.min(currentRef.current + 3, t))
      targetRef.current = t
    }

    function onTouchStart(e: TouchEvent) { touchY.current = e.touches[0].clientY }
    function onTouchMove(e: TouchEvent) {
      if (touchY.current === null) return
      e.preventDefault()
      lastInput.current = Date.now()
      const y = e.touches[0].clientY
      targetRef.current += (touchY.current - y) / (window.innerHeight * 0.85)
      touchY.current = y
    }
    function onTouchEnd() { touchY.current = null }

    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        lastInput.current = Date.now()
        targetRef.current = Math.round(currentRef.current) + 1
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        lastInput.current = Date.now()
        targetRef.current = Math.round(currentRef.current) - 1
      }
    }

    stage.addEventListener("wheel", onWheel, { passive: true })
    stage.addEventListener("touchstart", onTouchStart, { passive: true })
    stage.addEventListener("touchmove", onTouchMove, { passive: false })
    stage.addEventListener("touchend", onTouchEnd)
    window.addEventListener("keydown", onKey)

    let raf = 0
    function tick() {
      const now = Date.now()

      // Snap: si no hay input reciente, asentarse en el proyecto más cercano
      if (now - lastInput.current > SNAP_MS && touchY.current === null) {
        targetRef.current = Math.round(targetRef.current)
      }

      // Lerp del scroll virtual
      const c0 = currentRef.current
      const t  = targetRef.current
      currentRef.current = reduced ? t : c0 + (t - c0) * LERP
      const c = currentRef.current

      const cur = ((c % N) + N) % N

      // Transformaciones por item: la estructura vuela, el título flota (parallax)
      for (let i = 0; i < N; i++) {
        const el = itemRefs.current[i]
        const ti = titleRefs.current[i]
        if (!el || !ti) continue
        const d = wrapDist(i - cur, N)
        if (Math.abs(d) > 1.25) {
          el.style.visibility = "hidden"
          continue
        }
        el.style.visibility = "visible"
        el.style.transform = `translate3d(0, ${d * TRAVEL_VH}vh, 0)`
        ti.style.transform = `translate3d(0, ${-d * TRAVEL_VH * PARALLAX}vh, 0)`
        const op = Math.max(0, Math.min(1, 1 - (Math.abs(d) - 0.1) / 0.28))
        ti.style.opacity = String(op)
      }

      // Línea de progreso global (0→1 a través del set)
      if (lineRef.current) {
        lineRef.current.style.transform = `scaleY(${N > 1 ? cur / (N - 0) : 1})`
      }

      // Índice activo → crossfade del visor
      const ai = ((Math.round(c) % N) + N) % N
      if (ai !== activeRef.current) {
        activeRef.current = ai
        setActive(ai)
        setMounted(prev => {
          const add = [-1, 0, 1, 2].map(k => ((ai + k) % N + N) % N).filter(x => !prev.has(x))
          if (add.length === 0) return prev
          const next = new Set(prev)
          add.forEach(x => next.add(x))
          return next
        })
      }

      // Fase: moviéndose / UI visible / idle (UI escondido, video limpio)
      const moving = Math.abs(t - c) > 0.015
      const ph: Phase = moving ? "moving" : now - lastInput.current > IDLE_MS ? "idle" : "visible"
      if (ph !== phaseRef.current) {
        phaseRef.current = ph
        setPhase(ph)
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      stage.removeEventListener("wheel", onWheel)
      stage.removeEventListener("touchstart", onTouchStart)
      stage.removeEventListener("touchmove", onTouchMove)
      stage.removeEventListener("touchend", onTouchEnd)
      window.removeEventListener("keydown", onKey)
    }
  }, [N])

  function openActive() {
    const v = videos[activeRef.current]
    if (v?.id && phaseRef.current !== "moving") setModal(v.id)
  }

  const av = videos[active]

  return (
    <>
      <section
        ref={stageRef}
        className={`${styles.stage} ${styles["ph_" + phase] ?? ""}`}
        onClick={openActive}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openActive() } }}
        tabIndex={0}
        role="button"
        aria-label={`Proyecto ${active + 1} de ${N}: ${av?.title ?? ""}. Enter para ver con sonido, flechas para navegar.`}
        data-cursor="play"
      >
        {/* ── Visor: videos fullscreen con crossfade ── */}
        <div className={styles.visor}>
          {videos.map((v, i) => (
            <figure
              key={v.id || i}
              className={styles.figure}
              style={{ opacity: i === active ? 1 : 0 }}
            >
              {v.thumbnail && (
                <div className={styles.poster} style={{ backgroundImage: `url(${v.thumbnail})` }} />
              )}
              {v.id && mounted.has(i) && (
                <iframe
                  className={styles.frame}
                  src={`https://player.vimeo.com/video/${v.id}?background=1&autoplay=1&muted=1&loop=1&controls=0&byline=0&title=0&portrait=0&dnt=1`}
                  allow="autoplay"
                  tabIndex={-1}
                  aria-hidden
                />
              )}
            </figure>
          ))}
          <div className={styles.overlay} />
        </div>

        {/* ── UI: se esconde en idle ── */}
        <div className={styles.ui}>
          {/* Riel de progreso con numeral romano */}
          <div className={styles.rail}>
            <span className={styles.roman} key={active}>{roman(active + 1)}</span>
            <div className={styles.railLine}>
              <div ref={lineRef} className={styles.railFill} />
            </div>
          </div>

          {/* Metadata fija del proyecto activo */}
          <div className={styles.meta} key={`m${active}`}>
            <span>{av?.year}</span>
            <span className={styles.metaDur}>{av?.duration}</span>
          </div>

          {/* Títulos voladores con parallax */}
          <div className={styles.items}>
            {videos.map((v, i) => (
              <div
                key={v.id || i}
                ref={el => { itemRefs.current[i] = el }}
                className={styles.item}
              >
                <div
                  ref={el => { titleRefs.current[i] = el }}
                  className={styles.itemInner}
                >
                  <h2 className={styles.title}>“{v.title}”</h2>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {modal && <VideoModal videoId={modal} onClose={() => setModal(null)} />}
    </>
  )
}
