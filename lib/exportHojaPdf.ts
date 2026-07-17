// Import nombrado: es idéntico al default en el build de navegador, pero además
// funciona en Node (el build CJS no tiene default), lo que permite probar la
// generación del PDF fuera de la app.
import { jsPDF } from "jspdf"

// ─── Types (mirror HojaLlamadoPanel) ─────────────────────────────────────────

export type CrewRowPDF = {
  puesto: string
  nombre: string
  retro: string
  locacion: string
  pickup: string
  notas: string
}

export type CastRowPDF = {
  num: string
  nombre: string
  on_loc: string
  makeup: string
  hairdress: string
  wardrobe: string
  on_set: string
  ensayo: string
  toma: string
  notas: string
}

export type LocacionRowPDF = {
  locacion: string
  cap: string
  horario: string
  accion: string
  pag: string
  notas: string
}

export type HojaPDFData = {
  fecha_rodaje: string
  titulo: string
  dia_num: number
  dia_total: number
  avanzada: string
  client_on_loc: string
  director: string
  productor: string
  ready_to_shoot: string
  direcciones: { nombre: string; url: string }[]
  amanecer: string
  atardecer: string
  clima: string
  lluvia: string
  locaciones: LocacionRowPDF[]
  cast_list: CastRowPDF[]
  crew: CrewRowPDF[]
  arte_needs: string
  makeup_needs: string
  vestuario_needs: string
  efectos_needs: string
  vehiculos: string
  equipo_especial: string
  notas_produccion: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_W = 215.9
const PAGE_H = 279.4
const MARGIN = 10
const CONTENT_W = PAGE_W - MARGIN * 2

// El contenido NO se encoge para caber en una hoja: el texto va siempre al
// tamaño normal y cuando ya no cabe se abre otra página tamaño carta. Este es
// el límite inferior de contenido (deja espacio para el pie de página).
const BOTTOM_LIMIT = PAGE_H - MARGIN - 8

// Tope de líneas por celda: alto a propósito — equivale a "no cortar nada",
// solo protege contra un texto absurdamente largo.
const MAX_CELL_LINES = 60

const C_BG_HEADER   = "#1a0a3e"
const C_PURPLE      = "#7c3aed"
const C_TEXT        = "#1e293b"
const C_MUTED       = "#64748b"
const C_ROW_ALT     = "#f8fafc"
const C_ROW         = "#ffffff"
const C_BORDER      = "#e2e8f0"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}
function setBg(doc: jsPDF, hex: string)    { doc.setFillColor(...hexToRgb(hex)) }
function setColor(doc: jsPDF, hex: string) { doc.setTextColor(...hexToRgb(hex)) }
function setDraw(doc: jsPDF, hex: string)  { doc.setDrawColor(...hexToRgb(hex)) }

