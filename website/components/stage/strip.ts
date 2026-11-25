import * as THREE from "three"
import { clamp01, easeInOutCubic, lerp, smoothstep } from "@/lib/ease"

/* Carrusel de proyectos en WebGL: tarjetas planas en una fila infinita,
   física de resorte, un pase de lente horizontal (estira y separa el color
   en las orillas) y un visor fijo al centro. 1 unidad del mundo = 1 px CSS. */

export type StripWork = {
  id: string
  slug: string
  title: string
  subtitle: string
  poster: string
  posterLarge?: string
  aspect: number
  peek?: string
  peekPhone?: string
}

type Layout = {
  cardW: number; cardH: number; pitch: number; centerY: number
  frameW: number; frameH: number; cross: number; frameZ: number
}

const WIDE: Layout = { cardW: 51.3, cardH: 31.8, pitch: 54.9, centerY: 1.48, frameW: 53, frameH: 33.5, cross: 1.6, frameZ: 6 }
const NARROW: Layout = { cardW: 30, cardH: 18.6, pitch: 32.4, centerY: 1, frameW: 31, frameH: 19.6, cross: 1.2, frameZ: 4 }
const NARROW_QUERY = "(orientation: portrait), (max-width: 767px)"

const SLOTS = 9
const SPRING = { glide: 4.7, drag: 19.5, wheel: 6 }
const PULL = { max: 0.335, speed: 3.35, follow: 0.19, release: 0.04 }
const WHEEL = { settle: 150, threshold: 60 }
const LENS = { amount: 0.65, start: 0.7, aberration: 0.029, edgeBlur: 3.1, motionBlur: 1.8 }
const ORBIT = { yaw: 6.1, pitch: 3.9 }
const FLY = { behind: 1.76, x: -0.5, y: -0.5 }
const PEEK = { width: 0.74, height: 0.8, dim: 0.55 }

const presence = (d: number) => smoothstep(0.06, 0.55, d)
const defocus = (d: number, ref = 1) => clamp01(Math.abs(d - ref) / ref)
const mod = (a: number, n: number) => ((a % n) + n) % n
const rad = (deg: number) => (deg * Math.PI) / 180

const CARD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const CARD_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uImgAspect;
uniform float uQuadAspect;
uniform float uAlpha;
uniform float uBias;
uniform sampler2D uPeekMap;
uniform float uPeek;
uniform float uPeekAspect;
uniform float uGrow;
varying vec2 vUv;

vec2 cover(vec2 uv, float img, float quad) {
  vec2 s = img > quad ? vec2(quad / img, 1.0) : vec2(1.0, img / quad);
  return (uv - 0.5) * s + 0.5;
}

void main() {
  vec3 c = uHasMap > 0.5
    ? texture2D(uMap, cover(vUv, uImgAspect, uQuadAspect), uBias).rgb
    : vec3(0.08);

  if (uPeek > 0.001) {
    float w = ${PEEK.width.toFixed(3)};
    float h = w * uQuadAspect / uPeekAspect;
    if (h > ${PEEK.height.toFixed(3)}) { w *= ${PEEK.height.toFixed(3)} / h; h = ${PEEK.height.toFixed(3)}; }
    float y0 = mix(-h - 0.06, (1.0 - h) * 0.5, uPeek);
    w = mix(w, 1.0, uGrow);
    h = mix(h, 1.0, uGrow);
    y0 = mix(y0, 0.0, uGrow);
    vec2 origin = vec2((1.0 - w) * 0.5, y0);
    vec2 local = (vUv - origin) / vec2(w, h);
    vec2 edge = min(local, 1.0 - local) * vec2(w * uQuadAspect, h);
    float inside = smoothstep(-0.0025, 0.0025, min(edge.x, edge.y));
    vec3 v = texture2D(uPeekMap, cover(clamp(local, 0.0, 1.0), uPeekAspect, (w * uQuadAspect) / h)).rgb;
    c *= 1.0 - ${PEEK.dim.toFixed(3)} * uPeek * (1.0 - uGrow);
    c = mix(c, v, inside);
  }

  gl_FragColor = vec4(c * uAlpha, uAlpha);
}`

const SOLID_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
void main() { gl_FragColor = vec4(uColor * uAlpha, uAlpha); }`

const SOLID_VERT = /* glsl */ `
void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

const LENS_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

const LENS_FRAG = /* glsl */ `
uniform sampler2D uScene;
uniform vec2 uPivot;
uniform float uStretch;
uniform float uStart;
uniform float uFringe;
uniform float uSoft;
varying vec2 vUv;

vec4 fetchClipped(vec2 p, float bias) {
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return vec4(0.0);
  return texture2D(uScene, p, bias);
}

