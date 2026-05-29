// lib/exportQuotePdf.ts
// PDF de cotización orientado al cliente — márgenes ocultos, precios finales

export interface QuoteItemPDF {
  label: string
  qty: string
  days: string
  cost: string
  markup: string   // hidden — sólo para calcular precio final al cliente
  isInternal: boolean
  isCommission?: boolean
}

export interface QuoteRubroPDF {
  num: number
  label: string
  hexColor: string
  items: QuoteItemPDF[]
  financials: { gasto: number; utilidad: number; venta: number }
}

export interface QuotePDFData {
  quoteName: string
  atencion: string
  clientName: string
  projectName: string
  status: string
  date: string
  rubros: QuoteRubroPDF[]
  globalFinancials: { gasto: number; utilidad: number; venta: number }
  visibleMarkupPct: number  // markup global mostrado al cliente (quote.markup_percentage)
}

// ─── Tipos para exportar desde DB ────────────────────────────────────────────

export interface DBQuoteItem {
  description: string
  qty: number
  days: number
  unit_price: number       // costo real
  released_expense: number // markup % (oculto)
  real_expense: number     // 1 = recurso interno
  supplier: string | null
}

export interface DBQuoteSection {
  name: string
  order_index: number
  items: DBQuoteItem[]
}

export interface DBQuoteDetail {
  quote: { name: string; status: string; markup_percentage: number; atencion?: string }
  sections: DBQuoteSection[]
}

const RUBRO_COLOR_MAP: Record<string, string> = {
  "Preproducción": "#6366f1",
  "Personal Técnico": "#a78bfa",
  "Gastos de Producción": "#38bdf8",
  "Utilería y Vestuario": "#34d399",
  "Foro y Escenografía": "#fbbf24",
  "Renta de Equipo": "#fb923c",
  "Talento": "#f472b6",
  "Edición y Audio": "#818cf8",
  "Postproducción": "#c084fc",
}

export async function exportQuotePdfFromDetail(
  detail: DBQuoteDetail,
  clientName: string,
  projectName: string
): Promise<void> {
  const date = new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(new Date())

  const rubros: QuoteRubroPDF[] = detail.sections
    .slice()
    .sort((a, b) => a.order_index - b.order_index)
    .map((sec, idx) => {
      const items: QuoteItemPDF[] = sec.items.map((item) => ({
        label: item.description,
        qty: String(item.qty),
        days: String(item.days),
        cost: String(item.unit_price),
        markup: String(item.released_expense),
        isInternal: item.real_expense === 1,
      }))

      let gasto = 0
      let utilidad = 0
      for (const item of sec.items) {
        const amount = item.qty * item.days * item.unit_price
        if (item.real_expense === 1) {
          utilidad += amount
        } else {
          gasto += amount
          utilidad += amount * ((item.released_expense || 0) / 100)
        }
      }

      return {
        num: idx + 1,
        label: sec.name,
        hexColor: RUBRO_COLOR_MAP[sec.name] ?? "#6366f1",
        items,
        financials: { gasto, utilidad, venta: gasto + utilidad },
      }
    })

  const globalFinancials = rubros.reduce(
    (acc, r) => ({
      gasto: acc.gasto + r.financials.gasto,
      utilidad: acc.utilidad + r.financials.utilidad,
      venta: acc.venta + r.financials.venta,
    }),
    { gasto: 0, utilidad: 0, venta: 0 }
  )

  await exportQuotePdf({
    quoteName: detail.quote.name,
    atencion: detail.quote.atencion || "",
    clientName,
    projectName,
    status: detail.quote.status,
    date,
    rubros,
    globalFinancials,
    visibleMarkupPct: detail.quote.markup_percentage,
  })
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function rawAmt(qty: string, days: string, cost: string): number {
  return (parseFloat(qty) || 0) * (parseFloat(days) || 0) * (parseFloat(cost) || 0)
}

// Precio unitario que ve el cliente (markup oculto ya incluido)
function clientUnitPrice(item: QuoteItemPDF): number {
  const cost = parseFloat(item.cost) || 0
  if (item.isInternal) return cost
  return cost * (1 + (parseFloat(item.markup) || 0) / 100)
}

function fmt(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [100, 100, 200]
}

function lightBg(r: number, g: number, b: number): [number, number, number] {
  return [Math.round(r * 0.12 + 240), Math.round(g * 0.12 + 240), Math.round(b * 0.12 + 240)]
}

async function fetchImageBase64(
  url: string
): Promise<{ dataUrl: string; w: number; h: number }> {
  try {
    const resp = await fetch(url)
    const blob = await resp.blob()
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    const dims: { w: number; h: number } = await new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => resolve({ w: 300, h: 100 })
      img.src = dataUrl
    })
    return { dataUrl, ...dims }
  } catch {
    return { dataUrl: "", w: 0, h: 0 }
  }
}

