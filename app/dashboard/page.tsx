"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "../../lib/supabase"
import { AppSidebar } from "../../components/AppSidebar"
import { DatePickerField } from "../../components/DatePickerField"
import {
  employeeDisplayName,
  formatAnniversaryYears,
  getEmployeesOnVacationOnDate,
  getEmployeesWithAnniversaryOnDate,
  getEmployeesWithBirthdayOnDate,
} from "../../lib/employee-dates"

export default function DashboardPage() {
  const [profile, setProfile] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [allShoots, setAllShoots] = useState<any[]>([])
  const [shootEmployees, setShootEmployees] = useState<any[]>([])
  const [allVacations, setAllVacations] = useState<any[]>([])
  const [vacationEmployees, setVacationEmployees] = useState<any[]>([])
  const [selectedDate, setSelectedDate] = useState(getLocalDateString)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const isAdmin = profile?.role === "admin"

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  async function loadPage() {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      window.location.href = "/login"
      return
    }

    setUser(session.user)

    const { data: profiles } = await supabase.from("profiles").select("*")
    const myProfile = profiles?.find(
      (p) =>
        p.email?.trim().toLowerCase() ===
        session.user.email?.trim().toLowerCase()
    )

    setProfile(myProfile)

    const { data: shoots } = await supabase
      .from("shoots")
      .select("*")
      .order("start_time")

    const { data: emps } = await supabase
      .from("employees")
      .select("*")
      .order("nombre")
      .order("apellido_paterno")

    const { data: employeeAssignments } = await supabase
      .from("shoot_employees")
      .select("*, shoots(*), employees(*)")

    const { data: vacations } = await supabase
      .from("vacations")
      .select("*")
      .order("start_date")

    const { data: vacationAssignments } = await supabase
      .from("vacation_employees")
      .select("*, vacations(*), employees(*)")

    setAllShoots(shoots || [])
    setEmployees(emps || [])
    setShootEmployees(employeeAssignments || [])
    setAllVacations(vacations || [])
    setVacationEmployees(vacationAssignments || [])
  }

  useEffect(() => {
    loadPage()
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  function shiftDate(days: number) {
    const date = new Date(selectedDate + "T12:00:00")
    date.setDate(date.getDate() + days)
    setSelectedDate(getLocalDateString(date))
  }

  const shootsOnDate = useMemo(
    () => allShoots.filter((shoot) => shootOverlapsDate(shoot, selectedDate)),
    [allShoots, selectedDate]
  )

  const vacationsToday = useMemo(
    () =>
      getEmployeesOnVacationOnDate(
        employees,
        allVacations,
        vacationEmployees,
        selectedDate
      ),
    [employees, allVacations, vacationEmployees, selectedDate]
  )

  const birthdaysToday = useMemo(
    () => getEmployeesWithBirthdayOnDate(employees, selectedDate),
    [employees, selectedDate]
  )

  const anniversariesToday = useMemo(
    () => getEmployeesWithAnniversaryOnDate(employees, selectedDate),
    [employees, selectedDate]
  )

  const crewSummaries = useMemo(() => {
    return employees
      .map((person) => {
        const shoots = shootEmployees
          .filter((assignment) => assignment.employee_id === person.id)
          .map((assignment) =>
            allShoots.find((shoot) => shoot.id === assignment.shoot_id)
          )
          .filter(
            (shoot): shoot is NonNullable<typeof shoot> =>
              !!shoot && shootOverlapsDate(shoot, selectedDate)
          )
          .sort(
            (a, b) =>
              new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
          )

        return { person, shoots }
      })
      .sort((a, b) => {
        if (a.shoots.length !== b.shoots.length) {
          return b.shoots.length - a.shoots.length
        }
        return employeeDisplayName(a.person).localeCompare(
          employeeDisplayName(b.person),
          "es"
        )
      })
  }, [employees, shootEmployees, allShoots, selectedDate])

  const activeCrew = crewSummaries.filter((entry) => entry.shoots.length > 0)
  const vacationIds = new Set(vacationsToday.map((person) => person.id))
  const idleCrew = crewSummaries.filter(
    (entry) => entry.shoots.length === 0 && !vacationIds.has(entry.person.id)
  )

  const formattedDate = new Date(selectedDate + "T12:00:00").toLocaleDateString(
    "es-CL",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  )

  return (
    <div style={appShellStyle}>
      <AppSidebar
        profile={profile}
        user={user}
        isAdmin={isAdmin}
        isMobile={isMobile}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen(!menuOpen)}
        onMenuClose={() => setMenuOpen(false)}
        onLogout={logout}
      />

      <main style={{ ...mainStyle, padding: isMobile ? "76px 14px 24px" : "28px 32px" }}>
        <div style={pageContainerStyle}>
          <header style={pageHeaderStyle}>
            <div>
              <h1 style={pageTitleStyle}>Dashboard crew</h1>
              <p style={pageSubtitleStyle}>
                {activeCrew.length} con llamados · {vacationsToday.length} de vacaciones ·{" "}
                {birthdaysToday.length} cumpleaños · {anniversariesToday.length} aniversarios ·{" "}
                {idleCrew.length} libres · {shootsOnDate.length} llamado
                {shootsOnDate.length === 1 ? "" : "s"}
              </p>
            </div>

            <div style={dateControlsStyle}>
              <button onClick={() => shiftDate(-1)} style={ghostButtonStyle}>
                ←
              </button>
              <button
                onClick={() => setSelectedDate(getLocalDateString())}
                style={ghostButtonStyle}
              >
                Hoy
              </button>
              <div style={datePickerWrapStyle}>
                <DatePickerField
                  label="Fecha"
                  hideLabel
                  value={selectedDate}
                  onChange={setSelectedDate}
                />
              </div>
              <button onClick={() => shiftDate(1)} style={ghostButtonStyle}>
                →
              </button>
            </div>
          </header>

          <section style={dateBannerStyle}>
            <p style={dateBannerTitleStyle}>{formattedDate}</p>
            <p style={dateBannerHintStyle}>
              Llamados, vacaciones, cumpleaños y aniversarios del equipo Retro
            </p>
          </section>

          <div
            style={{
              ...summaryGridStyle,
              gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
            }}
          >
            <section style={summaryPanelStyle}>
              <div style={panelHeaderStyle}>
                <p style={panelTitleStyle}>Vacaciones</p>
                <p style={panelHintStyle}>
                  {vacationsToday.length} persona{vacationsToday.length === 1 ? "" : "s"} fuera
                </p>
              </div>
              {vacationsToday.length > 0 ? (
                <div style={summaryChipGridStyle}>
                  {vacationsToday.map((person) => (
                    <div key={person.id} style={vacationChipStyle}>
                      <span style={avatarStyle(employeeDisplayName(person), "vacation")}>
                        {employeeDisplayName(person).charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <p style={summaryNameStyle}>{employeeDisplayName(person)}</p>
                        <p style={summaryMetaStyle}>{person.puesto}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={summaryEmptyStyle}>Nadie de vacaciones este día</p>
              )}
            </section>

            <section style={summaryPanelStyle}>
              <div style={panelHeaderStyle}>
                <p style={panelTitleStyle}>Cumpleaños</p>
                <p style={panelHintStyle}>
                  {birthdaysToday.length} celebración{birthdaysToday.length === 1 ? "" : "es"} hoy
                </p>
              </div>
              {birthdaysToday.length > 0 ? (
                <div style={summaryChipGridStyle}>
                  {birthdaysToday.map((person) => (
                    <div key={person.id} style={birthdayChipStyle}>
                      <span style={avatarStyle(employeeDisplayName(person), "birthday")}>
                        🎂
                      </span>
                      <div>
                        <p style={summaryNameStyle}>{employeeDisplayName(person)}</p>
                        <p style={summaryMetaStyle}>{person.puesto}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={summaryEmptyStyle}>Sin cumpleaños este día</p>
              )}
            </section>

            <section style={summaryPanelStyle}>
              <div style={panelHeaderStyle}>
                <p style={panelTitleStyle}>Aniversarios</p>
                <p style={panelHintStyle}>
                  {anniversariesToday.length} aniversario
                  {anniversariesToday.length === 1 ? "" : "s"} laboral
                  {anniversariesToday.length === 1 ? "" : "es"} hoy
                </p>
              </div>
              {anniversariesToday.length > 0 ? (
                <div style={summaryChipGridStyle}>
                  {anniversariesToday.map(({ employee, years }) => (
                    <div key={employee.id} style={anniversaryChipStyle}>
                      <span style={avatarStyle(employeeDisplayName(employee), "anniversary")}>
                        🎉
                      </span>
                      <div>
                        <p style={summaryNameStyle}>{employeeDisplayName(employee)}</p>
                        <p style={summaryMetaStyle}>
                          {formatAnniversaryYears(years)} · {employee.puesto}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={summaryEmptyStyle}>Sin aniversarios este día</p>
              )}
            </section>
          </div>

          {crewSummaries.length === 0 ? (
            <section style={emptyPanelStyle}>
              No hay empleados registrados.
            </section>
          ) : (
            <>
              <div
                style={{
                  ...crewGridStyle,
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
                }}
              >
                {activeCrew.map(({ person, shoots }) => (
                  <section key={person.id} style={crewCardStyle}>
                    <div style={crewCardHeaderStyle}>
                      <div style={crewIdentityStyle}>
                        <span style={avatarStyle(employeeDisplayName(person))}>
                          {employeeDisplayName(person).charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <p style={crewNameStyle}>{employeeDisplayName(person)}</p>
                          <p style={crewRoleStyle}>{person.puesto}</p>
                        </div>
                      </div>
                      <span style={countBadgeStyle}>
                        {shoots.length} llamado{shoots.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div style={shootListStyle}>
                      {shoots.map((shoot) => (
                        <div key={shoot.id} style={shootRowStyle}>
                          <div style={shootRowTopStyle}>
                            <span style={timeBadgeStyle(shoot.status)}>
                              {formatShootSchedule(shoot)}
                            </span>
                            <span style={statusBadgeStyle(shoot.status)}>
                              {statusLabel(shoot.status)}
                            </span>
                          </div>
                          <p style={shootTitleStyle}>
                            {statusEmoji(shoot.status)} {shoot.title}
                          </p>
                          <p style={shootMetaStyle}>
                            {shoot.client || "Sin cliente"} ·{" "}
                            {shoot.project || "Sin proyecto"}
                          </p>
                          {(shoot.location || shoot.address) && (
                            <p style={shootLocationStyle}>
                              📍 {shoot.location || shoot.address}
                            </p>
                          )}
                          {shoot.public_notes && (
                            <p style={shootNotesStyle}>{shoot.public_notes}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              {idleCrew.length > 0 && (
                <section style={panelStyle}>
                  <div style={panelHeaderStyle}>
                    <p style={panelTitleStyle}>Sin llamados este día</p>
                    <p style={panelHintStyle}>
                      {idleCrew.length} persona{idleCrew.length === 1 ? "" : "s"}{" "}
                      disponible{idleCrew.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div style={idleGridStyle}>
                    {idleCrew.map(({ person }) => (
                      <div key={person.id} style={idleChipStyle}>
                        <span style={avatarStyle(employeeDisplayName(person), "muted")}>
                          {employeeDisplayName(person).charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <p style={idleNameStyle}>{employeeDisplayName(person)}</p>
                          <p style={idleRoleStyle}>{person.puesto}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {activeCrew.length === 0 && (
                <section style={emptyPanelStyle}>
                  No hay llamados asignados al crew para este día.
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function shootOverlapsDate(shoot: any, dateStr: string) {
  const dayStart = new Date(`${dateStr}T00:00:00`)
  const dayEnd = new Date(`${dateStr}T23:59:59.999`)
  const start = new Date(shoot.start_time)
  const end = new Date(shoot.end_time)
  return start <= dayEnd && end >= dayStart
}

function formatShootSchedule(shoot: any) {
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

function statusLabel(status: string) {
  if (status === "confirmed") return "Confirmado"
  if (status === "cancelled") return "Cancelado"
  if (status === "wrap") return "Wrap"
  return "Tentativo"
}

function statusEmoji(status: string) {
  if (status === "confirmed") return "✅"
  if (status === "cancelled") return "❌"
  if (status === "wrap") return "🏁"
  return "🟡"
}

function getStatusColor(status: string) {
  if (status === "confirmed") return "#16a34a"
  if (status === "cancelled") return "#dc2626"
  if (status === "wrap") return "#64748b"
  return "#eab308"
}

function statusBadgeStyle(status: string): React.CSSProperties {
  const color = getStatusColor(status)
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 8px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 600,
    background: `${color}22`,
    border: `1px solid ${color}44`,
    color: "#f8fafc",
  }
}

function timeBadgeStyle(status: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 8px",
    borderRadius: 8,
    fontSize: 11,
    fontWeight: 600,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(148,163,184,0.14)",
    color: "#e2e8f0",
  }
}

function avatarStyle(
  name: string,
  variant: "default" | "muted" | "vacation" | "birthday" | "anniversary" = "default"
): React.CSSProperties {
  if (variant === "vacation") {
    return {
      width: 34,
      height: 34,
      borderRadius: 10,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      background: "rgba(147,51,234,0.22)",
      border: "1px solid rgba(167,139,250,0.28)",
      color: "#f8fafc",
      fontSize: 13,
      fontWeight: 700,
    }
  }

  if (variant === "birthday") {
    return {
      width: 34,
      height: 34,
      borderRadius: 10,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      background: "rgba(245,158,11,0.18)",
      border: "1px solid rgba(251,191,36,0.28)",
      color: "#fde68a",
      fontSize: 15,
      fontWeight: 700,
    }
  }

  if (variant === "anniversary") {
    return {
      width: 34,
      height: 34,
      borderRadius: 10,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      background: "rgba(20,184,166,0.18)",
      border: "1px solid rgba(45,212,191,0.28)",
      color: "#99f6e4",
      fontSize: 15,
      fontWeight: 700,
    }
  }

  const muted = variant === "muted"

  return {
    width: 34,
    height: 34,
    borderRadius: 10,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    background: muted
      ? "rgba(148,163,184,0.12)"
      : "linear-gradient(135deg, rgba(124,58,237,0.35), rgba(14,165,233,0.22))",
    border: muted
      ? "1px solid rgba(148,163,184,0.16)"
      : "1px solid rgba(167,139,250,0.22)",
    color: muted ? "#94a3b8" : "#f8fafc",
    fontSize: 13,
    fontWeight: 700,
  }
}

const appShellStyle: React.CSSProperties = {
  display: "flex",
  minHeight: "100vh",
}

const mainStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
}

const pageContainerStyle: React.CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
}

const pageHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 14,
  flexWrap: "wrap",
}

const pageTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 22,
  letterSpacing: -0.5,
}

const pageSubtitleStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#64748b",
  fontSize: 12,
}

const dateControlsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
}

const datePickerWrapStyle: React.CSSProperties = {
  minWidth: 190,
}

const ghostButtonStyle: React.CSSProperties = {
  padding: "7px 10px",
  background: "transparent",
  color: "#94a3b8",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 500,
  fontSize: 12,
}

const dateBannerStyle: React.CSSProperties = {
  padding: "12px 14px",
  marginBottom: 14,
  borderRadius: 12,
  background:
    "linear-gradient(135deg, rgba(124,58,237,0.14), rgba(14,165,233,0.08))",
  border: "1px solid rgba(167,139,250,0.16)",
}

const dateBannerTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 15,
  fontWeight: 600,
  textTransform: "capitalize",
}

const dateBannerHintStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#94a3b8",
  fontSize: 12,
}

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  marginBottom: 14,
}

const summaryPanelStyle: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 16,
  padding: "14px 16px",
}

const summaryChipGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
  gap: 8,
}

const summaryNameStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 600,
}

const summaryMetaStyle: React.CSSProperties = {
  margin: "2px 0 0",
  color: "#64748b",
  fontSize: 11,
}

const summaryEmptyStyle: React.CSSProperties = {
  margin: 0,
  color: "#64748b",
  fontSize: 12,
}

const vacationChipStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(147,51,234,0.10)",
  border: "1px solid rgba(167,139,250,0.18)",
}

const birthdayChipStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(245,158,11,0.10)",
  border: "1px solid rgba(251,191,36,0.18)",
}

const anniversaryChipStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(20,184,166,0.10)",
  border: "1px solid rgba(45,212,191,0.18)",
}

const crewGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
}

const crewCardStyle: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148,163,184,0.14)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
  backdropFilter: "blur(16px)",
  borderRadius: 16,
  padding: "14px 16px",
}

const crewCardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
  marginBottom: 12,
  paddingBottom: 12,
  borderBottom: "1px solid rgba(148,163,184,0.10)",
}

const crewIdentityStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
}

const crewNameStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 600,
}

const crewRoleStyle: React.CSSProperties = {
  margin: "2px 0 0",
  color: "#64748b",
  fontSize: 11,
}

const countBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(124,58,237,0.16)",
  border: "1px solid rgba(167,139,250,0.22)",
  color: "#ddd6fe",
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: "nowrap",
}

const shootListStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
}

const shootRowStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
}

const shootRowTopStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  marginBottom: 8,
  flexWrap: "wrap",
}

const shootTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 600,
}

const shootMetaStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#94a3b8",
  fontSize: 12,
}

const shootLocationStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#cbd5e1",
  fontSize: 12,
}

const shootNotesStyle: React.CSSProperties = {
  margin: "8px 0 0",
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(2,6,23,0.45)",
  border: "1px solid rgba(148,163,184,0.10)",
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.4,
}

const panelStyle: React.CSSProperties = {
  marginTop: 14,
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 16,
  padding: "14px 16px",
}

const panelHeaderStyle: React.CSSProperties = {
  marginBottom: 12,
}

const panelTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 600,
}

const panelHintStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#64748b",
  fontSize: 12,
}

const idleGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
  gap: 8,
}

const idleChipStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
}

const idleNameStyle: React.CSSProperties = {
  margin: 0,
  color: "#cbd5e1",
  fontSize: 13,
  fontWeight: 500,
}

const idleRoleStyle: React.CSSProperties = {
  margin: "2px 0 0",
  color: "#64748b",
  fontSize: 11,
}

const emptyPanelStyle: React.CSSProperties = {
  padding: "24px 16px",
  borderRadius: 16,
  textAlign: "center",
  color: "#64748b",
  fontSize: 13,
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px dashed rgba(148,163,184,0.16)",
}
