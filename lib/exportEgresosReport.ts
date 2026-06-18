type ReportItem = {
  id: string
  seccion: string
  concepto: string
  proveedor: string
  monto: number
  pagado: boolean
  tipoPago: "proveedor" | "anticipo" | "comprobacion" | "reembolso"
  proveedorId: string | null
}

type ReportFactura = {
  proveedor_id: string | null
  quote_item_id: string | null
  subtotal: number | null
  status: string
  origen: string | null
  fecha_pago: string | null
  paid_at: string | null
  concepto: string | null
}

export type EgresosReportData = {
  projectName: string
  projectCode: string | null
  empresa: "retro_studio" | "retro_films" | null
  cliente: string | null
  responsable: string | null
  cobrado: number
  items: ReportItem[]
  facturas: ReportFactura[]
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)

function fechaLarga(iso: string | null): string {
  if (!iso) return ""
  const [y, m, d] = iso.split("T")[0].split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })
}

async function fetchImageBase64(url: string): Promise<string> {
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
    return ""
  }
}

export async function exportEgresosReport(data: EgresosReportData): Promise<void> {
  const { jsPDF } = await import("jspdf")
  const autoTable = (await import("jspdf-autotable")).default

  const doc = new jsPDF({ format: "letter", unit: "mm" })
  const pageW = 215.9
  const mL = 15
  const mR = 15
  const contentW = pageW - mL - mR

  const empresaLabel = data.empresa === "retro_films" ? "Retro Films" : data.empresa === "retro_studio" ? "Retro Studio" : "—"
  const proyectoLabel = data.projectCode ? `${data.projectCode} ${data.projectName}` : data.projectName

  // ── Encabezado (imagen) con título centrado ──────────────────────────────────
  const headerImg = await fetchImageBase64("/pdf-header-detail.png")
  const headerH = 34
  if (headerImg) {
    doc.addImage(headerImg, "PNG", 0, 0, pageW, headerH)
  } else {
    doc.setFillColor(15, 23, 42)
    doc.rect(0, 0, pageW, headerH, "F")
  }
  doc.setTextColor(248, 250, 252)
  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text(proyectoLabel, pageW / 2, headerH / 2 + 1, { align: "center", baseline: "middle" })
  doc.setFontSize(8.5)
  doc.setFont("helvetica", "normal")
  doc.text("REPORTE FINANCIERO", pageW / 2, headerH / 2 + 7, { align: "center", baseline: "middle" })

  let y = headerH + 12

  // ── Información del proyecto ──────────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    margin: { left: mL, right: mR },
    theme: "plain",
    body: [
      ["Cliente", data.cliente || "—", "Responsable", data.responsable || "—"],
      ["Proyecto", proyectoLabel, "Empresa", empresaLabel],
    ],
    styles: { fontSize: 9.5, cellPadding: 1.5 },
    columnStyles: {
      0: { fontStyle: "bold", textColor: [100, 116, 139], cellWidth: 28 },
      1: { textColor: [15, 23, 42], cellWidth: contentW / 2 - 28 },
      2: { fontStyle: "bold", textColor: [100, 116, 139], cellWidth: 28 },
      3: { textColor: [15, 23, 42] },
    },
  })
  // @ts-ignore
  y = doc.lastAutoTable.finalY + 10

  // ── Resumen financiero ───────────────────────────────────────────────────────
  const totalGastos = data.items.reduce((s, i) => s + i.monto, 0)
  const utilidad = data.cobrado - totalGastos
  const margen = data.cobrado > 0 ? (utilidad / data.cobrado) * 100 : 0

  doc.setTextColor(15, 23, 42)
  doc.setFontSize(12)
  doc.setFont("helvetica", "bold")
  doc.text("Resumen financiero", mL, y)
  y += 4

  autoTable(doc, {
    startY: y,
    margin: { left: mL, right: mR },
    theme: "grid",
    head: [["Concepto", "Monto"]],
    body: [
      ["Cobrado (precio de venta)", fmt(data.cobrado)],
      ["Total de gastos", fmt(totalGastos)],
      [`Utilidad (margen ${margen.toFixed(1)}%)`, fmt(utilidad)],
    ],
    headStyles: { fillColor: [30, 41, 59], textColor: [248, 250, 252], fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 10 },
    columnStyles: { 1: { halign: "right", cellWidth: 50 } },
    didParseCell: (h: any) => {
      if (h.section === "body" && h.row.index === 2) {
        h.cell.styles.fontStyle = "bold"
        h.cell.styles.textColor = utilidad >= 0 ? [22, 101, 52] : [153, 27, 27]
      }
    },
  })
  // @ts-ignore
  y = doc.lastAutoTable.finalY + 12

  // Facturas que NO son de pagos internos (anticipo/comprobacion/reembolso)
  const facturasProveedor = (data.facturas || []).filter(
    f => f.origen !== "anticipo" && f.origen !== "comprobacion" && f.origen !== "reembolso"
  )

  // ── Helper: estatus de pago de un egreso por pagar (factura de proveedor) ────
  const montoCoincide = (f: ReportFactura, monto: number) => Math.abs(Number(f.subtotal || 0) - monto) < 1.5
  function estatusPorPagar(item: ReportItem): string {
    const mismoProv = facturasProveedor.filter(f => f.proveedor_id && f.proveedor_id === item.proveedorId)
    // 0) vínculo directo egreso↔factura  1) mismo proveedor + monto
    // 2) mismo proveedor con fecha       3) respaldo por monto en el proyecto
    const fac =
      facturasProveedor.find(f => f.quote_item_id && f.quote_item_id === item.id) ||
      mismoProv.find(f => montoCoincide(f, item.monto)) ||
      mismoProv.find(f => f.fecha_pago) ||
      facturasProveedor.find(f => montoCoincide(f, item.monto) && (f.fecha_pago || f.status === "pagada"))
    if (fac?.status === "pagada" && fac.paid_at) return `Pagada ${fechaLarga(fac.paid_at)}`
    if (fac?.fecha_pago) return `Pago programado: ${fechaLarga(fac.fecha_pago)}`
    return "No se ha programado pago"
  }

  // ── Helper: estatus de un reembolso (factura origen reembolso) ───────────────
  function estatusReembolso(item: ReportItem): string {
    const fac = (data.facturas || []).find(
      f => f.origen === "reembolso" && f.proveedor_id === item.proveedorId &&
           Math.abs(Number(f.subtotal || 0) - item.monto) < 1.5
    ) || (data.facturas || []).find(f => f.origen === "reembolso" && f.proveedor_id === item.proveedorId)
    if (fac?.status === "pagada" && fac.paid_at) return `Pagado ${fechaLarga(fac.paid_at)}`
    if (fac?.fecha_pago) return `Por pagar · prog. ${fechaLarga(fac.fecha_pago)}`
    return "Por pagar"
  }

  // ── 1. Por pagar (gastos vía factura de proveedor) ───────────────────────────
  const porPagar = data.items.filter(i => i.tipoPago === "proveedor")
  if (porPagar.length > 0) {
    doc.setTextColor(15, 23, 42)
    doc.setFontSize(12)
    doc.setFont("helvetica", "bold")
    doc.text("Por pagar — facturas de proveedor", mL, y)
    y += 4
    autoTable(doc, {
      startY: y,
      margin: { left: mL, right: mR },
      theme: "striped",
      head: [["Sección", "Concepto", "Proveedor", "Monto", "Estatus de pago"]],
      body: porPagar.map(i => [i.seccion, i.concepto, i.proveedor, fmt(i.monto), estatusPorPagar(i)]),
      headStyles: { fillColor: [248, 113, 113], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: { 3: { halign: "right", cellWidth: 26 }, 4: { cellWidth: 42 } },
    })
    // @ts-ignore
    y = doc.lastAutoTable.finalY + 12
  }

  // ── 2. Anticipos, comprobaciones y reembolsos ────────────────────────────────
  const anticipos = data.items.filter(i =>
    i.tipoPago === "anticipo" || i.tipoPago === "comprobacion" || i.tipoPago === "reembolso"
  )
  if (anticipos.length > 0) {
    if (y > 230) { doc.addPage(); y = 20 }
    doc.setTextColor(15, 23, 42)
    doc.setFontSize(12)
    doc.setFont("helvetica", "bold")
    doc.text("Anticipos, comprobaciones y reembolsos", mL, y)
    y += 4
    autoTable(doc, {
      startY: y,
      margin: { left: mL, right: mR },
      theme: "striped",
      head: [["Sección", "Concepto", "Proveedor", "Tipo", "Monto", "Estatus"]],
      body: anticipos.map(i => [
        i.seccion, i.concepto, i.proveedor,
        i.tipoPago === "anticipo" ? "Anticipo" : i.tipoPago === "comprobacion" ? "Comprobación" : "Reembolso",
        fmt(i.monto),
        i.tipoPago === "reembolso" ? estatusReembolso(i) : (i.pagado ? "Pagado" : "Por pagar"),
      ]),
      headStyles: { fillColor: [52, 211, 153], textColor: [6, 78, 59], fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: { 4: { halign: "right", cellWidth: 26 }, 5: { cellWidth: 36 } },
    })
    // @ts-ignore
    y = doc.lastAutoTable.finalY + 12
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  const fechaGen = new Date().toLocaleDateString("es-MX", { dateStyle: "long" })
  doc.setFontSize(8)
  doc.setTextColor(148, 163, 184)
  doc.text(`Generado el ${fechaGen}`, mL, 272)

  doc.save(`Reporte_${(data.projectCode || data.projectName).replace(/[^a-zA-Z0-9]/g, "_")}.pdf`)
}
