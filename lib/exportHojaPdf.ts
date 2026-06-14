import jsPDF from "jspdf"

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
  // Header
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
  // Clima
  amanecer: string
  atardecer: string
  clima: string
  lluvia: string
  // Tables
  locaciones: LocacionRowPDF[]
  cast_list: CastRowPDF[]
  crew: CrewRowPDF[]
  // Needs
  arte_needs: string
  makeup_needs: string
  vestuario_needs: string
  efectos_needs: string
  // Bottom
  vehiculos: string
  equipo_especial: string
  notas_produccion: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_W = 215.9  // Letter width mm
const PAGE_H = 279.4  // Letter height mm
const MARGIN = 10
const CONTENT_W = PAGE_W - MARGIN * 2

// Colors
const C_BG_HEADER = "#1a0a3e"     // deep purple header
const C_PURPLE = "#7c3aed"
const C_PURPLE_LIGHT = "#ede9fe"
const C_RETRO = "#4c1d95"         // RETRO col header
const C_LOC = "#0c4a6e"           // LOCACIÓN col header
const C_PICKUP = "#064e3b"        // PICKUP col header
const C_TEXT = "#1e293b"
const C_MUTED = "#64748b"
const C_ROW_ALT = "#f8fafc"
const C_ROW = "#ffffff"
const C_BORDER = "#e2e8f0"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return [r, g, b]
}

function setBg(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex)
  doc.setFillColor(r, g, b)
}

function setColor(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex)
  doc.setTextColor(r, g, b)
}

function setDraw(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex)
  doc.setDrawColor(r, g, b)
}

