// lib/exportQuoteXlsx.ts
// Exporta una cotización a Excel (.xlsx) con la MISMA vista orientada al
// cliente que el PDF: precios finales (markup oculto ya incluido), sin mostrar
// costos ni márgenes internos.

import type { QuotePDFData } from "./exportQuotePdf"

const CURRENCY_FMT = '"$"#,##0.00'

// Precio unitario que ve el cliente (markup oculto ya incluido) — idéntico al PDF.
function unitClientPrice(cost: string, markup: string): number {
  return (parseFloat(cost) || 0) * (1 + (parseFloat(markup) || 0) / 100)
}

function rawAmt(qty: string, days: string, cost: string): number {
  return (parseFloat(qty) || 0) * (parseFloat(days) || 0) * (parseFloat(cost) || 0)
}

const round2 = (n: number) => Math.round(n * 100) / 100

export async function exportQuoteXlsx(data: QuotePDFData): Promise<void> {
  const XLSX = await import("xlsx")

  const rows: (string | number)[][] = []

  // ── Encabezado ──────────────────────────────────────────────────────────────
  rows.push([data.quoteName || "Cotización"])
  rows.push(["Cliente", data.clientName])
  rows.push(["Proyecto", data.projectName])
  if (data.atencion) rows.push(["Atención", data.atencion])
  rows.push(["Fecha", data.date])
  rows.push([])

  // ── Rubros e ítems ────────────────────────────────────────────────────────────
  for (const rubro of data.rubros) {
    const items = rubro.items.filter((it) => rawAmt(it.qty, it.days, it.cost) > 0)
    if (items.length === 0) continue

    rows.push([`${rubro.num}. ${rubro.label}`])
    rows.push(["Concepto", "Cant.", "Días", "P. Unitario", "Total"])
    for (const it of items) {
      const unit = unitClientPrice(it.cost, it.markup)
      const total = (parseFloat(it.qty) || 0) * (parseFloat(it.days) || 0) * unit
      rows.push([
        it.label,
        parseFloat(it.qty) || 0,
        parseFloat(it.days) || 0,
        round2(unit),
        round2(total),
      ])
    }
    rows.push(["", "", "", `Subtotal ${rubro.label}`, round2(rubro.financials.venta)])
    rows.push([])
  }

  // ── Totales (igual que el PDF: sin IVA) ───────────────────────────────────────
  const subtotal = data.globalFinancials.venta
  const markupAmt = subtotal * ((data.visibleMarkupPct || 0) / 100)
  const financiamientoAmt = subtotal * ((data.visibleFinanciamientoPct || 0) / 100)
  const totalBeforeIva = subtotal + markupAmt + financiamientoAmt

  rows.push(["", "", "", "Subtotal", round2(subtotal)])
  if ((data.visibleMarkupPct || 0) > 0) {
    rows.push(["", "", "", `Markup (${data.visibleMarkupPct}%)`, round2(markupAmt)])
  }
  if ((data.visibleFinanciamientoPct || 0) > 0) {
    rows.push(["", "", "", `Financiamiento (${data.visibleFinanciamientoPct}%)`, round2(financiamientoAmt)])
  }
  rows.push(["", "", "", "Total antes de IVA", round2(totalBeforeIva)])

  if (data.entregables) {
    rows.push([])
    rows.push(["Entregables"])
    rows.push([data.entregables])
  }

  // ── Hoja ──────────────────────────────────────────────────────────────────────
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws["!cols"] = [{ wch: 50 }, { wch: 8 }, { wch: 8 }, { wch: 16 }, { wch: 16 }]

  // Formato de moneda para las columnas de precio (D y E) en celdas numéricas.
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1")
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (const C of [3, 4]) {
      const ref = XLSX.utils.encode_cell({ r: R, c: C })
      const cell = ws[ref]
      if (cell && cell.t === "n") cell.z = CURRENCY_FMT
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Cotizacion")

  const slug =
    (data.quoteName || "cotizacion")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() || "cotizacion"
  XLSX.writeFile(wb, `Cotizacion_${slug}.xlsx`)
}
