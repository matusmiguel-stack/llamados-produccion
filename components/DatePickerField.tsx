"use client"

import { useEffect, useMemo, useRef, useState } from "react"

type DatePickerFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  minDate?: string
  maxDate?: string
  placeholder?: string
  labelStyle?: React.CSSProperties
  hideLabel?: boolean
}

const WEEKDAY_LABELS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"]
const MONTH_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

export function DatePickerField({
  label,
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = "Elegir fecha",
  labelStyle,
  hideLabel = false,
}: DatePickerFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 })
  const [viewMonth, setViewMonth] = useState(() => parseMonthFromValue(value))

  useEffect(() => {
    if (value) {
      setViewMonth(parseMonthFromValue(value))
    }
  }, [value])

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [open])

  const calendarDays = useMemo(
    () => buildCalendarDays(viewMonth.getFullYear(), viewMonth.getMonth()),
    [viewMonth]
  )

  function selectDate(day: number) {
    const nextValue = toDateInputValue(
      new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day)
    )

    if (minDate && nextValue < minDate) return
    if (maxDate && nextValue > maxDate) return

    onChange(nextValue)
    setOpen(false)
  }

  function shiftMonth(delta: number) {
    setViewMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + delta, 1)
    )
  }

  function toggleOpen() {
    if (open) {
      setOpen(false)
      return
    }

    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      const popoverWidth = 280
      const popoverHeight = 320
      let top = rect.bottom + 6
      let left = rect.left

      if (top + popoverHeight > window.innerHeight - 12) {
        top = Math.max(12, rect.top - popoverHeight - 6)
      }

      if (left + popoverWidth > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - popoverWidth - 12)
      }

      setPopoverPosition({ top, left })
    }

    setOpen(true)
  }

  const displayValue = value ? formatDisplayDate(value) : placeholder

  return (
    <label style={fieldWrapStyle}>
      {!hideLabel && (
        <span style={{ ...defaultLabelStyle, ...labelStyle }}>{label}</span>
      )}
      <div ref={rootRef} style={pickerRootStyle}>
        <button
          ref={triggerRef}
          type="button"
          onClick={toggleOpen}
          style={{
            ...triggerStyle,
            color: value ? "#f8fafc" : "#64748b",
          }}
        >
          <span style={triggerTextStyle}>{displayValue}</span>
          <CalendarIcon />
        </button>

        {open && (
          <div
            style={{
              ...popoverStyle,
              top: popoverPosition.top,
              left: popoverPosition.left,
            }}
          >
            <div style={popoverHeaderStyle}>
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                style={navButtonStyle}
                aria-label="Mes anterior"
              >
                ‹
              </button>
              <p style={monthLabelStyle}>
                {MONTH_LABELS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
              </p>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                style={navButtonStyle}
                aria-label="Mes siguiente"
              >
                ›
              </button>
            </div>

            <div style={weekdayRowStyle}>
              {WEEKDAY_LABELS.map((weekday) => (
                <span key={weekday} style={weekdayLabelStyle}>
                  {weekday}
                </span>
              ))}
            </div>

            <div style={daysGridStyle}>
              {calendarDays.map((day, index) => {
                if (!day) {
                  return <span key={`empty-${index}`} style={emptyDayStyle} />
                }

                const dateValue = toDateInputValue(
                  new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day)
                )
                const isSelected = value === dateValue
                const isDisabled =
                  (minDate ? dateValue < minDate : false) ||
                  (maxDate ? dateValue > maxDate : false)
                const isToday = dateValue === toDateInputValue(new Date())

                return (
                  <button
                    key={dateValue}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => selectDate(day)}
                    style={{
                      ...dayButtonStyle,
                      ...(isSelected ? daySelectedStyle : {}),
                      ...(isToday && !isSelected ? dayTodayStyle : {}),
                      ...(isDisabled ? dayDisabledStyle : {}),
                    }}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </label>
  )
}

function CalendarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function parseMonthFromValue(value: string) {
  if (!value) return new Date(new Date().getFullYear(), new Date().getMonth(), 1)

  const [year, month] = value.split("-").map(Number)
  return new Date(year, month - 1, 1)
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatDisplayDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function buildCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  let startOffset = firstDay.getDay() - 1
  if (startOffset < 0) startOffset = 6

  const days: Array<number | null> = []
  for (let index = 0; index < startOffset; index += 1) {
    days.push(null)
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(day)
  }
  return days
}

const fieldWrapStyle: React.CSSProperties = {
  display: "grid",
  gap: 5,
  minWidth: 0,
}

const defaultLabelStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 500,
}

const pickerRootStyle: React.CSSProperties = {
  position: "relative",
}

const triggerStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  padding: "8px 10px",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 8,
  background: "rgba(2,6,23,0.55)",
  color: "#f8fafc",
  fontSize: 13,
  lineHeight: 1.35,
  cursor: "pointer",
  textAlign: "left",
}

const triggerTextStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const popoverStyle: React.CSSProperties = {
  position: "fixed",
  zIndex: 1000001,
  width: 280,
  padding: 12,
  borderRadius: 12,
  background: "rgba(15, 23, 42, 0.98)",
  border: "1px solid rgba(148,163,184,0.18)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
  backdropFilter: "blur(16px)",
}

const popoverHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 10,
}

const monthLabelStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 600,
}

const navButtonStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(255,255,255,0.04)",
  color: "#e2e8f0",
  cursor: "pointer",
  fontSize: 18,
  lineHeight: 1,
}

const weekdayRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 4,
  marginBottom: 6,
}

const weekdayLabelStyle: React.CSSProperties = {
  textAlign: "center",
  color: "#64748b",
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
}

const daysGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  gap: 4,
}

const emptyDayStyle: React.CSSProperties = {
  width: 32,
  height: 32,
}

const dayButtonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "1px solid transparent",
  background: "transparent",
  color: "#e2e8f0",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
}

const daySelectedStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #7c3aed, #6366f1)",
  border: "1px solid rgba(167,139,250,0.35)",
  color: "#ffffff",
  fontWeight: 700,
}

const dayTodayStyle: React.CSSProperties = {
  border: "1px solid rgba(167,139,250,0.35)",
  color: "#ddd6fe",
}

const dayDisabledStyle: React.CSSProperties = {
  opacity: 0.28,
  cursor: "not-allowed",
}