// ─── Carátula (página 1) ──────────────────────────────────────────────────────

function drawCoverPage(
  doc: any,
  data: QuotePDFData,
  headerImg: string,
  footerImg: string
): void {
  const pageW = 215.9
  const pageH = 279.4
  const mL = 15
  const mR = 15
  const contentW = pageW - mL - mR

  // ── Header image ─────────────────────────────────────────────────────────────
  const headerH = 52
  if (headerImg) {
    doc.addImage(headerImg, "PNG", 0, 0, pageW, headerH)
  } else {
    doc.setFillColor(15, 23, 42)
    doc.rect(0, 0, pageW, headerH, "F")
  }

  let y = headerH + 14

  // ── Info sección ─────────────────────────────────────────────────────────────
  // ATENCIÓN (grande)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.setTextColor(100, 116, 139)
  doc.text("ATENCIÓN:", mL, y)

  y += 5.5
  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.setTextColor(15, 23, 42)
  doc.text(data.atencion || data.clientName, mL, y)

  y += 10
  // Grid de 4 columnas: Cliente | Campaña | Marca | Fecha
  const colW = contentW / 4
  const infoGrid = [
    { label: "CLIENTE", value: data.clientName },
    { label: "CAMPAÑA", value: data.projectName },
    { label: "MARCA", value: data.clientName },
    { label: "FECHA", value: data.date },
  ]
  infoGrid.forEach((col, i) => {
    const cx = mL + i * colW
    doc.setFont("helvetica", "normal")
    doc.setFontSize(6.5)
    doc.setTextColor(100, 116, 139)
    doc.text(col.label, cx, y)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8.5)
    doc.setTextColor(30, 41, 59)
    doc.text(col.value, cx, y + 5, { maxWidth: colW - 3 })
  })

  y += 16
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.3)
  doc.line(mL, y, pageW - mR, y)
  y += 8

  // ── Tabla de rubros ──────────────────────────────────────────────────────────
  // Encabezado oscuro
  const tableHeaderH = 9
  doc.setFillColor(15, 23, 42)
  doc.rect(mL, y, contentW, tableHeaderH, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text("CONCEPTO", mL + 6, y + 6)
  doc.text("PESOS", pageW - mR - 4, y + 6, { align: "right" })
  y += tableHeaderH

  const rowH = 8.5
  data.rubros.forEach((rubro, idx) => {
    const rubroClientTotal = rubro.items.reduce(
      (sum, item) =>
        sum +
        (parseFloat(item.qty) || 0) *
          (parseFloat(item.days) || 0) *
          clientUnitPrice(item),
      0
    )

    const [r, g, b] = hexToRgb(rubro.hexColor)

    // Fondo alternado
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252)
      doc.rect(mL, y, contentW, rowH, "F")
    }

    // Franja de color izquierda
    doc.setFillColor(r, g, b)
    doc.rect(mL, y, 3, rowH, "F")

    // Nombre del rubro
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(30, 41, 59)
    doc.text(`${rubro.num}. ${rubro.label}`, mL + 7, y + 5.6)

    // Monto
    if (rubroClientTotal > 0) {
      doc.setFont("helvetica", "bold")
      doc.setTextColor(15, 23, 42)
    } else {
      doc.setFont("helvetica", "normal")
      doc.setTextColor(148, 163, 184)
    }
    doc.text(fmt(rubroClientTotal), pageW - mR - 3, y + 5.6, { align: "right" })

    // Línea separadora
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.15)
    doc.line(mL, y + rowH, pageW - mR, y + rowH)

    y += rowH
  })

  y += 12

  // ── Sección inferior: términos (izq) + totales (der) ─────────────────────────
  const clientSubtotal = data.globalFinancials.venta
  const markupAmt = clientSubtotal * ((data.visibleMarkupPct || 0) / 100)
  const totalBeforeIva = clientSubtotal + markupAmt

  const rightStartX = pageW - mR - 78
  let ry = y

  // Sub-Total
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(71, 85, 105)
  doc.text("Sub-Total", rightStartX, ry)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  doc.setTextColor(30, 41, 59)
  doc.text(fmt(clientSubtotal), pageW - mR, ry, { align: "right" })
  ry += 7.5

  if (data.visibleMarkupPct > 0) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(71, 85, 105)
    doc.text(`Markup (${data.visibleMarkupPct}%)`, rightStartX, ry)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8.5)
    doc.setTextColor(30, 41, 59)
    doc.text(fmt(markupAmt), pageW - mR, ry, { align: "right" })
    ry += 7.5
  }

  // Caja "Total antes de IVA"
  const totalBoxH = 15
  const totalBoxX = rightStartX - 4
  const totalBoxW = pageW - mR - totalBoxX + 2
  doc.setFillColor(245, 243, 255)
  doc.roundedRect(totalBoxX, ry - 2, totalBoxW, totalBoxH, 2, 2, "F")
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(99, 102, 241)
  doc.text("Total antes de IVA", rightStartX, ry + 5.5)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.setTextColor(99, 102, 241)
  doc.text(fmt(totalBeforeIva), pageW - mR, ry + 10.5, { align: "right" })

  // Columna izquierda: No incluye / Términos
  let ly = y
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(30, 41, 59)
  doc.text("NO INCLUYE:", mL, ly)
  ly += 5.5
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)
  doc.text("· IVA", mL + 2, ly)

  ly += 10
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(30, 41, 59)
  doc.text("TÉRMINOS:", mL, ly)
  ly += 5.5
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(71, 85, 105)
  doc.text("Esta cotización no contempla IVA.", mL + 2, ly)
  ly += 5
  doc.text("Vigencia: 15 días a partir de su expedición.", mL + 2, ly)

  // ── Footer image ─────────────────────────────────────────────────────────────
  const footerTotalH = 19.5   // 1.5mm accent line + 18mm bar
  const footerY = pageH - footerTotalH
  if (footerImg) {
    doc.addImage(footerImg, "PNG", 0, footerY, pageW, footerTotalH)
  } else {
    doc.setFillColor(99, 102, 241)
    doc.rect(0, footerY, pageW, 1.5, "F")
    doc.setFillColor(5, 8, 22)
    doc.rect(0, footerY + 1.5, pageW, 18, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9.5)
    doc.setTextColor(255, 255, 255)
    doc.text("Miguel Matus", mL, footerY + 8.5)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(148, 163, 184)
    doc.text("Director General  ·  Retro Casa Productora", mL, footerY + 14.5)
    doc.setFontSize(8.5)
    doc.text("@retrocasaproductora", pageW - mR, footerY + 11.5, { align: "right" })
  }
}

