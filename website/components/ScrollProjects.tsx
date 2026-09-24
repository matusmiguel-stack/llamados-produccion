"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import VideoModal from "./VideoModal"
import SectionTitle from "./SectionTitle"
import styles from "./ScrollProjects.module.css"
import type { VimeoVideo } from "@/lib/vimeo"

/* Distancia envuelta más corta en un loop de N slots → [-N/2, N/2) */
function wrapDist(d: number, n: number): number {
  d = ((d % n) + n) % n
  if (d >= n / 2) d -= n
  return d
}

type Phase = "moving" | "visible" | "idle"
type Axis = "x" | "y" | null

const LERP       = 0.075 // factor de suavizado del scroll virtual
const SNAP_MS    = 150   // sin input durante esto → snap al proyecto más cercano
const IDLE_MS    = 1300  // sin input durante esto → se esconde el UI
const EXIT_COOLDOWN_MS = 700 // ignora el scroll vertical justo al entrar (inercia del gesto anterior)
const INTRO_MS      = 5000 // tiempo que se muestra el aviso de "desplaza…" al entrar
const INTRO_FADE_MS = 700  // duración del fade out del aviso
const SWIPE_FRACTION  = 0.5  // fracción del ancho de pantalla para un swipe completo (antes 0.85, muy pronunciado)
const FLICK_VELOCITY  = 0.6  // px/ms — un swipe rápido y corto también cambia de proyecto

