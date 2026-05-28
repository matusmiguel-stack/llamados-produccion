// lib/exportQuotePdf.ts
// Generación de PDF de cotización con jsPDF + jspdf-autotable (cliente only)

export interface QuoteItemPDF {
  label: string
  qty: string
  days: string
  cost: string
  markup: string
  isInternal: boolean
  isCommission?: boolean
  commissionPct?: string
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
  clientName: string
  projectName: string
  status: string
  date: string
  rubros: QuoteRubroPDF[]
  globalFinancials: { gasto: number; utilidad: number; venta: number }
  marginPct: number
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function rawAmt(qty: string, days: string, cost: string): number {
  return (parseFloat(qty) || 0) * (parseFloat(days) || 0) * (parseFloat(cost) || 0)
}

function fmt(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [100, 100, 200]
}

// Mezcla el color con blanco para fondo claro en encabezados
function lightBg(r: number, g: number, b: number): [number, number, number] {
  return [Math.round(r * 0.12 + 240), Math.round(g * 0.12 + 240), Math.round(b * 0.12 + 240)]
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

  // ── Encabezado de primera página ──────────────────────────────────────────
  // Banda oscura superior
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, pageW, 34, "F")

  // Título
  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.setTextColor(248, 250, 252)
  doc.text("COTIZACIÓN", mL, 13)

  // Nombre de la cotización
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.setTextColor(148, 163, 184)
  doc.text(data.quoteName, mL, 22)

  // Fecha (derecha)
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text(data.date, pageW - mR, 8.5, { align: "right" })

  // Badge de estado
  const sc = STATUS_COLOR[data.status] || [71, 85, 105]
  doc.setFillColor(...sc)
  doc.roundedRect(pageW - mR - 26, 14.5, 26, 8, 2, 2, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(255, 255, 255)
  doc.text(STATUS_LABEL[data.status] ?? data.status, pageW - mR - 13, 19.5, { align: "center" })

  // Línea de cliente / proyecto
  let y = 41
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(100, 116, 139)
  doc.text("Cliente:", mL, y)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(30, 41, 59)
  doc.text(data.clientName, mL + 13, y)

  doc.setFont("helvetica", "normal")
  doc.setTextColor(100, 116, 139)
  doc.text("Proyecto:", mL + 95, y)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(30, 41, 59)
  doc.text(data.projectName, mL + 111, y)

  y += 5
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.25)
  doc.line(mL, y, pageW - mR, y)
  y += 7

  // ── Rubros ──────────────────────────────────────────────────────────────────
  let hasInternalItems = false

