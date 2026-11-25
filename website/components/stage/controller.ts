import gsap from "gsap"
import { Strip, webglOk, type Rect } from "./strip"
import { gooTimeline, setGoo, prefersReducedMotion } from "@/lib/goo"
import { swapText } from "@/lib/swap"
import { lerp } from "@/lib/ease"
import { parseRoute, isThinRoute, SITE, type StageRoute } from "./routes"
import { revealHeader } from "./bus"
import type { Project } from "@/lib/vimeo"

export type StageDom = {
  root: HTMLElement
  hero: HTMLElement
  heroMedia: HTMLElement
  hint: HTMLElement
  veil: HTMLElement
  backdrop: HTMLElement
  canvas: HTMLCanvasElement
  caption: HTMLElement
  capTitle: HTMLElement
  capSub: HTMLElement
  player: HTMLElement
  caseUi: HTMLElement
  back: HTMLButtonElement
  backLabel: HTMLElement
  counter: HTMLElement
  list: HTMLElement
  preloader: HTMLElement | null
  preloaderLogo: HTMLElement | null
}

type Mode = "hero" | "proyectos" | "case" | "nosotros"

type Options = {
  projects: Project[]
  reel: { id: string; h: string }
  routerPush: (href: string) => void
  initial: StageRoute
  playIntro: boolean
  onIntroDone: () => void
  reelReady: Promise<void>
}

const VIMEO = "https://player.vimeo.com"
const PLAYER_PARAMS = "autoplay=1&muted=0&playsinline=1&title=0&byline=0&portrait=0&badge=0&vimeo_logo=0&dnt=1&color=D0342C&autopause=0&pip=0&keyboard=1&controls=1&unmute_button=1"

