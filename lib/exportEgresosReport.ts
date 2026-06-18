type ReportItem = {
  seccion: string
  concepto: string
  proveedor: string
  monto: number
  pagado: boolean
  pagoModo: "anticipo" | "comprobacion" | null
  proveedorId: string | null
}

type ReportFactura = {
  proveedor_id: string | null
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

export async function exportEgresosReport(data: EgresosReportData): Promise<void> {
  const { jsPDF } = await import("jspdf")
  const autoTable = (await import("jspdf-autotable")).default

  const doc = new jsPDF({ format: "letter", unit: "mm" })
  const pageW = 215.9
  const mL = 15
  const mR = 15
  const contentW = pageW - mL - mR

  const empresaLabel = data.empresa === "retro_films" ? "Retro Films" : data.empresa === "retro_studio" ? "Retro Studio" : ""
  const proyectoLabel = data.projectCode ? `${data.projectCode} ${data.projectName}` : data.projectName

  // ── Encabezado ───────────────────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42)
  doc.rect(0, 0, pageW, 26, "F")
  doc.setTextColor(148, 163, 184)
  doc.setFontSize(8)
  doc.text("RETRO CASA PRODUCTORA · REPORTE FINANCIERO", mL, 11)
  doc.setTextColor(248, 250, 252)
  doc.setFontSize(15)
  doc.setFont("helvetica", "bold")
  doc.text(proyectoLabel, mL, 19)
  if (empresaLabel) {
    doc.setFontSize(9)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(148, 163, 184)
    doc.text(empresaLabel, pageW - mR, 19, { align: "right" })
  }

  let y = 36

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

  // ── Helper: fecha programada de pago de un egreso por pagar ──────────────────
  function fechaProgramada(item: ReportItem): { texto: string; pagada: boolean } {
    const fac = (data.facturas || []).find(
      f => f.proveedor_id && f.proveedor_id === item.proveedorId &&
           (f.origen === "proveedor" || !f.origen) &&
           Math.abs(Number(f.subtotal || 0) - item.monto) < 1
    ) || (data.facturas || []).find(
      f => f.proveedor_id && f.proveedor_id === item.proveedorId && (f.origen === "proveedor" || !f.origen) && f.fecha_pago
    )
    if (fac?.status === "pagada" && fac.paid_at) return { texto: `Pagada ${fechaLarga(fac.paid_at)}`, pagada: true }
    if (fac?.fecha_pago) return { texto: `Pago programado: ${fechaLarga(fac.fecha_pago)}`, pagada: false }
    return { texto: "No se ha programado pago", pagada: false }
  }

  // ── 1. Por pagar (gastos vía factura de proveedor) ───────────────────────────
  const porPagar = data.items.filter(i => i.pagoModo == null)
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
      body: porPagar.map(i => {
        const f = fechaProgramada(i)
        return [i.seccion, i.concepto, i.proveedor, fmt(i.monto), f.texto]
      }),
      headStyles: { fillColor: [248, 113, 113], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: { 3: { halign: "right", cellWidth: 26 }, 4: { cellWidth: 42 } },
    })
    // @ts-ignore
    y = doc.lastAutoTable.finalY + 12
  }

  // ── 2. Anticipos (pagados y por pagar) ───────────────────────────────────────
  const anticipos = data.items.filter(i => i.pagoModo === "anticipo" || i.pagoModo === "comprobacion")
  if (anticipos.length > 0) {
    if (y > 230) { doc.addPage(); y = 20 }
    doc.setTextColor(15, 23, 42)
    doc.setFontSize(12)
    doc.setFont("helvetica", "bold")
    doc.text("Anticipos y comprobaciones", mL, y)
    y += 4
    autoTable(doc, {
      startY: y,
      margin: { left: mL, right: mR },
      theme: "striped",
      head: [["Sección", "Concepto", "Proveedor", "Tipo", "Monto", "Estatus"]],
      body: anticipos.map(i => [
        i.seccion, i.concepto, i.proveedor,
        i.pagoModo === "anticipo" ? "Anticipo" : "Comprobación",
        fmt(i.monto),
        i.pagado ? "Pagado" : "Por pagar",
      ]),
      headStyles: { fillColor: [52, 211, 153], textColor: [6, 78, 59], fontStyle: "bold", fontSize: 8 },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: { 4: { halign: "right", cellWidth: 26 } },
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
