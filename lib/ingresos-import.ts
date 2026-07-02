// Plantilla e importación de ingresos vía Excel.
// Permite subir varios "proyectos" directo al control de ingresos, sin tener que
// crearlos como proyectos en el sistema. Los ingresos importados quedan sin
// project_id (no vinculados), como cualquier ingreso manual.

const norm = (s: any) =>
  String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")

// Estatus válidos (valor en BD ← etiquetas amigables aceptadas en el Excel)
const ESTATUS_MAP: { key: string; labels: string[] }[] = [
  { key: "en_produccion",     labels: ["en produccion", "produccion", "en_produccion"] },
  { key: "proceso_facturado", labels: ["proceso facturado", "en proceso de facturar", "proceso_facturado"] },
  { key: "facturado",         labels: ["facturado"] },
  { key: "por_cobrar",        labels: ["por cobrar", "por_cobrar"] },
  { key: "factorado",         labels: ["factorado"] },
  { key: "pagado",            labels: ["pagado", "cobrado"] },
]

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

// Columnas de la plantilla (encabezados amigables)
const HEADERS = [
  "Empresa",
  "Estatus",
  "Cliente / Agencia",
  "Responsable",
  "Proyecto",
  "ODC",
  "Número de Factura",
  "Subtotal (sin IVA)",
  "IVA",
  "Fecha aprox. de pago (AAAA-MM-DD)",
  "Fecha de pago (AAAA-MM-DD)",
  "Mes de cierre",
  "Notas",
]

const EXAMPLE_ROWS = [
  ["Retro Studio", "En Producción", "Kueski", "Miguel", "RS9001 Campaña de ejemplo", "", "", 250000, "", "", "", "Julio", "Fila de ejemplo — puedes borrarla"],
  ["Retro Films", "Facturado", "Banamex", "Adrish", "RS9002 Otro proyecto", "4500123456", "A-123", 480000, 76800, "2026-08-14", "", "Agosto", ""],
]

export type IngresoImportRow = {
  empresa: string
  estatus: string
  cliente_agencia: string
  responsable: string | null
  proyecto: string
  odc: string | null
  numero_factura: string | null
  subtotal: number
  iva: number
  fecha_aprox_pago: string | null
  fecha_pago: string | null
  mes_cierre: string | null
  notas: string | null
}

// Mapea un encabezado del Excel a nuestro campo interno.
function fieldForHeader(header: string): keyof IngresoImportRow | null {
  const h = norm(header)
  if (!h) return null
  if (h.includes("empresa")) return "empresa"
  if (h.includes("estatus") || h.includes("estado")) return "estatus"
  if (h.includes("cliente") || h.includes("agencia")) return "cliente_agencia"
  if (h.includes("responsable")) return "responsable"
  if (h.includes("odc")) return "odc"
  if (h.includes("factura")) return "numero_factura"
  if (h.includes("subtotal") || h.includes("monto")) return "subtotal" // antes que IVA
  if (h.includes("iva")) return "iva"
  if (h.includes("aprox")) return "fecha_aprox_pago"
  if (h.includes("fecha") && h.includes("pago")) return "fecha_pago"
  if (h.includes("mes")) return "mes_cierre"
  if (h.includes("nota")) return "notas"
  if (h.includes("proyecto")) return "proyecto"
  return null
}

function toNum(v: any): number {
  if (typeof v === "number") return v
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""))
  return Number.isFinite(n) ? n : 0
}

function toDateStr(v: any): string {
  if (v == null || v === "") return ""
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, "0")
    const d = String(v.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }
  return String(v).trim()
}

function mapEmpresa(v: any): string {
  const n = norm(v)
  if (n.includes("films")) return "retro_films"
  return "retro_studio" // default y "studio"
}

function mapEstatus(v: any): string {
  const n = norm(v)
  if (!n) return "en_produccion"
  for (const e of ESTATUS_MAP) if (e.labels.some((l) => n.includes(l))) return e.key
  return "en_produccion"
}

function mapMes(v: any): string | null {
  const n = norm(v)
  if (!n) return null
  const found = MESES.find((m) => norm(m) === n)
  return found || String(v).trim()
}

