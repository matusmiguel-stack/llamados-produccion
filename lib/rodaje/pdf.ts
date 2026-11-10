// PDF del plan de rodaje: el plan de trabajo (por día, completo o por unidad)
// y el reporte de tomas buenas (en orden de guion o de rodaje).
// Corre en el navegador; jsPDF se carga solo cuando se pide un PDF.

import type { jsPDF as JsPDF } from "jspdf"
import type { DatosPlan } from "./datos"
import { bloquesDia, comparadorGuion, diasVista, secuenciaDia, slugEscena, type DiaVista } from "./orden"
import { ETIQUETAS, type RodajeEscena, type RodajeGuion, type RodajeToma } from "./tipos"

type RGB = [number, number, number]
const TINTA: RGB = [15, 23, 42]
const TEXTO: RGB = [51, 65, 85]
const GRIS: RGB = [100, 116, 139]
const LINEA: RGB = [226, 232, 240]
const VIOLETA: RGB = [91, 33, 182]
const VIOLETA_SUAVE: RGB = [237, 233, 254]
const VERDE: RGB = [21, 128, 61]
const VERDE_SUAVE: RGB = [220, 252, 231]
const AMBAR: RGB = [180, 83, 9]
const AMBAR_SUAVE: RGB = [254, 243, 199]
const CABEZA_TABLA: RGB = [241, 245, 249]

export type AlcancePlan =
  | { tipo: "todo" }
  | { tipo: "dia"; diaId: string | null }
  | { tipo: "unidad"; unidad: 1 | 2 }

export type OrdenTomas = "guion" | "rodaje"

/** Las fuentes estándar del PDF solo traen el alfabeto latino: lo demás se cambia o se quita. */
export function textoPdf(t: unknown): string {
  return String(t ?? "")
    .replace(/[✓✔]/g, "OK")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/ /g, " ")
    .replace(/[^\u0000-ÿ—–…€]/g, "")
}

