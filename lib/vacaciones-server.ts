// Lógica de vacaciones compartida por las API routes (usa service role).

import { contarDiasHabiles, isWeekend, periodoActual, resumenVacaciones } from "./vacaciones"

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

export type EmployeeVac = {
  id: string
  nombre: string
  apellido_paterno: string
  nickname: string | null
  email: string
  vac_anios: number | null
  vac_mes_reseteo: number | null
  vac_dias_base: number | null
  vac_ultimo_reset_anio: number | null
}

export function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Normaliza y valida la lista de días pedidos. Devuelve el error o los días limpios. */
export function validarDias(input: unknown): { error: string } | { dias: string[] } {
  if (!Array.isArray(input) || input.length === 0) {
    return { error: "Selecciona al menos un día" }
  }
  if (input.length > 90) {
    return { error: "Demasiados días en una sola solicitud" }
  }

  const dias = Array.from(new Set(input.map((d) => String(d).slice(0, 10)))).sort()

  for (const d of dias) {
    if (!ISO_RE.test(d) || Number.isNaN(Date.parse(d))) {
      return { error: `Fecha inválida: ${d}` }
    }
    if (isWeekend(d)) {
      return { error: "Los fines de semana no cuentan como vacaciones" }
    }
  }
  if (dias[0] < hoyISO()) {
    return { error: "No puedes solicitar días que ya pasaron" }
  }

  return { dias }
}

/** Empleado vinculado al usuario por email (así se conectan profiles y employees).
 *  Coincidencia exacta en minúsculas: con ilike, un "_" en el correo sería comodín. */
export async function buscarEmpleadoPorEmail(admin: any, email: string): Promise<EmployeeVac | null> {
  // Hay fichas con el correo vacío: sin correo no hay a quién ligar
  if (!email?.trim()) return null
  const { data } = await admin
    .from("employees")
    .select("id, nombre, apellido_paterno, nickname, email, vac_anios, vac_mes_reseteo, vac_dias_base, vac_ultimo_reset_anio")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle()
  return (data as EmployeeVac) || null
}

/** Rangos de vacaciones ya bloqueados en el calendario para un empleado. */
export async function rangosDelEmpleado(admin: any, employeeId: string) {
  const { data } = await admin
    .from("vacation_employees")
    .select("vacations(start_date, end_date)")
    .eq("employee_id", employeeId)

  return ((data as any[]) || [])
    .map((row) => row.vacations)
    .filter((v: any) => v?.start_date && v?.end_date) as { start_date: string; end_date: string }[]
}

/** Saldo de días del período actual, descontando lo que ya está pendiente de aprobar. */
export async function calcularSaldo(admin: any, emp: EmployeeVac, excluirRequestId?: string) {
  const rangos = await rangosDelEmpleado(admin, emp.id)
  const resumen = resumenVacaciones(emp, rangos)
  const { startISO, endISO } = periodoActual(emp.vac_mes_reseteo || 1)

  let query = admin
    .from("vacation_requests")
    .select("id, dias")
    .eq("employee_id", emp.id)
    .eq("status", "pendiente")
  if (excluirRequestId) query = query.neq("id", excluirRequestId)

  const { data: pendientes } = await query
  const diasPendientes: string[] = ((pendientes as any[]) || []).flatMap((r) => r.dias || [])
  const pendientesEnPeriodo = contarDiasHabiles(
    diasPendientes.filter((d) => d >= startISO && d <= endISO),
  )

  return {
    resumen,
    rangos,
    startISO,
    endISO,
    pendientesEnPeriodo,
    // Lo que realmente puede comprometer hoy
    disponibles: resumen.restantes - pendientesEnPeriodo,
  }
}

/** Días de la solicitud que caen dentro del período vigente (los que consumen saldo). */
export function diasEnPeriodo(dias: string[], startISO: string, endISO: string): number {
  return contarDiasHabiles(dias.filter((d) => d >= startISO && d <= endISO))
}

/** Días que ya están bloqueados en el calendario dentro de los rangos dados. */
export function diasYaBloqueados(dias: string[], rangos: { start_date: string; end_date: string }[]): string[] {
  return dias.filter((d) => rangos.some((r) => d >= r.start_date && d <= r.end_date))
}

export function nombreEmpleado(emp: { nickname: string | null; nombre: string; apellido_paterno: string }): string {
  return emp.nickname?.trim() || `${emp.nombre} ${emp.apellido_paterno}`.trim()
}