// ─── exportación principal ────────────────────────────────────────────────────

export async function exportQuotePdf(data: QuotePDFData): Promise<void> {
  const { jsPDF } = await import("jspdf")
  const autoTable = (await import("jspdf-autotable")).default

  const doc = new jsPDF({ format: "letter", unit: "mm" })
  const pageW = 215.9
  const pageH = 279.4
  const mL = 15
  const mR = 15
  const contentW = pageW - mL - mR

  // Cargar imágenes
  const [headerCover, headerDetail, footer] = await Promise.all([
    fetchImageBase64("/pdf-header-cover.png"),
    fetchImageBase64("/pdf-header-detail.png"),
    fetchImageBase64("/pdf-footer.png"),
  ])

  // ── Página 1: Carátula ───────────────────────────────────────────────────────
  drawCoverPage(doc, data, headerCover.dataUrl, footer.dataUrl)

  // ── Página 2+: Detalle por rubro ─────────────────────────────────────────────
  doc.addPage()

  const STATUS_LABEL: Record<string, string> = {
    draft: "Borrador",
    sent: "Enviada",
    approved: "Aprobada",
  }
  const STATUS_COLOR: Record<string, [number, number, number]> = {
    draft: [71, 85, 105],
    sent: [14, 165, 233],
    approved: [22, 163, 74],
  }

  // ── Encabezado del detalle (imagen limpia, sin texto encima) ─────────────────
  const detailHeaderH = 30
  if (headerDetail.dataUrl) {
    doc.addImage(headerDetail.dataUrl, "PNG", 0, 0, pageW, detailHeaderH)
  } else {
    doc.setFillColor(15, 23, 42)
    doc.rect(0, 0, pageW, detailHeaderH, "F")
  }

  let y = detailHeaderH + 7

  // ── Rubros ───────────────────────────────────────────────────────────────────
  for (const rubro of data.rubros) {
    // Solo ítems con importe > 0
    const visible = rubro.items.filter(
      (item) => rawAmt(item.qty, item.days, item.cost) > 0
    )
    if (visible.length === 0) continue

    const minSpace = 8 + 6 + visible.length * 6
    if (y + minSpace > pageH - mR - 50) {
      doc.addPage()
      y = mL
    }

    // Cabecera del rubro
    const [r, g, b] = hexToRgb(rubro.hexColor)
    doc.setFillColor(...lightBg(r, g, b))
    doc.rect(mL, y, contentW, 7.5, "F")
    doc.setFillColor(r, g, b)
    doc.rect(mL, y, 3, 7.5, "F")

    const rubroClientTotal = visible.reduce(
      (sum, item) =>
        sum +
        (parseFloat(item.qty) || 0) *
          (parseFloat(item.days) || 0) *
          clientUnitPrice(item),
      0
    )

    doc.setFont("helvetica", "bold")
    doc.setFontSize(8.5)
    doc.setTextColor(30, 41, 59)
    doc.text(`${rubro.num}. ${rubro.label.toUpperCase()}`, mL + 5.5, y + 5)
    doc.setTextColor(r, g, b)
    doc.text(fmt(rubroClientTotal), pageW - mR, y + 5, { align: "right" })

    y += 9.5

    // Filas — precios para el cliente (markup oculto incluido)
    const rows = visible.map((item) => {
      const unitP = clientUnitPrice(item)
      const lineTotal =
        (parseFloat(item.qty) || 0) * (parseFloat(item.days) || 0) * unitP
      return [item.label, item.qty, item.days, fmt(unitP), fmt(lineTotal)]
    })

    autoTable(doc, {
      startY: y,
      margin: { left: mL, right: mR },
      head: [["Concepto", "Cantidad", "Días", "Costo unitario", "Costo total"]],
      body: rows,
      styles: {
        fontSize: 7.8,
        cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 },
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
        textColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [71, 85, 105],
        fontStyle: "bold",
        fontSize: 7.5,
      },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 18, halign: "right" },
        2: { cellWidth: 14, halign: "right" },
        3: { cellWidth: 38, halign: "right" },
        4: { cellWidth: 38, halign: "right", fontStyle: "bold" },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    })

    y = (doc as any).lastAutoTable.finalY + 7
  }

  // ── Resumen financiero ────────────────────────────────────────────────────────
  if (y + 55 > pageH - mR) {
    doc.addPage()
    y = mL
  }

  doc.setDrawColor(100, 116, 139)
  doc.setLineWidth(0.4)
  doc.line(mL, y, pageW - mR, y)
  y += 7

  const subtotal = data.globalFinancials.venta
  const markupAmt = subtotal * ((data.visibleMarkupPct || 0) / 100)
  const totalBeforeIva = subtotal + markupAmt

  const summaryBody: (string | number)[][] = [
    ["Subtotal", fmt(subtotal)],
    ...(data.visibleMarkupPct > 0
      ? [[`Markup (${data.visibleMarkupPct}%)`, fmt(markupAmt)]]
      : []),
    ["Total antes de IVA", fmt(totalBeforeIva)],
  ]

  autoTable(doc, {
    startY: y,
    margin: { left: mL, right: mR },
    body: summaryBody,
    styles: {
      fontSize: 9,
      cellPadding: { top: 2.8, bottom: 2.8, left: 4, right: 4 },
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: 120, textColor: [71, 85, 105] },
      1: {
        cellWidth: "auto",
        halign: "right",
        fontStyle: "bold",
        textColor: [15, 23, 42],
      },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (hookData: any) => {
      if (
        hookData.section === "body" &&
        hookData.row.index === summaryBody.length - 1
      ) {
        hookData.cell.styles.fontSize = 10.5
        hookData.cell.styles.textColor = [99, 102, 241]
        hookData.cell.styles.fillColor = [245, 243, 255]
      }
    },
  })

  // ── Firma ────────────────────────────────────────────────────────────────────
  let finalY = (doc as any).lastAutoTable.finalY

  if (finalY + 38 > pageH - mR) {
    doc.addPage()
    finalY = mL
  }

  finalY += 18

  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text("Miguel Matus", mL, finalY)

  finalY += 5.5
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(71, 85, 105)
  doc.text("Director General", mL, finalY)

  // ── No incluye / Términos ─────────────────────────────────────────────────────
  finalY += 14

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(30, 41, 59)
  doc.text("No incluye:", mL, finalY)
  finalY += 4.5
  doc.setFont("helvetica", "normal")
  doc.setTextColor(71, 85, 105)
  doc.text("· IVA", mL + 2, finalY)

  finalY += 8
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(30, 41, 59)
  doc.text("Términos:", mL, finalY)
  finalY += 4.5
  doc.setFont("helvetica", "normal")
  doc.setTextColor(71, 85, 105)
  doc.text("Esta cotización no contempla IVA.", mL + 2, finalY)
  finalY += 4.5
  doc.text("Vigencia de la cotización: 15 días a partir de su expedición.", mL + 2, finalY)

  // ── Guardar ──────────────────────────────────────────────────────────────────
  const safeName = (data.quoteName || "cotizacion")
    .replace(/[^a-z0-9áéíóúñ\s_-]/gi, "")
    .replace(/\s+/g, "_")
  doc.save(`${safeName}.pdf`)
}
