import type { EgresosReportData } from "./exportEgresosReport"

// ─── helpers ────────────────────────────────────────────────────────────────

const fmtMXN = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)

function fechaLarga(iso: string | null): string {
  if (!iso) return ""
  const [y, m, d] = iso.split("T")[0].split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", {
    day: "numeric", month: "long", year: "numeric",
  })
}

type Estado = "sin_fecha" | "programado" | "pagado" | "vencido"
type ReportItem = EgresosReportData["items"][0]
type ReportFactura = EgresosReportData["facturas"][0]

const hoy = new Date().toLocaleDateString("sv", { timeZone: "America/Mexico_City" })
const vencida = (fecha: string | null) => !!fecha && fecha.split("T")[0] < hoy

function estadoDeFactura(
  fac: ReportFactura | undefined,
  sinFechaTexto: string,
): { texto: string; estado: Estado } {
  if (fac?.status === "pagada" && fac.paid_at)
    return { texto: `Pagado ${fechaLarga(fac.paid_at)}`, estado: "pagado" }
  if (fac?.fecha_pago) {
    const venc = vencida(fac.fecha_pago)
    return {
      texto: `${venc ? "Vencido · " : "Programado: "}${fechaLarga(fac.fecha_pago)}`,
      estado: venc ? "vencido" : "programado",
    }
  }
  return { texto: sinFechaTexto, estado: "sin_fecha" }
}

// ─── Colores hex por estado ─────────────────────────────────────────────────
const ESTADO_COLOR: Record<Estado, string> = {
  sin_fecha:  "FF94A3B8",
  programado: "FFEA580C",
  pagado:     "FF16A34A",
  vencido:    "FFDC2626",
}

