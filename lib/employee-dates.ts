export const BIRTHDAY_EVENT_PREFIX = "birthday:"
export const ANNIVERSARY_EVENT_PREFIX = "anniversary:"

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

export function getYearsOfService(
  fechaIngreso: string | null | undefined,
  dateStr: string
) {
  if (!fechaIngreso) return null

  const [hireYear, hireMonth, hireDay] = fechaIngreso.split("-").map(Number)
  const [year, month, day] = dateStr.split("-").map(Number)

  if (!hireYear || !hireMonth || !hireDay || !year || !month || !day) return null
  if (hireMonth !== month || hireDay !== day) return null

  const years = year - hireYear
  if (years < 1) return null

  return years
}

export function isAnniversaryOnDate(
  fechaIngreso: string | null | undefined,
  dateStr: string
) {
  return getYearsOfService(fechaIngreso, dateStr) !== null
}

export function formatAnniversaryYears(years: number) {
  return years === 1 ? "1 año" : `${years} años`
}

export function getEmployeesWithAnniversaryOnDate(
  employees: Array<{
    id: string
    fecha_ingreso?: string | null
    nickname?: string | null
    nombre: string
    puesto?: string
  }>,
  dateStr: string
) {
  return employees
    .map((employee) => {
      const years = getYearsOfService(employee.fecha_ingreso, dateStr)
      if (years === null) return null

      return { employee, years }
    })
    .filter(
      (entry): entry is { employee: (typeof employees)[number]; years: number } =>
        entry !== null
    )
    .sort((a, b) => {
      if (a.years !== b.years) return b.years - a.years
      return employeeDisplayName(a.employee).localeCompare(
        employeeDisplayName(b.employee),
        "es"
      )
    })
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

export function buildAnniversaryCalendarEvents(
  employees: Array<{
    id: string
    fecha_ingreso?: string | null
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
  const color = options?.color || "#14b8a6"
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
    if (!employee.fecha_ingreso) return
    if (options?.filterEmployeeId && employee.id !== options.filterEmployeeId) return

    const [hireYear, month, day] = employee.fecha_ingreso.split("-").map(Number)
    if (!hireYear || !month || !day) return

    for (let year = startYear; year <= endYear; year += 1) {
      const years = year - hireYear
      if (years < 1) continue

      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`

      events.push({
        id: `${ANNIVERSARY_EVENT_PREFIX}${employee.id}:${year}`,
        title: `🎉 ${employeeDisplayName(employee)} · ${formatAnniversaryYears(years)}`,
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
