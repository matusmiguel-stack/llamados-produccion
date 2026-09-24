"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Script from "next/script"
import VideoModal from "./VideoModal"
import SectionTitle from "./SectionTitle"
import styles from "./FilmsCarousel.module.css"
import type { Film } from "@/lib/films"

type VimeoPlayer = {
  setCurrentTime: (t: number) => Promise<number>
  play: () => Promise<void>
  on: (event: string, cb: () => void) => void
  unload: () => Promise<void>
}

declare global {
  interface Window {
    Vimeo?: {
      Player: new (el: HTMLIFrameElement) => VimeoPlayer
    }
  }
}

/* Distancia envuelta más corta en un loop de N slots → [-N/2, N/2) */
function wrapDist(d: number, n: number): number {
  d = ((d % n) + n) % n
  if (d >= n / 2) d -= n
  return d
}

type Phase = "moving" | "visible" | "idle"
type Axis = "x" | "y" | null

const LERP       = 0.075
const SNAP_MS    = 150
const IDLE_MS    = 1300
const EXIT_COOLDOWN_MS = 700
const SWIPE_FRACTION  = 0.5
const FLICK_VELOCITY  = 0.6
const LOOP_START_S    = 2 // el fondo arranca (y cada vuelta del loop vuelve a) el segundo 2