void main() {
  float edge = clamp((abs(vUv.x - 0.5) * 2.0 - uStart) / (1.0 - uStart), 0.0, 1.0);
  edge = edge * edge * edge;
  float sy = 1.0 + uStretch * edge;
  float f = uFringe * edge;
  float bias = edge * uSoft;
  vec2 rel = vUv - uPivot;
  vec4 g = fetchClipped(uPivot + rel * vec2(1.0, 1.0 / sy), bias);
  vec4 r = fetchClipped(uPivot + rel * vec2(1.0 - 0.5 * f, 1.0 / (sy * (1.0 + f))), bias);
  vec4 b = fetchClipped(uPivot + rel * vec2(1.0 + 0.5 * f, 1.0 / (sy * (1.0 - f))), bias);
  gl_FragColor = vec4(r.r, g.g, b.b, max(g.a, max(r.a, b.a)));
}`

type CardUniforms = {
  uMap: { value: THREE.Texture | null }
  uHasMap: { value: number }
  uImgAspect: { value: number }
  uQuadAspect: { value: number }
  uAlpha: { value: number }
  uBias: { value: number }
  uPeekMap: { value: THREE.Texture | null }
  uPeek: { value: number }
  uPeekAspect: { value: number }
  uGrow: { value: number }
}

type Slot = { mesh: THREE.Mesh; u: CardUniforms; work: number; rel: number; visible: boolean }

type Peek = {
  video: HTMLVideoElement
  tex: THREE.VideoTexture | null
  aspect: number
  amount: number
  shown: number
  playing: boolean
  blocked: boolean
  lastUsed: number
}

type Hover = "open" | "step" | "drag" | null

export type StripCallbacks = {
  onChange?: (index: number) => void
  onOpen?: (index: number) => void
  onHover?: (kind: Hover) => void
}

export type Rect = { x: number; y: number; w: number; h: number }

function makeCardUniforms(): CardUniforms {
  return {
    uMap: { value: null }, uHasMap: { value: 0 }, uImgAspect: { value: 16 / 9 }, uQuadAspect: { value: 16 / 9 },
    uAlpha: { value: 1 }, uBias: { value: 0 },
    uPeekMap: { value: null }, uPeek: { value: 0 }, uPeekAspect: { value: 16 / 9 }, uGrow: { value: 0 },
  }
}

function cardMaterial(u: CardUniforms) {
  return new THREE.ShaderMaterial({
    uniforms: u, vertexShader: CARD_VERT, fragmentShader: CARD_FRAG,
    transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false,
  })
}

export class Strip {
  readonly canvas: HTMLCanvasElement
  private works: StripWork[]
  private cb: StripCallbacks
  private renderer: THREE.WebGLRenderer
  private rt: THREE.WebGLRenderTarget
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(53.13, 1, 1, 1000)
  private post = new THREE.Scene()
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private lensU = {
    uScene: { value: null as THREE.Texture | null },
    uPivot: { value: new THREE.Vector2(0.5, 0.5) },
    uStretch: { value: 0 }, uStart: { value: LENS.start }, uFringe: { value: 0 }, uSoft: { value: 0 },
  }
  private geo = new THREE.PlaneGeometry(1, 1)
  private slots: Slot[] = []
  private frame = new THREE.Group()
  private frameBox: { mesh: THREE.Mesh; u: { uColor: { value: THREE.Color }; uAlpha: { value: number } } }[] = []
  private frameCross: { group: THREE.Group; sx: number; sy: number; u: { uColor: { value: THREE.Color }; uAlpha: { value: number } }[] }[] = []
  private morphMesh: THREE.Mesh
  private morphU = makeCardUniforms()

  private textures: (THREE.Texture | null)[] = []
  private largeTex = new Map<number, THREE.Texture>()
  private peeks = new Map<number, Peek>()
  private peekBox: HTMLDivElement
  private loader = new THREE.TextureLoader()

  private W = 1
  private H = 1
  private dpr = 1
  private u = 10
  private L: Layout = WIDE
  private narrow = false
  private coarse = false
  private reduced = false

  // física
  private offset = 0
  private goal = 0
  private anchor = 0
  private velocity = 0
  private pull = 0
  private wheeling = false
  private wheelFrom = 0
  private wheelSum = 0
  private wheelAt = 0
  private dragState: { id: number; x0: number; goal0: number; moved: boolean; lastX: number; lastT: number; v: number; mouse: boolean } | null = null
  private active = -1

  // estado controlado desde fuera (Stage)
  arrive = 0
  stripShown = 1
  inputEnabled = false
  peekEnabled = false
  private orbitTarget = { x: 0, y: 0 }
  private orbit = { x: 0, y: 0 }

  // morph
  private lifted: { index: number; from: { x: number; y: number; z: number; w: number; h: number } } | null = null
  private morphTarget: Rect = { x: 0, y: 0, w: 1, h: 1 }
  morph = 0

  private awake = false
  private lastSig: number[] = []
  private disposed = false

  constructor(canvas: HTMLCanvasElement, works: StripWork[], cb: StripCallbacks = {}) {
    this.canvas = canvas
    this.works = works
    this.cb = cb
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: true, depth: false, premultipliedAlpha: true, powerPreference: "high-performance",
    })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.autoClear = false
    this.rt = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: false, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    })
    this.lensU.uScene.value = this.rt.texture
    this.camera.rotation.order = "YXZ"

    const lensMat = new THREE.ShaderMaterial({
      uniforms: this.lensU, vertexShader: LENS_VERT, fragmentShader: LENS_FRAG,
      blending: THREE.NoBlending, depthTest: false, depthWrite: false,
    })
    this.post.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), lensMat))

    for (let i = 0; i < SLOTS; i++) {
      const u = makeCardUniforms()
      const mesh = new THREE.Mesh(this.geo, cardMaterial(u))
      mesh.renderOrder = 1
      this.scene.add(mesh)
      this.slots.push({ mesh, u, work: -1, rel: 0, visible: false })
    }

    this.morphMesh = new THREE.Mesh(this.geo, cardMaterial(this.morphU))
    this.morphMesh.renderOrder = 3
    this.morphMesh.visible = false
    this.scene.add(this.morphMesh)

    this.buildFrame()
    this.scene.add(this.frame)

    this.peekBox = document.createElement("div")
    this.peekBox.setAttribute("aria-hidden", "true")
    this.peekBox.style.cssText = "position:fixed;left:0;top:0;width:4px;height:4px;overflow:hidden;opacity:.01;pointer-events:none;z-index:-1"
    document.body.append(this.peekBox)

    this.textures = works.map(() => null)
    works.forEach((w, i) => this.loadPoster(i, w.poster))

    this.coarse = window.matchMedia("(pointer: coarse)").matches
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    this.bindPointer()
    // iOS suele tirar el contexto WebGL al salir de la app; al volver hay que repintar
    canvas.addEventListener("webglcontextrestored", this.onRestored)
    this.resize()
  }

  private onRestored = () => {
    if (this.awake) this.resize()
    this.lastSig = []
  }

  /* ---------- carga ---------- */

  private prepTexture(tex: THREE.Texture) {
    tex.colorSpace = THREE.NoColorSpace
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
    tex.generateMipmaps = true
    tex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy())
    tex.needsUpdate = true
  }

  private loadPoster(i: number, url: string) {
    if (!url) return
    this.loader.load(url, (tex) => {
      if (this.disposed) { tex.dispose(); return }
      this.prepTexture(tex)
      this.textures[i] = tex
      this.lastSig = []
    })
  }

  private loadLarge(i: number) {
    const url = this.works[i]?.posterLarge
    if (!url || this.largeTex.has(i)) return
    this.loader.load(url, (tex) => {
      if (this.disposed) { tex.dispose(); return }
      this.prepTexture(tex)
      this.largeTex.set(i, tex)
      this.lastSig = []
    })
  }

  private posterFor(i: number, large = false) {
    return (large && this.largeTex.get(i)) || this.textures[i]
  }

  private imgAspect(tex: THREE.Texture | null | undefined) {
    const img = tex?.image as { width?: number; height?: number } | undefined
    return img?.width && img?.height ? img.width / img.height : 16 / 9
  }

  /* ---------- visor ---------- */

  private solid(alpha: number) {
    const u = { uColor: { value: new THREE.Color(1, 1, 1) }, uAlpha: { value: alpha } }
    const mesh = new THREE.Mesh(this.geo, new THREE.ShaderMaterial({
      uniforms: u, vertexShader: SOLID_VERT, fragmentShader: SOLID_FRAG,
      transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false,
    }))
    mesh.renderOrder = 2
    return { mesh, u }
  }

  private buildFrame() {
    for (let i = 0; i < 4; i++) {
      const s = this.solid(0.2)
      this.frame.add(s.mesh)
      this.frameBox.push(s)
    }
    for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const group = new THREE.Group()
      const h = this.solid(1)
      const v = this.solid(1)
      group.add(h.mesh, v.mesh)
      this.frame.add(group)
      this.frameCross.push({ group, sx, sy, u: [h.u, v.u] })
    }
  }

  private layoutFrame() {
    const { u, L } = this
    const fw = L.frameW * u
    const fh = L.frameH * u
    const [top, bottom, left, right] = this.frameBox
    top.mesh.scale.set(fw, 1, 1); top.mesh.position.set(0, fh / 2 - 0.5, 0)
    bottom.mesh.scale.set(fw, 1, 1); bottom.mesh.position.set(0, -fh / 2 + 0.5, 0)
    left.mesh.scale.set(1, fh, 1); left.mesh.position.set(-fw / 2 + 0.5, 0, 0)
    right.mesh.scale.set(1, fh, 1); right.mesh.position.set(fw / 2 - 0.5, 0, 0)
    const arm = L.cross * u
    for (const c of this.frameCross) {
      const [h, v] = c.group.children as THREE.Mesh[]
      h.scale.set(arm, 1, 1)
      v.scale.set(1, arm, 1)
    }
  }

  /* ---------- tamaño ---------- */

  resize() {
    const W = window.innerWidth
    const H = window.innerHeight
    this.W = W
    this.H = H
    this.narrow = window.matchMedia(NARROW_QUERY).matches
    this.L = this.narrow ? NARROW : WIDE
    this.u = this.narrow ? Math.min(W / 39, H / 84.4) : W / 192
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)

    this.camera.fov = (2 * Math.atan(H / 2 / H) * 180) / Math.PI
    this.camera.aspect = W / H
    this.camera.near = 1
    this.camera.far = 4 * H
    this.camera.updateProjectionMatrix()

    if (this.awake) {
      this.renderer.setPixelRatio(this.dpr)
      this.renderer.setSize(W, H, false)
      // Mismo tamaño exacto que el canvas, para que la lente no remuestree
      const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2())
      this.rt.setSize(buf.x, buf.y)
    }
    for (const s of this.slots) s.mesh.scale.set(this.L.cardW * this.u, this.L.cardH * this.u, 1)
    this.layoutFrame()
    this.lensU.uPivot.value.set(0.5, 0.5 + (this.L.centerY * this.u) / H)
    this.lastSig = []
  }

  /* Libera la memoria del render target cuando el carrusel no se ve. */
  setAwake(awake: boolean) {
    if (awake === this.awake) return
    this.awake = awake
    if (awake) {
      this.resize()
    } else {
      this.renderer.setSize(1, 1, false)
      this.rt.setSize(1, 1)
      for (const p of this.peeks.values()) { p.video.pause(); p.playing = false }
    }
    this.lastSig = []
  }

  /* Obliga a repintar en el siguiente frame (p. ej. al volver a la pestaña). */
  invalidate() {
    this.lastSig = []
  }

  get isNarrow() { return this.narrow }
  get unit() { return this.u }

  /* ---------- entrada ---------- */

  setPointer(x: number, y: number) {
    this.orbitTarget.x = x
    this.orbitTarget.y = y
  }

  private pitchPx() { return this.L.pitch * this.u }

  step(n: number) {
    this.wheeling = false
    this.goal = Math.round(this.goal) + n
    this.anchor = this.goal
  }

  goTo(index: number, instant = false) {
    const N = this.works.length
    if (!N) return
    let n = index - mod(Math.round(this.goal), N)
    if (n > N / 2) n -= N
    if (n < -N / 2) n += N
    if (instant) {
      this.goal = this.anchor = this.offset = Math.round(this.goal) + n
      this.velocity = 0
      this.wheeling = false
      this.emitChange()
      this.lastSig = []
    } else {
      this.step(n)
    }
  }

  wheel(e: WheelEvent) {
    if (!this.inputEnabled) return
    const scale = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? this.H : 1
    const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * scale
    if (!this.wheeling) {
      this.wheeling = true
      this.wheelFrom = Math.round(this.goal)
      this.wheelSum = 0
    }
    this.wheelSum += delta
    this.wheelAt = performance.now()
    this.goal += delta / this.pitchPx()
  }

  private settleWheel() {
    const dir = Math.sign(this.wheelSum)
    let t = Math.round(this.goal)
    if ((t - this.offset) * dir < 0 && Math.abs(this.velocity) > 1) t += dir
    if (t === this.wheelFrom && Math.abs(this.wheelSum) >= WHEEL.threshold) t += dir
    this.goal = this.anchor = t
    this.wheeling = false
  }

  /* Rectángulos en pantalla (sin la lente) de las tarjetas visibles. */
  private slotRects() {
    const out: { slot: Slot; r: Rect }[] = []
    const v = new THREE.Vector3()
    for (const s of this.slots) {
      if (!s.visible || !s.mesh.visible) continue
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const [cx, cy] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
        v.set(cx, cy, 0).applyMatrix4(s.mesh.matrixWorld).project(this.camera)
        const sx = (v.x * 0.5 + 0.5) * this.W
        const sy = (-v.y * 0.5 + 0.5) * this.H
        minX = Math.min(minX, sx); maxX = Math.max(maxX, sx)
        minY = Math.min(minY, sy); maxY = Math.max(maxY, sy)
      }
      out.push({ slot: s, r: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } })
    }
    return out
  }

  private hitTest(x: number, y: number) {
    const rects = this.slotRects()
    let band: { top: number; bottom: number } | null = null
    for (const { slot, r } of rects) {
      if (Math.abs(slot.rel) < 0.5) band = { top: r.y, bottom: r.y + r.h }
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return { slot, band }
    }
    if (!band && rects[0]) band = { top: rects[0].r.y, bottom: rects[0].r.y + rects[0].r.h }
    return { slot: null as Slot | null, band }
  }

  private hoverKind: Hover = null
  private setHover(kind: Hover) {
    if (kind === this.hoverKind) return
    this.hoverKind = kind
    this.cb.onHover?.(kind)
  }

  private bindPointer() {
    const c = this.canvas
    c.style.touchAction = "pan-y"
    c.style.touchAction = "pan-y pinch-zoom"

    c.addEventListener("pointerdown", (e) => {
      if (!this.inputEnabled || this.stripShown < 0.99) return
      const mouse = e.pointerType === "mouse"
      if (mouse && e.button !== 0) return
      const { band } = this.hitTest(e.clientX, e.clientY)
      if (mouse && (!band || e.clientY < band.top || e.clientY > band.bottom)) return
      this.dragState = { id: e.pointerId, x0: e.clientX, goal0: this.goal, moved: false, lastX: e.clientX, lastT: performance.now(), v: 0, mouse }
      this.wheeling = false
      try { c.setPointerCapture(e.pointerId) } catch {}
    })

    c.addEventListener("pointermove", (e) => {
      const d = this.dragState
      if (d && d.id === e.pointerId) {
        const dx = e.clientX - d.x0
        if (!d.moved && Math.abs(dx) > 5) {
          d.moved = true
          this.setHover("drag")
        }
        if (d.moved) {
          const now = performance.now()
          const dt = Math.max((now - d.lastT) / 1000, 1e-3)
          d.v = (e.clientX - d.lastX) / this.pitchPx() / dt
          d.lastX = e.clientX
          d.lastT = now
          this.goal = d.goal0 - dx / this.pitchPx()
        }
        return
      }
      if (e.pointerType !== "mouse" || !this.inputEnabled || this.stripShown < 0.99) {
        this.setHover(null)
        return
      }
      const { slot, band } = this.hitTest(e.clientX, e.clientY)
      if (slot) this.setHover(Math.abs(slot.rel) < 0.5 ? "open" : "step")
      else if (band && e.clientY >= band.top && e.clientY <= band.bottom) this.setHover("drag")
      else this.setHover(null)
    })

    const end = (e: PointerEvent) => {
      const d = this.dragState
      if (!d || d.id !== e.pointerId) return
      this.dragState = null
      try { c.releasePointerCapture(e.pointerId) } catch {}
      if (d.moved) {
        const v = performance.now() - d.lastT > 80 ? 0 : d.v
        this.goal -= Math.max(-1, Math.min(1, v * 0.2))
        this.anchor = d.goal0
        const delta = this.goal - this.anchor
        this.goal = delta > 0.15 ? Math.ceil(this.goal) : delta < -0.15 ? Math.floor(this.goal) : Math.round(this.goal)
        this.anchor = this.goal
        this.setHover(null)
        return
      }
      if (e.type === "pointercancel") return
      const { slot } = this.hitTest(e.clientX, e.clientY)
      if (!slot) return
      if (Math.abs(slot.rel) < 0.5) this.cb.onOpen?.(slot.work)
      else this.step(Math.round(slot.rel))
    }
    c.addEventListener("pointerup", end)
    c.addEventListener("pointercancel", end)
    c.addEventListener("pointerleave", () => { if (!this.dragState) this.setHover(null) })
  }

  /* ---------- morph tarjeta → video ---------- */

  /* Toma la tarjeta del centro (o la de `index`) para transformarla. */
  lift(index?: number) {
    const s = this.slots.find((sl) => sl.visible && Math.abs(sl.rel) < 0.5 && (index === undefined || sl.work === index))
    if (!s || this.arrive < 0.99) return false
    // La profundidad de origen es la de la fila en reposo, sin el empujón de
    // cuando el carrusel está escondido: al cerrar, la tarjeta debe acabar
    // del mismo tamaño que la que reaparece en su lugar.
    this.lifted = {
      index: s.work,
      from: {
        x: s.mesh.position.x, y: s.mesh.position.y, z: -(this.pull / (1 - this.pull)) * this.H,
        w: this.L.cardW * this.u, h: this.L.cardH * this.u,
      },
    }
    this.loadLarge(s.work)
    this.morphMesh.visible = true
    this.lastSig = []
    return true
  }

  /* Cierre sin tarjeta levantada (por ejemplo al entrar directo a un caso):
     centra el carrusel en ese proyecto y la levanta desde ahí. */
  liftAt(index: number) {
    this.goTo(index, true)
    this.updateSlots()
    this.slots.forEach((s) => s.mesh.updateMatrixWorld())
    return this.lift(index)
  }

  setMorphTarget(r: Rect) {
    this.morphTarget = r
    this.lastSig = []
  }

  drop() {
    this.lifted = null
    this.morphMesh.visible = false
    this.morph = 0
    this.lastSig = []
  }

  get liftedIndex() { return this.lifted?.index ?? -1 }

  /* ---------- caption proyectado ---------- */

  captionTransform(offsetY: number) {
    const v = new THREE.Vector3(0, -offsetY, 0)
    v.applyMatrix4(this.camera.matrixWorldInverse)
    const depth = -v.z / this.H
    const p = new THREE.Vector3(0, -offsetY, 0).project(this.camera)
    const sx = (p.x * 0.5 + 0.5) * this.W
    const sy = (-p.y * 0.5 + 0.5) * this.H
    return {
      x: sx - this.W / 2,
      y: sy - this.H / 2 - offsetY,
      scale: depth > 0.01 ? 1 / depth : 100,
      opacity: depth > 0 ? presence(depth) : 0,
      blur: Math.max(Math.abs(depth - 1) - 0.04, 0) * 40,
    }
  }

  /* ---------- peek ---------- */

  private peekFor(i: number): Peek | null {
    const w = this.works[i]
    const src = (this.narrow && w?.peekPhone) || w?.peek
    if (!src) return null
    let p = this.peeks.get(i)
    if (p) { p.lastUsed = performance.now(); return p }
    const video = document.createElement("video")
    video.muted = true
    video.defaultMuted = true
    video.loop = true
    video.playsInline = true
    video.preload = "auto"
    video.crossOrigin = "anonymous"
    video.setAttribute("muted", "")
    video.setAttribute("playsinline", "")
    video.src = src
    video.style.cssText = "width:4px;height:4px"
    this.peekBox.append(video)
    const peek: Peek = { video, tex: null, aspect: 16 / 9, amount: 0, shown: 0, playing: false, blocked: false, lastUsed: performance.now() }
    video.addEventListener("loadeddata", () => {
      if (this.disposed) return
      const tex = new THREE.VideoTexture(video)
      tex.colorSpace = THREE.NoColorSpace
      tex.minFilter = THREE.LinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.generateMipmaps = false
      peek.tex = tex
      peek.aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9
    }, { once: true })
    this.peeks.set(i, peek)
    this.trimPeeks()
    return peek
  }

  private trimPeeks() {
    if (this.peeks.size <= 4) return
    const list = [...this.peeks.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)
    for (const [i, p] of list) {
      if (this.peeks.size <= 4) break
      if (p.amount > 0.01) continue
      p.video.pause()
      p.video.removeAttribute("src")
      p.video.load()
      p.video.remove()
      p.tex?.dispose()
      this.peeks.delete(i)
    }
  }

  private updatePeeks(dt: number) {
    const N = this.works.length
    const settled = !this.dragState && !this.wheeling && Math.abs(this.velocity) < 0.2
      && Math.abs(this.offset - Math.round(this.offset)) < 0.04
    const target = this.peekEnabled && settled && this.stripShown >= 1 && N ? mod(Math.round(this.offset), N) : -1
    if (target >= 0) this.peekFor(target)
    const k = 1 - Math.exp(-5 * dt)
    for (const [i, p] of this.peeks) {
      const keep = this.lifted?.index === i
      const want = (i === target || keep) && p.tex ? 1 : 0
      p.amount += (want - p.amount) * k
      if (Math.abs(want - p.amount) < 0.001) p.amount = want
      p.shown = p.amount * p.amount * (3 - 2 * p.amount)
      if (p.amount > 0.01 && !p.playing && !p.blocked && this.awake) {
        p.playing = true
        p.video.play().catch(() => {
          // Autoplay bloqueado (p. ej. modo de bajo consumo): se reintenta
          // una sola vez, con el siguiente toque o clic.
          p.playing = false
          p.blocked = true
          window.addEventListener("pointerdown", () => { p.blocked = false }, { once: true, capture: true })
        })
      } else if ((p.amount <= 0.01 || !this.awake) && p.playing) {
        p.playing = false
        p.video.pause()
      }
    }
  }

  /* ---------- bucle ---------- */

  private emitChange() {
    const N = this.works.length
    if (!N) return
    const a = mod(Math.round(this.offset), N)
    if (a !== this.active) {
      this.active = a
      this.cb.onChange?.(a)
    }
  }

  get activeIndex() { return this.active }

  private physics(dt: number, now: number) {
    if (this.wheeling && now - this.wheelAt > WHEEL.settle) this.settleWheel()
    const glide = this.reduced ? 12 : SPRING.glide
    const k = this.dragState?.moved ? SPRING.drag : this.wheeling ? SPRING.wheel : glide
    const e = this.offset - this.goal
    const j = (this.velocity + k * e) * dt
    const decay = Math.exp(-k * dt)
    this.offset = this.goal + (e + j) * decay
    this.velocity = (this.velocity - j * k) * decay
    if (Math.abs(this.offset - this.goal) < 1e-4 && Math.abs(this.velocity) < 0.001) {
      this.offset = this.goal
      this.velocity = 0
    }

    const target = PULL.max * (1 - Math.exp(-Math.abs(this.velocity) / PULL.speed))
    const rate = target > this.pull ? PULL.follow : PULL.release
    this.pull += (target - this.pull) * (1 - Math.pow(1 - rate, dt * 60))
    if (Math.abs(target - this.pull) < 1e-4) this.pull = target

    const ok = this.coarse || this.reduced ? 0 : 1
    const s = 1 - Math.pow(0.94, dt * 60)
    this.orbit.x += (this.orbitTarget.x * ok - this.orbit.x) * s
    this.orbit.y += (this.orbitTarget.y * ok - this.orbit.y) * s
    if (Math.abs(this.orbitTarget.x * ok - this.orbit.x) < 5e-4) this.orbit.x = this.orbitTarget.x * ok
    if (Math.abs(this.orbitTarget.y * ok - this.orbit.y) < 5e-4) this.orbit.y = this.orbitTarget.y * ok

    this.emitChange()
  }

  private morphEased() { return easeInOutCubic(clamp01(this.morph)) }

  private updateCamera() {
    const { W, H } = this
    const a = clamp01(this.arrive)
    const n = this.lifted ? this.morphEased() : 0
    const weight = 1 - n
    const dist = H * (1 - (1 - a) * (1 + FLY.behind))
    const yaw = rad(this.orbit.x * ORBIT.yaw) * weight
    const pitch = rad(this.orbit.y * ORBIT.pitch) * weight
    const off = (1 - a) * (1 - a)
    this.camera.rotation.set(pitch, yaw, 0, "YXZ")
    const pos = new THREE.Vector3(0, 0, dist).applyEuler(this.camera.rotation)
    pos.x += FLY.x * W * off
    pos.y -= FLY.y * H * off
    this.camera.position.copy(pos)
    this.camera.updateMatrixWorld()
  }

  private depthOf(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).applyMatrix4(this.camera.matrixWorldInverse)
    return -v.z / this.H
  }

  private updateSlots() {
    const { u, L, H } = this
    const N = this.works.length
    const pullPush = (this.pull / (1 - this.pull)) * H
    const hide = 1 - this.stripShown
    const hidePush = hide * hide * 0.6 * H
    const y = L.centerY * u
    const z = -pullPush - hidePush
    const base = Math.floor(this.offset)
    for (let t = 0; t < SLOTS; t++) {
      const s = this.slots[t]
      const n = base + t - 4
      const rel = n - this.offset
      s.rel = rel
      if (!N) { s.visible = false; s.mesh.visible = false; continue }
      s.work = mod(n, N)
      const x = rel * L.pitch * u
      s.mesh.position.set(x, y, z)
      const depth = this.depthOf(x, y, z)
      s.visible = depth > 0.005
      const isLifted = this.lifted && this.lifted.index === s.work && Math.abs(rel) < 0.5
      s.mesh.visible = s.visible && !isLifted
      const tex = this.posterFor(s.work)
      s.u.uMap.value = tex
      s.u.uHasMap.value = tex ? 1 : 0
      s.u.uImgAspect.value = this.imgAspect(tex)
      s.u.uQuadAspect.value = L.cardW / L.cardH
      s.u.uAlpha.value = presence(depth) * this.stripShown
      s.u.uBias.value = defocus(depth, 1 + pullPush / H) * 6 + hide * 5
      const peek = Math.abs(rel) < 0.5 ? this.peeks.get(s.work) : undefined
      s.u.uPeek.value = peek?.tex ? peek.shown : 0
      s.u.uPeekMap.value = peek?.tex ?? null
      s.u.uPeekAspect.value = peek?.aspect ?? 16 / 9
      s.u.uGrow.value = 0
    }
  }

  private updateFrame() {
    const { u, L, H } = this
    const hide = 1 - this.stripShown
    const hidePush = hide * hide * 0.6 * H
    const fz = L.frameZ * u - hidePush
    this.frame.position.set(0, L.centerY * u, fz)
    this.frame.scale.setScalar((H - L.frameZ * u) / H)
    const depth = this.depthOf(0, L.centerY * u, fz)
    const alpha = (depth > 0 ? presence(depth) : 0) * this.stripShown
    this.frame.visible = alpha > 0.001
    for (const b of this.frameBox) b.u.uAlpha.value = 0.2 * alpha
    const speed01 = Math.min(Math.abs(this.velocity) * 0.6, 1)
    const spread = speed01 * 3 * u
    const fw = L.frameW * u
    const fh = L.frameH * u
    for (const c of this.frameCross) {
      c.group.position.set(c.sx * (fw / 2 + spread), c.sy * (fh / 2 + spread), 0)
      for (const cu of c.u) cu.uAlpha.value = alpha
    }
  }

  private updateMorph() {
    if (!this.lifted) return
    const n = this.morphEased()
    const { from } = this.lifted
    const t = this.morphTarget
    const tx = t.x + t.w / 2 - this.W / 2
    const ty = this.H / 2 - (t.y + t.h / 2)
    const w = lerp(from.w, t.w, n)
    const h = lerp(from.h, t.h, n)
    this.morphMesh.position.set(lerp(from.x, tx, n), lerp(from.y, ty, n), lerp(from.z, 0, n) + Math.sin(Math.PI * n) * 0.06 * this.H)
    this.morphMesh.scale.set(w, h, 1)
    const i = this.lifted.index
    const tex = this.posterFor(i, true)
    const mu = this.morphU
    mu.uMap.value = tex
    mu.uHasMap.value = tex ? 1 : 0
    mu.uImgAspect.value = this.imgAspect(tex)
    mu.uQuadAspect.value = w / h
    mu.uAlpha.value = 1
    mu.uBias.value = 0
    const peek = this.peeks.get(i)
    mu.uPeek.value = peek?.tex ? peek.shown : 0
    mu.uPeekMap.value = peek?.tex ?? null
    mu.uPeekAspect.value = peek?.aspect ?? 16 / 9
    mu.uGrow.value = smoothstep(0, 0.6, n)
  }

  private updateLens() {
    const n = this.lifted ? this.morphEased() : 0
    const Lw = 1 - n
    const speed01 = Math.min(Math.abs(this.velocity) * 0.6, 1)
    const reduced = this.reduced ? 0 : 1
    this.lensU.uStretch.value = LENS.amount * Lw
    this.lensU.uFringe.value = LENS.aberration * Lw * reduced
    this.lensU.uSoft.value = (LENS.edgeBlur + LENS.motionBlur * speed01 * reduced) * Lw
  }

  private signature() {
    const sig: number[] = [
      this.camera.position.x, this.camera.position.y, this.camera.position.z,
      this.camera.rotation.x, this.camera.rotation.y,
      this.offset, this.pull, this.stripShown, this.arrive, this.morph, this.velocity,
      this.morphMesh.visible ? 1 : 0, this.morphTarget.x, this.morphTarget.y, this.morphTarget.w, this.morphTarget.h,
    ]
    for (const [i, p] of this.peeks) {
      if (p.amount > 0) sig.push(i, p.shown, p.video.currentTime)
    }
    return sig
  }

  update(dt: number) {
    if (this.disposed) return
    const now = performance.now()
    this.physics(dt, now)
    this.updatePeeks(dt)
    if (!this.awake) return
    this.updateCamera()
    this.updateSlots()
    this.updateFrame()
    this.updateMorph()
    this.updateLens()

    const sig = this.signature()
    const last = this.lastSig
    let same = last.length === sig.length
    if (same) for (let i = 0; i < sig.length; i++) if (sig[i] !== last[i]) { same = false; break }
    if (same) return
    this.lastSig = sig
    this.render()
  }

  private render() {
    const r = this.renderer
    r.setRenderTarget(this.rt)
    r.setClearColor(0x000000, 0)
    r.clear()
    r.render(this.scene, this.camera)
    r.setRenderTarget(null)
    r.clear()
    r.render(this.post, this.postCam)
  }

  /* Compila shaders y sube texturas antes de la primera transición. */
  warm() {
    const was = this.awake
    this.setAwake(true)
    this.renderer.compile(this.scene, this.camera)
    this.renderer.compile(this.post, this.postCam)
    this.lastSig = []
    if (!was) this.setAwake(false)
  }

  dispose() {
    this.disposed = true
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored)
    for (const p of this.peeks.values()) {
      p.video.pause()
      p.video.removeAttribute("src")
      p.video.load()
      p.tex?.dispose()
    }
    this.peeks.clear()
    this.peekBox.remove()
    for (const t of this.textures) t?.dispose()
    for (const t of this.largeTex.values()) t.dispose()
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined
      m?.dispose()
    })
    this.post.traverse((o) => {
      const mesh = o as THREE.Mesh
      ;(mesh.material as THREE.Material | undefined)?.dispose()
      mesh.geometry?.dispose()
    })
    this.geo.dispose()
    this.rt.dispose()
    this.renderer.dispose()
  }
}

export function webglOk() {
  try {
    const c = document.createElement("canvas")
    const gl = c.getContext("webgl2")
    if (!gl) return false
    const ext = gl.getExtension("WEBGL_debug_renderer_info")
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ""
    gl.getExtension("WEBGL_lose_context")?.loseContext()
    return !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)
  } catch {
    return false
  }
}