function formatDate(s: string): string {
  if (!s) return ""
  const [y, m, d] = s.split("-")
  if (!y || !m || !d) return s
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`
}

// Draw a simple table. Returns the Y position after the table.
function drawTable(
  doc: jsPDF,
  x: number,
  y: number,
  tableW: number,
  cols: { header: string; width: number; align?: "left" | "center" | "right"; bgHex?: string }[],
  rows: string[][],
  rowH = 6.5
): number {
  const headerH = 6

  // Header row
  let cx = x
  setBg(doc, "#334155")
  setDraw(doc, C_BORDER)
  doc.setLineWidth(0.1)

  for (const col of cols) {
    const bg = col.bgHex || "#334155"
    setBg(doc, bg)
    doc.rect(cx, y, col.width, headerH, "F")
    setColor(doc, "#ffffff")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(6.5)
    const tx = col.align === "center" ? cx + col.width / 2 : col.align === "right" ? cx + col.width - 1.5 : cx + 1.5
    const ta = col.align || "left"
    doc.text(col.header, tx, y + headerH / 2 + 2, { align: ta })
    cx += col.width
  }

  y += headerH

  // Data rows
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri]
    cx = x
    const bg = ri % 2 === 0 ? C_ROW : C_ROW_ALT
    setBg(doc, bg)
    doc.rect(x, y, tableW, rowH, "F")

    // Border
    setDraw(doc, C_BORDER)
    doc.setLineWidth(0.1)
    doc.rect(x, y, tableW, rowH, "S")

    for (let ci = 0; ci < cols.length; ci++) {
      const col = cols[ci]
      const cell = row[ci] || ""
      setColor(doc, C_TEXT)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(6.5)
      const maxW = col.width - 3
      const lines = doc.splitTextToSize(cell, maxW)
      const tx = col.align === "center" ? cx + col.width / 2 : col.align === "right" ? cx + col.width - 1.5 : cx + 1.5
      const ta = col.align || "left"
      doc.text(lines[0] || "", tx, y + rowH / 2 + 1.8, { align: ta })
      cx += col.width
    }
    y += rowH
  }

  return y
}

// Draw a section title bar
function sectionBar(doc: jsPDF, x: number, y: number, w: number, title: string): number {
  setBg(doc, C_PURPLE)
  doc.rect(x, y, w, 5.5, "F")
  setColor(doc, "#ffffff")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.text(title.toUpperCase(), x + 2, y + 3.8)
  return y + 5.5
}

// Draw a KV pair (label: value) in a cell
function kv(doc: jsPDF, x: number, y: number, w: number, label: string, value: string, h = 9) {
  setBg(doc, "#f1f5f9")
  setDraw(doc, C_BORDER)
  doc.setLineWidth(0.1)
  doc.rect(x, y, w, h, "FD")

  setColor(doc, C_MUTED)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(5.5)
  doc.text(label.toUpperCase(), x + 1.5, y + 3)

  setColor(doc, C_TEXT)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  const lines = doc.splitTextToSize(value || "—", w - 3)
  doc.text(lines[0] || "—", x + 1.5, y + 6.5)
}

// ─── Main export ──────────────────────────────────────────────────────────────

async function fetchImageBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url)
    const blob = await resp.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function exportHojaPdf(data: HojaPDFData, projectName?: string) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "letter",
  })

  const pageW = 215.9
  const headerImgH = 30
  const headerDataUrl = await fetchImageBase64("/pdf-header-detail.png")

  let y = 0
  const x = MARGIN
  const W = CONTENT_W

  // ═══════════════════════════════════════════════════════════════
  // HEADER IMAGE (full bleed, sin márgenes)
  // ═══════════════════════════════════════════════════════════════
  if (headerDataUrl) {
    doc.addImage(headerDataUrl, "PNG", 0, 0, pageW, headerImgH)
  } else {
    setBg(doc, C_BG_HEADER)
    doc.rect(0, 0, pageW, headerImgH, "F")
    setColor(doc, "#ffffff")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.text("RETRO CASA PRODUCTORA", x + 3, 12)
  }

  // Día X de Y — encima de la imagen, alineado a la derecha
  setColor(doc, "#ffffff")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(22)
  doc.text(`DÍA ${data.dia_num}`, x + W - 3, headerImgH - 12, { align: "right" })
  setColor(doc, "#a78bfa")
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.text(`de ${data.dia_total}`, x + W - 3, headerImgH - 6, { align: "right" })

  y = headerImgH + 4

  // ═══════════════════════════════════════════════════════════════
  // INFO STRIP: fecha | título
  // ═══════════════════════════════════════════════════════════════
  setBg(doc, "#7c3aed")
  doc.rect(x, y, W, 8, "F")
  setColor(doc, "#ede9fe")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  const fechaStr = formatDate(data.fecha_rodaje)
  doc.text(fechaStr || "Fecha no definida", x + 3, y + 5)

  setColor(doc, "#ffffff")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text(data.titulo || "Sin título", x + W / 2, y + 5, { align: "center" })

  y += 10

  // ═══════════════════════════════════════════════════════════════
  // KV GRID: Avanzada | Client on loc | Ready to shoot | Director | Productor
  // ═══════════════════════════════════════════════════════════════
  const kvH = 9
  const col5 = W / 5

  kv(doc, x,              y, col5, "Avanzada",      data.avanzada,      kvH)
  kv(doc, x + col5,       y, col5, "Client on loc", data.client_on_loc, kvH)
  kv(doc, x + col5 * 2,   y, col5, "Ready to shoot",data.ready_to_shoot,kvH)
  kv(doc, x + col5 * 3,   y, col5, "Director",      data.director,      kvH)
  kv(doc, x + col5 * 4,   y, col5, "Productor",     data.productor,     kvH)

  y += kvH

  // Direcciones (una o varias filas)
  const locW = W * 0.62
  const urlW = W - locW
  const dirs = data.direcciones.length > 0 ? data.direcciones : [{ nombre: "", url: "" }]
  for (const dir of dirs) {
    kv(doc, x,        y, locW, "Locación",   dir.nombre, kvH)
    kv(doc, x + locW, y, urlW, "URL / Maps", dir.url,    kvH)
    y += kvH
  }

  // Clima strip
  const col4 = W / 4
  kv(doc, x,            y, col4, "Amanecer",   data.amanecer, kvH)
  kv(doc, x + col4,     y, col4, "Atardecer",  data.atardecer, kvH)
  kv(doc, x + col4 * 2, y, col4, "Clima",      data.clima, kvH)
  kv(doc, x + col4 * 3, y, col4, "Prob. lluvia", data.lluvia, kvH)

  y += kvH + 3

  // ═══════════════════════════════════════════════════════════════
  // LOCACIONES TABLE
  // ═══════════════════════════════════════════════════════════════
  const locRows = data.locaciones.filter((r) => r.locacion || r.accion)
  if (locRows.length > 0) {
    y = sectionBar(doc, x, y, W, "Locaciones")
    y += 1
    const locCols = [
      { header: "Locación",       width: W * 0.25 },
      { header: "Cap.",           width: W * 0.07, align: "center" as const },
      { header: "Horario",        width: W * 0.13, align: "center" as const },
      { header: "Acción / Escena",width: W * 0.28 },
      { header: "Pág.",           width: W * 0.07, align: "center" as const },
      { header: "Notas",          width: W * 0.20 },
    ]
    const locData = locRows.map((r) => [r.locacion, r.cap, r.horario, r.accion, r.pag, r.notas])
    y = drawTable(doc, x, y, W, locCols, locData)
    y += 3
  }

  // ═══════════════════════════════════════════════════════════════
  // CAST TABLE
  // ═══════════════════════════════════════════════════════════════
  const castRows = data.cast_list.filter((r) => r.nombre)
  if (castRows.length > 0) {
    y = sectionBar(doc, x, y, W, "Cast")
    y += 1
    const castCols = [
      { header: "#",        width: W * 0.04, align: "center" as const },
      { header: "Nombre",   width: W * 0.18 },
      { header: "On loc.",  width: W * 0.08, align: "center" as const },
      { header: "Makeup",   width: W * 0.08, align: "center" as const },
      { header: "Hairdress",width: W * 0.09, align: "center" as const },
      { header: "Wardrobe", width: W * 0.09, align: "center" as const },
      { header: "On set",   width: W * 0.08, align: "center" as const },
      { header: "Ensayo",   width: W * 0.08, align: "center" as const },
      { header: "Toma",     width: W * 0.08, align: "center" as const },
      { header: "Notas",    width: W * 0.20 },
    ]
    const castData = castRows.map((r, i) => [
      r.num || String(i + 1), r.nombre, r.on_loc, r.makeup,
      r.hairdress, r.wardrobe, r.on_set, r.ensayo, r.toma, r.notas,
    ])
    y = drawTable(doc, x, y, W, castCols, castData)
    y += 3
  }

  // ═══════════════════════════════════════════════════════════════
  // CREW LIST
  // ═══════════════════════════════════════════════════════════════
  const crewRows = data.crew.filter((r) => r.nombre || r.puesto)
  if (crewRows.length > 0) {
    // Check if we need a new page
    const crewTableH = 6 + crewRows.length * 6.5 + 10
    if (y + crewTableH > PAGE_H - MARGIN) {
      doc.addPage()
      y = MARGIN
    }

    y = sectionBar(doc, x, y, W, "Crew List")
    y += 1

    const retroW = W * 0.10
    const locColW = W * 0.10
    const pickupW = W * 0.10
    const crewCols = [
      { header: "#",        width: W * 0.04, align: "center" as const },
      { header: "Puesto",   width: W * 0.22 },
      { header: "Nombre",   width: W * 0.24 },
      { header: "RETRO",    width: retroW,   align: "center" as const, bgHex: "#4c1d95" },
      { header: "LOCACIÓN", width: locColW,  align: "center" as const, bgHex: "#0c4a6e" },
      { header: "PICKUP",   width: pickupW,  align: "center" as const, bgHex: "#064e3b" },
      { header: "Notas",    width: W * 0.20 },
    ]
    const crewData = crewRows.map((r, i) => [
      String(i + 1), r.puesto, r.nombre, r.retro || "—", r.locacion || "—", r.pickup || "—", r.notas,
    ])
    y = drawTable(doc, x, y, W, crewCols, crewData)
    y += 3
  }

  // ═══════════════════════════════════════════════════════════════
  // NECESIDADES
  // ═══════════════════════════════════════════════════════════════
  const needsData = [
    { label: "Arte / Set dressing", value: data.arte_needs },
    { label: "Maquillaje / Peinado", value: data.makeup_needs },
    { label: "Vestuario", value: data.vestuario_needs },
    { label: "Efectos especiales", value: data.efectos_needs },
  ]
  const hasNeeds = needsData.some((n) => n.value && n.value.trim())

  if (hasNeeds) {
    // New page if near bottom
    if (y + 30 > PAGE_H - MARGIN) {
      doc.addPage()
      y = MARGIN
    }
    y = sectionBar(doc, x, y, W, "Necesidades")
    y += 1

    const needW = W / 4
    const needH = 22

    for (let i = 0; i < needsData.length; i++) {
      const nd = needsData[i]
      const nx = x + i * needW
      setBg(doc, i % 2 === 0 ? C_ROW : C_ROW_ALT)
      setDraw(doc, C_BORDER)
      doc.setLineWidth(0.1)
      doc.rect(nx, y, needW, needH, "FD")

      setColor(doc, C_MUTED)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(6)
      doc.text(nd.label.toUpperCase(), nx + 1.5, y + 3.5)

      setColor(doc, C_TEXT)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7)
      const lines = doc.splitTextToSize(nd.value || "—", needW - 3)
      doc.text(lines.slice(0, 4), nx + 1.5, y + 7.5)
    }
    y += needH + 3
  }

  // ═══════════════════════════════════════════════════════════════
  // LOGÍSTICA Y NOTAS
  // ═══════════════════════════════════════════════════════════════
  const hasLogistica = data.vehiculos || data.equipo_especial || data.notas_produccion
  if (hasLogistica) {
    if (y + 25 > PAGE_H - MARGIN) {
      doc.addPage()
      y = MARGIN
    }
    y = sectionBar(doc, x, y, W, "Logística y notas de producción")
    y += 1

    const col3 = W / 3
    const logH = 18

    const logItems = [
      { label: "Vehículos", value: data.vehiculos },
      { label: "Equipo especial", value: data.equipo_especial },
      { label: "Notas de producción", value: data.notas_produccion },
    ]

    for (let i = 0; i < logItems.length; i++) {
      const item = logItems[i]
      const lx = x + i * col3
      setBg(doc, i % 2 === 0 ? C_ROW : C_ROW_ALT)
      setDraw(doc, C_BORDER)
      doc.setLineWidth(0.1)
      doc.rect(lx, y, col3, logH, "FD")

      setColor(doc, C_MUTED)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(6)
      doc.text(item.label.toUpperCase(), lx + 1.5, y + 3.5)

      setColor(doc, C_TEXT)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7)
      const lines = doc.splitTextToSize(item.value || "—", col3 - 3)
      doc.text(lines.slice(0, 3), lx + 1.5, y + 7.5)
    }
    y += logH + 3
  }

  // ═══════════════════════════════════════════════════════════════
  // FOOTER
  // ═══════════════════════════════════════════════════════════════
  const footerY = PAGE_H - MARGIN - 4
  setDraw(doc, "#e2e8f0")
  doc.setLineWidth(0.3)
  doc.line(x, footerY, x + W, footerY)
  setColor(doc, "#94a3b8")
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6)
  doc.text("RETRO CASA PRODUCTORA — Documento de uso interno", x, footerY + 3)
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.text(`Pág. ${i} / ${pageCount}`, x + W, footerY + 3, { align: "right" })
  }

  // ─── Save ─────────────────────────────────────────────────────
  const slug = (data.titulo || "hoja-de-llamado").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
  const fecha = data.fecha_rodaje ? data.fecha_rodaje.replace(/-/g, "") : "sin-fecha"
  doc.save(`hoja-llamado_${slug}_${fecha}_dia${data.dia_num}.pdf`)
}
