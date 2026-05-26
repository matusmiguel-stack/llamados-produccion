export const BIRTHDAY_EVENT_PREFIX = "birthday:"

export function employeeDisplayName(employee: {
  nickname?: string | null
  nombre: string
}) {
  return employee.nickname?.trim() || employee.nombre
}

export function isBirthdayOnDate(
  cumpleanos: string | null | undefined,
  dateStr: string
) {
  if (!cumpleanos) return false

  const [, birthMonth, birthDay] = cumpleanos.split("-")
  const [, month, day] = dateStr.split("-")

  if (!birthMonth || !birthDay || !month || !day) return false

  return birthMonth === month && birthDay === day
}

export function getEmployeesWithBirthdayOnDate(
  employees: Array<{ id: string; cumpleanos?: string | null; nickname?: string | null; nombre: string; puesto?: string }>,
  dateStr: string
) {
  return employees
    .filter((employee) => isBirthdayOnDate(employee.cumpleanos, dateStr))
    .sort((a, b) =>
      employeeDisplayName(a).localeCompare(employeeDisplayName(b), "es")
    )
}

export function vacationOverlapsDate(
  vacation: { start_date: string; end_date: string },
  dateStr: string
) {
  return dateStr >= vacation.start_date && dateStr <= vacation.end_date
}

export function getVacationsOnDate(
  vacations: Array<{ id: string; start_date: string; end_date: string }>,
  dateStr: string
) {
  return vacations.filter((vacation) => vacationOverlapsDate(vacation, dateStr))
}

export function getEmployeesOnVacationOnDate(
  employees: Array<{ id: string; nickname?: string | null; nombre: string; puesto?: string }>,
  vacations: Array<{ id: string; start_date: string; end_date: string }>,
  vacationEmployees: Array<{ vacation_id: string; employee_id: string; employees?: any }>,
  dateStr: string
) {
  const vacationsOnDate = getVacationsOnDate(vacations, dateStr)
  const employeeIds = new Set<string>()

  vacationEmployees.forEach((assignment) => {
    if (vacationsOnDate.some((vacation) => vacation.id === assignment.vacation_id)) {
      employeeIds.add(assignment.employee_id)
    }
  })

  return employees
    .filter((employee) => employeeIds.has(employee.id))
    .sort((a, b) =>
      employeeDisplayName(a).localeCompare(employeeDisplayName(b), "es")
    )
}

export function buildBirthdayCalendarEvents(
  employees: Array<{
    id: string
    cumpleanos?: string | null
    nickname?: string | null
    nombre: string
  }>,
  options?: {
    filterEmployeeId?: string
    color?: string
    startYear?: number
    endYear?: number
  }
) {
  const color = options?.color || "#f59e0b"
  const currentYear = new Date().getFullYear()
  const startYear = options?.startYear ?? currentYear - 2
  const endYear = options?.endYear ?? currentYear + 5
  const events: Array<{
    id: string
    title: string
    start: string
    allDay: boolean
    backgroundColor: string
    borderColor: string
    textColor: string
    editable: boolean
  }> = []

  employees.forEach((employee) => {
    if (!employee.cumpleanos) return
    if (options?.filterEmployeeId && employee.id !== options.filterEmployeeId) return

    const [, month, day] = employee.cumpleanos.split("-")
    if (!month || !day) return

    for (let year = startYear; year <= endYear; year += 1) {
      const dateStr = `${year}-${month}-${day}`

      events.push({
        id: `${BIRTHDAY_EVENT_PREFIX}${employee.id}:${year}`,
        title: `🎂 ${employeeDisplayName(employee)}`,
        start: dateStr,
        allDay: true,
        backgroundColor: color,
        borderColor: color,
        textColor: "#ffffff",
        editable: false,
      })
    }
  })

  return events
}