export async function exportEgresosReportXlsx(data: EgresosReportData): Promise<void> {
  const XLSX = await import("xlsx")
  const wb = XLSX.utils.book_new()

  const empresaLabel =
    data.empresa === "retro_films" ? "Retro Films" :
    data.empresa === "retro_studio" ? "Retro Studio" : "—"
  const proyectoLabel = data.projectCode
    ? `${data.projectCode} ${data.projectName}`
    : data.projectName

  const facturasProveedor = (data.facturas || []).filter(
    f => f.origen !== "anticipo" && f.origen !== "comprobacion" && f.origen !== "reembolso",
  )

  const montoCoincide = (f: ReportFactura, monto: number) =>
    Math.abs(Number(f.subtotal || 0) - monto) < 1.5

  function estatusPorPagar(item: ReportItem) {
    const mismoProv = facturasProveedor.filter(
      f => f.proveedor_id && f.proveedor_id === (item as any).proveedorId,
    )
    const fac =
      facturasProveedor.find(f => f.quote_item_id && f.quote_item_id === item.id) ||
      mismoProv.find(f => montoCoincide(f, item.monto)) ||
      mismoProv.find(f => f.fecha_pago) ||
      facturasProveedor.find(
        f => montoCoincide(f, item.monto) && (f.fecha_pago || f.status === "pagada"),
      )
    return estadoDeFactura(fac, "No se ha programado pago")
  }

  function estatusReembolso(item: ReportItem) {
    const fac =
      (data.facturas || []).find(
        f => f.origen === "reembolso" &&
             f.proveedor_id === (item as any).proveedorId &&
             Math.abs(Number(f.subtotal || 0) - item.monto) < 1.5,
      ) ||
      (data.facturas || []).find(
        f => f.origen === "reembolso" && f.proveedor_id === (item as any).proveedorId,
      )
    return estadoDeFactura(fac, "Por pagar")
  }

  function estadoItem(item: ReportItem): Estado {
    if (item.tipoPago === "proveedor") return estatusPorPagar(item).estado
    if (item.tipoPago === "reembolso") return estatusReembolso(item).estado
    return item.pagado ? "pagado" : "sin_fecha"
  }

  // ── Sheet 1: Resumen ────────────────────────────────────────────────────────
  const totalGastos = data.items.reduce((s, i) => s + i.monto, 0)
  const utilidad = data.cobrado - totalGastos
  const margen = data.cobrado > 0 ? (utilidad / data.cobrado) * 100 : 0

  const totalPorEstado: Record<Estado, number> = {
    sin_fecha: 0, programado: 0, pagado: 0, vencido: 0,
  }
  for (const it of data.items) totalPorEstado[estadoItem(it)] += it.monto

  const resumenRows = [
    ["REPORTE FINANCIERO", proyectoLabel],
    [],
    ["INFORMACIÓN DEL PROYECTO"],
    ["Cliente",      data.cliente || "—"],
    ["Responsable",  data.responsable || "—"],
    ["Proyecto",     proyectoLabel],
    ["Empresa",      empresaLabel],
    [],
    ["RESUMEN FINANCIERO"],
    ["Cobrado (precio de venta)",                fmtMXN(data.cobrado)],
    ["Total de gastos",                          fmtMXN(totalGastos)],
    [`Utilidad (margen ${margen.toFixed(1)}%)`,  fmtMXN(utilidad)],
    [],
    ["TOTALES POR ESTATUS DE PAGO"],
    ["Total programado",           fmtMXN(totalPorEstado.programado)],
    ["Total sin programar",        fmtMXN(totalPorEstado.sin_fecha)],
    ["Total pagado",               fmtMXN(totalPorEstado.pagado)],
    ["Total vencido",              fmtMXN(totalPorEstado.vencido)],
    [],
    ["Total general de gastos",    fmtMXN(totalGastos)],
    [],
    [`Generado el ${new Date().toLocaleDateString("es-MX", { dateStyle: "long" })}`],
  ]

  const wsResumen = XLSX.utils.aoa_to_sheet(resumenRows)
  wsResumen["!cols"] = [{ wch: 38 }, { wch: 22 }]
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen")

  // ── Sheet 2: Por pagar (facturas de proveedor) ──────────────────────────────
  const porPagar = data.items.filter(i => i.tipoPago === "proveedor")
  const ppHeader = ["Sección", "Concepto", "Proveedor", "Monto", "Estatus de pago"]
  const ppRows = porPagar.map(i => {
    const { texto } = estatusPorPagar(i)
    return [i.seccion, i.concepto, i.proveedor, i.monto, texto]
  })
  const ppTotal = porPagar.reduce((s, i) => s + i.monto, 0)
  ppRows.push(["", "", "TOTAL", ppTotal, ""])

  const wsPP = XLSX.utils.aoa_to_sheet([ppHeader, ...ppRows])
  // Formato de moneda a la columna D (índice 3) — excepto header
  ppRows.forEach((_, ri) => {
    const cellRef = XLSX.utils.encode_cell({ r: ri + 1, c: 3 })
    if (wsPP[cellRef]) {
      wsPP[cellRef].t = "n"
      wsPP[cellRef].z = '"$"#,##0.00'
    }
  })
  wsPP["!cols"] = [{ wch: 22 }, { wch: 30 }, { wch: 30 }, { wch: 14 }, { wch: 36 }]
  XLSX.utils.book_append_sheet(wb, wsPP, "Por pagar (proveedores)")

  // ── Sheet 3: Anticipos, comprobaciones y reembolsos ─────────────────────────
  const anticipos = data.items.filter(
    i => i.tipoPago === "anticipo" || i.tipoPago === "comprobacion" || i.tipoPago === "reembolso",
  )
  const antHeader = ["Sección", "Concepto", "Proveedor", "Tipo", "Monto", "Estatus"]
  const antRows = anticipos.map(i => {
    const estTexto =
      i.tipoPago === "reembolso"
        ? estatusReembolso(i).texto
        : i.pagado ? "Pagado" : "Por pagar"
    const tipo =
      i.tipoPago === "anticipo" ? "Anticipo" :
      i.tipoPago === "comprobacion" ? "Comprobación" : "Reembolso"
    return [i.seccion, i.concepto, i.proveedor, tipo, i.monto, estTexto]
  })
  const antTotal = anticipos.reduce((s, i) => s + i.monto, 0)
  antRows.push(["", "", "TOTAL", "", antTotal, ""])

  const wsAnt = XLSX.utils.aoa_to_sheet([antHeader, ...antRows])
  antRows.forEach((_, ri) => {
    const cellRef = XLSX.utils.encode_cell({ r: ri + 1, c: 4 })
    if (wsAnt[cellRef]) {
      wsAnt[cellRef].t = "n"
      wsAnt[cellRef].z = '"$"#,##0.00'
    }
  })
  wsAnt["!cols"] = [{ wch: 22 }, { wch: 30 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 30 }]
  XLSX.utils.book_append_sheet(wb, wsAnt, "Anticipos y comprobaciones")

  // ── Sheet 4: Todos los egresos ───────────────────────────────────────────────
  const todoHeader = ["Sección", "Concepto", "Proveedor", "Tipo de pago", "Monto", "Estatus"]
  const todoRows = data.items.map(i => {
    let estTexto = ""
    if (i.tipoPago === "proveedor") estTexto = estatusPorPagar(i).texto
    else if (i.tipoPago === "reembolso") estTexto = estatusReembolso(i).texto
    else estTexto = i.pagado ? "Pagado" : "Por pagar"
    const tipo =
      i.tipoPago === "anticipo" ? "Anticipo" :
      i.tipoPago === "comprobacion" ? "Comprobación" :
      i.tipoPago === "reembolso" ? "Reembolso" : "Proveedor"
    return [i.seccion, i.concepto, i.proveedor, tipo, i.monto, estTexto]
  })
  todoRows.push(["", "", "TOTAL", "", totalGastos, ""])

  const wsTodo = XLSX.utils.aoa_to_sheet([todoHeader, ...todoRows])
  todoRows.forEach((_, ri) => {
    const cellRef = XLSX.utils.encode_cell({ r: ri + 1, c: 4 })
    if (wsTodo[cellRef]) {
      wsTodo[cellRef].t = "n"
      wsTodo[cellRef].z = '"$"#,##0.00'
    }
  })
  wsTodo["!cols"] = [{ wch: 22 }, { wch: 30 }, { wch: 30 }, { wch: 16 }, { wch: 14 }, { wch: 36 }]
  XLSX.utils.book_append_sheet(wb, wsTodo, "Todos los egresos")

  // ── Descargar ────────────────────────────────────────────────────────────────
  const slug = (data.projectCode || data.projectName).replace(/[^a-zA-Z0-9]/g, "_")
  XLSX.writeFile(wb, `Reporte_${slug}.xlsx`)
}
