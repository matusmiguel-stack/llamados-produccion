import gsap from "gsap"
import { clamp01, gooOut, smoothstep } from "./ease"

/* Efecto "goo": el texto (o una imagen con alfa) se condensa desde manchas
   líquidas hasta letras nítidas. Es un desenfoque gaussiano seguido de un
   umbral de alfa (feColorMatrix). El progreso r va de 0 (invisible) a 1 (nítido).

   En pantallas táctiles el filtro SVG sobre HTML es caro en WebKit, así que
   ahí se usa un blur CSS + opacidad que se lee parecido. */

const SVGNS = "http://www.w3.org/2000/svg"

type Pair = {
  filter: SVGFilterElement
  blur: SVGFEGaussianBlurElement
  matrix: SVGFEColorMatrixElement
}

type GooState = {
  // Dos filtros por elemento: algunos WebKit no repintan cuando cambian los
  // atributos del filtro referenciado, así que se alterna entre A y B.
  pairs: [Pair, Pair]
  active: 0 | 1
  ids: [string, string]
  fs: number
  last: string
  r: number
}

const states = new WeakMap<Element, GooState>()
const progress = new WeakMap<Element, number>()
let svgRoot: SVGSVGElement | null = null

/* Progreso actual de un elemento (1 si ya entró, 0 si está oculto). */
export function gooProgress(el: HTMLElement) {
  return progress.get(el) ?? (el.classList.contains("is-in") ? 1 : 0)
}
let counter = 0
let fsCacheBound = false

function isCoarse() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function root() {
  if (svgRoot && svgRoot.isConnected) return svgRoot
  svgRoot = document.createElementNS(SVGNS, "svg")
  svgRoot.setAttribute("aria-hidden", "true")
  svgRoot.setAttribute("width", "0")
  svgRoot.setAttribute("height", "0")
  svgRoot.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none"
  document.body.prepend(svgRoot)
  if (!fsCacheBound) {
    fsCacheBound = true
    window.addEventListener("resize", () => { fsVersion++ })
  }
  return svgRoot
}

let fsVersion = 0
const fsSeen = new WeakMap<Element, number>()

function makePair(id: string): Pair {
  const filter = document.createElementNS(SVGNS, "filter")
  filter.setAttribute("id", id)
  filter.setAttribute("x", "-50%")
  filter.setAttribute("y", "-50%")
  filter.setAttribute("width", "200%")
  filter.setAttribute("height", "200%")
  filter.setAttribute("color-interpolation-filters", "sRGB")
  const blur = document.createElementNS(SVGNS, "feGaussianBlur")
  blur.setAttribute("in", "SourceGraphic")
  blur.setAttribute("result", "blur")
  const matrix = document.createElementNS(SVGNS, "feColorMatrix")
  matrix.setAttribute("in", "blur")
  matrix.setAttribute("type", "matrix")
  filter.append(blur, matrix)
  root().append(filter)
  return { filter, blur, matrix }
}

function state(el: HTMLElement): GooState {
  let s = states.get(el)
  if (!s) {
    const n = ++counter
    const ids: [string, string] = [`goo-${n}a`, `goo-${n}b`]
    s = { pairs: [makePair(ids[0]), makePair(ids[1])], active: 0, ids, fs: 0, last: "", r: 0 }
    states.set(el, s)
  }
  if (!s.fs || fsSeen.get(el) !== fsVersion) {
    s.fs = parseFloat(getComputedStyle(el).fontSize) || 16
    fsSeen.set(el, fsVersion)
  }
  return s
}

/* Mapea el progreso r a los parámetros del filtro. */
function params(r: number, fs: number) {
  const blur = 0.5 * fs * (1 - gooOut(Math.max(r, 0)))
  const n = clamp01((r - 0.65) / 0.35)
  return { blur, amp: 20 - 19 * n, off: -8 * (1 - n) }
}

export function setGoo(el: HTMLElement, r: number) {
  r = clamp01(r)
  progress.set(el, r)
  if (r > 0) el.classList.add("is-in")

  if (isCoarse()) {
    const fs = parseFloat(getComputedStyle(el).fontSize) || 16
    if (r >= 1 || r <= 0) {
      el.style.filter = ""
      el.style.willChange = ""
      el.style.opacity = r <= 0 ? "0" : ""
      return
    }
    el.style.willChange = "filter, opacity"
    el.style.filter = `blur(${(0.22 * fs * (1 - gooOut(r))).toFixed(2)}px)`
    el.style.opacity = smoothstep(0, 1, Math.min(r / 0.55, 1)).toFixed(3)
    return
  }

  if (r >= 1) {
    el.style.filter = ""
    el.style.opacity = ""
    el.style.willChange = ""
    return
  }

  const s = state(el)
  const { blur, amp, off } = params(r, s.fs)
  const key = `${blur.toFixed(3)}|${amp.toFixed(3)}|${off.toFixed(3)}`
  el.style.opacity = r <= 0 ? "0" : ""
  if (key === s.last) return
  s.last = key
  const next = (s.active ^ 1) as 0 | 1
  const p = s.pairs[next]
  p.blur.setAttribute("stdDeviation", blur.toFixed(3))
  p.matrix.setAttribute("values", `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${amp.toFixed(3)} ${off.toFixed(3)}`)
  s.active = next
  el.style.willChange = "filter"
  el.style.filter = `url(#${s.ids[next]})`
}

export function resetGoo(el: HTMLElement) {
  progress.set(el, 0)
  el.classList.remove("is-in")
  el.style.filter = ""
  el.style.opacity = ""
  el.style.willChange = ""
}

type GooOpts = { duration?: number; stagger?: number; delay?: number }

/* Timeline que lleva r hacia 1 (in) o hacia 0 (out) en cada elemento, desde
   donde esté (si ya está ahí no hace nada), lineal; toda la forma de la
   curva vive en params(). */
export function gooTimeline(
  els: (HTMLElement | null | undefined)[],
  dir: "in" | "out",
  { duration = 1.2, stagger = 0.1, delay = 0, restart = false }: GooOpts & { restart?: boolean } = {},
) {
  const list = els.filter(Boolean) as HTMLElement[]
  const tl = gsap.timeline({ delay })
  const reduced = prefersReducedMotion()
  list.forEach((el, i) => {
    const target = dir === "in" ? 1 : 0
    const from = restart ? 1 - target : gooProgress(el)
    if (from === target) return
    const proxy = { r: from }
    setGoo(el, from)
    tl.to(proxy, {
      r: target,
      duration: (reduced ? 0.3 : duration) * Math.abs(target - from),
      ease: "none",
      onUpdate: () => setGoo(el, proxy.r),
      onComplete: () => {
        if (dir === "out") {
          setGoo(el, 0)
          el.classList.remove("is-in")
        }
      },
    }, reduced ? 0 : i * stagger)
  })
  return tl
}
