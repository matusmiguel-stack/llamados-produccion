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