export default function FilmsCarousel({ films }: { films: Film[] }) {
  const N = films.length
  const router = useRouter()

  const stageRef   = useRef<HTMLElement>(null)
  const figureRefs = useRef<(HTMLElement | null)[]>([])
  const iframeRefs = useRef<(HTMLIFrameElement | null)[]>([])
  const lineRef    = useRef<HTMLDivElement>(null)
  const playersRef = useRef<Map<number, VimeoPlayer>>(new Map())

  const targetRef      = useRef(0)
  const currentRef     = useRef(0)
  const lastInput       = useRef(Date.now())
  const phaseRef        = useRef<Phase>("visible")
  const activeRef        = useRef(0)
  const touchStartRef      = useRef<{ x: number; y: number } | null>(null)
  const touchAxisRef       = useRef<Axis>(null)
  const touchVelocityRef   = useRef(0)
  const touchLastMoveRef   = useRef(Date.now())
  const touchOriginRef     = useRef(0)
  const wheelOriginRef     = useRef(0)
  const lastWheelRef       = useRef(0)
  const navigatingRef  = useRef(false)

  const [active, setActive] = useState(0)
  const [phase,  setPhase]  = useState<Phase>("visible")
  const [modal,  setModal]  = useState<string | null>(null)
  const [sdkReady, setSdkReady] = useState(false)
  // Cambia al cerrar el modal para remontar los iframes de fondo: el navegador
  // los pausa mientras el modal (con sonido) está abierto y no los reanuda solo
  const [bgKey, setBgKey] = useState(0)
  const [mounted, setMounted] = useState<Set<number>>(
    () => new Set([-1, 0, 1].map(k => ((k % N) + N) % N))
  )

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || N < 1) return

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const mountedAt = Date.now()
    navigatingRef.current = false

    // Vertical → cambia de sección: abajo a Live, arriba a Proyectos
    function exitSection(dir: "down" | "up") {
      if (navigatingRef.current) return
      if (Date.now() - mountedAt < EXIT_COOLDOWN_MS) return
      navigatingRef.current = true
      if (dir === "down") router.push("/live", { transitionTypes: ["nav-forward"] })
      else router.push("/proyectos", { transitionTypes: ["nav-back"] })
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const dx = e.deltaX
      const dy = e.deltaY

      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 60) {
        exitSection(dy > 0 ? "down" : "up")
        return
      }

      const now = Date.now()
      if (now - lastWheelRef.current > 200) {
        wheelOriginRef.current = Math.round(currentRef.current)
      }
      lastWheelRef.current = now
      lastInput.current = now
      let t = targetRef.current + dx * 0.0011
      t = Math.max(wheelOriginRef.current - 1, Math.min(wheelOriginRef.current + 1, t))
      targetRef.current = t
    }

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0]
      touchStartRef.current = { x: t.clientX, y: t.clientY }
      touchAxisRef.current = null
      touchVelocityRef.current = 0
      touchLastMoveRef.current = Date.now()
      touchOriginRef.current = Math.round(currentRef.current)
    }
    function onTouchMove(e: TouchEvent) {
      const start = touchStartRef.current
      if (!start) return
      const t = e.touches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y

      if (!touchAxisRef.current) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        touchAxisRef.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y"
      }

      if (touchAxisRef.current === "x") {
        e.preventDefault()
        lastInput.current = Date.now()
        const now = Date.now()
        const dt = now - touchLastMoveRef.current
        const dxRaw = start.x - t.clientX
        if (dt > 0) touchVelocityRef.current = dxRaw / dt
        touchLastMoveRef.current = now
        let nt = targetRef.current + dxRaw / (window.innerWidth * SWIPE_FRACTION)
        nt = Math.max(touchOriginRef.current - 1, Math.min(touchOriginRef.current + 1, nt))
        targetRef.current = nt
        touchStartRef.current = { x: t.clientX, y: t.clientY }
      }
    }
    function onTouchEnd(e: TouchEvent) {
      const start = touchStartRef.current
      if (start && touchAxisRef.current === "y") {
        const t = e.changedTouches[0]
        const dy = start.y - t.clientY
        if (Math.abs(dy) > 60) exitSection(dy > 0 ? "down" : "up")
      } else if (touchAxisRef.current === "x") {
        const v = touchVelocityRef.current
        if (Math.abs(v) > FLICK_VELOCITY) {
          const dir = v > 0 ? 1 : -1
          targetRef.current = dir > 0
            ? Math.floor(currentRef.current) + 1
            : Math.ceil(currentRef.current) - 1
        }
      }
      touchStartRef.current = null
      touchAxisRef.current = null
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        lastInput.current = Date.now()
        targetRef.current = Math.round(currentRef.current) + 1
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        lastInput.current = Date.now()
        targetRef.current = Math.round(currentRef.current) - 1
      } else if (e.key === "ArrowDown") {
        exitSection("down")
      } else if (e.key === "ArrowUp") {
        exitSection("up")
      }
    }

    stage.addEventListener("wheel", onWheel, { passive: false })
    stage.addEventListener("touchstart", onTouchStart, { passive: true })
    stage.addEventListener("touchmove", onTouchMove, { passive: false })
    stage.addEventListener("touchend", onTouchEnd)
    window.addEventListener("keydown", onKey)

    let raf = 0
    function tick() {
      const now = Date.now()

      if (now - lastInput.current > SNAP_MS && touchAxisRef.current !== "x") {
        targetRef.current = Math.round(targetRef.current)
      }

      const c0 = currentRef.current
      const t  = targetRef.current
      currentRef.current = reduced ? t : c0 + (t - c0) * LERP
      const c = currentRef.current

      const cur = ((c % N) + N) % N

      for (let i = 0; i < N; i++) {
        const fig = figureRefs.current[i]
        if (!fig) continue
        const d = wrapDist(i - cur, N)
        if (Math.abs(d) > 1.15) {
          fig.style.visibility = "hidden"
          continue
        }
        fig.style.visibility = "visible"
        fig.style.transform = `translate3d(${d * 100}vw, 0, 0)`
      }

      if (lineRef.current) {
        lineRef.current.style.transform = `scaleX(${N > 1 ? cur / (N - 0) : 1})`
      }

      const ai = ((Math.round(c) % N) + N) % N
      if (ai !== activeRef.current) {
        activeRef.current = ai
        setActive(ai)
        setMounted(new Set([-1, 0, 1].map(k => ((ai + k) % N + N) % N)))
      }

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
  }, [N, router])

  // El fondo arranca (y cada vez que el clip termina, vuelve a arrancar) en
  // LOOP_START_S: se maneja con el SDK de Vimeo en vez de loop=1 nativo, que
  // siempre reinicia en 0.
  useEffect(() => {
    if (!sdkReady || typeof window === "undefined" || !window.Vimeo) return
    const Vimeo = window.Vimeo

    mounted.forEach(i => {
      const iframe = iframeRefs.current[i]
      if (!iframe || playersRef.current.has(i)) return
      const player = new Vimeo.Player(iframe)
      playersRef.current.set(i, player)
      player.setCurrentTime(LOOP_START_S).catch(() => {})
      player.on("ended", () => {
        player.setCurrentTime(LOOP_START_S).then(() => player.play()).catch(() => {})
      })
    })

    return () => {
      playersRef.current.forEach(p => { try { p.unload?.() } catch {} })
      playersRef.current.clear()
    }
  }, [sdkReady, mounted, bgKey])

  function openActive() {
    const f = films[activeRef.current]
    if (f?.vimeoId && phaseRef.current !== "moving") setModal(f.vimeoId)
  }

  function closeModal() {
    setModal(null)
    setBgKey(k => k + 1)
  }

  function goPrev() {
    lastInput.current = Date.now()
    targetRef.current = Math.round(currentRef.current) - 1
  }
  function goNext() {
    lastInput.current = Date.now()
    targetRef.current = Math.round(currentRef.current) + 1
  }

  const af = films[active]

  return (
    <>
      <Script src="https://player.vimeo.com/api/player.js" strategy="afterInteractive" onLoad={() => setSdkReady(true)} />

      <section
        ref={stageRef}
        className={`${styles.stage} ${styles["ph_" + phase] ?? ""}`}
        onClick={openActive}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openActive() } }}
        tabIndex={0}
        role="button"
        aria-label={`Película ${active + 1} de ${N}: ${af?.title ?? ""}. Enter para ver con sonido, flechas izquierda/derecha para navegar.`}
        data-cursor="play"
        data-cursor-label="Ver película"
      >
        <div className={styles.visor}>
          {films.map((f, i) => (
            <figure
              key={f.id}
              ref={el => { figureRefs.current[i] = el }}
              className={styles.figure}
            >
              {mounted.has(i) && (
                <iframe
                  key={bgKey}
                  ref={el => { iframeRefs.current[i] = el }}
                  className={styles.frame}
                  src={`https://player.vimeo.com/video/${f.vimeoId}?background=1&autoplay=1&muted=1&controls=0&byline=0&title=0&portrait=0&dnt=1`}
                  allow="autoplay"
                  tabIndex={-1}
                  aria-hidden
                />
              )}

              <div className={styles.card}>
                <img src={f.poster} alt={`Póster de ${f.title}`} className={styles.poster} />
                <div className={styles.ficha}>
                  <h2 className={styles.fichaTitle}>{f.title}</h2>
                  <dl className={styles.fichaList}>
                    <div className={styles.fichaRow}><dt>Dirección</dt><dd>{f.director}</dd></div>
                    <div className={styles.fichaRow}><dt>Guion</dt><dd>{f.writer}</dd></div>
                    <div className={styles.fichaRow}><dt>Año</dt><dd>{f.year}</dd></div>
                    <div className={styles.fichaRow}><dt>Duración</dt><dd>{f.duration}</dd></div>
                    <div className={styles.fichaRow}><dt>Género</dt><dd>{f.genre}</dd></div>
                    <div className={styles.fichaRow}><dt>País</dt><dd>{f.country}</dd></div>
                    <div className={styles.fichaRow}><dt>Reparto</dt><dd>{f.cast.join(", ")}</dd></div>
                  </dl>
                  <p className={styles.synopsis}>{f.synopsis}</p>
                </div>
              </div>
            </figure>
          ))}
          <div className={styles.overlay} />
        </div>

        <SectionTitle>Films</SectionTitle>

        <button
          type="button"
          className={`${styles.hint} ${styles.hintLeft}`}
          onClick={e => { e.stopPropagation(); goPrev() }}
          aria-label="Película anterior"
        >‹</button>
        <button
          type="button"
          className={`${styles.hint} ${styles.hintRight}`}
          onClick={e => { e.stopPropagation(); goNext() }}
          aria-label="Película siguiente"
        >›</button>

        {N > 1 && (
          <div className={styles.ui}>
            <div className={styles.railWrap}>
              <div className={styles.rail}>
                <span className={styles.counter} key={active}>{active + 1} de {N}</span>
                <div className={styles.railLine}>
                  <div ref={lineRef} className={styles.railFill} />
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {modal && <VideoModal videoId={modal} onClose={closeModal} />}
    </>
  )
}
