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

// ─── Constants (base dimensions at scale=1) ───────────────────────────────────

const PAGE_W = 215.9
const PAGE_H = 279.4
const MARGIN = 10
const CONTENT_W = PAGE_W - MARGIN * 2

// Si el crew supera este número de filas, se divide en 2 columnas (mitad y
// mitad) para reducir la altura y que todo quede más grande en la hoja.
const CREW_SPLIT_THRESHOLD = 16

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

// Draw table — all base dimensions are pre-scaled by caller
function drawTable(
  doc: jsPDF,
  x: number, y: number,
  tableW: number,
  cols: { header: string; width: number; align?: "left"|"center"|"right"; bgHex?: string }[],
  rows: string[][],
  scale: number,
  rowH = 6.5,
): number {
  const headerH = 6 * scale
  const rH      = rowH * scale
  const fs       = 6.5 * scale

  let cx = x
  setBg(doc, "#334155")
  setDraw(doc, C_BORDER)
  doc.setLineWidth(0.1)

  for (const col of cols) {
    setBg(doc, col.bgHex || "#334155")
    doc.rect(cx, y, col.width, headerH, "F")
    setColor(doc, "#ffffff")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(fs)
    const tx = col.align === "center" ? cx + col.width/2 : col.align === "right" ? cx + col.width - 1.5*scale : cx + 1.5*scale
    doc.text(col.header, tx, y + headerH/2 + 2*scale, { align: col.align || "left" })
    cx += col.width
  }
  y += headerH

  for (let ri = 0; ri < rows.length; ri++) {
    cx = x
    setBg(doc, ri % 2 === 0 ? C_ROW : C_ROW_ALT)
    doc.rect(x, y, tableW, rH, "F")
    setDraw(doc, C_BORDER)
    doc.setLineWidth(0.1)
    doc.rect(x, y, tableW, rH, "S")

    for (let ci = 0; ci < cols.length; ci++) {
      const col  = cols[ci]
      const cell = rows[ri][ci] || ""
      setColor(doc, C_TEXT)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(fs)
      const maxW = col.width - 3*scale
      const lines = doc.splitTextToSize(cell, maxW)
      const tx = col.align === "center" ? cx + col.width/2 : col.align === "right" ? cx + col.width - 1.5*scale : cx + 1.5*scale
      doc.text(lines[0] || "", tx, y + rH/2 + 1.8*scale, { align: col.align || "left" })
      cx += col.width
    }
    y += rH
  }
  return y
}

function sectionBar(doc: jsPDF, x: number, y: number, w: number, title: string, scale: number): number {
  const h = 5.5 * scale
  setBg(doc, C_PURPLE)
  doc.rect(x, y, w, h, "F")
  setColor(doc, "#ffffff")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5 * scale)
  doc.text(title.toUpperCase(), x + 2*scale, y + 3.8*scale)
  return y + h
}

function kv(doc: jsPDF, x: number, y: number, w: number, label: string, value: string, scale: number, h = 9) {
  const sh = h * scale
  setBg(doc, "#f1f5f9")
  setDraw(doc, C_BORDER)
  doc.setLineWidth(0.1)
  doc.rect(x, y, w, sh, "FD")

  setColor(doc, C_MUTED)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(5.5 * scale)
  doc.text(label.toUpperCase(), x + 1.5*scale, y + 3*scale)

  setColor(doc, C_TEXT)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5 * scale)
  const lines = doc.splitTextToSize(value || "—", w - 3*scale)
  doc.text(lines[0] || "—", x + 1.5*scale, y + 6.5*scale)
}

// ─── Height estimator (base, scale=1) ────────────────────────────────────────