  for (const rubro of data.rubros) {
    // Filtrar items con importe > 0
    const visible = rubro.items.filter(item => rawAmt(item.qty, item.days, item.cost) > 0)
    if (visible.length === 0) continue

    // Espacio estimado para encabezado + al menos 1 fila
    const minSpace = 8 + 6 + visible.length * 6
    if (y + minSpace > pageH - mR - 45) {
      doc.addPage()
      y = mL
    }

    // ── Cabecera del rubro ──────────────────────────────────────────────────
    const [r, g, b] = hexToRgb(rubro.hexColor)
    doc.setFillColor(...lightBg(r, g, b))
    doc.rect(mL, y, contentW, 7.5, "F")
    doc.setFillColor(r, g, b)
    doc.rect(mL, y, 3, 7.5, "F")

    doc.setFont("helvetica", "bold")
    doc.setFontSize(8.5)
    doc.setTextColor(30, 41, 59)
    doc.text(`${rubro.num}. ${rubro.label.toUpperCase()}`, mL + 5.5, y + 5)

    // Subtotal rubro (derecha)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8.5)
    doc.setTextColor(r, g, b)
    doc.text(fmt(rubro.financials.venta), pageW - mR, y + 5, { align: "right" })

    y += 9.5

    // ── Tabla de ítems del rubro ─────────────────────────────────────────────
    const internalFlags: boolean[] = []

    const rows = visible.map(item => {
      const amount = rawAmt(item.qty, item.days, item.cost)
      internalFlags.push(item.isInternal)

      if (item.isCommission) {
        const u = amount * ((parseFloat(item.markup) || 0) / 100)
        return [`Comisión de agencia (${item.commissionPct}%)`, "—", "—", fmt(amount), `${item.markup}%`, fmt(amount + u)]
      }

      if (item.isInternal) {
        hasInternalItems = true
        return [`${item.label} (*)`, item.qty, item.days, fmt(parseFloat(item.cost) || 0), "INT", fmt(amount)]
      }

      const u = amount * ((parseFloat(item.markup) || 0) / 100)
      return [item.label, item.qty, item.days, fmt(parseFloat(item.cost) || 0), `${item.markup}%`, fmt(amount + u)]
    })

    autoTable(doc, {
      startY: y,
      margin: { left: mL, right: mR },
      head: [["Concepto", "Cant.", "Días", "Costo unit.", "Mkp%", "Precio venta"]],
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
        1: { cellWidth: 13, halign: "right" },
        2: { cellWidth: 13, halign: "right" },
        3: { cellWidth: 32, halign: "right" },
        4: { cellWidth: 16, halign: "right" },
        5: { cellWidth: 35, halign: "right", fontStyle: "bold" },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (hookData: any) => {
        if (hookData.section === "body" && internalFlags[hookData.row.index]) {
          hookData.cell.styles.textColor = [22, 163, 74]
          hookData.cell.styles.fontStyle = "italic"
        }
      },
    })

    y = (doc as any).lastAutoTable.finalY + 7
  }

  // ── Resumen financiero ───────────────────────────────────────────────────────
  if (y + 55 > pageH - mR) {
    doc.addPage()
    y = mL
  }

  // Separador
  doc.setDrawColor(100, 116, 139)
  doc.setLineWidth(0.4)
  doc.line(mL, y, pageW - mR, y)
  y += 7

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9.5)
  doc.setTextColor(15, 23, 42)
  doc.text("RESUMEN FINANCIERO", mL, y)
  y += 6

  const marginColor: [number, number, number] =
    data.marginPct >= 20 ? [22, 163, 74] : data.marginPct >= 10 ? [217, 119, 6] : [220, 38, 38]

  autoTable(doc, {
    startY: y,
    margin: { left: mL, right: mR },
    body: [
      ["Total Gasto", fmt(data.globalFinancials.gasto)],
      ["Total Utilidad", fmt(data.globalFinancials.utilidad)],
      ["Precio de Venta Total", fmt(data.globalFinancials.venta)],
      ["Margen de Utilidad", `${data.marginPct.toFixed(1)}%`],
    ],
    styles: {
      fontSize: 9,
      cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    columnStyles: {
      0: { cellWidth: 120, textColor: [71, 85, 105] },
      1: { cellWidth: "auto", halign: "right", fontStyle: "bold", textColor: [15, 23, 42] },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (hookData: any) => {
      if (hookData.section === "body") {
        // Precio de venta — morado
        if (hookData.row.index === 2) {
          hookData.cell.styles.textColor = [99, 102, 241]
          hookData.cell.styles.fontSize = 10
        }
        // Margen — color semáforo
        if (hookData.row.index === 3 && hookData.column.index === 1) {
          hookData.cell.styles.textColor = marginColor
        }
      }
    },
  })

  // Nota items internos
  if (hasInternalItems) {
    const lastY = (doc as any).lastAutoTable.finalY
    doc.setFont("helvetica", "italic")
    doc.setFontSize(7)
    doc.setTextColor(100, 116, 139)
    doc.text("(*) Recursos internos: el monto se contabiliza íntegramente como utilidad (gasto real = $0).", mL, lastY + 7)
  }

  // ── Guardar ──────────────────────────────────────────────────────────────────
  const safeName = (data.quoteName || "cotizacion").replace(/[^a-z0-9áéíóúñ\s_-]/gi, "").replace(/\s+/g, "_")
  doc.save(`${safeName}.pdf`)
}
