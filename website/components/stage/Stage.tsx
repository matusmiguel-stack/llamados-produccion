"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { StageController, type StageDom } from "./controller"
import { parseRoute } from "./routes"
import { setStageNavigator } from "./bus"
import type { Category, Project } from "@/lib/vimeo"
import styles from "./stage.module.css"

/* Escenario persistente de "/", "/proyectos", "/proyectos/[slug]" y "/nosotros":
   el reel de fondo, el carrusel WebGL y el reproductor viven aquí y no se
   desmontan al navegar entre esas rutas. */

let introPlayed = false

type Props = {
  projects: Project[]
  categories: Category[]
  reel: { id: string; h: string; poster: string }
  reelVideo?: string
  children: React.ReactNode
}

/* Proyectos de la categoría activa, en el orden del showcase (con su índice
   global, que es el que entiende el escenario). */
function listFor(projects: Project[], categories: Category[], cat: number) {
  const byId = new Map(projects.map((p, i) => [p.id, i]))
  const ids = categories[cat]?.ids
  if (!ids) return projects.map((p, i) => ({ p, i }))
  return ids.flatMap((id) => {
    const i = byId.get(id)
    return i === undefined ? [] : [{ p: projects[i], i }]
  })
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}

export default function Stage({ projects, categories, reel, reelVideo, children }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [withPreloader] = useState(() => !introPlayed)
  // Categoría activa: solo para pintar la lista accesible en su orden
  const [cat, setCat] = useState(0)
  const ready = useRef<ReturnType<typeof deferred> | null>(null)
  if (!ready.current) ready.current = deferred()

  const root = useRef<HTMLDivElement>(null)
  const hero = useRef<HTMLDivElement>(null)
  const heroMedia = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const reelFrame = useRef<HTMLIFrameElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const hint = useRef<HTMLButtonElement>(null)
  const veil = useRef<HTMLDivElement>(null)
  const backdrop = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const caption = useRef<HTMLParagraphElement>(null)
  const capTitle = useRef<HTMLSpanElement>(null)
  const capSub = useRef<HTMLSpanElement>(null)
  const player = useRef<HTMLDivElement>(null)
  const caseUi = useRef<HTMLDivElement>(null)
  const back = useRef<HTMLButtonElement>(null)
  const backLabel = useRef<HTMLSpanElement>(null)
  const counter = useRef<HTMLSpanElement>(null)
  const preloader = useRef<HTMLDivElement>(null)
  const preloaderLogo = useRef<HTMLSpanElement>(null)
  const ctrl = useRef<StageController | null>(null)

  useEffect(() => {
    // El reel se empieza a cargar desde el HTML del servidor, así que puede
    // estar listo antes de que React enganche sus eventos: se revisa aquí.
    const done = () => ready.current?.resolve()
    const v = video.current
    if (v) {
      v.muted = true
      v.defaultMuted = true
      if (!v.paused && v.readyState >= 2) done()
      v.addEventListener("playing", done, { once: true })
      v.play().catch(() => {
        done()
        window.addEventListener("pointerdown", () => { v.play().catch(() => {}) }, { once: true, capture: true })
      })
    }
    const f = reelFrame.current
    let onMsg: ((e: MessageEvent) => void) | null = null
    if (f) {
      f.addEventListener("load", () => setTimeout(done, 700), { once: true })
      onMsg = (e: MessageEvent) => {
        if (e.origin === "https://player.vimeo.com" && e.source === f.contentWindow) done()
      }
      window.addEventListener("message", onMsg)
      try { f.contentWindow?.postMessage({ method: "getPaused" }, "https://player.vimeo.com") } catch {}
    }

    const dom: StageDom = {
      root: root.current!, hero: hero.current!, heroMedia: heroMedia.current!, hint: hint.current!,
      veil: veil.current!, backdrop: backdrop.current!, canvas: canvas.current!,
      caption: caption.current!, capTitle: capTitle.current!, capSub: capSub.current!,
      player: player.current!, caseUi: caseUi.current!, back: back.current!, backLabel: backLabel.current!,
      counter: counter.current!, list: list.current!, bar: bar.current, preloader: preloader.current, preloaderLogo: preloaderLogo.current,
    }
    const c = new StageController(dom, {
      projects,
      categories,
      reel,
      routerPush: (href) => router.push(href, { scroll: false }),
      initial: parseRoute(window.location.pathname),
      playIntro: !introPlayed && !!preloader.current,
      onCategory: setCat,
      onIntroDone: () => { introPlayed = true },
      reelReady: ready.current!.promise,
    })
    ctrl.current = c
    setStageNavigator((href) => c.navigate(href))
    return () => {
      if (onMsg) window.removeEventListener("message", onMsg)
      setStageNavigator(null)
      c.dispose()
      ctrl.current = null
    }
    // El escenario se monta una sola vez; las rutas llegan por el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    ctrl.current?.go(parseRoute(pathname))
  }, [pathname])

  const reelSrc = `https://player.vimeo.com/video/${reel.id}?h=${reel.h}&background=1&autoplay=1&muted=1&loop=1&controls=0&byline=0&title=0&portrait=0&dnt=1&autopause=0`

  return (
    <div ref={root} className={styles.root}>
      <div
        ref={hero}
        className={styles.hero}
        onClick={() => ctrl.current?.openReel()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            ctrl.current?.openReel()
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Ver reel con sonido"
        data-cursor="play"
        data-cursor-label="Ver reel"
      >
        <div ref={heroMedia} className={styles.heroMedia} style={{ backgroundImage: `url(${reel.poster})` }}>
          {reelVideo ? (
            <video ref={video} src={reelVideo} poster={reel.poster} muted loop playsInline autoPlay preload="auto" aria-hidden />
          ) : (
            <iframe ref={reelFrame} src={reelSrc} allow="autoplay; fullscreen" tabIndex={-1} aria-hidden title="Reel" />
          )}
        </div>
      </div>

      <button ref={hint} type="button" className={styles.hint} data-goo onClick={() => ctrl.current?.navigate("/proyectos")}>
        <span className={styles.hintWheel}>Desliza para ver proyectos</span>
        <span className={styles.hintTouch}>Desliza hacia arriba</span>
        <svg className={styles.hintArrow} viewBox="0 0 12 18" aria-hidden>
          <path d="M6 1v15M1.5 11.5 6 16l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>

      <div ref={veil} className={styles.veil} aria-hidden />
      <div ref={backdrop} className={styles.backdrop} aria-hidden />
      <canvas ref={canvas} className={styles.canvas} aria-hidden />

      <p ref={caption} className={styles.caption} aria-live="polite">
        <span ref={capTitle} className={styles.capTitle} data-goo />
        <span ref={capSub} className={styles.capSub} data-goo />
      </p>

      {categories.length > 1 && (
        <div ref={bar} className={styles.bar} role="group" aria-label="Categorías">
          {categories.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={styles.barItem}
              data-goo
              aria-pressed={i === 0}
              onClick={() => ctrl.current?.setCategory(i)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      <ul ref={list} className={styles.list} aria-label="Proyectos">
        {listFor(projects, categories, cat).map(({ p, i }) => (
          <li key={p.id}>
            <button type="button" onClick={() => ctrl.current?.openFromList(i)} onFocus={() => ctrl.current?.focusProject(i)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.poster} alt="" loading="lazy" />
              <span className={styles.listTitle}>{p.client}</span>
              <span className={styles.listSub}>{p.name}</span>
            </button>
          </li>
        ))}
      </ul>

      <div ref={player} className={styles.player} />

      <div ref={caseUi} className={styles.caseUi}>
        <button ref={back} type="button" className={styles.back} onClick={() => ctrl.current?.back()}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path className={styles.backShaft} d="M20 12H5" pathLength={1} />
            <path d="M10 7l-5 5 5 5" />
          </svg>
          <span ref={backLabel}>Proyectos</span>
        </button>
        <span ref={counter} className={styles.counter} aria-live="polite" />
      </div>

      <div className={styles.content}>{children}</div>

      {withPreloader && (
        <div ref={preloader} className={styles.preloader} aria-hidden>
          <span ref={preloaderLogo} className={styles.preloaderLogo} data-goo>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-retro.png" alt="" />
          </span>
        </div>
      )}
    </div>
  )
}