function estimateTotalHeight(data: HojaPDFData): number {
  const dirs      = data.direcciones.length > 0 ? data.direcciones : [{ nombre: "", url: "" }]
  const locRows   = data.locaciones.filter((r) => r.locacion || r.accion)
  const castRows  = data.cast_list.filter((r) => r.nombre)
  const crewRows  = data.crew.filter((r) => r.nombre || r.puesto)
  const hasNeeds  = [data.arte_needs, data.makeup_needs, data.vestuario_needs, data.efectos_needs].some(Boolean)
  const hasLog    = !!(data.vehiculos || data.equipo_especial || data.notas_produccion)

  let h = 0
  h += 30          // header image
  h += 4           // gap after header
  h += 8 + 2       // info strip
  h += 9           // KV row: avanzada/client/ready/director/productor
  h += dirs.length * 9   // direcciones
  h += 9           // clima row
  h += 3           // gap

  if (locRows.length > 0)  h += 5.5 + 1 + 6 + locRows.length  * 6.5 + 3
  if (castRows.length > 0) h += 5.5 + 1 + 6 + castRows.length * 6.5 + 3
  if (crewRows.length > 0) {
    // En 2 columnas la altura es la de la columna más larga (la mitad).
    const crewLines = crewRows.length > CREW_SPLIT_THRESHOLD ? Math.ceil(crewRows.length / 2) : crewRows.length
    h += 5.5 + 1 + 6 + crewLines * 6.5 + 3
  }
  if (hasNeeds)            h += 5.5 + 1 + 22 + 3
  if (hasLog)              h += 5.5 + 1 + 18 + 3

  h += MARGIN + 4 + 3  // footer
  return h
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
  // Compute scale so everything fits on one page
  const estimatedH = estimateTotalHeight(data)
  const scale      = Math.min(1, (PAGE_H - 2) / estimatedH)

  const s = (n: number) => n * scale   // scale a base dimension

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" })

  const headerDataUrl  = await fetchImageBase64("/pdf-header-detail.png")
  const headerImgH     = s(30)

  let y = 0
  const x = MARGIN
  const W = CONTENT_W

  // ── Header image ────────────────────────────────────────────────
  if (headerDataUrl) {
    doc.addImage(headerDataUrl, "PNG", 0, 0, PAGE_W, headerImgH)
  } else {
    setBg(doc, C_BG_HEADER)
    doc.rect(0, 0, PAGE_W, headerImgH, "F")
    setColor(doc, "#ffffff")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(s(11))
    doc.text("RETRO CASA PRODUCTORA", x + s(3), s(12))
  }

  // Día X / Y
  const centerX = PAGE_W / 2
  setColor(doc, "#ffffff")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(s(22))
  doc.text(`DÍA ${data.dia_num}`, centerX, headerImgH/2 - s(1), { align: "center" })
  setColor(doc, "#a78bfa")
  doc.setFont("helvetica", "normal")
  doc.setFontSize(s(8))
  doc.text(`de ${data.dia_total}`, centerX, headerImgH/2 + s(6), { align: "center" })

  y = headerImgH + s(4)

  // ── Info strip ──────────────────────────────────────────────────
  setBg(doc, "#7c3aed")
  doc.rect(x, y, W, s(8), "F")
  setColor(doc, "#ede9fe")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(s(8))
  doc.text(formatDate(data.fecha_rodaje) || "Fecha no definida", x + s(3), y + s(5))
  setColor(doc, "#ffffff")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(s(9))
  doc.text(data.titulo || "Sin título", x + W/2, y + s(5), { align: "center" })

  y += s(10)

  // ── KV grid ─────────────────────────────────────────────────────
  const kvH  = 9
  const col5 = W / 5
  kv(doc, x,            y, col5, "Avanzada",       data.avanzada,       scale, kvH)
  kv(doc, x + col5,     y, col5, "Client on loc",  data.client_on_loc,  scale, kvH)
  kv(doc, x + col5*2,   y, col5, "Ready to shoot", data.ready_to_shoot, scale, kvH)
  kv(doc, x + col5*3,   y, col5, "Director",       data.director,       scale, kvH)
  kv(doc, x + col5*4,   y, col5, "Productor",      data.productor,      scale, kvH)
  y += s(kvH)

  const dirs = data.direcciones.length > 0 ? data.direcciones : [{ nombre: "", url: "" }]
  const locW = W * 0.62
  const urlW = W - locW
  for (const dir of dirs) {
    kv(doc, x,        y, locW, "Locación",   dir.nombre, scale, kvH)
    kv(doc, x + locW, y, urlW, "URL / Maps", dir.url,    scale, kvH)
    y += s(kvH)
  }

  const col4 = W / 4
  kv(doc, x,            y, col4, "Amanecer",     data.amanecer,  scale, kvH)
  kv(doc, x + col4,     y, col4, "Atardecer",    data.atardecer, scale, kvH)
  kv(doc, x + col4*2,   y, col4, "Clima",        data.clima,     scale, kvH)
  kv(doc, x + col4*3,   y, col4, "Prob. lluvia", data.lluvia,    scale, kvH)
  y += s(kvH) + s(3)

  // ── Locaciones ──────────────────────────────────────────────────
  const locRows = data.locaciones.filter((r) => r.locacion || r.accion)
  if (locRows.length > 0) {
    y = sectionBar(doc, x, y, W, "Locaciones", scale)
    y += s(1)
    const locCols = [
      { header: "Locación",        width: W*0.25 },
      { header: "Cap.",            width: W*0.07, align: "center" as const },
      { header: "Horario",         width: W*0.13, align: "center" as const },
      { header: "Acción / Escena", width: W*0.28 },
      { header: "Pág.",            width: W*0.07, align: "center" as const },
      { header: "Notas",           width: W*0.20 },
    ]
    y = drawTable(doc, x, y, W, locCols, locRows.map((r) => [r.locacion, r.cap, r.horario, r.accion, r.pag, r.notas]), scale)
    y += s(3)
  }

  // ── Cast ────────────────────────────────────────────────────────
  const castRows = data.cast_list.filter((r) => r.nombre)
  if (castRows.length > 0) {
    y = sectionBar(doc, x, y, W, "Cast", scale)
    y += s(1)
    const castCols = [
      { header: "#",         width: W*0.04, align: "center" as const },
      { header: "Nombre",    width: W*0.18 },
      { header: "On loc.",   width: W*0.08, align: "center" as const },
      { header: "Makeup",    width: W*0.08, align: "center" as const },
      { header: "Hairdress", width: W*0.09, align: "center" as const },
      { header: "Wardrobe",  width: W*0.09, align: "center" as const },
      { header: "On set",    width: W*0.08, align: "center" as const },
      { header: "Ensayo",    width: W*0.08, align: "center" as const },
      { header: "Toma",      width: W*0.08, align: "center" as const },
      { header: "Notas",     width: W*0.20 },
    ]
    y = drawTable(doc, x, y, W, castCols,
      castRows.map((r, i) => [r.num||String(i+1), r.nombre, r.on_loc, r.makeup, r.hairdress, r.wardrobe, r.on_set, r.ensayo, r.toma, r.notas]),
      scale)
    y += s(3)
  }

  // ── Crew ────────────────────────────────────────────────────────
  const crewRows = data.crew.filter((r) => r.nombre || r.puesto)
  if (crewRows.length > 0) {
    y = sectionBar(doc, x, y, W, "Crew List", scale)
    y += s(1)

    if (crewRows.length > CREW_SPLIT_THRESHOLD) {
      // Crew largo → 2 columnas (mitad izquierda / mitad derecha) para ganar
      // altura. Se omite "Notas" por espacio; las 3 horas (RETRO/LOC/PICK) sí.
      const gap  = 4
      const colW = (W - gap) / 2
      const half = Math.ceil(crewRows.length / 2)
      const cols2 = (cw: number) => [
        { header: "#",      width: cw*0.06, align: "center" as const },
        { header: "Puesto", width: cw*0.30 },
        { header: "Nombre", width: cw*0.28 },
        { header: "RETRO",  width: cw*0.12, align: "center" as const, bgHex: "#4c1d95" },
        { header: "LOC.",   width: cw*0.12, align: "center" as const, bgHex: "#0c4a6e" },
        { header: "PICK.",  width: cw*0.12, align: "center" as const, bgHex: "#064e3b" },
      ]
      const toRow = (r: CrewRowPDF, n: number) =>
        [String(n), r.puesto, r.nombre, r.retro||"—", r.locacion||"—", r.pickup||"—"]
      const yL = drawTable(doc, x, y, colW, cols2(colW),
        crewRows.slice(0, half).map((r, i) => toRow(r, i + 1)), scale)
      const yR = drawTable(doc, x + colW + gap, y, colW, cols2(colW),
        crewRows.slice(half).map((r, i) => toRow(r, half + i + 1)), scale)
      y = Math.max(yL, yR) + s(3)
    } else {
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
        crewRows.map((r, i) => [String(i+1), r.puesto, r.nombre, r.retro||"—", r.locacion||"—", r.pickup||"—", r.notas]),
        scale)
      y += s(3)
    }
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
    y = sectionBar(doc, x, y, W, "Necesidades", scale)
    y += s(1)
    const needW = W / 4
    const needH = s(22)
    for (let i = 0; i < needsData.length; i++) {
      const nd = needsData[i]
      const nx = x + i * needW
      setBg(doc, i % 2 === 0 ? C_ROW : C_ROW_ALT)
      setDraw(doc, C_BORDER)
      doc.setLineWidth(0.1)
      doc.rect(nx, y, needW, needH, "FD")
      setColor(doc, C_MUTED)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(s(6))
      doc.text(nd.label.toUpperCase(), nx + s(1.5), y + s(3.5))
      setColor(doc, C_TEXT)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(s(7))
      const lines = doc.splitTextToSize(nd.value || "—", needW - s(3))
      doc.text(lines.slice(0, 4), nx + s(1.5), y + s(7.5))
    }
    y += needH + s(3)
  }

  // ── Logística y notas ───────────────────────────────────────────
  const hasLogistica = !!(data.vehiculos || data.equipo_especial || data.notas_produccion)
  if (hasLogistica) {
    y = sectionBar(doc, x, y, W, "Logística y notas de producción", scale)
    y += s(1)
    const col3 = W / 3
    const logH = s(18)
    const logItems = [
      { label: "Vehículos",            value: data.vehiculos },
      { label: "Equipo especial",      value: data.equipo_especial },
      { label: "Notas de producción",  value: data.notas_produccion },
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
      doc.setFontSize(s(6))
      doc.text(item.label.toUpperCase(), lx + s(1.5), y + s(3.5))
      setColor(doc, C_TEXT)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(s(7))
      const lines = doc.splitTextToSize(item.value || "—", col3 - s(3))
      doc.text(lines.slice(0, 3), lx + s(1.5), y + s(7.5))
    }
    y += logH + s(3)
  }

  // ── Footer ──────────────────────────────────────────────────────
  const footerY = PAGE_H - MARGIN - 4
  setDraw(doc, "#e2e8f0")
  doc.setLineWidth(0.3)
  doc.line(x, footerY, x + W, footerY)
  setColor(doc, "#94a3b8")
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6)
  doc.text("RETRO CASA PRODUCTORA — Documento de uso interno", x, footerY + 3)
  doc.text("Pág. 1 / 1", x + W, footerY + 3, { align: "right" })

  return doc
}

export async function exportHojaPdf(data: HojaPDFData, _projectName?: string) {
  const doc = await buildHojaDoc(data)
  const slug  = (data.titulo || "hoja-de-llamado").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
  const fecha = data.fecha_rodaje ? data.fecha_rodaje.replace(/-/g, "") : "sin-fecha"
  doc.save(`hoja-llamado_${slug}_${fecha}_dia${data.dia_num}.pdf`)
}