function formatDate(s: string): string {
  if (!s) return ""
  const [y, m, d] = s.split("-")
  if (!y || !m || !d) return s
  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
  return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`
}

// Si lo que sigue no cabe antes del pie de página, abre una página nueva.
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= BOTTOM_LIMIT) return y
  doc.addPage()
  return MARGIN
}

// Draw table with page breaks: cada fila crece según sus líneas y si una fila
// ya no cabe, se abre otra página repitiendo los encabezados de la tabla.
function drawTable(
  doc: jsPDF,
  x: number, y: number,
  tableW: number,
  cols: { header: string; width: number; align?: "left"|"center"|"right"; bgHex?: string }[],
  rows: string[][],
  rowH = 6.5,
): number {
  const headerH = 6
  const fs      = 8.5
  const lineH   = 3.4

  const drawHeader = (yy: number): number => {
    let cx = x
    setDraw(doc, C_BORDER)
    doc.setLineWidth(0.1)
    for (const col of cols) {
      setBg(doc, col.bgHex || "#334155")
      doc.rect(cx, yy, col.width, headerH, "F")
      setColor(doc, "#ffffff")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(fs)
      const tx = col.align === "center" ? cx + col.width/2 : col.align === "right" ? cx + col.width - 1.5 : cx + 1.5
      doc.text(col.header, tx, yy + headerH/2 + 2, { align: col.align || "left" })
      cx += col.width
    }
    return yy + headerH
  }

  y = ensureSpace(doc, y, headerH + rowH)
  y = drawHeader(y)

  for (let ri = 0; ri < rows.length; ri++) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(fs)
    // Envolver cada celda a su ancho: el texto completo, sin cortar.
    const cellLines = cols.map((col, ci) =>
      doc.splitTextToSize(rows[ri][ci] || "", col.width - 3).slice(0, MAX_CELL_LINES))
    const nLines = Math.max(1, ...cellLines.map((l) => l.length))
    const rH = nLines <= 1 ? rowH : Math.max(rowH, nLines * lineH + 2.4)

    if (y + rH > BOTTOM_LIMIT) {
      doc.addPage()
      y = drawHeader(MARGIN)
    }

    let cx = x
    setBg(doc, ri % 2 === 0 ? C_ROW : C_ROW_ALT)
    doc.rect(x, y, tableW, rH, "F")
    setDraw(doc, C_BORDER)
    doc.setLineWidth(0.1)
    doc.rect(x, y, tableW, rH, "S")

    for (let ci = 0; ci < cols.length; ci++) {
      const col   = cols[ci]
      const lines = cellLines[ci]
      setColor(doc, C_TEXT)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(fs)
      const tx = col.align === "center" ? cx + col.width/2 : col.align === "right" ? cx + col.width - 1.5 : cx + 1.5
      if (lines.length <= 1) {
        doc.text(lines[0] || "", tx, y + rH/2 + 1.8, { align: col.align || "left" })
      } else {
        for (let li = 0; li < lines.length; li++) {
          doc.text(lines[li], tx, y + lineH + li*lineH, { align: col.align || "left" })
        }
      }
      cx += col.width
    }
    y += rH
  }
  return y
}

function sectionBar(doc: jsPDF, x: number, y: number, w: number, title: string): number {
  const h = 5.5
  setBg(doc, C_PURPLE)
  doc.rect(x, y, w, h, "F")
  setColor(doc, "#ffffff")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9.5)
  doc.text(title.toUpperCase(), x + 2, y + 3.8)
  return y + h
}

function kv(doc: jsPDF, x: number, y: number, w: number, label: string, value: string, h = 9) {
  setBg(doc, "#f1f5f9")
  setDraw(doc, C_BORDER)
  doc.setLineWidth(0.1)
  doc.rect(x, y, w, h, "FD")

  setColor(doc, C_MUTED)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7)
  doc.text(label.toUpperCase(), x + 1.5, y + 3)

  setColor(doc, C_TEXT)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9.5)
  const lines = doc.splitTextToSize(value || "—", w - 3)
  doc.text(lines[0] || "—", x + 1.5, y + 6.5)
}

// Fila de cajas etiqueta+texto (Necesidades / Logística): la altura crece con
// el texto más largo de la fila para que nada se corte.
function boxRow(
  doc: jsPDF,
  x: number, y: number, W: number,
  items: { label: string; value: string }[],
): number {
  const boxW  = W / items.length
  const lineH = 3.6
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  const linesPerBox = items.map((it) =>
    doc.splitTextToSize(it.value || "—", boxW - 3).slice(0, MAX_CELL_LINES))
  const maxLines = Math.max(1, ...linesPerBox.map((l) => l.length))
  const boxH = 7.5 + maxLines * lineH + 1.5

  y = ensureSpace(doc, y, boxH)
  for (let i = 0; i < items.length; i++) {
    const nx = x + i * boxW
    setBg(doc, i % 2 === 0 ? C_ROW : C_ROW_ALT)
    setDraw(doc, C_BORDER)
    doc.setLineWidth(0.1)
    doc.rect(nx, y, boxW, boxH, "FD")
    setColor(doc, C_MUTED)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.text(items[i].label.toUpperCase(), nx + 1.5, y + 3.5)
    setColor(doc, C_TEXT)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.text(linesPerBox[i], nx + 1.5, y + 7.5)
  }
  return y + boxH
}

// ─── Fetch image ──────────────────────────────────────────────────────────────

async function fetchImageBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url)
    const blob = await resp.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function buildHojaDoc(data: HojaPDFData): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" })
  const x = MARGIN
  const W = CONTENT_W

  // ── Header: altura FIJA según la proporción real de la imagen (a ancho
  // completo, solo en la primera página).
  const headerDataUrl = await fetchImageBase64("/pdf-header-detail.jpg")
  let headerImgH = 30
  if (headerDataUrl) {
    try {
      const p = doc.getImageProperties(headerDataUrl)
      if (p?.width && p?.height) headerImgH = PAGE_W * (p.height / p.width)
    } catch { headerImgH = 30 }
  }

  let y = 0

  // ── Header image ────────────────────────────────────────────────
  if (headerDataUrl) {
    doc.addImage(headerDataUrl, "JPEG", 0, 0, PAGE_W, headerImgH)
  } else {
    setBg(doc, C_BG_HEADER)
    doc.rect(0, 0, PAGE_W, headerImgH, "F")
    setColor(doc, "#ffffff")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.text("RETRO CASA PRODUCTORA", x + 3, 12)
  }

  // Día X / Y
  const centerX = PAGE_W / 2
  setColor(doc, "#ffffff")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(22)
  doc.text(`DÍA ${data.dia_num}`, centerX, headerImgH/2 - 1, { align: "center" })
  setColor(doc, "#a78bfa")
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.text(`de ${data.dia_total}`, centerX, headerImgH/2 + 6, { align: "center" })

  y = headerImgH + 4

  // ── Info strip ──────────────────────────────────────────────────
  setBg(doc, "#7c3aed")
  doc.rect(x, y, W, 8, "F")
  setColor(doc, "#ede9fe")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text(formatDate(data.fecha_rodaje) || "Fecha no definida", x + 3, y + 5)
  setColor(doc, "#ffffff")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text(data.titulo || "Sin título", x + W/2, y + 5, { align: "center" })

  y += 10

  // ── KV grid ─────────────────────────────────────────────────────
  const kvH  = 9
  const col5 = W / 5
  kv(doc, x,            y, col5, "Avanzada",       data.avanzada,       kvH)
  kv(doc, x + col5,     y, col5, "Client on loc",  data.client_on_loc,  kvH)
  kv(doc, x + col5*2,   y, col5, "Ready to shoot", data.ready_to_shoot, kvH)
  kv(doc, x + col5*3,   y, col5, "Director",       data.director,       kvH)
  kv(doc, x + col5*4,   y, col5, "Productor",      data.productor,      kvH)
  y += kvH

  const dirs = data.direcciones.length > 0 ? data.direcciones : [{ nombre: "", url: "" }]
  const locW = W * 0.62
  const urlW = W - locW
  for (const dir of dirs) {
    y = ensureSpace(doc, y, kvH)
    kv(doc, x,        y, locW, "Locación",   dir.nombre, kvH)
    kv(doc, x + locW, y, urlW, "URL / Maps", dir.url,    kvH)
    y += kvH
  }

  y = ensureSpace(doc, y, kvH)
  const col4 = W / 4
  kv(doc, x,            y, col4, "Amanecer",     data.amanecer,  kvH)
  kv(doc, x + col4,     y, col4, "Atardecer",    data.atardecer, kvH)
  kv(doc, x + col4*2,   y, col4, "Clima",        data.clima,     kvH)
  kv(doc, x + col4*3,   y, col4, "Prob. lluvia", data.lluvia,    kvH)
  y += kvH + 3

  // Una sección nunca deja su barra huérfana al fondo: si no cabe la barra
  // más un par de filas, todo arranca en la página siguiente.
  const startSection = (title: string): void => {
    y = ensureSpace(doc, y, 5.5 + 1 + 6 + 2 * 6.5)
    y = sectionBar(doc, x, y, W, title)
    y += 1
  }

  // ── Locaciones ──────────────────────────────────────────────────
  const locRows = data.locaciones.filter((r) => r.locacion || r.accion)
  if (locRows.length > 0) {
    startSection("Locaciones")
    const locCols = [
      { header: "Locación",        width: W*0.25 },
      { header: "Cap.",            width: W*0.07, align: "center" as const },
      { header: "Horario",         width: W*0.13, align: "center" as const },
      { header: "Acción / Escena", width: W*0.28 },
      { header: "Pág.",            width: W*0.07, align: "center" as const },
      { header: "Notas",           width: W*0.20 },
    ]
    y = drawTable(doc, x, y, W, locCols, locRows.map((r) => [r.locacion, r.cap, r.horario, r.accion, r.pag, r.notas]))
    y += 3
  }

  // ── Cast ────────────────────────────────────────────────────────
  const castRows = data.cast_list.filter((r) => r.nombre)
  if (castRows.length > 0) {
    startSection("Cast")
    const castCols = [
      { header: "#",         width: W*0.04, align: "center" as const },
      { header: "Nombre",    width: W*0.16 },
      { header: "On loc.",   width: W*0.07, align: "center" as const },
      { header: "Makeup",    width: W*0.07, align: "center" as const },
      { header: "Hairdress", width: W*0.085, align: "center" as const },
      { header: "Wardrobe",  width: W*0.085, align: "center" as const },
      { header: "On set",    width: W*0.07, align: "center" as const },
      { header: "Ensayo",    width: W*0.07, align: "center" as const },
      { header: "Toma",      width: W*0.07, align: "center" as const },
      { header: "Notas",     width: W*0.28 },
    ]
    y = drawTable(doc, x, y, W, castCols,
      castRows.map((r, i) => [r.num||String(i+1), r.nombre, r.on_loc, r.makeup, r.hairdress, r.wardrobe, r.on_set, r.ensayo, r.toma, r.notas]))
    y += 3
  }

  // ── Crew: SIEMPRE a una sola columna, con notas y sin cortar nombres.
  // Si el crew es largo, la tabla continúa en la(s) siguiente(s) página(s).
  const crewRows = data.crew.filter((r) => r.nombre || r.puesto)
  if (crewRows.length > 0) {
    startSection("Crew List")
    const crewCols = [
      { header: "#",        width: W*0.04, align: "center" as const },
      { header: "Puesto",   width: W*0.22 },
      { header: "Nombre",   width: W*0.24 },
      { header: "RETRO",    width: W*0.10, align: "center" as const, bgHex: "#4c1d95" },
      { header: "LOCACIÓN", width: W*0.10, align: "center" as const, bgHex: "#0c4a6e" },
      { header: "PICKUP",   width: W*0.10, align: "center" as const, bgHex: "#064e3b" },
      { header: "Notas",    width: W*0.20 },
    ]
    y = drawTable(doc, x, y, W, crewCols,
      crewRows.map((r, i) => [String(i+1), r.puesto, r.nombre, r.retro||"—", r.locacion||"—", r.pickup||"—", r.notas]))
    y += 3
  }

  // ── Necesidades ─────────────────────────────────────────────────
  const needsData = [
    { label: "Arte / Set dressing", value: data.arte_needs },
    { label: "Maquillaje / Peinado", value: data.makeup_needs },
    { label: "Vestuario",            value: data.vestuario_needs },
    { label: "Efectos especiales",   value: data.efectos_needs },
  ]
  const hasNeeds = needsData.some((n) => n.value?.trim())
  if (hasNeeds) {
    startSection("Necesidades")
    y = boxRow(doc, x, y, W, needsData)
    y += 3
  }

  // ── Logística y notas ───────────────────────────────────────────
  const hasLogistica = !!(data.vehiculos || data.equipo_especial || data.notas_produccion)
  if (hasLogistica) {
    startSection("Logística y notas de producción")
    y = boxRow(doc, x, y, W, [
      { label: "Vehículos",            value: data.vehiculos },
      { label: "Equipo especial",      value: data.equipo_especial },
      { label: "Notas de producción",  value: data.notas_produccion },
    ])
    y += 3
  }

  // ── Footer en todas las páginas, con numeración real ────────────
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const footerY = PAGE_H - MARGIN - 4
    setDraw(doc, "#e2e8f0")
    doc.setLineWidth(0.3)
    doc.line(x, footerY, x + W, footerY)
    setColor(doc, "#94a3b8")
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.text("RETRO CASA PRODUCTORA — Documento de uso interno", x, footerY + 3)
    doc.text(`Pág. ${p} / ${totalPages}`, x + W, footerY + 3, { align: "right" })
  }

  return doc
}

export async function exportHojaPdf(data: HojaPDFData, _projectName?: string) {
  const doc = await buildHojaDoc(data)
  const slug  = (data.titulo || "hoja-de-llamado").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
  const fecha = data.fecha_rodaje ? data.fecha_rodaje.replace(/-/g, "") : "sin-fecha"
  doc.save(`hoja-llamado_${slug}_${fecha}_dia${data.dia_num}.pdf`)
}
