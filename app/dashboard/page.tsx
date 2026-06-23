"use client"
import { PageLoader } from "../../components/PageLoader"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "../../lib/supabase"
import { requireSessionProfile } from "../../lib/session-profile"
import { AppSidebar } from "../../components/AppSidebar"
import { DatePickerField } from "../../components/DatePickerField"
import {
  employeeDisplayName,
  formatAnniversaryYears,
  getEmployeesOnVacationOnDate,
  getEmployeesWithAnniversaryOnDate,
  getEmployeesWithBirthdayOnDate,
} from "../../lib/employee-dates"
import { formatShootSchedule, shootOverlapsDate } from "../../lib/shoot-dates"
import Link from "next/link"

export default function DashboardPage() {
  const [profile, setProfile] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [allShoots, setAllShoots] = useState<any[]>([])
  const [shootEmployees, setShootEmployees] = useState<any[]>([])
  const [allVacations, setAllVacations] = useState<any[]>([])
  const [vacationEmployees, setVacationEmployees] = useState<any[]>([])
  const [allJuntas, setAllJuntas] = useState<any[]>([])
  const [allEnsayos, setAllEnsayos] = useState<any[]>([])
  const [juntaAttendees, setJuntaAttendees] = useState<any[]>([])
  const [allEntregas, setAllEntregas] = useState<any[]>([])
  const [myTasks, setMyTasks] = useState<any[]>([])
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
    const auth = await requireSessionProfile()
    if (!auth) return

    setUser(auth.session.user)
    setProfile(auth.profile)

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

    const { data: juntas } = await supabase
      .from("juntas")
      .select("*")
      .order("fecha")

    const { data: juntaAttendeesData } = await supabase
      .from("junta_attendees")
      .select("junta_id, employee_id")

    const { data: ensayos } = await supabase
      .from("ensayos")
      .select("*")
      .order("fecha")

    setAllShoots(shoots || [])
    setEmployees(emps || [])
    setShootEmployees(employeeAssignments || [])
    setAllVacations(vacations || [])
    setVacationEmployees(vacationAssignments || [])
    setAllJuntas(juntas || [])
    setJuntaAttendees(juntaAttendeesData || [])
    setAllEnsayos(ensayos || [])

    const { data: entregas } = await supabase
      .from("entregas")
      .select("*")
      .order("fecha")
    setAllEntregas(entregas || [])

    const { data: tasks } = await supabase
      .from("user_tasks")
      .select("*")
      .eq("completed", false)
      .order("due_date")
    setMyTasks(tasks || [])
  }

  useEffect(() => {
    loadPage()
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const [viewMode, setViewMode] = useState<"day" | "week">("day")
  const [sendingDigest, setSendingDigest] = useState(false)
  const [digestStatus, setDigestStatus]   = useState<"idle" | "ok" | "error">("idle")
  const [testingPush, setTestingPush]     = useState(false)
  const [pushTestStatus, setPushTestStatus] = useState<"idle" | "ok" | "error">("idle")

  async function testPush() {
    setTestingPush(true)
    setPushTestStatus("idle")
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      })
      const data = await res.json()
      if (data.ok) {
        setPushTestStatus("ok")
        setTimeout(() => setPushTestStatus("idle"), 4000)
      } else {
        setPushTestStatus("error")
        alert("Error push: " + (data.error || JSON.stringify(data)))
      }
    } catch (e: any) {
      setPushTestStatus("error")
      alert("Error: " + e.message)
    } finally {
      setTestingPush(false)
    }
  }

  async function sendDigest() {
    setSendingDigest(true)
    setDigestStatus("idle")
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/cron/daily-digest", {
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      })
      const data = await res.json()
      if (data.ok) {
        setDigestStatus("ok")
        setTimeout(() => setDigestStatus("idle"), 4000)
      } else {
        setDigestStatus("error")
        alert("Error: " + (data.error || JSON.stringify(data)))
      }
    } catch (e: any) {
      setDigestStatus("error")
      alert("Error: " + e.message)
    } finally {
      setSendingDigest(false)
    }
  }

  function shiftDate(days: number) {
    const date = new Date(selectedDate + "T12:00:00")
    date.setDate(date.getDate() + (viewMode === "week" ? days * 7 : days))
    setSelectedDate(getLocalDateString(date))
  }

  // Semana: lunes a domingo de la fecha seleccionada
  const weekDays = useMemo(() => {
    const d = new Date(selectedDate + "T12:00:00")
    const dow = d.getDay() // 0=Dom, 1=Lun...
    const monday = new Date(d)
    monday.setDate(d.getDate() - ((dow + 6) % 7)) // retroceder al lunes
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday)
      day.setDate(monday.getDate() + i)
      return getLocalDateString(day)
    })
  }, [selectedDate])

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

  const juntasToday = useMemo(
    () => allJuntas.filter((j) => j.fecha === selectedDate).sort((a, b) =>
      (a.hora_inicio || "").localeCompare(b.hora_inicio || "")
    ),
    [allJuntas, selectedDate]
  )

  const entregasToday = useMemo(
    () => allEntregas.filter((e) => e.fecha === selectedDate).sort((a, b) =>
      (a.hora || "").localeCompare(b.hora || "")
    ),
    [allEntregas, selectedDate]
  )

  const ensayosToday = useMemo(
    () => allEnsayos.filter((e) => e.fecha === selectedDate).sort((a, b) =>
      (a.hora_inicio || "").localeCompare(b.hora_inicio || "")
    ),
    [allEnsayos, selectedDate]
  )

  const birthdaysToday = useMemo(
    () => getEmployeesWithBirthdayOnDate(employees, selectedDate),
    [employees, selectedDate]
  )

  const anniversariesToday = useMemo(
    () => getEmployeesWithAnniversaryOnDate(employees, selectedDate),
    [employees, selectedDate]
  )

  const shootSummaries = useMemo(() => {
    return shootsOnDate
      .map((shoot) => {
        const participants = shootEmployees
          .filter((assignment) => assignment.shoot_id === shoot.id)
          .map(
            (assignment) =>
              assignment.employees ||
              employees.find((person) => person.id === assignment.employee_id)
          )
          .filter(Boolean)
          .sort((a, b) =>
            employeeDisplayName(a).localeCompare(employeeDisplayName(b), "es")
          )

        return { shoot, participants }
      })
      .sort(
        (a, b) =>
          new Date(a.shoot.start_time).getTime() -
          new Date(b.shoot.start_time).getTime()
      )
  }, [shootsOnDate, shootEmployees, employees])

  const assignedEmployeeIds = useMemo(() => {
    return new Set(
      shootSummaries.flatMap((entry) =>
        entry.participants.map((person) => person.id)
      )
    )
  }, [shootSummaries])

  const vacationIds = useMemo(
    () => new Set(vacationsToday.map((person) => person.id)),
    [vacationsToday]
  )

  const idleCrew = useMemo(
    () =>
      employees
        .filter(
          (person) =>
            !assignedEmployeeIds.has(person.id) && !vacationIds.has(person.id)
        )
        .sort((a, b) =>
          employeeDisplayName(a).localeCompare(employeeDisplayName(b), "es")
        ),
    [employees, assignedEmployeeIds, vacationIds]
  )

  const participantsCount = assignedEmployeeIds.size

  const formattedDate = new Date(selectedDate + "T12:00:00").toLocaleDateString(
    "es-CL",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  )

  if (!profile) return <PageLoader />
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
                {shootsOnDate.length} llamado{shootsOnDate.length === 1 ? "" : "s"} ·{" "}
                {juntasToday.length} junta{juntasToday.length === 1 ? "" : "s"} ·{" "}
                {ensayosToday.length} ensayo{ensayosToday.length === 1 ? "" : "s"} ·{" "}
                {entregasToday.length} entrega{entregasToday.length === 1 ? "" : "s"} post ·{" "}
                {participantsCount} en set · {vacationsToday.length} de vacaciones ·{" "}
                {birthdaysToday.length} cumpleaños · {anniversariesToday.length} aniversarios
              </p>
            </div>

            {isAdmin && (
              <button
                onClick={testPush}
                disabled={testingPush}
                title="Enviar push de prueba a este dispositivo"
                style={{
                  padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  cursor: testingPush ? "not-allowed" : "pointer",
                  border: pushTestStatus === "ok" ? "1px solid rgba(74,222,128,0.4)" : "1px solid rgba(148,163,184,0.2)",
                  background: pushTestStatus === "ok" ? "rgba(16,185,129,0.12)" : "rgba(56,189,248,0.1)",
                  color: pushTestStatus === "ok" ? "#4ade80" : "#38bdf8",
                  opacity: testingPush ? 0.6 : 1,
                }}>
                {testingPush ? "Enviando..." : pushTestStatus === "ok" ? "✓ Push enviado" : "🔔 Test push"}
              </button>
            )}

            {isAdmin && (
              <button
                onClick={sendDigest}
                disabled={sendingDigest}
                title="Enviar resumen del día por email (modo prueba)"
                style={{
                  padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  cursor: sendingDigest ? "not-allowed" : "pointer",
                  border: digestStatus === "ok" ? "1px solid rgba(74,222,128,0.4)" : "1px solid rgba(148,163,184,0.2)",
                  background: digestStatus === "ok" ? "rgba(16,185,129,0.12)" : "rgba(167,139,250,0.1)",
                  color: digestStatus === "ok" ? "#4ade80" : "#a78bfa",
                  opacity: sendingDigest ? 0.6 : 1,
                  transition: "all 0.2s",
                }}
              >
                {sendingDigest ? "Enviando..." : digestStatus === "ok" ? "✓ Enviado" : "📧 Enviar resumen"}
              </button>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {/* Toggle Día / Semana */}
              <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(148,163,184,0.2)" }}>
                {(["day", "week"] as const).map((mode) => (
                  <button key={mode} onClick={() => setViewMode(mode)} style={{
                    padding: "6px 14px", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    background: viewMode === mode ? "rgba(124,58,237,0.3)" : "transparent",
                    color: viewMode === mode ? "#a78bfa" : "#64748b",
                  }}>
                    {mode === "day" ? "Día" : "Semana"}
                  </button>
                ))}
              </div>

              <div style={dateControlsStyle}>
                <button onClick={() => shiftDate(-1)} style={ghostButtonStyle}>←</button>
                <button onClick={() => setSelectedDate(getLocalDateString())} style={ghostButtonStyle}>Hoy</button>
                <div style={datePickerWrapStyle}>
                  <DatePickerField label="Fecha" hideLabel value={selectedDate} onChange={setSelectedDate} />
                </div>
                <button onClick={() => shiftDate(1)} style={ghostButtonStyle}>→</button>
              </div>
            </div>
          </header>

          {viewMode === "week" ? (
            <WeekView
              weekDays={weekDays}
              selectedDate={selectedDate}
              allShoots={allShoots}
              allJuntas={allJuntas}
              allEntregas={allEntregas}
              shootEmployees={shootEmployees}
              employees={employees}
              isMobile={isMobile}
              onDayClick={(d) => { setSelectedDate(d); setViewMode("day") }}
            />
          ) : (
          <>
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

          <DashboardTasksWidget tasks={myTasks} />

          {employees.length === 0 ? (
            <section style={emptyPanelStyle}>
              No hay empleados registrados.
            </section>
          ) : (
            <>
              {shootSummaries.length > 0 ? (
                <div
                  style={{
                    ...shootsGridStyle,
                    gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
                  }}
                >
                  {shootSummaries.map(({ shoot, participants }) => (
                    <section key={shoot.id} style={shootCardStyle}>
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

                      <div style={shootCrewSectionStyle}>
                        <p style={shootCrewLabelStyle}>
                          Crew ({participants.length})
                        </p>
                        {participants.length > 0 ? (
                          <div style={participantGridStyle}>
                            {participants.map((person) => (
                              <div key={person.id} style={participantChipStyle}>
                                <span style={avatarStyle(employeeDisplayName(person))}>
                                  {employeeDisplayName(person).charAt(0).toUpperCase()}
                                </span>
                                <div>
                                  <p style={participantNameStyle}>
                                    {employeeDisplayName(person)}
                                  </p>
                                  <p style={participantRoleStyle}>{person.puesto}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={shootCrewEmptyStyle}>
                            Sin crew asignado a este llamado
                          </p>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <section style={emptyPanelStyle}>
                  No hay llamados para este día.
                </section>
              )}

              {juntasToday.length > 0 && (
                <section style={panelStyle}>
                  <div style={panelHeaderStyle}>
                    <p style={panelTitleStyle}>📋 Juntas del día</p>
                    <p style={panelHintStyle}>{juntasToday.length} junta{juntasToday.length === 1 ? "" : "s"}</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {juntasToday.map((j) => {
                      const emoji = j.tipo === "Brief" ? "📋" : j.tipo === "PPM" ? "🎬" : "🤝"
                      const attendeeIds = juntaAttendees.filter((a) => a.junta_id === j.id).map((a) => a.employee_id)
                      const attendeeNames = attendeeIds
                        .map((id: string) => employees.find((e) => e.id === id))
                        .filter(Boolean)
                        .map((e: any) => employeeDisplayName(e))
                      return (
                        <div key={j.id} style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(8,145,178,0.08)", border: "1px solid rgba(8,145,178,0.2)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 16 }}>{emoji}</span>
                            <span style={{ color: "#f8fafc", fontWeight: 700, fontSize: 14 }}>{j.titulo || j.tipo}</span>
                            <span style={{ marginLeft: "auto", color: "#67e8f9", fontSize: 13 }}>
                              {j.hora_inicio}{j.hora_fin ? ` – ${j.hora_fin}` : ""} hrs
                            </span>
                          </div>
                          {j.notas && <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: 12 }}>{j.notas}</p>}
                          {attendeeNames.length > 0 && (
                            <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 12 }}>
                              {attendeeNames.join(" · ")}
                            </p>
                          )}
                          {j.link && (
                            <a href={j.link} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 8, color: "#7dd3fc", fontSize: 12 }}>
                              🔗 Unirse
                            </a>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}
              {ensayosToday.length > 0 && (
                <section style={panelStyle}>
                  <div style={panelHeaderStyle}>
                    <p style={panelTitleStyle}>🎭 Ensayos del día</p>
                    <p style={panelHintStyle}>{ensayosToday.length} ensayo{ensayosToday.length === 1 ? "" : "s"}</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {ensayosToday.map((e) => (
                      <div key={e.id} style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(219,39,119,0.08)", border: "1px solid rgba(219,39,119,0.2)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 16 }}>🎭</span>
                          <span style={{ color: "#f8fafc", fontWeight: 700, fontSize: 14 }}>{e.titulo || "Ensayo"}</span>
                          <span style={{ marginLeft: "auto", color: "#f9a8d4", fontSize: 13 }}>
                            {e.all_day || !e.hora_inicio ? "Todo el día" : `${e.hora_inicio}${e.hora_fin ? ` – ${e.hora_fin}` : ""} hrs`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {entregasToday.length > 0 && (
                <section style={panelStyle}>
                  <div style={panelHeaderStyle}>
                    <p style={panelTitleStyle}>🎞️ Post Producción</p>
                    <p style={panelHintStyle}>{entregasToday.length} entrega{entregasToday.length === 1 ? "" : "s"}</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {entregasToday.map((e) => {
                      const TIPO_COLORS: Record<string, string> = {
                        "CDT Interna":       "#6366f1",
                        "CDT Cliente":       "#0891b2",
                        "Entrega final":     "#16a34a",
                        "Ronda Ajustes":     "#ea580c",
                        "Edición y Post":    "#7c3aed",
                        "Online CC y Audio": "#db2777",
                      }
                      const color = TIPO_COLORS[e.tipo] || "#6366f1"
                      return (
                        <div key={e.id} style={{ padding: "12px 16px", borderRadius: 10, background: `${color}11`, border: `1px solid ${color}33` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            {e.tipo && (
                              <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: `${color}22`, color }}>
                                {e.tipo}
                              </span>
                            )}
                            <span style={{ color: "#f8fafc", fontWeight: 700, fontSize: 14 }}>{e.titulo}</span>
                            {e.hora && (
                              <span style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 13 }}>{e.hora} hrs</span>
                            )}
                          </div>
                          {e.proyecto && <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: 12 }}>{e.proyecto}{e.cliente ? ` · ${e.cliente}` : ""}</p>}
                          {e.editor && <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>Editor: {e.editor}</p>}
                          {e.notas && <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>{e.notas}</p>}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}
            </>
          )}
          </>
          )}
        </div>
      </main>
    </div>
  )
}

// ── WeekView component ────────────────────────────────────────────────────────

function WeekView({ weekDays, selectedDate, allShoots, allJuntas, allEntregas, shootEmployees, employees, isMobile, onDayClick }: {
  weekDays: string[]
  selectedDate: string
  allShoots: any[]
  allJuntas: any[]
  allEntregas: any[]
  shootEmployees: any[]
  employees: any[]
  isMobile: boolean
  onDayClick: (d: string) => void
}) {
  const today = getLocalDateString()
  const DOW = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"]
  const TIPO_COLORS: Record<string, string> = {
    "CDT Interna": "#6366f1", "CDT Cliente": "#0891b2",
    "Entrega final": "#16a34a", "Ronda Ajustes": "#ea580c",
    "Edición y Post": "#7c3aed", "Online CC y Audio": "#db2777",
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(7,1fr)" : "repeat(7,1fr)", gap: 6, marginTop: 8 }}>
      {weekDays.map((dateStr, i) => {
        const shoots = allShoots.filter((s) => {
          const sd = s.start_time?.slice(0,10)
          const ed = s.end_time?.slice(0,10)
          return sd && dateStr >= sd && dateStr <= (ed || sd)
        }).filter((s) => s.status !== "cancelled")
        const juntas = allJuntas.filter((j) => j.fecha === dateStr)
        const entregas = allEntregas.filter((e) => e.fecha === dateStr)
        const isToday = dateStr === today
        const isSelected = dateStr === selectedDate
        const [, m, d] = dateStr.split("-")

        return (
          <div
            key={dateStr}
            onClick={() => onDayClick(dateStr)}
            style={{
              borderRadius: 10,
              border: isSelected ? "1px solid rgba(124,58,237,0.6)" : isToday ? "1px solid rgba(124,58,237,0.3)" : "1px solid rgba(148,163,184,0.12)",
              background: isSelected ? "rgba(124,58,237,0.12)" : isToday ? "rgba(124,58,237,0.06)" : "rgba(255,255,255,0.03)",
              padding: isMobile ? "8px 4px" : "10px 10px",
              cursor: "pointer",
              minHeight: 100,
              transition: "all 0.15s",
            }}
          >
            {/* Header día */}
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <p style={{ margin: 0, color: "#64748b", fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>{DOW[i]}</p>
              <p style={{
                margin: "2px 0 0",
                fontSize: isMobile ? 13 : 16,
                fontWeight: 700,
                color: isToday ? "#a78bfa" : isSelected ? "#c4b5fd" : "#f8fafc",
                background: isToday ? "rgba(124,58,237,0.2)" : "transparent",
                borderRadius: "50%",
                width: isMobile ? 22 : 28, height: isMobile ? 22 : 28,
                display: "flex", alignItems: "center", justifyContent: "center",
                marginTop: 2, marginLeft: "auto", marginRight: "auto", marginBottom: 0,
              }}>{parseInt(d)}</p>
              {!isMobile && <p style={{ margin: "2px 0 0", color: "#475569", fontSize: 10 }}>{parseInt(m)}月</p>}
            </div>

            {/* Eventos */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {shoots.map((s) => (
                <div key={s.id} style={{
                  borderRadius: 4, padding: isMobile ? "2px 3px" : "3px 6px",
                  background: `${s.color || "#7c3aed"}33`,
                  borderLeft: `2px solid ${s.color || "#7c3aed"}`,
                  overflow: "hidden",
                }}>
                  {!isMobile && <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    🎬 {s.title}
                  </p>}
                  {isMobile && <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.color || "#7c3aed" }} />}
                </div>
              ))}
              {juntas.map((j) => (
                <div key={j.id} style={{
                  borderRadius: 4, padding: isMobile ? "2px 3px" : "3px 6px",
                  background: "rgba(8,145,178,0.15)", borderLeft: "2px solid #0891b2",
                }}>
                  {!isMobile && <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: "#67e8f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    📋 {j.titulo || j.tipo}
                  </p>}
                  {isMobile && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#0891b2" }} />}
                </div>
              ))}
              {entregas.map((e) => {
                const color = TIPO_COLORS[e.tipo] || "#6366f1"
                return (
                  <div key={e.id} style={{
                    borderRadius: 4, padding: isMobile ? "2px 3px" : "3px 6px",
                    background: `${color}22`, borderLeft: `2px solid ${color}`,
                  }}>
                    {!isMobile && <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      🎞️ {e.titulo}
                    </p>}
                    {isMobile && <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />}
                  </div>
                )
              })}
              {shoots.length === 0 && juntas.length === 0 && entregas.length === 0 && !isMobile && (
                <p style={{ margin: 0, color: "#334155", fontSize: 10, textAlign: "center", marginTop: 8 }}>–</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
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

const shootsGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  marginBottom: 14,
}

const shootCardStyle: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148,163,184,0.14)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
  backdropFilter: "blur(16px)",
  borderRadius: 16,
  padding: "14px 16px",
}

const shootCrewSectionStyle: React.CSSProperties = {
  marginTop: 12,
  paddingTop: 12,
  borderTop: "1px solid rgba(148,163,184,0.10)",
}

const shootCrewLabelStyle: React.CSSProperties = {
  margin: "0 0 8px",
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.8,
}

const shootCrewEmptyStyle: React.CSSProperties = {
  margin: 0,
  color: "#64748b",
  fontSize: 12,
}

const participantGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
  gap: 8,
}

const participantChipStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 10px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
}

const participantNameStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 600,
}

const participantRoleStyle: React.CSSProperties = {
  margin: "2px 0 0",
  color: "#64748b",
  fontSize: 11,
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

function getLocalDateStringSimple() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function DashboardTasksWidget({ tasks }: { tasks: any[] }) {
  const today = getLocalDateStringSimple()

  const overdue = tasks.filter(t => {
    if (t.due_date < today) return true
    if (t.due_date === today && t.due_time) {
      const now = new Date()
      const [h, m] = t.due_time.split(":").map(Number)
      return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)
    }
    return false
  })

  const dueToday = tasks.filter(t => t.due_date === today && !overdue.includes(t))

  if (tasks.length === 0) return null

  return (
    <section style={{
      background: "rgba(255,255,255,0.03)",
      border: overdue.length > 0 ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(148,163,184,0.1)",
      borderRadius: 12, padding: "14px 16px", marginTop: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: overdue.length > 0 ? "#f87171" : "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
          {overdue.length > 0 ? `⚠ ${overdue.length} tarea${overdue.length === 1 ? "" : "s"} vencida${overdue.length === 1 ? "" : "s"}` : "Mis Tareas"}
          {dueToday.length > 0 && overdue.length === 0 && ` · ${dueToday.length} para hoy`}
        </p>
        <Link href="/tasks" style={{ fontSize: 12, color: "#7c3aed", textDecoration: "none" }}>Ver todas →</Link>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[...overdue, ...dueToday].slice(0, 5).map(task => {
          const isOvd = overdue.includes(task)
          return (
            <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: isOvd ? "#ef4444" : "#94a3b8", flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: isOvd ? "#fca5a5" : "#cbd5e1", flex: 1 }}>{task.title}</span>
              <span style={{ fontSize: 11, color: isOvd ? "#f87171" : "#64748b" }}>
                {isOvd ? "Vencida" : task.due_time ? task.due_time.slice(0, 5) : "Hoy"}
              </span>
            </div>
          )
        })}
        {tasks.length > 5 && (
          <Link href="/tasks" style={{ fontSize: 12, color: "#64748b", textDecoration: "none", marginTop: 2 }}>
            +{tasks.length - 5} más…
          </Link>
        )}
      </div>
    </section>
  )
}
