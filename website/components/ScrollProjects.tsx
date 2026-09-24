"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
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
type Axis = "x" | "y" | null

const TRAVEL_VW  = 130   // recorrido horizontal de cada item (en vw) por slot
const PARALLAX   = 0.9   // el título contra-viaja a 0.9 → velocidad neta 0.1x
const LERP       = 0.075 // factor de suavizado del scroll virtual
const SNAP_MS    = 150   // sin input durante esto → snap al proyecto más cercano
const IDLE_MS    = 1300  // sin input durante esto → se esconde el UI
const EXIT_COOLDOWN_MS = 700 // ignora el scroll vertical justo al entrar (inercia del gesto anterior)
const INTRO_MS      = 5000 // tiempo que se muestra el aviso de "desplaza…" al entrar
const INTRO_FADE_MS = 700  // duración del fade out del aviso

export default function ScrollProjects({ videos }: { videos: VimeoVideo[] }) {
  const N = videos.length
  const router = useRouter()

  const stageRef  = useRef<HTMLElement>(null)
  const itemRefs  = useRef<(HTMLDivElement | null)[]>([])
  const titleRefs = useRef<(HTMLDivElement | null)[]>([])
  const lineRef   = useRef<HTMLDivElement>(null)

  const targetRef      = useRef(0)
  const currentRef     = useRef(0)
  const lastInput       = useRef(Date.now())
  const phaseRef        = useRef<Phase>("visible")
  const activeRef        = useRef(0)
  const touchStartRef      = useRef<{ x: number; y: number } | null>(null)
  const touchAxisRef       = useRef<Axis>(null)
  const navigatingRef  = useRef(false)

  const [active, setActive] = useState(0)
  const [phase,  setPhase]  = useState<Phase>("visible")
  const [modal,  setModal]  = useState<string | null>(null)
  const [intro,  setIntro]  = useState<"show" | "hide" | "gone">("show")
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
      lastInput.current = Date.now()
      let t = targetRef.current + dx * 0.0011
      // no permitir vuelos de más de 3 proyectos de golpe
      t = Math.max(currentRef.current - 3, Math.min(currentRef.current + 3, t))
      targetRef.current = t
    }

    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0]
      touchStartRef.current = { x: t.clientX, y: t.clientY }
      touchAxisRef.current = null
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
        targetRef.current += (start.x - t.clientX) / (window.innerWidth * 0.85)
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
        el.style.transform = `translate3d(${d * TRAVEL_VW}vw, 0, 0)`
        ti.style.transform = `translate3d(${-d * TRAVEL_VW * PARALLAX}vw, 0, 0)`
        const op = Math.max(0, Math.min(1, 1 - (Math.abs(d) - 0.1) / 0.28))
        ti.style.opacity = String(op)
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
          {/* Riel de progreso horizontal con numeral romano, abajo centrado */}
          <div className={styles.rail}>
            <span className={styles.roman} key={active}>{roman(active + 1)}</span>
            <div className={styles.railLine}>
              <div ref={lineRef} className={styles.railFill} />
            </div>
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

      {intro !== "gone" && (
        <div className={`${styles.intro} ${intro === "hide" ? styles.introHide : ""}`} aria-hidden>
          {/* El fondo se ve a través: es el reel persistente del layout (reel), igual que en Nosotros */}
          <img src="/intro-desliza.webp" alt="" className={styles.introImg} />
        </div>
      )}
    </>
  )
}
