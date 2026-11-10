// PDF del plan de rodaje: el plan de trabajo (por día, completo o por unidad)
// y el reporte de tomas buenas (en orden de guion o de rodaje).
//
// Mismo lenguaje visual que la hoja de llamado (lib/exportHojaPdf.ts): imagen
// de encabezado de Retro con el título al centro, tira morada, cajas de datos,
// barras de sección moradas, tablas con encabezado oscuro y pie interno.
// Corre en el navegador; jsPDF se carga solo cuando se pide un PDF.

import type { jsPDF as JsPDF } from "jspdf"
import type { DatosPlan } from "./datos"
import { bloquesDia, comparadorGuion, diasVista, secuenciaDia, slugEscena, type DiaVista } from "./orden"
import { ETIQUETAS, type RodajeEscena, type RodajeGuion, type RodajeToma } from "./tipos"

// ── Hoja y colores (los mismos de la hoja de llamado) ─────────────────────────
const PAGE_W = 215.9
const PAGE_H = 279.4
const MARGIN = 10
const W = PAGE_W - MARGIN * 2
const X = MARGIN
const FONDO = PAGE_H - MARGIN - 8 // límite inferior del contenido (deja el pie)

const C_ENCABEZADO = "#1a0a3e"
const C_MORADO = "#7c3aed"
const C_MORADO_CLARO = "#a78bfa"
const C_LILA = "#ede9fe"
const C_MORADO_TEXTO = "#5b21b6"
const C_TEXTO = "#1e293b"
const C_GRIS = "#64748b"
const C_GRIS_CLARO = "#94a3b8"
const C_FILA = "#ffffff"
const C_FILA_ALT = "#f8fafc"
const C_CAJA = "#f1f5f9"
const C_BORDE = "#e2e8f0"
const C_CABEZA_TABLA = "#334155"
const C_VERDE = "#059669"
const C_AMBAR = "#b45309"
const C_LIMA = "#c8f068" // el verde del "es" de #TODOesPOSIBLE

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

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function hoy(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
function fechaCorta(d = new Date()): string {
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`
}

function paraArchivo(nombre: string): string {
  return (nombre || "proyecto").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 80)
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`
}

async function imagenBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const blob = await resp.blob()
    return await new Promise((resolve) => {
      const lector = new FileReader()
      lector.onload = () => resolve(lector.result as string)
      lector.onerror = () => resolve(null)
      lector.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/** Atajos de dibujo sobre un documento. */
function pincel(doc: JsPDF) {
  const p = {
    fondo: (hex: string) => doc.setFillColor(...rgb(hex)),
    color: (hex: string) => doc.setTextColor(...rgb(hex)),
    trazo: (hex: string) => doc.setDrawColor(...rgb(hex)),
    fuente: (peso: "normal" | "bold", tam: number) => {
      doc.setFont("helvetica", peso)
      doc.setFontSize(tam)
    },
    partir: (t: string, ancho: number): string[] => {
      const s = textoPdf(t)
      return s ? (doc.splitTextToSize(s, ancho) as string[]) : []
    },
    /** Recorta con "…" lo que no quepa en un renglón. */
    ajustar: (t: string, ancho: number): string => {
      let s = textoPdf(t)
      if (doc.getTextWidth(s) <= ancho) return s
      while (s.length > 1 && doc.getTextWidth(s + "…") > ancho) s = s.slice(0, -1)
      return s.trimEnd() + "…"
    },
  }
  return p
}
type Pincel = ReturnType<typeof pincel>

/** Imagen de encabezado de Retro a todo lo ancho, con el título al centro. Devuelve dónde sigue el contenido. */
async function encabezado(doc: JsPDF, p: Pincel, titulo: string, subtitulo: string): Promise<number> {
  const img = await imagenBase64("/pdf-header-detail.jpg")
  let alto = 30
  if (img) {
    try {
      const props = doc.getImageProperties(img)
      if (props?.width && props?.height) alto = PAGE_W * (props.height / props.width)
    } catch {
      alto = 30
    }
    doc.addImage(img, "JPEG", 0, 0, PAGE_W, alto)
  } else {
    p.fondo(C_ENCABEZADO)
    doc.rect(0, 0, PAGE_W, alto, "F")
    p.color("#ffffff"); p.fuente("bold", 11)
    doc.text("RETRO CASA PRODUCTORA", X + 3, 12)
  }
  const centro = PAGE_W / 2
  p.color("#ffffff"); p.fuente("bold", 20)
  doc.text(textoPdf(titulo), centro, alto / 2 - 0.5, { align: "center" })
  p.color(C_MORADO_CLARO); p.fuente("normal", 8)
  doc.text(p.ajustar(subtitulo.toUpperCase(), 108), centro, alto / 2 + 6, { align: "center" })
  return alto + 4
}

/** Tira morada: fecha a la izquierda, nombre del proyecto al centro. */
function tira(doc: JsPDF, p: Pincel, y: number, izquierda: string, centro: string): number {
  p.fondo(C_MORADO)
  doc.rect(X, y, W, 8, "F")
  p.color(C_LILA); p.fuente("bold", 10)
  doc.text(textoPdf(izquierda), X + 3, y + 5.4)
  const anchoIzq = doc.getTextWidth(textoPdf(izquierda)) + 6
  p.color("#ffffff"); p.fuente("bold", 11)
  doc.text(p.ajustar(centro, W - anchoIzq * 2), X + W / 2, y + 5.5, { align: "center" })
  return y + 10
}

function caja(doc: JsPDF, p: Pincel, x: number, y: number, w: number, etiqueta: string, valor: string, h = 9) {
  p.fondo(C_CAJA); p.trazo(C_BORDE)
  doc.setLineWidth(0.1)
  doc.rect(x, y, w, h, "FD")
  p.color(C_GRIS); p.fuente("bold", 7)
  doc.text(textoPdf(etiqueta.toUpperCase()), x + 1.5, y + 3)
  p.color(C_TEXTO); p.fuente("normal", 9.5)
  doc.text(p.ajustar(valor || "—", w - 3), x + 1.5, y + 6.5)
}

function cajas(doc: JsPDF, p: Pincel, y: number, datos: [string, string][]): number {
  const w = W / datos.length
  datos.forEach(([etiqueta, valor], i) => caja(doc, p, X + i * w, y, w, etiqueta, valor))
  return y + 9
}

/** Caja de etiqueta + texto que crece con el texto (nota del día, pendientes). */
function cajaTexto(doc: JsPDF, p: Pincel, y: number, etiqueta: string, texto: string, colorEtiqueta = C_GRIS): number {
  p.fuente("normal", 9)
  const lineas = p.partir(texto, W - 3)
  const h = 5.2 + Math.max(1, lineas.length) * 3.6 + 1.3
  p.fondo(C_FILA_ALT); p.trazo(C_BORDE)
  doc.setLineWidth(0.1)
  doc.rect(X, y, W, h, "FD")
  p.color(colorEtiqueta); p.fuente("bold", 7)
  doc.text(textoPdf(etiqueta.toUpperCase()), X + 1.5, y + 3.2)
  p.color(C_TEXTO); p.fuente("normal", 9)
  doc.text(lineas, X + 1.5, y + 7.2)
  return y + h
}

function barraSeccion(doc: JsPDF, p: Pincel, y: number, titulo: string, derecha = ""): number {
  const h = 5.5
  p.fondo(C_MORADO)
  doc.rect(X, y, W, h, "F")
  p.fuente("normal", 8)
  const d = textoPdf(derecha)
  const anchoDer = d ? doc.getTextWidth(d) + 6 : 0
  if (d) {
    p.color(C_LILA)
    doc.text(d, X + W - 2, y + 3.8, { align: "right" })
  }
  p.color("#ffffff"); p.fuente("bold", 9.5)
  doc.text(p.ajustar(titulo.toUpperCase(), W - anchoDer - 4), X + 2, y + 3.8)
  return y + h
}

type Columna = { titulo: string; w: number; centro?: boolean }

function cabezaTabla(doc: JsPDF, p: Pincel, y: number, cols: Columna[]): number {
  const h = 6
  let cx = X
  p.fondo(C_CABEZA_TABLA)
  doc.rect(X, y, W, h, "F")
  p.color("#ffffff"); p.fuente("bold", 8)
  for (const c of cols) {
    doc.text(textoPdf(c.titulo), c.centro ? cx + c.w / 2 : cx + 1.5, y + 4, { align: c.centro ? "center" : "left" })
    cx += c.w
  }
  return y + h
}

/** Renglón que cruza toda la tabla: la pieza (lila) o un separador (oscuro). */
function renglonAncho(
  doc: JsPDF, p: Pincel, y: number,
  opciones: { texto: string; derecha?: string; fondo: string; color: string; centrado?: boolean }
): number {
  const h = 5.5
  p.fondo(opciones.fondo); p.trazo(C_BORDE)
  doc.setLineWidth(0.1)
  doc.rect(X, y, W, h, "FD")
  p.fuente("bold", 8); p.color(opciones.color)
  const der = textoPdf(opciones.derecha || "")
  const anchoDer = der ? doc.getTextWidth(der) + 6 : 0
  if (der) doc.text(der, X + W - 2, y + 3.8, { align: "right" })
  if (opciones.centrado) {
    doc.text(p.ajustar(opciones.texto.toUpperCase(), W - 10), X + W / 2, y + 3.8, { align: "center", charSpace: 0.3 })
  } else {
    doc.text(p.ajustar(opciones.texto.toUpperCase(), W - anchoDer - 4), X + 2, y + 3.8)
  }
  return y + h
}

/** Pie de la hoja de llamado: línea, leyenda interna y número de página. */
function pie(doc: JsPDF, p: Pincel, documento: string) {
  const total = doc.getNumberOfPages()
  for (let n = 1; n <= total; n++) {
    doc.setPage(n)
    const y = PAGE_H - MARGIN - 4
    p.trazo(C_BORDE)
    doc.setLineWidth(0.3)
    doc.line(X, y, X + W, y)
    p.color(C_GRIS_CLARO); p.fuente("normal", 7.5)
    doc.text(p.ajustar(`RETRO CASA PRODUCTORA — ${documento}`, W - 26), X, y + 3)
    doc.text(`Pág. ${n} / ${total}`, X + W, y + 3, { align: "right" })
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
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" })
  const p = pincel(doc)
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
  const diasDeRodaje = dias.filter((d) => d.id).length

  const queEs =
    (unidad ? `Unidad ${unidad} · ` : "") + (alcance.tipo === "dia" ? dias[0]?.titulo || "Día" : "plan completo")

  // Encabezado, tira y cajas de datos
  let y = await encabezado(doc, p, "PLAN DE TRABAJO", queEs)
  y = tira(doc, p, y, fechaCorta(), proyecto)
  y = cajas(doc, p, y, [
    ["Escenas", String(enAlcance.length)],
    ["Filmadas", String(filmadas)],
    ["Por filmar", String(enAlcance.length - filmadas)],
    ["Días de rodaje", String(diasDeRodaje)],
    ["Unidad", unidad ? `Unidad ${unidad}` : "Todas"],
  ])
  y += 3

  if (!enAlcance.length) {
    p.color(C_GRIS); p.fuente("normal", 10)
    doc.text("No hay escenas que mostrar con esta selección.", X, y + 6)
  }

  const COLS: Columna[] = [
    { titulo: "ESC.", w: 17 },
    { titulo: "LOCACIÓN / ACCIÓN", w: W - 17 - 48 - 17 },
    { titulo: "PERSONAJES", w: 48 },
    { titulo: "FILMADA", w: 17, centro: true },
  ]

  dias.forEach((d) => {
    const delDia = escenas.filter((e) => (e.dia_id || null) === d.id)
    const conteo = `${plural(delDia.length, "escena", "escenas")} · ${plural(delDia.filter((e) => e.filmada).length, "filmada", "filmadas")}`
    const abrirSeccion = (continua: boolean) => {
      y = barraSeccion(doc, p, y, d.titulo + (continua ? "  (continúa)" : ""), conteo)
      if (d.nota && !continua) y = cajaTexto(doc, p, y, "Nota del día", d.nota)
      y = cabezaTabla(doc, p, y, COLS)
    }
    // La barra nunca queda huérfana al fondo: necesita espacio para un par de renglones.
    if (y + 5.5 + 6 + 20 > FONDO) { doc.addPage(); y = MARGIN }
    abrirSeccion(false)

    let bloques = bloquesDia(secuenciaDia(d.id, escenas, datos.seps, datos.guiones))
    // Al filtrar por unidad, un separador sin escenas debajo ya no dice nada.
    if (unidad) bloques = bloques.filter((b, i) => b.t !== "sep" || bloques[i + 1]?.t === "corrida")

    let fila = 0
    for (const b of bloques) {
      if (b.t === "sep") {
        if (y + 5.5 + 7 > FONDO) { doc.addPage(); y = MARGIN; abrirSeccion(true) }
        y = renglonAncho(doc, p, y, { texto: b.s.titulo, fondo: C_ENCABEZADO, color: C_LIMA, centrado: true })
        continue
      }

      const g = ctx.porGuion.get(b.c.guionId)
      const renglonPieza = (continua: boolean) => {
        if (!ctx.varias) return
        y = renglonAncho(doc, p, y, {
          texto: ctx.pieza(g) + (continua ? "  (continúa)" : ""),
          derecha: g?.unidad ? `UNIDAD ${g.unidad}` : "",
          fondo: C_LILA,
          color: C_MORADO_TEXTO,
        })
      }
      let faltaPieza = true

      for (const e of b.c.escenas) {
        p.fuente("bold", 8.5); const titulo = p.partir(slugEscena(e), COLS[1].w - 3)
        p.fuente("normal", 8); const desc = p.partir(e.descripcion, COLS[1].w - 3)
        p.fuente("normal", 7.5); const gente = p.partir(e.personajes.join(" · "), COLS[2].w - 3)
        const alto = Math.max(6.5, 2.4 + titulo.length * 3.5 + desc.length * 3.2 + 1, 2.6 + gente.length * 3 + 1)

        if (y + alto + (faltaPieza && ctx.varias ? 5.5 : 0) > FONDO) {
          doc.addPage(); y = MARGIN
          abrirSeccion(true)
          renglonPieza(!faltaPieza)
          faltaPieza = false
        } else if (faltaPieza) {
          renglonPieza(false)
          faltaPieza = false
        }

        p.fondo(fila % 2 === 0 ? C_FILA : C_FILA_ALT); p.trazo(C_BORDE)
        doc.setLineWidth(0.1)
        doc.rect(X, y, W, alto, "FD")
        fila++

        let cx = X
        p.fuente("bold", 10); p.color(e.filmada ? C_VERDE : C_MORADO_TEXTO)
        doc.text(p.ajustar(ctx.numero(e), COLS[0].w - 3), cx + 1.5, y + 4.4)
        cx += COLS[0].w

        p.fuente("bold", 8.5); p.color(C_TEXTO)
        doc.text(titulo, cx + 1.5, y + 4.1, { lineHeightFactor: 1.17 })
        if (desc.length) {
          p.fuente("normal", 8); p.color(C_GRIS)
          doc.text(desc, cx + 1.5, y + 4.1 + titulo.length * 3.5, { lineHeightFactor: 1.13 })
        }
        cx += COLS[1].w

        if (gente.length) {
          p.fuente("normal", 7.5); p.color(C_GRIS)
          doc.text(gente, cx + 1.5, y + 4.1, { lineHeightFactor: 1.13 })
        }
        cx += COLS[2].w

        // Casilla de filmado
        const lado = 3.8
        const bx = cx + COLS[3].w / 2 - lado / 2
        const by = y + Math.min(alto / 2 - lado / 2, 1.6)
        if (e.filmada) {
          p.fondo(C_VERDE); p.trazo(C_VERDE)
          doc.setLineWidth(0.3)
          doc.rect(bx, by, lado, lado, "FD")
          doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.55)
          doc.line(bx + 0.85, by + 2.0, bx + 1.6, by + 2.85)
          doc.line(bx + 1.6, by + 2.85, bx + 3.0, by + 1.0)
        } else {
          p.trazo(C_GRIS_CLARO)
          doc.setLineWidth(0.3)
          doc.rect(bx, by, lado, lado, "S")
        }
        y += alto
      }
    }
    y += 4
  })

  pie(doc, p, `Plan de trabajo · ${proyecto}`)
  return doc
}

// ── Reporte de tomas buenas ───────────────────────────────────────────────────

export function nombreTomasPDF(proyecto: string, orden: OrdenTomas): string {
  return `Reporte de tomas - ${paraArchivo(proyecto)} - ${orden === "rodaje" ? "Orden de rodaje" : "Orden del guion"} - ${hoy()}.pdf`
}

export async function generarTomasPDF(datos: DatosPlan, proyecto: string, orden: OrdenTomas): Promise<JsPDF> {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" })
  const p = pincel(doc)
  const ctx = contexto(datos)

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

  // Encabezado, tira y cajas de datos
  let y = await encabezado(doc, p, "TOMAS BUENAS", `Reporte · ${tituloOrden}`)
  y = tira(doc, p, y, fechaCorta(), proyecto)
  y = cajas(doc, p, y, [
    ["Escenas", String(lista.length)],
    ["Filmadas", String(nFilmadas)],
    ["Con tomas", String(conTomas)],
    ["Filmadas sin calificar", String(sinCalificar.length)],
    ["Orden", orden === "rodaje" ? "De rodaje" : "Del guion"],
  ])
  if (sinCalificar.length) {
    y = cajaTexto(doc, p, y, `Filmadas sin calificar (${sinCalificar.length})`, sinCalificar.map((e) => ctx.numero(e)).join(", "), C_AMBAR)
  }
  y += 3

  const COLS: Columna[] = [
    { titulo: "ESC.", w: 17 },
    { titulo: "ESCENA", w: 62 },
    { titulo: "EMPLAZAMIENTO", w: 36 },
    { titulo: "BUENA", w: 15, centro: true },
    { titulo: "PROT.", w: 15, centro: true },
    { titulo: "NOTAS", w: W - 17 - 62 - 36 - 15 - 15 },
  ]
  const xEmp = X + COLS[0].w + COLS[1].w
  const wTomas = W - COLS[0].w - COLS[1].w

  const seccionDe = (e: RodajeEscena) => (orden === "rodaje" ? lugar.get(e.id)?.dia.clave || "" : e.guion_id)

  const abrirSeccion = (e: RodajeEscena, continua: boolean) => {
    let izq: string, der: string
    if (orden === "rodaje") {
      const d = lugar.get(e.id)?.dia
      const delDia = datos.escenas.filter((x) => (x.dia_id || null) === (d?.id ?? null))
      izq = d?.titulo || "Sin día asignado"
      der = `${plural(delDia.length, "escena", "escenas")} · ${plural(delDia.filter((x) => x.filmada).length, "filmada", "filmadas")}`
    } else {
      const g = ctx.porGuion.get(e.guion_id)
      izq = ctx.pieza(g)
      const ns = [...new Set(
        datos.escenas.filter((x) => x.guion_id === e.guion_id).map((x) => lugar.get(x.id)?.dia.n).filter((n): n is number => !!n)
      )].sort((a, b) => a - b)
      der = [g?.unidad ? `Unidad ${g.unidad}` : "", ns.length ? `Día ${ns.join(", ")}` : "Sin día asignado"].filter(Boolean).join(" · ")
    }
    y = barraSeccion(doc, p, y, izq + (continua ? "  (continúa)" : ""), der)
    y = cabezaTabla(doc, p, y, COLS)
  }

  let actual: string | null = null
  let fila = 0
  for (const e of lista) {
    const sec = seccionDe(e)
    const g = ctx.porGuion.get(e.guion_id)
    const tomas = tomasDe.get(e.id) || []
    const donde = lugar.get(e.id)

    // Lo que va en la celda de la escena
    p.fuente("bold", 8.5); const titulo = p.partir(slugEscena(e), COLS[1].w - 3)
    p.fuente("normal", 7.5); const desc = p.partir(e.descripcion, COLS[1].w - 3)
    const meta: string[] = []
    if (orden === "rodaje" && ctx.varias) meta.push(ctx.pieza(g))
    if (orden === "rodaje" && g?.unidad) meta.push(`Unidad ${g.unidad}`)
    p.fuente("normal", 7); const metaL = p.partir(meta.join(" · "), COLS[1].w - 3)
    const altoEscena = 2.4 + titulo.length * 3.5 + desc.length * 3 + metaL.length * 2.9 + 1.2
    const pos = donde ? (!donde.dia.id ? "s/día" : orden === "rodaje" ? `#${donde.i}` : `D${donde.dia.n} #${donde.i}`) : ""

    // Renglones de tomas (o uno solo con el aviso si no hay)
    type Renglon = { emp: string[]; buena: string; prot: string; notas: string[]; h: number; aviso?: { texto: string; color: string } }
    const renglones: Renglon[] = tomas.length
      ? tomas.map((t, i) => {
          p.fuente("normal", 8.5); const emp = p.partir(t.emplazamiento.trim() || `Emplazamiento ${i + 1}`, COLS[2].w - 3)
          p.fuente("normal", 8); const notas = p.partir(t.notas, COLS[5].w - 3)
          return {
            emp, notas, buena: textoPdf(t.buena.trim()), prot: textoPdf(t.proteccion.trim()),
            h: Math.max(6.5, 2.6 + Math.max(emp.length * 3.5, notas.length * 3.3) + 1),
          }
        })
      : [{
          emp: [], notas: [], buena: "", prot: "", h: 6.5,
          aviso: e.filmada ? { texto: "Sin calificar", color: C_AMBAR } : { texto: "Pendiente de filmar", color: C_GRIS_CLARO },
        }]
    const sumaTomas = renglones.reduce((a, r) => a + r.h, 0)
    if (sumaTomas < altoEscena) renglones[renglones.length - 1].h += altoEscena - sumaTomas
    const altoTotal = Math.max(sumaTomas, altoEscena)

    // Sección nueva o salto de página. La escena se mantiene junta si cabe en una hoja.
    const cabeEntera = altoTotal <= FONDO - MARGIN - 5.5 - 6
    if (sec !== actual) {
      if (actual !== null) y += 4
      if (y + 5.5 + 6 + (cabeEntera ? altoTotal : renglones[0].h) > FONDO) { doc.addPage(); y = MARGIN }
      abrirSeccion(e, false)
      actual = sec
    } else if (y + (cabeEntera ? altoTotal : renglones[0].h) > FONDO) {
      doc.addPage(); y = MARGIN
      abrirSeccion(e, true)
    }

    const fondoFila = fila % 2 === 0 ? C_FILA : C_FILA_ALT
    fila++

    // Dibuja la celda de la escena para un tramo de altura h (se repite si la escena cruza de página).
    const celdaEscena = (yy: number, h: number, continua: boolean) => {
      p.fondo(fondoFila); p.trazo(C_BORDE)
      doc.setLineWidth(0.1)
      doc.rect(X, yy, COLS[0].w + COLS[1].w, h, "FD")
      p.fuente("bold", 10); p.color(e.filmada ? C_VERDE : C_MORADO_TEXTO)
      doc.text(p.ajustar(ctx.numero(e), COLS[0].w - 3), X + 1.5, yy + 4.4)
      if (pos) {
        p.fuente("normal", 7); p.color(C_GRIS_CLARO)
        doc.text(pos, X + 1.5, yy + 7.6)
      }
      const cx = X + COLS[0].w + 1.5
      if (continua) {
        p.fuente("normal", 8); p.color(C_GRIS)
        doc.text("(continúa)", cx, yy + 4.1)
        return
      }
      p.fuente("bold", 8.5); p.color(C_TEXTO)
      doc.text(titulo, cx, yy + 4.1, { lineHeightFactor: 1.17 })
      let ty = yy + 4.1 + titulo.length * 3.5
      if (desc.length) {
        p.fuente("normal", 7.5); p.color(C_GRIS)
        doc.text(desc, cx, ty, { lineHeightFactor: 1.13 })
        ty += desc.length * 3
      }
      if (metaL.length) {
        p.fuente("normal", 7); p.color(C_GRIS_CLARO)
        doc.text(metaL, cx, ty, { lineHeightFactor: 1.15 })
      }
    }

    let inicioTramo = y
    let continua = false
    renglones.forEach((r, i) => {
      if (y + r.h > FONDO) {
        // La escena cruza de página: cierra el tramo y sigue en la siguiente.
        celdaEscena(inicioTramo, y - inicioTramo, continua)
        doc.addPage(); y = MARGIN
        abrirSeccion(e, true)
        inicioTramo = y
        continua = true
      }
      p.fondo(fondoFila); p.trazo(C_BORDE)
      doc.setLineWidth(0.1)
      doc.rect(xEmp, y, wTomas, r.h, "FD")
      if (r.aviso) {
        p.fuente("bold", 8.5); p.color(r.aviso.color)
        doc.text(r.aviso.texto, xEmp + 1.5, y + 4.2)
      } else {
        let cx = xEmp
        p.fuente("normal", 8.5); p.color(C_TEXTO)
        doc.text(r.emp, cx + 1.5, y + 4.2, { lineHeightFactor: 1.17 })
        cx += COLS[2].w
        if (r.buena) { p.fuente("bold", 10); p.color(C_VERDE) } else { p.fuente("normal", 9); p.color(C_BORDE) }
        doc.text(p.ajustar(r.buena || "—", COLS[3].w - 2), cx + COLS[3].w / 2, y + 4.4, { align: "center" })
        cx += COLS[3].w
        if (r.prot) { p.fuente("bold", 9.5); p.color(C_TEXTO) } else { p.fuente("normal", 9); p.color(C_BORDE) }
        doc.text(p.ajustar(r.prot || "—", COLS[4].w - 2), cx + COLS[4].w / 2, y + 4.4, { align: "center" })
        cx += COLS[4].w
        if (r.notas.length) {
          p.fuente("normal", 8); p.color(C_TEXTO)
          doc.text(r.notas, cx + 1.5, y + 4.2, { lineHeightFactor: 1.17 })
        }
      }
      y += r.h
      if (i === renglones.length - 1) celdaEscena(inicioTramo, y - inicioTramo, continua)
    })
  }

  if (!lista.length) {
    p.color(C_GRIS); p.fuente("normal", 10)
    doc.text("Este plan todavía no tiene escenas.", X, y + 6)
  }

  pie(doc, p, `Reporte de tomas buenas (${tituloOrden}) · ${proyecto}`)
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