export default function ScrollProjects({ videos }: { videos: VimeoVideo[] }) {
  const N = videos.length
  const router = useRouter()

  const stageRef  = useRef<HTMLElement>(null)
  const figureRefs = useRef<(HTMLElement | null)[]>([])
  const lineRef   = useRef<HTMLDivElement>(null)

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
  const [intro,  setIntro]  = useState<"show" | "hide" | "gone">("show")
  // Cambia al cerrar el modal para remontar los iframes de fondo: el navegador
  // los pausa mientras el modal (con sonido) está abierto y no los reanuda solo
  const [bgKey, setBgKey] = useState(0)
  // Iframes montados: ventana alrededor del activo, acumulativa (una vez cargado, se queda)
  const [mounted, setMounted] = useState<Set<number>>(
    () => new Set(Array.from({ length: Math.min(3, N) }, (_, i) => i).concat(N > 3 ? [N - 1] : []))
  )

  // Aviso inicial: se ve INTRO_MS, luego fade out y desaparece del DOM.
  // También se puede saltar antes si el usuario ya empieza a hacer scroll horizontal.
  function dismissIntro() {
    setIntro(i => i === "show" ? "hide" : i)
  }
  useEffect(() => {
    const t1 = setTimeout(dismissIntro, INTRO_MS)
    return () => clearTimeout(t1)
  }, [])
  useEffect(() => {
    if (intro !== "hide") return
    const t2 = setTimeout(() => setIntro("gone"), INTRO_FADE_MS)
    return () => clearTimeout(t2)
  }, [intro])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || N < 1) return

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const mountedAt = Date.now()
    navigatingRef.current = false

    // Vertical → cambia de sección: abajo a Films, arriba a Nosotros
    function exitSection(dir: "down" | "up") {
      if (navigatingRef.current) return
      if (Date.now() - mountedAt < EXIT_COOLDOWN_MS) return
      navigatingRef.current = true
      if (dir === "down") router.push("/films", { transitionTypes: ["nav-forward"] })
      else router.push("/nosotros", { transitionTypes: ["nav-back"] })
    }

    function onWheel(e: WheelEvent) {
      // Reclama el gesto: sin esto, un swipe horizontal de trackpad lo agarra
      // el navegador para "atrás/adelante" y nunca llega a mover el carrusel.
      e.preventDefault()

      const dx = e.deltaX
      const dy = e.deltaY

      // Vertical domina → sale de la sección
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 60) {
        exitSection(dy > 0 ? "down" : "up")
        return
      }

      // Horizontal → navega entre proyectos (y salta el aviso inicial si sigue ahí)
      dismissIntro()
      const now = Date.now()
      // Gesto nuevo (pausa > 200ms desde el último wheel) → reinicia el origen del tope
      if (now - lastWheelRef.current > 200) {
        wheelOriginRef.current = Math.round(currentRef.current)
      }
      lastWheelRef.current = now
      lastInput.current = now
      let t = targetRef.current + dx * 0.0011
      // Un gesto (por fuerte o rápido que sea) mueve como máximo un proyecto
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
        dismissIntro()
        lastInput.current = Date.now()
        const now = Date.now()
        const dt = now - touchLastMoveRef.current
        const dxRaw = start.x - t.clientX
        if (dt > 0) touchVelocityRef.current = dxRaw / dt
        touchLastMoveRef.current = now
        let nt = targetRef.current + dxRaw / (window.innerWidth * SWIPE_FRACTION)
        // Un swipe mueve como máximo un proyecto, sin importar qué tan lejos o
        // fuerte se arrastre
        nt = Math.max(touchOriginRef.current - 1, Math.min(touchOriginRef.current + 1, nt))
        targetRef.current = nt
        touchStartRef.current = { x: t.clientX, y: t.clientY }
      }
      // eje vertical: no mueve el carrusel, se decide en touchend
    }
    function onTouchEnd(e: TouchEvent) {
      const start = touchStartRef.current
      if (start && touchAxisRef.current === "y") {
        const t = e.changedTouches[0]
        const dy = start.y - t.clientY
        if (Math.abs(dy) > 60) exitSection(dy > 0 ? "down" : "up")
      } else if (touchAxisRef.current === "x") {
        // Swipe corto pero rápido ("flick") también cambia de proyecto,
        // aunque no haya recorrido la fracción completa de la pantalla
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
        dismissIntro()
        lastInput.current = Date.now()
        targetRef.current = Math.round(currentRef.current) + 1
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        dismissIntro()
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

      // Snap: si no hay input reciente, asentarse en el proyecto más cercano
      if (now - lastInput.current > SNAP_MS && touchAxisRef.current !== "x") {
        targetRef.current = Math.round(targetRef.current)
      }

      // Lerp del scroll virtual
      const c0 = currentRef.current
      const t  = targetRef.current
      currentRef.current = reduced ? t : c0 + (t - c0) * LERP
      const c = currentRef.current

      const cur = ((c % N) + N) % N

      // Wipe: cada video se desliza horizontalmente según su distancia al activo,
      // así el cambio entre proyectos se lee claramente como un barrido, no un crossfade
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

      // Línea de progreso global (0→1 a través del set)
      if (lineRef.current) {
        lineRef.current.style.transform = `scaleX(${N > 1 ? cur / (N - 0) : 1})`
      }

      // Índice activo → crossfade del visor
      const ai = ((Math.round(c) % N) + N) % N
      if (ai !== activeRef.current) {
        activeRef.current = ai
        setActive(ai)
        // Ventana chica y fija (no acumulativa): evita ir cargando cada vez
        // más iframes de Vimeo a la vez, que en móvil termina tronando la página
        setMounted(new Set([-1, 0, 1].map(k => ((ai + k) % N + N) % N)))
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
  }, [N, router])

  function openActive() {
    const v = videos[activeRef.current]
    if (v?.id && phaseRef.current !== "moving") setModal(v.id)
  }

  function closeModal() {
    setModal(null)
    setBgKey(k => k + 1)
  }

  // Botones ‹ › — misma acción que ArrowLeft/ArrowRight, para quien no
  // pueda hacer swipe horizontal (mouse, o para descartar si es tema de gesto)
  function goPrev() {
    dismissIntro()
    lastInput.current = Date.now()
    targetRef.current = Math.round(currentRef.current) - 1
  }
  function goNext() {
    dismissIntro()
    lastInput.current = Date.now()
    targetRef.current = Math.round(currentRef.current) + 1
  }

  const av = videos[active]

  return (
    <>
      <section
        ref={stageRef}
        className={`${styles.stage} ${styles["ph_" + phase] ?? ""} ${intro !== "gone" ? styles.stageIntro : ""}`}
        onClick={openActive}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openActive() } }}
        tabIndex={0}
        role="button"
        aria-label={`Proyecto ${active + 1} de ${N}: ${av?.title ?? ""}. Enter para ver con sonido, flechas izquierda/derecha para navegar.`}
        data-cursor="play"
        data-cursor-label="Ver video"
      >
        {/* ── Visor: videos fullscreen con crossfade ── */}
        <div className={styles.visor}>
          {videos.map((v, i) => (
            <figure
              key={v.id || i}
              ref={el => { figureRefs.current[i] = el }}
              className={styles.figure}
            >
              {v.thumbnail && (
                <div className={styles.poster} style={{ backgroundImage: `url(${v.thumbnail})` }} />
              )}
              {v.id && mounted.has(i) && (
                <iframe
                  key={bgKey}
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

        <SectionTitle>Proyectos</SectionTitle>

        {/* Indicadores de scroll horizontal — también sirven de botón; siempre
            visibles, no se esconden en idle como el resto del UI */}
        <button
          type="button"
          className={`${styles.hint} ${styles.hintLeft}`}
          onClick={e => { e.stopPropagation(); goPrev() }}
          aria-label="Proyecto anterior"
        >‹</button>
        <button
          type="button"
          className={`${styles.hint} ${styles.hintRight}`}
          onClick={e => { e.stopPropagation(); goNext() }}
          aria-label="Proyecto siguiente"
        >›</button>

        {/* ── UI: se esconde en idle ── */}
        <div className={styles.ui}>
          {/* Título del proyecto (chico) + riel de progreso horizontal, abajo centrado */}
          <div className={styles.railWrap}>
            <div className={styles.projectTitle} key={active}>{av?.title}</div>
            <div className={styles.rail}>
              <span className={styles.counter} key={active}>{active + 1} de {N}</span>
              <div className={styles.railLine}>
                <div ref={lineRef} className={styles.railFill} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {modal && <VideoModal videoId={modal} onClose={closeModal} />}

      {intro !== "gone" && (
        <div className={`${styles.intro} ${intro === "hide" ? styles.introHide : ""}`} aria-hidden>
          {/* El fondo se ve a través: es el reel persistente del layout (reel), igual que en Nosotros */}
          <img src="/intro-desliza.webp" alt="" className={styles.introImg} />
        </div>
      )}
    </>
  )
}
