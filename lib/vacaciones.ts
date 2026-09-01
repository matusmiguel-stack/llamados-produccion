// Escala de días de vacaciones por años laborados (Retro)
export function diasPorAnios(anios: number): number {
  if (anios <= 0) return 0
  if (anios === 1) return 12
  if (anios === 2) return 14
  if (anios === 3) return 16
  if (anios === 4) return 18
  if (anios === 5) return 20
  if (anios <= 10) return 22
  if (anios <= 15) return 24
  if (anios <= 20) return 26
  if (anios <= 25) return 28
  return 30
}

export const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

function parseISO(d: string): Date {
  const [y, m, day] = d.split("T")[0].split("-").map(Number)
  return new Date(y, m - 1, day)
}
function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// Días hábiles (lun-vie) entre dos fechas inclusive
export function businessDaysInclusive(startISO: string, endISO: string): number {
  const start = parseISO(startISO)
  const end = parseISO(endISO)
  if (end < start) return 0
  let count = 0
  const d = new Date(start)
  while (d <= end) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

// Período de vacaciones actual según el mes de reseteo
export function periodoActual(mesReseteo: number, today = new Date()): { startISO: string; endISO: string; startYear: number } {
  const mes = mesReseteo || 1
  const curMonth = today.getMonth() + 1
  const startYear = curMonth >= mes ? today.getFullYear() : today.getFullYear() - 1
  const start = new Date(startYear, mes - 1, 1)
  const end = new Date(startYear + 1, mes - 1, 0) // último día antes del siguiente reseteo
  return { startISO: toISO(start), endISO: toISO(end), startYear }
}

export type VacEmp = {
  vac_anios: number | null
  vac_mes_reseteo: number | null
  vac_dias_base: number | null
  vac_ultimo_reset_anio: number | null
}

// Días tomados en el calendario dentro del período (días hábiles, intersección con el período)
export function diasTomadosCalendario(
  vacationRanges: { start_date: string; end_date: string }[],
  startISO: string,
  endISO: string,
): number {
  let total = 0
  for (const v of vacationRanges) {
    const s = v.start_date > startISO ? v.start_date : startISO
    const e = v.end_date < endISO ? v.end_date : endISO
    if (s <= e) total += businessDaysInclusive(s, e)
  }
  return total
}

// Resumen de vacaciones de un empleado (con reinicio automático si pasó el mes de reseteo)
export function resumenVacaciones(
  emp: VacEmp,
  vacationRanges: { start_date: string; end_date: string }[],
  today = new Date(),
): {
  configurado: boolean
  anios: number
  mesReseteo: number
  corresponden: number
  tomados: number
  restantes: number
  startISO: string
  endISO: string
  needsReset: boolean
  newAnios: number
} {
  const configurado = emp.vac_mes_reseteo != null && emp.vac_anios != null
  const mesReseteo = emp.vac_mes_reseteo || 1
  const { startISO, endISO, startYear } = periodoActual(mesReseteo, today)

  // ¿Pasó un nuevo período desde el último reinicio aplicado?
  const ultimo = emp.vac_ultimo_reset_anio ?? startYear
  const resetsPasados = Math.max(0, startYear - ultimo)
  const needsReset = resetsPasados > 0
  const anios = (emp.vac_anios || 0) + resetsPasados
  // Tras un reinicio, la base de días tomados vuelve a 0
  const base = needsReset ? 0 : (emp.vac_dias_base || 0)

  const corresponden = diasPorAnios(anios)
  const tomados = base + diasTomadosCalendario(vacationRanges, startISO, endISO)
  const restantes = corresponden - tomados

  return {
    configurado, anios, mesReseteo, corresponden, tomados, restantes,
    startISO, endISO, needsReset, newAnios: anios,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Solicitudes de vacaciones
// ════════════════════════════════════════════════════════════════════════════

// Solo estas personas revisan (aprueban / declinan) las solicitudes.
// Compartido entre el frontend, las API routes y las políticas RLS.
export const VACACIONES_APROBADORES = [
  "adriana@retrocasaproductora.com", // Adriana Barrera
  "miguel@retrocasaproductora.com",  // Miguel Matus
  "matusmiguel@gmail.com",           // Miguel Matus (cuenta de pruebas)
]

export const esAprobadorVacaciones = (email: string | null | undefined) =>
  !!email && VACACIONES_APROBADORES.includes(email.toLowerCase())

// Finanzas recibe copia SOLO cuando unas vacaciones se aprueban
// (no cuando se solicitan ni cuando se declinan).
export const VACACIONES_FINANZAS = [
  "ana@retrocasaproductora.com",
  "marco@retrocasaproductora.com",
]

export type SolicitudStatus = "pendiente" | "aprobada" | "rechazada"

export const STATUS_INFO: Record<SolicitudStatus, { emoji: string; label: string; color: string; bg: string }> = {
  pendiente: { emoji: "⏳", label: "Pendiente", color: "#fbbf24", bg: "rgba(234,179,8,0.12)" },
  aprobada:  { emoji: "✅", label: "Aprobada",  color: "#34d399", bg: "rgba(52,211,153,0.12)" },
  rechazada: { emoji: "❌", label: "Declinada", color: "#f87171", bg: "rgba(248,113,113,0.12)" },
}

export function isWeekend(iso: string): boolean {
  const dow = parseISO(iso).getDay()
  return dow === 0 || dow === 6
}

// Días hábiles de una lista de fechas sueltas (ignora fines de semana y repetidos)
export function contarDiasHabiles(dias: string[]): number {
  return new Set(dias.filter((d) => !isWeekend(d))).size
}

// Agrupa fechas sueltas en rangos continuos para pintarlos en el calendario.
// El fin de semana no rompe el rango: viernes + lunes forma un solo bloque
// (el conteo de días hábiles no cambia, pero la barra se ve continua).
export function agruparDiasEnRangos(dias: string[]): { start_date: string; end_date: string }[] {
  const orden = Array.from(new Set(dias)).sort()
  const rangos: { start_date: string; end_date: string }[] = []

  for (const dia of orden) {
    const ultimo = rangos[rangos.length - 1]
    if (ultimo && siguienteDiaHabil(ultimo.end_date) === dia) {
      ultimo.end_date = dia
    } else {
      rangos.push({ start_date: dia, end_date: dia })
    }
  }

  return rangos
}

function siguienteDiaHabil(iso: string): string {
  const d = parseISO(iso)
  do {
    d.setDate(d.getDate() + 1)
  } while (d.getDay() === 0 || d.getDay() === 6)
  return toISO(d)
}

// Día en que se reinician las vacaciones del período actual (1° del mes de reseteo)
export function proximoReseteoISO(mesReseteo: number, today = new Date()): string {
  const { startYear } = periodoActual(mesReseteo || 1, today)
  return toISO(new Date(startYear + 1, (mesReseteo || 1) - 1, 1))
}

export function formatFechaLarga(iso: string): string {
  return parseISO(iso).toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })
}

export function formatFechaCorta(iso: string): string {
  return parseISO(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" })
}

// "12 de mayo", "12 al 16 de mayo", "28 de abril al 2 de mayo"
export function describirRango(startISO: string, endISO: string): string {
  if (startISO === endISO) return formatFechaLarga(startISO).replace(/^\w+,?\s*/, "")
  const a = parseISO(startISO)
  const b = parseISO(endISO)
  const mesA = a.toLocaleDateString("es-MX", { month: "long" })
  const mesB = b.toLocaleDateString("es-MX", { month: "long" })
  if (mesA === mesB && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()} al ${b.getDate()} de ${mesB} ${b.getFullYear()}`
  }
  return `${a.getDate()} de ${mesA} al ${b.getDate()} de ${mesB} ${b.getFullYear()}`
}

/** Días hábiles sueltos que abarca un rango (para pintar el calendario). */
export function expandirRango(startISO: string, endISO: string): string[] {
  const out: string[] = []
  const d = parseISO(startISO)
  const fin = parseISO(endISO)
  while (d <= fin) {
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(toISO(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}