function hoy(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function sello(): string {
  return new Date().toLocaleString("es-MX", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

function paraArchivo(nombre: string): string {
  return (nombre || "proyecto").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 80)
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`
}

/** Lo que comparten los dos PDF: medidas de la hoja y atajos de dibujo. */
function lienzo(doc: JsPDF) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 40
  return {
    W, H, M,
    CW: W - 2 * M,
    FONDO: H - 46,
    color: (c: RGB) => doc.setTextColor(c[0], c[1], c[2]),
    relleno: (c: RGB) => doc.setFillColor(c[0], c[1], c[2]),
    trazo: (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]),
    fuente: (peso: "normal" | "bold", tam: number) => {
      doc.setFont("helvetica", peso)
      doc.setFontSize(tam)
    },
    partir: (t: string, ancho: number): string[] => doc.splitTextToSize(textoPdf(t), ancho) as string[],
    /** Recorta con "…" lo que no quepa en un renglón. */
    ajustar: (t: string, ancho: number): string => {
      let s = textoPdf(t)
      if (doc.getTextWidth(s) <= ancho) return s
      while (s.length > 1 && doc.getTextWidth(s + "…") > ancho) s = s.slice(0, -1)
      return s.trimEnd() + "…"
    },
  }
}

function pie(doc: JsPDF, izquierda: string) {
  const L = lienzo(doc)
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    L.fuente("normal", 8)
    L.color(GRIS)
    doc.text(L.ajustar(izquierda, L.CW - 90), L.M, L.H - 22)
    doc.text(`Página ${i} de ${n}`, L.W - L.M, L.H - 22, { align: "right" })
  }
}

type Contexto = {
  varias: boolean
  porGuion: Map<string, RodajeGuion>
  numero: (e: RodajeEscena) => string
  pieza: (g: RodajeGuion | undefined) => string
}

function contexto(datos: DatosPlan): Contexto {
  const etq = ETIQUETAS[datos.plan.etiqueta] || ETIQUETAS.guion
  const varias = datos.guiones.length > 1
  const porGuion = new Map(datos.guiones.map((g) => [g.id, g]))
  return {
    varias,
    porGuion,
    numero: (e) => {
      const g = porGuion.get(e.guion_id)
      return varias && g ? `${g.numero}.${e.numero}` : e.numero
    },
    pieza: (g) => (g ? `${etq.uno} ${g.numero}${g.titulo ? " · " + g.titulo : ""}` : etq.uno),
  }
}

// ── Plan de trabajo ───────────────────────────────────────────────────────────

export function nombrePlanPDF(datos: DatosPlan, proyecto: string, alcance: AlcancePlan): string {
  let parte = "Plan completo"
  if (alcance.tipo === "unidad") parte = `Unidad ${alcance.unidad} - Plan completo`
  if (alcance.tipo === "dia") {
    const d = diasVista(datos.dias).find((x) => x.id === alcance.diaId)
    parte = d && d.id ? `Día ${d.n}` : "Sin día asignado"
  }
  return `Plan de trabajo - ${paraArchivo(proyecto)} - ${parte} - ${hoy()}.pdf`
}

export async function generarPlanPDF(datos: DatosPlan, proyecto: string, alcance: AlcancePlan): Promise<JsPDF> {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "pt", format: "letter" })
  doc.setLineHeightFactor(1.25)
  const L = lienzo(doc)
  const { M, CW, FONDO } = L
  const NUMW = 54, CHKW = 30, TXTW = CW - NUMW - CHKW
  const ctx = contexto(datos)

  const unidad = alcance.tipo === "unidad" ? alcance.unidad : null
  const incluye = (e: RodajeEscena) => !unidad || ctx.porGuion.get(e.guion_id)?.unidad === unidad
  const escenas = datos.escenas.filter(incluye)
  const todos = diasVista(datos.dias)
  const dias: DiaVista[] =
    alcance.tipo === "dia"
      ? todos.filter((d) => d.id === alcance.diaId)
      : todos.filter((d) => escenas.some((e) => (e.dia_id || null) === d.id))
  const enAlcance = escenas.filter((e) => dias.some((d) => d.id === (e.dia_id || null)))
  const filmadas = enAlcance.filter((e) => e.filmada).length

  // Encabezado
  let y = M
  L.fuente("bold", 17); L.color(TINTA)
  doc.text(L.ajustar(proyecto.toUpperCase(), CW), M, y + 12)
  L.fuente("normal", 11); L.color(GRIS)
  const queEs =
    (unidad ? `Unidad ${unidad} · ` : "") + (alcance.tipo === "dia" ? dias[0]?.titulo || "Día" : "plan completo")
  doc.text(textoPdf(`Plan de trabajo · ${queEs}`), M, y + 30)
  L.fuente("normal", 9)
  doc.text(
    textoPdf(`Generado ${sello()} · ${plural(enAlcance.length, "escena", "escenas")} · ${plural(filmadas, "filmada", "filmadas")}`),
    M, y + 44
  )
  y += 62

  if (!enAlcance.length) {
    L.fuente("normal", 10); L.color(GRIS)
    doc.text("No hay escenas que mostrar con esta selección.", M, y + 10)
  }

  const cabezaDia = (d: DiaVista, continua: boolean) => {
    const delDia = escenas.filter((e) => (e.dia_id || null) === d.id)
    L.relleno(VIOLETA_SUAVE); doc.rect(M, y, CW, 22, "F")
    L.fuente("normal", 9); L.color(VIOLETA)
    const derecha = `${plural(delDia.length, "escena", "escenas")} · ${plural(delDia.filter((e) => e.filmada).length, "filmada", "filmadas")}`
    const anchoDer = doc.getTextWidth(derecha)
    doc.text(derecha, M + CW - 8, y + 15, { align: "right" })
    L.fuente("bold", 10.5)
    doc.text(L.ajustar(d.titulo.toUpperCase() + (continua ? "  (continúa)" : ""), CW - anchoDer - 28), M + 8, y + 15)
    y += 30
    if (d.nota && !continua) {
      L.fuente("normal", 9); L.color(TEXTO)
      const nota = L.partir(d.nota, CW - 16)
      doc.text(nota, M + 8, y + 4)
      y += nota.length * 11.5 + 6
    }
  }

  dias.forEach((d, di) => {
    if (di > 0) {
      if (y > L.H - 140) { doc.addPage(); y = M } else y += 10
    }
    cabezaDia(d, false)
    const paginaNueva = () => { doc.addPage(); y = M; cabezaDia(d, true) }

    let bloques = bloquesDia(secuenciaDia(d.id, escenas, datos.seps, datos.guiones))
    // Al filtrar por unidad, un separador sin escenas debajo ya no dice nada.
    if (unidad) bloques = bloques.filter((b, i) => b.t !== "sep" || bloques[i + 1]?.t === "corrida")

    for (const b of bloques) {
      if (b.t === "sep") {
        if (y + 30 > FONDO) paginaNueva()
        y += 4
        L.trazo(AMBAR); doc.setLineWidth(1); doc.setLineDashPattern([3, 2], 0)
        doc.line(M, y + 6, M + CW, y + 6)
        doc.setLineDashPattern([], 0)
        L.fuente("bold", 9)
        const titulo = L.ajustar(b.s.titulo.toUpperCase(), CW - 60)
        const ancho = doc.getTextWidth(titulo) + 18
        L.relleno([255, 255, 255]); doc.rect(M + CW / 2 - ancho / 2, y - 2, ancho, 15, "F")
        L.color(AMBAR); doc.text(titulo, M + CW / 2, y + 9, { align: "center" })
        y += 22
        continue
      }

      const g = ctx.porGuion.get(b.c.guionId)
      let faltaCabeza = ctx.varias
      for (const e of b.c.escenas) {
        L.fuente("bold", 10); const titulo = L.partir(slugEscena(e), TXTW)
        L.fuente("normal", 8.5); const desc = e.descripcion ? L.partir(e.descripcion, TXTW) : []
        L.fuente("normal", 7.5); const gente = e.personajes.length ? L.partir(e.personajes.join(" · "), TXTW) : []
        const alto = titulo.length * 12.5 + desc.length * 10.8 + gente.length * 9.6 + 8

        if (y + alto + (faltaCabeza ? 18 : 0) > FONDO) { paginaNueva(); faltaCabeza = ctx.varias }
        if (faltaCabeza) {
          faltaCabeza = false
          L.fuente("bold", 8); L.color(VIOLETA)
          const unidadTxt = g?.unidad ? `   ·   UNIDAD ${g.unidad}` : ""
          doc.text(L.ajustar(ctx.pieza(g).toUpperCase() + unidadTxt, CW), M, y + 9)
          y += 16
        }

        const arriba = y
        if (e.filmada) { L.relleno(VERDE_SUAVE); doc.rect(M, arriba - 2, CW, alto, "F") }
        L.fuente("bold", 12); L.color(e.filmada ? VERDE : VIOLETA)
        doc.text(L.ajustar(ctx.numero(e), NUMW - 8), M + 4, arriba + 11)
        L.fuente("bold", 10); L.color(TINTA); doc.text(titulo, M + NUMW, arriba + 10)
        let yy = arriba + 10 + titulo.length * 12.5 - 1.5
        if (desc.length) { L.fuente("normal", 8.5); L.color(TEXTO); doc.text(desc, M + NUMW, yy); yy += desc.length * 10.8 }
        if (gente.length) { L.fuente("normal", 7.5); L.color(GRIS); doc.text(gente, M + NUMW, yy) }

        // Casilla de filmado
        const bx = M + CW - CHKW + 8, by = arriba + 1, lado = 13
        doc.setLineWidth(1)
        if (e.filmada) {
          L.trazo(VERDE); L.relleno(VERDE); doc.rect(bx, by, lado, lado, "FD")
          doc.setDrawColor(255, 255, 255); doc.setLineWidth(1.8)
          doc.line(bx + 3, by + 7, bx + 5.6, by + 10); doc.line(bx + 5.6, by + 10, bx + 10.5, by + 3.5)
        } else {
          L.trazo(GRIS); doc.rect(bx, by, lado, lado, "S")
        }

        y = arriba + alto
        L.trazo(LINEA); doc.setLineWidth(0.5); doc.line(M, y - 1, M + CW, y - 1)
        y += 2
      }
    }
  })

  pie(doc, `${proyecto} · Plan de trabajo`)
  return doc
}

// ── Reporte de tomas buenas ───────────────────────────────────────────────────

export function nombreTomasPDF(proyecto: string, orden: OrdenTomas): string {
  return `Reporte de tomas - ${paraArchivo(proyecto)} - ${orden === "rodaje" ? "Orden de rodaje" : "Orden del guion"} - ${hoy()}.pdf`
}

export async function generarTomasPDF(datos: DatosPlan, proyecto: string, orden: OrdenTomas): Promise<JsPDF> {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "pt", format: "letter" })
  doc.setLineHeightFactor(1.2)
  const L = lienzo(doc)
  const { M, CW } = L
  const FONDO = L.H - 48
  const NUMW = 54, X = M + NUMW, TW = CW - NUMW
  const ctx = contexto(datos)

  type Col = { k: "emplazamiento" | "buena" | "proteccion" | "notas"; t: string; w: number }
  const COLS: Col[] = [
    { k: "emplazamiento", t: "EMPLAZAMIENTO", w: 124 },
    { k: "buena", t: "TOMA BUENA", w: 64 },
    { k: "proteccion", t: "PROTECCIÓN", w: 66 },
  ]
  COLS.push({ k: "notas", t: "NOTAS", w: TW - COLS.reduce((a, c) => a + c.w, 0) })

  // Tomas por escena y lugar de cada escena en el rodaje (día y orden dentro del día).
  const tomasDe = new Map<string, RodajeToma[]>()
  for (const t of [...datos.tomas].sort((a, b) => a.orden - b.orden)) {
    if (!(t.emplazamiento || t.buena || t.proteccion || t.notas)) continue
    const lista = tomasDe.get(t.escena_id)
    if (lista) lista.push(t)
    else tomasDe.set(t.escena_id, [t])
  }
  const dias = diasVista(datos.dias)
  const lugar = new Map<string, { dia: DiaVista; i: number }>()
  const enRodaje: RodajeEscena[] = []
  for (const d of dias) {
    let i = 0
    for (const it of secuenciaDia(d.id, datos.escenas, datos.seps, datos.guiones)) {
      if (it.t !== "e") continue
      lugar.set(it.e.id, { dia: d, i: ++i })
      enRodaje.push(it.e)
    }
  }
  const lista = orden === "rodaje" ? enRodaje : [...datos.escenas].sort(comparadorGuion(datos.guiones))

  const conTomas = lista.filter((e) => tomasDe.has(e.id)).length
  const nFilmadas = lista.filter((e) => e.filmada).length
  const sinCalificar = lista.filter((e) => e.filmada && !tomasDe.has(e.id))
  const tituloOrden = orden === "rodaje" ? "orden de rodaje" : "orden del guion"

  // Encabezado
  let y = M
  L.fuente("bold", 17); L.color(TINTA)
  doc.text(L.ajustar(proyecto.toUpperCase(), CW), M, y + 12)
  L.fuente("normal", 11); L.color(GRIS)
  doc.text(textoPdf(`Reporte de tomas buenas · ${tituloOrden}`), M, y + 30)
  L.fuente("normal", 9)
  doc.text(
    textoPdf(
      `Generado ${sello()} · ${plural(lista.length, "escena", "escenas")} · ${plural(nFilmadas, "filmada", "filmadas")} · ${conTomas} con tomas`
    ),
    M, y + 44
  )
  L.fuente("normal", 8)
  doc.text(
    textoPdf(
      orden === "rodaje"
        ? "#3 bajo el número de escena = orden en que se filma ese día."
        : "D2 #5 bajo el número de escena = día de rodaje y orden en que se filma ese día."
    ),
    M, y + 57
  )
  y += 70

  // Filmadas a las que les falta calificar
  if (sinCalificar.length) {
    L.fuente("normal", 8.5)
    const nums = L.partir(sinCalificar.map((e) => ctx.numero(e)).join(", "), CW - 20)
    const alto = 20 + nums.length * 10.5
    L.relleno(AMBAR_SUAVE); doc.rect(M, y, CW, alto, "F")
    L.fuente("bold", 8); L.color(AMBAR)
    doc.text(textoPdf(`FILMADAS SIN CALIFICAR (${sinCalificar.length})`), M + 10, y + 13, { charSpace: 0.4 })
    L.fuente("normal", 8.5); L.color(TINTA); doc.text(nums, M + 10, y + 25)
    y += alto + 12
  } else if (nFilmadas > 0) {
    L.fuente("bold", 9); L.color(VERDE)
    doc.text("Todas las escenas filmadas tienen tomas calificadas.", M, y + 8)
    y += 20
  }

  const seccionDe = (e: RodajeEscena) => (orden === "rodaje" ? lugar.get(e.id)?.dia.clave || "" : e.guion_id)

  const cabezaSeccion = (e: RodajeEscena, continua: boolean) => {
    L.relleno(VIOLETA_SUAVE); doc.rect(M, y, CW, 22, "F")
    let izq: string, der: string
    if (orden === "rodaje") {
      const d = lugar.get(e.id)?.dia
      const delDia = datos.escenas.filter((x) => (x.dia_id || null) === (d?.id ?? null))
      izq = (d?.titulo || "Sin día asignado").toUpperCase()
      der = `${plural(delDia.length, "escena", "escenas")} · ${plural(delDia.filter((x) => x.filmada).length, "filmada", "filmadas")}`
    } else {
      const g = ctx.porGuion.get(e.guion_id)
      izq = ctx.pieza(g).toUpperCase()
      const ns = [...new Set(
        datos.escenas.filter((x) => x.guion_id === e.guion_id).map((x) => lugar.get(x.id)?.dia.n).filter((n): n is number => !!n)
      )].sort((a, b) => a - b)
      der = [g?.unidad ? `Unidad ${g.unidad}` : "", ns.length ? `Día ${ns.join(", ")}` : "Sin día asignado"].filter(Boolean).join(" · ")
    }
    if (continua) izq += "  (continúa)"
    L.fuente("normal", 8.5); L.color(VIOLETA)
    const anchoDer = Math.min(doc.getTextWidth(textoPdf(der)), CW * 0.45)
    doc.text(L.ajustar(der, CW * 0.45), M + CW - 8, y + 15, { align: "right" })
    L.fuente("bold", 10.5)
    doc.text(L.ajustar(izq, CW - anchoDer - 28), M + 8, y + 15)
    y += 30
  }

  const cabezaTabla = () => {
    L.relleno(CABEZA_TABLA); doc.rect(X, y, TW, 14, "F")
    L.fuente("bold", 6.8); L.color(GRIS)
    let cx = X
    for (const c of COLS) {
      doc.text(textoPdf(c.t), cx + 5, y + 9.5, { charSpace: 0.5 })
      cx += c.w
    }
    y += 14
  }

  const valor = (t: RodajeToma, k: Col["k"], i: number) =>
    k === "emplazamiento" ? t.emplazamiento.trim() || `Emplazamiento ${i + 1}` : (t[k] || "").trim()

  const lineasFila = (t: RodajeToma, i: number): string[][] =>
    COLS.map((c) => {
      if (c.k === "buena") L.fuente("bold", 10)
      else if (c.k === "notas") L.fuente("normal", 8.5)
      else L.fuente("normal", 9)
      const v = valor(t, c.k, i)
      return v ? L.partir(v, c.w - 10) : ["—"]
    })
  const altoFila = (ls: string[][]) => Math.max(...ls.map((l, i) => l.length * (COLS[i].k === "notas" ? 10.2 : 11))) + 7

  let actual: string | null = null
  lista.forEach((e, idx) => {
    const sec = seccionDe(e)
    const g = ctx.porGuion.get(e.guion_id)
    const tomas = tomasDe.get(e.id) || []
    const donde = lugar.get(e.id)

    const meta: string[] = []
    if (orden === "rodaje" && ctx.varias) meta.push(ctx.pieza(g))
    if (orden === "rodaje" && g?.unidad) meta.push(`Unidad ${g.unidad}`)
    if (!e.filmada) meta.push("PENDIENTE DE FILMAR")
    L.fuente("bold", 10); const titulo = L.partir(slugEscena(e), TW)
    L.fuente("normal", 8.5); const desc = e.descripcion ? L.partir(e.descripcion, TW) : []
    L.fuente("normal", 8); const metaL = meta.length ? L.partir(meta.join("  ·  "), TW) : []
    const filas = tomas.map(lineasFila)
    const altoCabeza = titulo.length * 12.5 + desc.length * 10.8 + metaL.length * 10 + 6
    const altoPrimera = filas.length ? 14 + altoFila(filas[0]) : e.filmada ? 16 : 0

    if (sec !== actual) {
      if (actual !== null) y += 6
      if (y + 30 + altoCabeza + altoPrimera > FONDO) { doc.addPage(); y = M }
      cabezaSeccion(e, false)
      actual = sec
    } else if (y + altoCabeza + altoPrimera > FONDO) {
      doc.addPage(); y = M
      cabezaSeccion(e, true)
    }

    const arriba = y
    // Columna izquierda: número de escena y su lugar en el rodaje
    L.fuente("bold", 12.5); L.color(e.filmada ? VERDE : VIOLETA)
    doc.text(L.ajustar(ctx.numero(e), NUMW - 6), M + 2, arriba + 11)
    L.fuente("normal", 7.5); L.color(GRIS)
    const pos = donde ? (!donde.dia.id ? "s/día" : orden === "rodaje" ? `#${donde.i}` : `D${donde.dia.n} #${donde.i}`) : ""
    if (pos) doc.text(pos, M + 2, arriba + 22)

    L.fuente("bold", 10); L.color(TINTA); doc.text(titulo, X, arriba + 10)
    let yy = arriba + 10 + titulo.length * 12.5 - 1.5
    if (desc.length) { L.fuente("normal", 8.5); L.color(TEXTO); doc.text(desc, X, yy); yy += desc.length * 10.8 }
    if (metaL.length) { L.fuente("normal", 8); L.color(GRIS); doc.text(metaL, X, yy); yy += metaL.length * 10 }
    y = Math.max(yy - 4, arriba + 26)

    if (filas.length) {
      y += 2
      cabezaTabla()
      tomas.forEach((t, i) => {
        const ls = filas[i]
        const h = altoFila(ls)
        if (y + h > FONDO) {
          doc.addPage(); y = M
          cabezaSeccion(e, true)
          L.fuente("bold", 9); L.color(GRIS)
          doc.text(textoPdf(`Esc. ${ctx.numero(e)} (continúa)`), X, y + 8)
          y += 14
          cabezaTabla()
        }
        let cx = X
        ls.forEach((l, ci) => {
          const c = COLS[ci]
          const vacia = !valor(t, c.k, i)
          if (vacia) { L.fuente("normal", 9); L.color(LINEA) }
          else if (c.k === "buena") { L.fuente("bold", 10); L.color(VERDE) }
          else if (c.k === "proteccion") { L.fuente("bold", 9); L.color(TINTA) }
          else if (c.k === "notas") { L.fuente("normal", 8.5); L.color(TINTA) }
          else { L.fuente("normal", 9); L.color(TINTA) }
          doc.text(l, cx + 5, y + 11)
          cx += c.w
        })
        y += h
        L.trazo(LINEA); doc.setLineWidth(0.5); doc.line(X, y, X + TW, y)
      })
    } else if (e.filmada) {
      L.fuente("bold", 8.5); L.color(AMBAR)
      doc.text("Sin calificar", X, y + 9)
      y += 14
    }
    y += 10
    const sig = lista[idx + 1]
    if (!filas.length && sig && seccionDe(sig) === sec) {
      L.trazo(LINEA); doc.setLineWidth(0.5); doc.line(M, y - 5, M + CW, y - 5)
    }
  })

  if (!lista.length) {
    L.fuente("normal", 10); L.color(GRIS)
    doc.text("Este plan todavía no tiene escenas.", M, y + 10)
  }

  pie(doc, `${proyecto} · Reporte de tomas buenas · ${tituloOrden}`)
  return doc
}

/** Genera el PDF del plan de trabajo y lo descarga. */
export async function descargarPlanPDF(datos: DatosPlan, proyecto: string, alcance: AlcancePlan): Promise<void> {
  const doc = await generarPlanPDF(datos, proyecto, alcance)
  doc.save(nombrePlanPDF(datos, proyecto, alcance))
}

/** Genera el reporte de tomas buenas y lo descarga. */
export async function descargarTomasPDF(datos: DatosPlan, proyecto: string, orden: OrdenTomas): Promise<void> {
  const doc = await generarTomasPDF(datos, proyecto, orden)
  doc.save(nombreTomasPDF(proyecto, orden))
}