// ── Descargar plantilla ──────────────────────────────────────────────────────
export async function downloadIngresosTemplate(): Promise<void> {
  const XLSX = await import("xlsx")

  const wb = XLSX.utils.book_new()

  // Hoja de datos: encabezados + filas de ejemplo
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...EXAMPLE_ROWS])
  ws["!cols"] = HEADERS.map((h) => ({ wch: Math.max(14, h.length + 2) }))
  XLSX.utils.book_append_sheet(wb, ws, "Ingresos")

  // Hoja de instrucciones
  const instrucciones = [
    ["Instrucciones para importar ingresos"],
    [""],
    ["1. Llena una fila por proyecto en la hoja \"Ingresos\"."],
    ["2. Borra las filas de ejemplo antes de importar."],
    ["3. Campos obligatorios: Cliente / Agencia, Proyecto y Subtotal (sin IVA)."],
    ["4. Si dejas el IVA vacío, se calcula automáticamente (16% del subtotal)."],
    [""],
    ["Valores válidos:"],
    ["• Empresa:", "Retro Studio  |  Retro Films"],
    ["• Estatus:", "En Producción | Proceso Facturado | Facturado | Por Cobrar | Factorado | Pagado"],
    ["• Mes de cierre:", MESES.join(" | ")],
    ["• Fechas:", "Formato AAAA-MM-DD (ej. 2026-08-14). Opcionales."],
    [""],
    ["Nota: estos ingresos se cargan sin vincularse a un proyecto del sistema."],
  ]
  const wsI = XLSX.utils.aoa_to_sheet(instrucciones)
  wsI["!cols"] = [{ wch: 16 }, { wch: 90 }]
  XLSX.utils.book_append_sheet(wb, wsI, "Instrucciones")

  XLSX.writeFile(wb, "plantilla-ingresos.xlsx")
}

// ── Parsear Excel subido ─────────────────────────────────────────────────────
export async function parseIngresosExcel(file: File): Promise<IngresoImportRow[]> {
  const XLSX = await import("xlsx")
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: "array", cellDates: true })

  // Preferir la hoja "Ingresos"; si no, la primera
  const sheetName = wb.SheetNames.find((n) => norm(n).includes("ingreso")) || wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  if (!sheet) throw new Error("El archivo no tiene hojas legibles.")

  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" })
  if (rows.length < 2) throw new Error("El archivo no tiene datos (solo encabezados).")

  // Mapear columnas por encabezado
  const headerRow = rows[0]
  const colMap: Record<number, keyof IngresoImportRow> = {}
  headerRow.forEach((h, i) => {
    const f = fieldForHeader(h)
    if (f) colMap[i] = f
  })

  const result: IngresoImportRow[] = []
  for (let r = 1; r < rows.length; r++) {
    const raw = rows[r]
    const rec: any = {}
    for (const [idxStr, field] of Object.entries(colMap)) {
      rec[field] = raw[Number(idxStr)]
    }

    const cliente = String(rec.cliente_agencia ?? "").trim()
    const proyecto = String(rec.proyecto ?? "").trim()
    // Saltar filas vacías
    if (!cliente && !proyecto && !rec.subtotal) continue

    const subtotal = toNum(rec.subtotal)
    const ivaRaw = rec.iva
    const iva = ivaRaw == null || String(ivaRaw).trim() === "" ? Math.round(subtotal * 0.16 * 100) / 100 : toNum(ivaRaw)

    result.push({
      empresa:          mapEmpresa(rec.empresa),
      estatus:          mapEstatus(rec.estatus),
      cliente_agencia:  cliente,
      responsable:      String(rec.responsable ?? "").trim() || null,
      proyecto,
      odc:              String(rec.odc ?? "").trim() || null,
      numero_factura:   String(rec.numero_factura ?? "").trim() || null,
      subtotal,
      iva,
      fecha_aprox_pago: toDateStr(rec.fecha_aprox_pago) || null,
      fecha_pago:       toDateStr(rec.fecha_pago) || null,
      mes_cierre:       mapMes(rec.mes_cierre),
      notas:            String(rec.notas ?? "").trim() || null,
    })
  }

  // Validar obligatorios
  const invalid = result.findIndex((r) => !r.cliente_agencia || !r.proyecto)
  if (invalid >= 0) {
    throw new Error(`La fila ${invalid + 2} no tiene Cliente/Agencia o Proyecto (ambos obligatorios).`)
  }
  if (result.length === 0) throw new Error("No se encontraron filas con datos para importar.")

  return result
}