const pad2 = (n: number) => String(n).padStart(2, "0")
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export class StageController {
  private dom: StageDom
  private o: Options
  private projects: Project[]
  private strip: Strip | null = null
  private webgl: boolean
  private reduced: boolean

  mode: Mode = "hero"
  private caseIndex = -1
  private reelOpen = false
  private introRunning = false
  private introTl: gsap.core.Timeline | null = null
  private pendingRoute: StageRoute | null = null
  private tl: gsap.core.Timeline | null = null
  private lockedUntil = 0
  private captionShown = false
  private captionTl: gsap.core.Timeline | null = null
  private capProgress = { p: 0 }

  // valores animados que se aplican al DOM en cada frame
  private v = { recede: 0, veil: 0, backdrop: 0, hero: 1 }
  private applied = { recede: -1, veil: -1, backdrop: -1, hero: -1 }

  // reproductor
  private iframe: HTMLIFrameElement | null = null
  private playerShown = false
  private playerPlaying = false
  private morphDone = false
  private revealTimer: ReturnType<typeof setTimeout> | null = null

  // entrada
  private lastWheelAt = 0
  private lastWheelDy = 0
  private wheelGuard = false
  private touch: { x: number; y: number; t: number } | null = null

  private captionOffset = 0
  private disposed = false
  private cleanups: (() => void)[] = []

  constructor(dom: StageDom, o: Options) {
    this.dom = dom
    this.o = o
    this.projects = o.projects
    this.reduced = prefersReducedMotion()
    this.webgl = webglOk()
    dom.root.dataset.webgl = this.webgl && o.projects.length ? "on" : "off"
    dom.root.dataset.mode = "hero"

    if (this.webgl && this.projects.length) {
      this.strip = new Strip(dom.canvas, this.projects.map((p) => ({
        id: p.id, slug: p.slug, title: p.client, subtitle: p.name,
        poster: p.poster, posterLarge: p.posterLarge, aspect: p.width / p.height,
        peek: p.peek, peekPhone: p.peekPhone,
      })), {
        onChange: (i) => this.onActiveChange(i),
        onOpen: (i) => this.requestCase(i),
        onHover: (k) => {
          dom.canvas.dataset.cursor = k === "open" ? "play" : ""
          dom.canvas.dataset.cursorLabel = "Ver video"
          dom.canvas.style.cursor = k === "open" || k === "step" ? "pointer" : k === "drag" ? "grab" : ""
        },
      })
      this.strip.warm()
    }

    if (process.env.NODE_ENV !== "production") (window as unknown as { __stage: unknown }).__stage = this

    gsap.ticker.lagSmoothing(500, 16.7)
    gsap.ticker.add(this.tick)
    this.listen()
    this.measure()

    if (this.projects.length) this.setCaption(0, false)

    document.documentElement.classList.add("stage-on")

    if (o.playIntro) {
      this.runIntro(o.initial)
    } else {
      this.v.hero = 0
      gsap.to(this.v, { hero: 1, duration: this.reduced ? 0.3 : 0.6, ease: "power1.out" })
      revealHeader()
      this.go(o.initial, { initial: true, force: true })
    }
  }

  /* ---------- bucle por frame ---------- */

  private tick = (_time: number, deltaMs: number) => {
    if (this.disposed) return
    const dt = Math.min(deltaMs / 1000, 0.1)
    this.strip?.update(dt)
    this.apply()
  }

  private apply() {
    const { v, applied, dom } = this
    if (v.recede !== applied.recede || v.hero !== applied.hero) {
      applied.recede = v.recede
      applied.hero = v.hero
      const r = v.recede
      const blur = r * 0.0075 * window.innerHeight
      dom.heroMedia.style.transform = `scale(${lerp(1.04, 1, r).toFixed(4)})`
      dom.heroMedia.style.filter = r > 0.001
        ? `blur(${blur.toFixed(2)}px) brightness(${(1 - 0.4 * r).toFixed(3)}) saturate(${(1 - 0.15 * r).toFixed(3)})`
        : ""
      dom.hero.style.opacity = v.hero.toFixed(3)
    }
    if (v.veil !== applied.veil) {
      applied.veil = v.veil
      dom.veil.style.opacity = v.veil.toFixed(3)
    }
    if (v.backdrop !== applied.backdrop) {
      applied.backdrop = v.backdrop
      dom.backdrop.style.opacity = v.backdrop.toFixed(3)
      dom.backdrop.style.visibility = v.backdrop > 0.001 ? "visible" : "hidden"
    }
    if (this.strip && this.captionShown) {
      const t = this.strip.captionTransform(this.captionOffset)
      dom.caption.style.transform = `translate(${t.x.toFixed(1)}px, ${t.y.toFixed(1)}px) scale(${t.scale.toFixed(4)})`
      dom.caption.style.opacity = t.opacity.toFixed(3)
      dom.caption.style.filter = t.blur > 0.3 ? `blur(${t.blur.toFixed(1)}px)` : ""
    }
  }

  private measure() {
    const c = this.dom.caption
    c.style.transform = ""
    this.captionOffset = c.offsetTop + c.offsetHeight / 2 - window.innerHeight / 2
    if (this.caseIndex >= 0 || this.reelOpen) this.placePlayer()
  }

  /* ---------- intro ---------- */

  private async runIntro(initial: StageRoute) {
    this.introRunning = true
    this.v.hero = 0
    const logo = this.dom.preloaderLogo
    await Promise.race([document.fonts?.ready ?? Promise.resolve(), sleep(800)])
    if (this.disposed) return
    const inTl = logo ? gooTimeline([logo], "in", { duration: 1.4 }) : null
    this.introTl = inTl
    await Promise.all([
      inTl ?? Promise.resolve(),
      Promise.race([this.o.reelReady, sleep(3500)]),
    ])
    if (this.disposed) return

    const tl = gsap.timeline()
    this.introTl = tl
    if (logo) tl.add(gooTimeline([logo], "out", { duration: 1.0 }), 0)
    tl.to(this.v, { hero: 1, duration: this.reduced ? 0.6 : 1.2, ease: "power1.inOut" }, 0)
    tl.call(() => revealHeader(), [], 0.8)
    tl.call(() => {
      const route = this.pendingRoute ?? initial
      if (this.dom.preloader) this.dom.preloader.style.display = "none"
      this.introTl = null
      this.introRunning = false
      this.o.onIntroDone()
      this.pendingRoute = null
      this.go(route, { initial: true, force: true })
    }, [], 1.35)
  }

  /* ---------- navegación ---------- */

  private indexOf(slug: string) {
    return this.projects.findIndex((p) => p.slug === slug)
  }

  private setTitle(route: StageRoute) {
    if (route.mode === "proyectos") document.title = `Proyectos — ${SITE}`
    else if (route.mode === "case") {
      const p = this.projects[this.indexOf(route.slug)]
      document.title = p ? `${p.title} — ${SITE}` : SITE
    } else if (route.mode === "hero") document.title = SITE
  }

  /* Navegación iniciada por el escenario o el header. Entre rutas "delgadas"
     se usa pushState para que la animación arranque sin esperar al router. */
  navigate(href: string) {
    const route = parseRoute(href)
    if (route.mode === "outside") return false
    if (isThinRoute(location.pathname) && isThinRoute(href)) {
      if (href !== location.pathname) history.pushState(null, "", href)
      this.setTitle(route)
      this.go(route)
      return true
    }
    return false
  }

  private push(href: string) {
    if (!this.navigate(href)) this.o.routerPush(href)
  }

  private locked() {
    return performance.now() < this.lockedUntil || this.introRunning
  }

  private lock(seconds: number) {
    this.lockedUntil = performance.now() + seconds * 1000
  }

  private requestCase(i: number) {
    if (this.locked() || this.mode !== "proyectos") return
    this.push(`/proyectos/${this.projects[i].slug}`)
  }

  go(route: StageRoute, { initial = false, force = false }: { initial?: boolean; force?: boolean } = {}) {
    if (this.disposed || route.mode === "outside") return
    if (this.introRunning) {
      this.pendingRoute = route
      return
    }
    let to: Mode = route.mode
    let index = -1
    if (route.mode === "case") {
      index = this.indexOf(route.slug)
      if (index < 0) {
        history.replaceState(null, "", "/proyectos")
        to = "proyectos"
      }
    }
    if (!force && !this.reelOpen && to === this.mode && (to !== "case" || index === this.caseIndex)) return

    this.tl?.kill()
    this.tl = null
    if (this.reelOpen) this.closeReel(true)
    const from = this.mode
    this.mode = to
    this.dom.root.dataset.mode = to
    if (route.mode !== "case" || index >= 0) this.setTitle(route)
    this.syncFocusables()

    if (to === "case") {
      if (from === "case") this.swapCase(index)
      else this.openCase(index, from === "proyectos" && !initial)
      return
    }
    if (to === "proyectos") return this.toStrip(from, initial)
    if (to === "hero") return this.toHero(from, initial)
    if (to === "nosotros") return this.toNosotros(from, initial)
  }

  /* Lo que solo tiene sentido en un modo sale del orden de tabulación (y del
     ratón) en los demás. */
  private syncFocusables() {
    const { hint, hero } = this.dom
    const inHero = this.mode === "hero" && !this.reelOpen
    if (!inHero && document.activeElement === hint) hint.blur()
    hint.inert = !inHero
    hero.inert = !inHero
  }

  /* ---------- transiciones ---------- */

  private timeline(lockFor: number) {
    this.tl?.kill()
    const tl = gsap.timeline()
    this.tl = tl
    this.lock(lockFor)
    return tl
  }

  /* Si una transición anterior quedó a medias (por ejemplo, se cerró un video
     y antes de terminar se pidió el inicio), lo que dejó a medio camino se
     limpia aquí: el fondo negro, la fila de "regresar", el reproductor y la
     tarjeta levantada. */
  private settleLeftovers(tl: gsap.core.Timeline) {
    if (this.iframe && !this.reelOpen && this.caseIndex < 0) {
      const iframe = this.iframe
      tl.to(iframe, { opacity: 0, duration: 0.2, ease: "none" }, 0)
      tl.call(() => { if (this.iframe === iframe) this.unmountPlayer() }, [], 0.21)
    }
    if (this.v.backdrop > 0) tl.to(this.v, { backdrop: 0, duration: 0.5, ease: "power1.inOut" }, 0)
    if (Number(gsap.getProperty(this.dom.caseUi, "opacity")) > 0) {
      tl.to(this.dom.caseUi, { autoAlpha: 0, duration: 0.3, ease: "power1.in" }, 0)
    }
    if (this.strip && this.strip.liftedIndex >= 0) this.strip.drop()
  }

  private stripIn(tl: gsap.core.Timeline, at: number) {
    const s = this.strip
    if (!s) return
    s.setAwake(true)
    s.inputEnabled = false
    s.peekEnabled = false
    if (s.arrive < 0.01) {
      s.arrive = 0
      tl.to(s, { arrive: 1, duration: this.reduced ? 0.4 : 1.667, ease: this.reduced ? "power1.out" : "power3.out" }, at)
    } else {
      tl.to(s, { arrive: 1, duration: 0.8, ease: "power3.out" }, at)
    }
    tl.to(s, { stripShown: 1, duration: 0.6, ease: "power3.out" }, at)
  }

  private stripOut(tl: gsap.core.Timeline, at: number) {
    const s = this.strip
    if (!s) return
    s.inputEnabled = false
    s.peekEnabled = false
    tl.to(s, {
      arrive: 0, duration: this.reduced ? 0.3 : 1.333, ease: "power3.in",
      onComplete: () => { if (this.mode !== "proyectos" && this.mode !== "case") s.setAwake(false) },
    }, at)
  }

  private enableStrip() {
    if (this.mode !== "proyectos") return
    if (this.strip) {
      this.strip.inputEnabled = true
      this.strip.peekEnabled = true
    }
  }

  private toStrip(from: Mode, initial: boolean) {
    const tl = this.timeline(initial ? 1.5 : 1.21)
    if (from === "case") return this.closeCase(tl, true)
    this.settleLeftovers(tl)
    tl.add(gooTimeline([this.dom.hint], "out", { duration: 0.33 }), 0)
    const late = initial ? 0.25 : 0
    tl.to(this.v, { recede: 1, duration: 1.333, ease: "power2.inOut" }, late)
    tl.to(this.v, { veil: 1, duration: 1.0, ease: "power1.inOut" }, late + 0.167)
    this.stripIn(tl, late + 0.167)
    tl.call(() => this.showCaption(), [], late + 0.79)
    tl.call(() => this.enableStrip(), [], late + 1.21)
  }

  private toHero(from: Mode, initial: boolean) {
    const tl = this.timeline(initial ? 0.2 : 1.47)
    if (from === "case") this.closeCase(tl, false)
    else this.settleLeftovers(tl)
    this.hideCaption(tl, 0)
    this.stripOut(tl, 0)
    tl.to(this.v, { recede: 0, duration: 1.067, ease: "power2.inOut" }, from === "case" ? 0.21 : 0.4)
    tl.to(this.v, { veil: 0, duration: 0.8, ease: "power1.inOut" }, from === "case" ? 0.375 : 0.533)
    tl.add(gooTimeline([this.dom.hint], "in", { duration: 1.0 }), initial ? 0 : 1.0)
  }

  private toNosotros(from: Mode, initial: boolean) {
    const tl = this.timeline(initial ? 0.2 : 1.2)
    if (from === "case") this.closeCase(tl, false)
    else this.settleLeftovers(tl)
    tl.add(gooTimeline([this.dom.hint], "out", { duration: 0.33 }), 0)
    this.hideCaption(tl, 0)
    this.stripOut(tl, 0)
    tl.to(this.v, { recede: 1, duration: 1.333, ease: "power2.inOut" }, 0)
    tl.to(this.v, { veil: 1, duration: 1.0, ease: "power1.inOut" }, 0.167)
  }

  /* ---------- caption ---------- */

  private setCaption(i: number, animate: boolean) {
    const p = this.projects[i]
    if (!p) return
    const { capTitle, capSub } = this.dom
    if (!animate) {
      capTitle.textContent = p.client
      capSub.textContent = p.name
      return
    }
    this.captionTl?.kill()
    const prog = this.capProgress
    const tl = gsap.timeline()
    this.captionTl = tl
    const update = () => { setGoo(capTitle, prog.p); setGoo(capSub, prog.p) }
    tl.to(prog, { p: 0, duration: 0.3 * prog.p, ease: "none", onUpdate: update })
    tl.call(() => { capTitle.textContent = p.client; capSub.textContent = p.name })
    tl.to(prog, { p: 1, duration: this.reduced ? 0.2 : 0.8, ease: "none", onUpdate: update })
  }

  private onActiveChange(i: number) {
    this.setCaption(i, this.captionShown && this.mode === "proyectos")
  }

  private showCaption() {
    if (this.mode !== "proyectos" || !this.strip) return
    this.captionShown = true
    this.dom.caption.style.visibility = "visible"
    this.captionTl?.kill()
    const i = this.strip?.activeIndex ?? 0
    this.setCaption(i < 0 ? 0 : i, false)
    this.capProgress.p = 0
    const els = [this.dom.capTitle, this.dom.capSub]
    const tl = gooTimeline(els, "in", { duration: 0.83, stagger: 0.05 })
    tl.eventCallback("onComplete", () => { this.capProgress.p = 1 })
    this.captionTl = tl
  }

  private hideCaption(tl: gsap.core.Timeline, at: number, duration = 0.4) {
    if (!this.captionShown) return
    this.captionTl?.kill()
    const els = [this.dom.capTitle, this.dom.capSub]
    tl.add(gooTimeline(els, "out", { duration, stagger: 0.025 }), at)
    tl.call(() => {
      this.captionShown = false
      this.capProgress.p = 0
      this.dom.caption.style.visibility = "hidden"
    }, [], at + duration + 0.05)
  }

  /* ---------- caso (video completo) ---------- */

  private caseRect(aspect: number): Rect {
    const W = window.innerWidth
    const H = window.innerHeight
    const narrow = window.matchMedia("(orientation: portrait), (max-width: 767px)").matches
    const u = this.strip?.unit ?? (narrow ? Math.min(W / 39, H / 84.4) : W / 192)
    const box = narrow
      ? { x: 0, y: 12 * u, w: W, h: H - 21 * u }
      : { x: 2.4 * u, y: 10 * u, w: W - 4.8 * u, h: H - 12.4 * u }
    let w = box.w
    let h = w / aspect
    if (h > box.h) { h = box.h; w = h * aspect }
    return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
  }

  private placePlayer() {
    const aspect = this.reelOpen ? 16 / 9 : (() => {
      const p = this.projects[this.caseIndex]
      return p ? p.width / p.height : 16 / 9
    })()
    const r = this.caseRect(aspect)
    const s = this.dom.player.style
    s.left = `${r.x}px`; s.top = `${r.y}px`; s.width = `${r.w}px`; s.height = `${r.h}px`
    const u = this.strip?.unit ?? window.innerWidth / 192
    this.dom.caseUi.style.setProperty("--row-top", `${Math.max(6.4 * u, r.y - 3.6 * u)}px`)
    this.dom.caseUi.style.setProperty("--row-left", `${r.x}px`)
    this.dom.caseUi.style.setProperty("--row-right", `${window.innerWidth - r.x - r.w}px`)
    this.strip?.setMorphTarget(r)
    return r
  }

  private mountPlayer(src: string) {
    this.unmountPlayer()
    const f = document.createElement("iframe")
    f.src = src
    f.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media"
    f.allowFullscreen = true
    f.title = "Reproductor de video"
    f.style.opacity = "0"
    this.dom.player.append(f)
    this.dom.player.style.pointerEvents = "none"
    this.iframe = f
    this.playerShown = false
    this.playerPlaying = false
  }

  private unmountPlayer() {
    if (this.revealTimer) clearTimeout(this.revealTimer)
    this.revealTimer = null
    if (this.iframe) {
      this.post("pause")
      this.iframe.remove()
      this.iframe = null
    }
    this.dom.player.style.pointerEvents = "none"
    this.playerShown = false
    this.playerPlaying = false
  }

  private post(method: string, value?: unknown) {
    try { this.iframe?.contentWindow?.postMessage({ method, value }, VIMEO) } catch {}
  }

  private onMessage = (e: MessageEvent) => {
    if (e.origin !== VIMEO || !this.iframe || e.source !== this.iframe.contentWindow) return
    let data = e.data
    if (typeof data === "string") { try { data = JSON.parse(data) } catch { return } }
    const ev = data?.event
    if (ev === "ready") {
      for (const name of ["play", "playing", "timeupdate", "error"]) this.post("addEventListener", name)
    } else if (ev === "play" || ev === "playing" || (ev === "timeupdate" && (data?.data?.seconds ?? 0) > 0)) {
      if (!this.playerPlaying) {
        this.playerPlaying = true
        if (this.morphDone) this.revealPlayer()
      }
    } else if (ev === "error") {
      this.revealPlayer()
    }
  }

  private armReveal() {
    this.morphDone = true
    if (this.playerPlaying) return this.revealPlayer()
    if (this.revealTimer) clearTimeout(this.revealTimer)
    this.revealTimer = setTimeout(() => this.revealPlayer(), 2500)
  }

  private revealPlayer() {
    if (!this.iframe || this.playerShown) return
    if (this.revealTimer) clearTimeout(this.revealTimer)
    this.revealTimer = null
    this.playerShown = true
    this.dom.player.style.pointerEvents = "auto"
    gsap.to(this.iframe, {
      opacity: 1, duration: 0.35, ease: "none",
      onComplete: () => {
        if (this.mode === "case" || this.reelOpen) {
          this.strip?.drop()
          this.strip?.setAwake(false)
        }
      },
    })
    this.lockedUntil = Math.min(this.lockedUntil, performance.now())
  }

  private openCase(index: number, morph: boolean) {
    const p = this.projects[index]
    this.caseIndex = index
    this.morphDone = false
    this.strip?.prefetch(index)
    this.dom.counter.textContent = `${pad2(index + 1)} / ${pad2(this.projects.length)}`
    this.dom.backLabel.textContent = "Proyectos"
    this.dom.root.dataset.player = "case"
    this.placePlayer()
    this.unmountPlayer()
    const src = `${p.embedUrl}${p.embedUrl.includes("?") ? "&" : "?"}${PLAYER_PARAMS}`

    const s = this.strip
    const lifted = morph && !this.reduced && !!s && s.stripShown > 0.99 && s.lift(index)
    const tl = this.timeline(1.25)
    // El reproductor de Vimeo carga pesado en el hilo principal: si se crea al
    // mismo tiempo que la tarjeta se transforma, la animación se traba.
    if (lifted) tl.call(() => this.mountPlayer(src), [], 0.9)
    else this.mountPlayer(src)

    if (s) {
      s.inputEnabled = false
      s.peekEnabled = false
    }
    if (lifted && s) {
      this.hideCaption(tl, 0, 0.375)
      s.morph = 0
      tl.to(s, { stripShown: 0, duration: 0.54, ease: "power2.in" }, 0)
      tl.to(s, { morph: 1, duration: 1.083, ease: "none" }, 0)
      tl.to(this.v, { backdrop: 1, duration: 0.6, ease: "power1.inOut" }, 0.15)
      tl.fromTo(this.dom.caseUi, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8, ease: "power1.out" }, 0.55)
      tl.call(() => this.armReveal(), [], 1.083)
    } else {
      this.hideCaption(tl, 0, 0.3)
      tl.add(gooTimeline([this.dom.hint], "out", { duration: 0.33 }), 0)
      if (s) {
        s.drop()
        tl.to(s, { stripShown: 0, duration: 0.4, ease: "power2.in" }, 0)
      }
      tl.to(this.v, { recede: 1, duration: 1.0, ease: "power2.inOut" }, 0)
      tl.to(this.v, { veil: 1, duration: 0.8, ease: "power1.inOut" }, 0)
      tl.to(this.v, { backdrop: 1, duration: 0.6, ease: "power1.inOut" }, 0)
      tl.fromTo(this.dom.caseUi, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8, ease: "power1.out" }, 0.3)
      tl.call(() => {
        if (s) { s.arrive = 1; s.stripShown = 0; s.setAwake(false) }
        this.armReveal()
      }, [], 0.6)
    }
  }

  /* Cambiar de un caso a otro (flechas del navegador entre dos casos). */
  private swapCase(index: number) {
    const p = this.projects[index]
    this.caseIndex = index
    this.strip?.prefetch(index)
    swapText(this.dom.counter, `${pad2(index + 1)} / ${pad2(this.projects.length)}`)
    this.placePlayer()
    this.mountPlayer(`${p.embedUrl}${p.embedUrl.includes("?") ? "&" : "?"}${PLAYER_PARAMS}`)
    this.morphDone = false
    this.armReveal()
  }

  private closeCase(tl: gsap.core.Timeline, toStrip: boolean) {
    const index = this.caseIndex
    this.caseIndex = -1
    this.morphDone = false
    const iframe = this.iframe
    if (this.revealTimer) clearTimeout(this.revealTimer)
    this.post("setVolume", 0)
    this.post("pause")
    this.dom.player.style.pointerEvents = "none"
    if (iframe) {
      tl.to(iframe, { opacity: 0, duration: 0.25, ease: "none" }, 0)
      tl.call(() => { if (this.iframe === iframe) this.unmountPlayer() }, [], 0.26)
    }
    tl.to(this.dom.caseUi, { autoAlpha: 0, duration: 0.3, ease: "power1.in" }, 0)
    tl.to(this.v, { backdrop: 0, duration: 0.6, ease: "power1.inOut" }, 0.2)

    const s = this.strip
    if (!s) return
    if (toStrip && index >= 0) {
      s.setAwake(true)
      s.arrive = 1
      // Si se cierra a media apertura la tarjeta sigue levantada: se regresa
      // desde donde va. Si ya se veía el video, se levanta otra vez en grande.
      if (s.liftedIndex !== index) {
        s.drop()
        s.liftAt(index)
        s.morph = 1
      }
      this.setCaption(index, false)
      const back = Math.max(s.morph, 0.3) * (this.reduced ? 0.3 : 0.9)
      tl.to(s, { morph: 0, duration: back, ease: "none", onComplete: () => s.drop() }, 0.1)
      tl.to(s, { stripShown: 1, duration: 1.0, ease: "power3.out" }, 0.375)
      tl.call(() => this.showCaption(), [], 0.71)
      tl.call(() => this.enableStrip(), [], 1.1)
    } else {
      s.drop()
      s.stripShown = 0
      tl.call(() => {
        s.arrive = 0
        s.stripShown = 1
        if (this.mode !== "proyectos") s.setAwake(false)
      }, [], 0.8)
    }
  }

  /* ---------- reel con sonido (clic en el home) ---------- */

  openReel() {
    if (this.mode !== "hero" || this.reelOpen || this.locked()) return
    this.reelOpen = true
    this.syncFocusables()
    this.dom.root.dataset.player = "reel"
    this.dom.backLabel.textContent = "Regresar"
    this.placePlayer()
    this.mountPlayer(`${VIMEO}/video/${this.o.reel.id}?h=${this.o.reel.h}&${PLAYER_PARAMS}`)
    this.morphDone = false
    const tl = this.timeline(0.6)
    tl.add(gooTimeline([this.dom.hint], "out", { duration: 0.33 }), 0)
    tl.to(this.v, { backdrop: 1, duration: 0.6, ease: "power1.inOut" }, 0)
    tl.fromTo(this.dom.caseUi, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8, ease: "power1.out" }, 0.3)
    tl.call(() => this.armReveal(), [], 0.6)
  }

  closeReel(instant = false) {
    if (!this.reelOpen) return
    this.reelOpen = false
    this.syncFocusables()
    const iframe = this.iframe
    if (this.revealTimer) clearTimeout(this.revealTimer)
    this.revealTimer = null
    this.morphDone = false
    this.post("pause")
    this.dom.player.style.pointerEvents = "none"
    if (instant) {
      this.unmountPlayer()
      gsap.set(this.dom.caseUi, { autoAlpha: 0 })
      this.v.backdrop = 0
      return
    }
    const tl = this.timeline(0.8)
    if (iframe) {
      tl.to(iframe, { opacity: 0, duration: 0.25, ease: "none" }, 0)
      tl.call(() => { if (this.iframe === iframe) this.unmountPlayer() }, [], 0.26)
    }
    tl.to(this.dom.caseUi, { autoAlpha: 0, duration: 0.3, ease: "power1.in" }, 0)
    tl.to(this.v, { backdrop: 0, duration: 0.6, ease: "power1.inOut" }, 0.2)
    tl.add(gooTimeline([this.dom.hint], "in", { duration: 1.0 }), 0.5)
  }

  back() {
    if (this.reelOpen) return this.closeReel()
    if (this.mode === "case") this.push("/proyectos")
  }

  /* ---------- entrada ---------- */

  private onWheel = (e: WheelEvent) => {
    // Ctrl + rueda y el pellizco del trackpad son zoom del navegador
    if (this.mode === "nosotros" || e.ctrlKey) return
    if (this.mode === "proyectos" && !this.strip) {
      // Sin WebGL: la rueda vertical recorre la lista horizontal
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        this.dom.list.scrollLeft += e.deltaY
      }
      return
    }
    e.preventDefault()
    const now = performance.now()
    const gap = now - this.lastWheelAt
    const dy = e.deltaY
    if (this.wheelGuard) {
      const rising = Math.abs(dy) > 1.5 * Math.abs(this.lastWheelDy) + 2
      const flipped = Math.sign(dy) !== Math.sign(this.lastWheelDy) && dy !== 0
      if (gap > 220 || rising || flipped) this.wheelGuard = false
    }
    this.lastWheelAt = now
    this.lastWheelDy = dy
    if (this.wheelGuard || this.reelOpen) return

    if (this.mode === "hero") {
      if (gap > 220 && dy > 0 && !this.locked()) {
        this.wheelGuard = true
        this.push("/proyectos")
      }
      return
    }
    if (this.mode === "proyectos" && !this.locked()) this.strip?.wheel(e)
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
    const t = e.target as HTMLElement | null
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
    if (this.mode === "nosotros") return
    const k = e.key
    if (this.reelOpen) {
      if (k === "Escape") { e.preventDefault(); this.closeReel() }
      return
    }
    if (this.mode === "case") {
      if (k === "Escape") { e.preventDefault(); this.back() }
      return
    }
    if (this.locked()) return
    if (this.mode === "hero") {
      if (k === "ArrowDown" || k === "PageDown" || k === " ") { e.preventDefault(); this.push("/proyectos") }
      return
    }
    if (this.mode === "proyectos") {
      // Enter abre la tarjeta del centro salvo que el foco esté en otro
      // control (un link del menú, un botón de la lista accesible…)
      const onControl = !!t && t !== document.body && !!t.closest("a, button, [tabindex]")
      if (!this.strip) {
        if (k === "Escape" || k === "ArrowUp" || k === "PageUp" || k === "Home") { e.preventDefault(); this.push("/") }
        return
      }
      if (k === "ArrowRight") { e.preventDefault(); this.strip.step(1) }
      else if (k === "ArrowLeft") { e.preventDefault(); this.strip.step(-1) }
      else if (k === "Enter" && !onControl) {
        e.preventDefault()
        const i = this.strip.activeIndex
        if (i >= 0) this.requestCase(i)
      } else if (k === "Escape" || k === "ArrowUp" || k === "PageUp" || k === "Home") {
        e.preventDefault()
        this.push("/")
      }
    }
  }

  private onTouchStart = (e: TouchEvent) => {
    const p = e.touches[0]
    this.touch = p ? { x: p.clientX, y: p.clientY, t: performance.now() } : null
  }

  private onTouchEnd = (e: TouchEvent) => {
    const s = this.touch
    this.touch = null
    const p = e.changedTouches[0]
    if (!s || !p || this.locked() || this.reelOpen) return
    const dx = p.clientX - s.x
    const dy = p.clientY - s.y
    if (performance.now() - s.t > 450 || Math.abs(dy) < 60 || Math.abs(dy) < 1.5 * Math.abs(dx)) return
    if (this.mode === "hero" && dy < 0) this.push("/proyectos")
    else if (this.mode === "proyectos" && dy > 0) this.push("/")
  }

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return
    this.strip?.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1)
  }

  private onResize = () => {
    this.strip?.resize()
    this.measure()
  }

  private onVisibility = () => {
    // Al volver a la pestaña se vuelve a pintar: iOS a veces borra el canvas
    if (!document.hidden) this.strip?.invalidate()
  }

  private listen() {
    const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      window.addEventListener(type, fn, opts)
      this.cleanups.push(() => window.removeEventListener(type, fn, opts))
    }
    on("wheel", this.onWheel, { passive: false })
    on("keydown", this.onKey)
    on("touchstart", this.onTouchStart, { passive: true })
    on("touchend", this.onTouchEnd, { passive: true })
    on("pointermove", this.onPointerMove, { passive: true })
    on("resize", this.onResize)
    on("message", this.onMessage)
    document.addEventListener("visibilitychange", this.onVisibility)
    this.cleanups.push(() => document.removeEventListener("visibilitychange", this.onVisibility))
  }

  /* Clic (o Enter) en la lista: la visible sin WebGL o la oculta para
     teclado y lectores de pantalla. */
  openFromList(i: number) {
    if (this.mode !== "proyectos" || this.locked()) return
    if (this.strip && this.strip.activeIndex !== i) this.strip.goTo(i, true)
    this.push(`/proyectos/${this.projects[i].slug}`)
  }

  /* Con teclado, enfocar un proyecto de la lista lo trae al centro. */
  focusProject(i: number) {
    if (this.mode === "proyectos" && this.strip && !this.locked()) this.strip.goTo(i)
  }

  dispose() {
    this.disposed = true
    if (this.introRunning) {
      this.introRunning = false
      revealHeader()
    }
    this.introTl?.kill()
    document.documentElement.classList.remove("stage-on")
    this.tl?.kill()
    this.captionTl?.kill()
    gsap.killTweensOf(this.v)
    gsap.ticker.remove(this.tick)
    for (const fn of this.cleanups) fn()
    this.unmountPlayer()
    if (this.strip) gsap.killTweensOf(this.strip)
    this.strip?.dispose()
    this.strip = null
  }
}
