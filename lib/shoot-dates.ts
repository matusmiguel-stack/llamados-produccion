type ShootDateFields = {
  start_time: string
  end_time: string
  all_day: boolean
}

function storedDatePart(iso: string) {
  return iso.slice(0, 10)
}

function storedTimePart(iso: string) {
  const match = iso.match(/T(\d{2}:\d{2}:\d{2})/)
  return match?.[1] ?? "00:00:00"
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function datePartFromTimestamp(iso: string) {
  return toDateInputValue(new Date(iso))
}

function isEndOfDayTimestamp(iso: string) {
  return storedTimePart(iso).startsWith("23:59")
}

export function shootToDateRange(shoot: ShootDateFields) {
  if (!shoot.all_day) {
    const startDate = datePartFromTimestamp(shoot.start_time)
    const endDate = datePartFromTimestamp(shoot.end_time)

    return {
      startDate,
      endDate: endDate < startDate ? startDate : endDate,
    }
  }

  const startDate = storedDatePart(shoot.start_time)
  let endDate = storedDatePart(shoot.end_time)

  if (endDate > startDate && !isEndOfDayTimestamp(shoot.end_time)) {
    const end = new Date(`${endDate}T12:00:00`)
    end.setDate(end.getDate() - 1)
    endDate = toDateInputValue(end)
  }

  if (endDate < startDate) {
    endDate = startDate
  }

  return { startDate, endDate }
}

export function shootOverlapsDate(shoot: ShootDateFields, dateStr: string) {
  const { startDate, endDate } = shootToDateRange(shoot)
  return dateStr >= startDate && dateStr <= endDate
}

export function formatShootSchedule(shoot: ShootDateFields) {
  if (shoot.all_day) return "Todo el día"

  const start = new Date(shoot.start_time)
  const end = new Date(shoot.end_time)

  return `${start.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  })} – ${end.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}
