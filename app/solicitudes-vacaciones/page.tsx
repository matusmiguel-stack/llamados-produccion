"use client"

import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { AppSidebar } from "../../components/AppSidebar"
import { PageLoader } from "../../components/PageLoader"
import { requireSessionProfile } from "../../lib/session-profile"
import {
  MESES,
  STATUS_INFO,
  agruparDiasEnRangos,
  describirRango,
  esAprobadorVacaciones,
  resumenVacaciones,
  type SolicitudStatus,
} from "../../lib/vacaciones"

type Filtro = "pendiente" | "aprobada" | "rechazada" | "todas"

const FILTROS: { key: Filtro; label: string }[] = [
  { key: "pendiente", label: "Pendientes" },
  { key: "aprobada",  label: "Aprobadas" },
  { key: "rechazada", label: "Declinadas" },
  { key: "todas",     label: "Todas" },
]

export default function SolicitudesVacacionesPage() {
  const [profile, setProfile] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [empleados, setEmpleados] = useState<Record<string, any>>({})
  const [rangosPorEmpleado, setRangosPorEmpleado] = useState<Record<string, { start_date: string; end_date: string }[]>>({})
  const [filtro, setFiltro] = useState<Filtro>("pendiente")
  const [resolviendo, setResolviendo] = useState<string | null>(null)
  const [rechazandoId, setRechazandoId] = useState<string | null>(null)
  const [motivo, setMotivo] = useState("")

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

    // Módulo exclusivo de quienes aprueban vacaciones (Adriana y Miguel)
    if (!esAprobadorVacaciones(auth.profile.email)) {
      window.location.href = "/"
      return
    }

    setUser(auth.session.user)
    setProfile(auth.profile)
    await cargarSolicitudes()
  }

  async function cargarSolicitudes() {
    const [{ data: reqs }, { data: emps }, { data: asignaciones }] = await Promise.all([
      supabase.from("vacation_requests").select("*").order("created_at", { ascending: false }),
      supabase
        .from("employees")
        .select("id, nombre, apellido_paterno, nickname, puesto, vac_anios, vac_mes_reseteo, vac_dias_base, vac_ultimo_reset_anio"),
      supabase.from("vacation_employees").select("employee_id, vacations(start_date, end_date)"),
    ])

    setSolicitudes((reqs as any[]) || [])

    const porId: Record<string, any> = {}
    for (const e of ((emps as any[]) || [])) porId[e.id] = e
    setEmpleados(porId)

    const rangos: Record<string, { start_date: string; end_date: string }[]> = {}
    for (const a of ((asignaciones as any[]) || [])) {
      const v = a.vacations
      if (!v?.start_date || !v?.end_date) continue
      ;(rangos[a.employee_id] ||= []).push({ start_date: v.start_date, end_date: v.end_date })
    }
    setRangosPorEmpleado(rangos)
  }

  useEffect(() => {
    loadPage()
  }, [])

  // Las solicitudes nuevas aparecen sin recargar
  useEffect(() => {
    if (!profile) return
    const channel = supabase
      .channel("solicitudes-vacaciones")
      .on("postgres_changes", { event: "*", schema: "public", table: "vacation_requests" }, () => {
        cargarSolicitudes()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile])

  async function decidir(requestId: string, decision: "aprobar" | "rechazar", motivoTexto?: string) {
    setResolviendo(requestId)

    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/vacaciones/decidir", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ requestId, decision, motivo: motivoTexto || "" }),
    })
    const json = await res.json().catch(() => ({}))
    setResolviendo(null)

    if (!res.ok) return alert(json.error || "No se pudo procesar la solicitud")

    setRechazandoId(null)
    setMotivo("")
    if (json.emailWarning) {
      alert("Se registró la decisión, pero el correo al solicitante falló.")
    }
    await cargarSolicitudes()
  }

  function aprobar(s: any) {
    const nombre = s.requester_name
    const dias = Number(s.dias_habiles)
    if (!confirm(`¿Aprobar ${dias} día${dias !== 1 ? "s" : ""} de vacaciones para ${nombre}?\n\nSe bloquearán esos días en el calendario y se le avisará por correo.`)) return
    decidir(s.id, "aprobar")
  }

  function confirmarRechazo(s: any) {
    if (!motivo.trim()) return alert("Escribe el motivo por el que declinas la solicitud")
    decidir(s.id, "rechazar", motivo.trim())
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  if (!profile) return <PageLoader />

  const visibles = filtro === "todas"
    ? solicitudes
    : solicitudes.filter((s) => s.status === filtro)
  const pendientes = solicitudes.filter((s) => s.status === "pendiente").length

  return (
    <div style={appShellStyle}>
      <AppSidebar
        profile={profile}
        user={user}
        isAdmin={profile?.role === "admin"}
        isMobile={isMobile}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen(!menuOpen)}
        onMenuClose={() => setMenuOpen(false)}
        onLogout={logout}
      />

      <main style={{ ...mainStyle, padding: isMobile ? "76px 14px 24px" : "28px 32px" }}>
        <div style={pageContainerStyle}>
          <header style={pageHeaderStyle}>
            <p style={eyebrowStyle}>Equipo</p>
            <h1 style={pageTitleStyle}>Solicitudes de vacaciones</h1>
            <p style={pageSubtitleStyle}>
              {pendientes > 0
                ? `${pendientes} solicitud${pendientes !== 1 ? "es" : ""} esperando respuesta`
                : "No hay solicitudes pendientes"}
            </p>
          </header>

          <div style={filtrosStyle}>
            {FILTROS.map((f) => {
              const count = f.key === "todas"
                ? solicitudes.length
                : solicitudes.filter((s) => s.status === f.key).length
              return (
                <button
                  key={f.key}
                  onClick={() => setFiltro(f.key)}
                  style={{ ...filtroButtonStyle, ...(filtro === f.key ? filtroActivoStyle : {}) }}
                >
                  {f.label}
                  <span style={filtroCountStyle}>{count}</span>
                </button>
              )
            })}
          </div>

          {visibles.length === 0 ? (
            <section style={panelStyle}>
              <p style={emptyStyle}>No hay solicitudes en esta vista.</p>
            </section>
          ) : (
            visibles.map((s) => {
              const info = STATUS_INFO[s.status as SolicitudStatus]
              const emp = empleados[s.employee_id]
              const resumen = emp && emp.vac_mes_reseteo != null && emp.vac_anios != null
                ? resumenVacaciones(emp, rangosPorEmpleado[s.employee_id] || [])
                : null
              const rangos = agruparDiasEnRangos(s.dias || [])
              const dias = Number(s.dias_habiles)
              const esPendiente = s.status === "pendiente"
              const rechazando = rechazandoId === s.id
              const ocupado = resolviendo === s.id

              return (
                <section key={s.id} style={panelStyle}>
                  <div style={cardHeaderStyle}>
                    <div style={{ minWidth: 0 }}>
                      <p style={solicitanteStyle}>{s.requester_name}</p>
                      <p style={puestoStyle}>
                        {emp?.puesto || s.requester_email}
                        {" · pedida el "}
                        {new Date(s.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}
                      </p>
                    </div>
                    <span style={{ ...statusBadgeStyle, background: info.bg, color: info.color }}>
                      {info.emoji} {info.label}
                    </span>
                  </div>

                  <div style={cardBodyStyle}>
                    <div style={diasBlockStyle}>
                      <span style={diasNumStyle}>{dias}</span>
                      <span style={diasLabelStyle}>día{dias !== 1 ? "s" : ""} hábil{dias !== 1 ? "es" : ""}</span>
                    </div>

                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={chipsStyle}>
                        {rangos.map((r) => (
                          <span key={r.start_date} style={chipStyle}>
                            {describirRango(r.start_date, r.end_date)}
                          </span>
                        ))}
                      </div>
                      {resumen && (
                        <p style={saldoStyle}>
                          Le quedan <strong style={{ color: resumen.restantes - (esPendiente ? dias : 0) < 0 ? "#f87171" : "#34d399" }}>
                            {resumen.restantes}
                          </strong> de {resumen.corresponden} días
                          {esPendiente && ` · quedarían ${resumen.restantes - dias}`}
                          {" · resetea "}{MESES[resumen.mesReseteo - 1]}
                        </p>
                      )}
                    </div>
                  </div>

                  {s.nota && (
                    <p style={notaStyle}>“{s.nota}”</p>
                  )}

                  {s.status === "rechazada" && s.motivo_rechazo && (
                    <p style={motivoRechazoStyle}>
                      <strong>Motivo:</strong> {s.motivo_rechazo}
                    </p>
                  )}

                  {!esPendiente && s.decided_by_name && (
                    <p style={resueltoPorStyle}>
                      {s.status === "aprobada" ? "Aprobó" : "Declinó"} {s.decided_by_name}
                      {s.decided_at && ` el ${new Date(s.decided_at).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}`}
                    </p>
                  )}

                  {esPendiente && !rechazando && (
                    <div style={accionesStyle}>
                      <button
                        onClick={() => { setRechazandoId(s.id); setMotivo("") }}
                        disabled={ocupado}
                        style={dangerButtonStyle}
                      >
                        Declinar
                      </button>
                      <button onClick={() => aprobar(s)} disabled={ocupado} style={approveButtonStyle}>
                        {ocupado ? "Procesando..." : "Aprobar"}
                      </button>
                    </div>
                  )}

                  {esPendiente && rechazando && (
                    <div style={rechazoPanelStyle}>
                      <label style={fieldStyle}>
                        <span style={fieldLabelStyle}>¿Por qué se declina esta solicitud?</span>
                        <textarea
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          rows={3}
                          maxLength={500}
                          autoFocus
                          placeholder="Ej. esa semana tenemos rodaje con cliente, propón otras fechas"
                          style={textareaStyle}
                        />
                      </label>
                      <div style={accionesStyle}>
                        <button
                          onClick={() => { setRechazandoId(null); setMotivo("") }}
                          disabled={ocupado}
                          style={secondaryButtonStyle}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => confirmarRechazo(s)}
                          disabled={ocupado || !motivo.trim()}
                          style={{ ...dangerButtonStyle, opacity: !motivo.trim() ? 0.5 : 1 }}
                        >
                          {ocupado ? "Enviando..." : "Declinar y avisar"}
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              )
            })
          )}
        </div>
      </main>
    </div>
  )
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
  maxWidth: 780,
  margin: "0 auto",
}

const pageHeaderStyle: React.CSSProperties = {
  marginBottom: 18,
}

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: "#a78bfa",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 1.2,
  fontWeight: 700,
}

const pageTitleStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#f8fafc",
  fontSize: 28,
  letterSpacing: -0.6,
  lineHeight: 1.1,
}

const pageSubtitleStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#7d8ca3",
  fontSize: 13,
}

const filtrosStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  marginBottom: 14,
}

const filtroButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "7px 13px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "transparent",
  color: "#94a3b8",
  cursor: "pointer",
}

const filtroActivoStyle: React.CSSProperties = {
  background: "rgba(124,58,237,0.16)",
  border: "1px solid rgba(167,139,250,0.30)",
  color: "#ddd6fe",
}

const filtroCountStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.7,
  fontVariantNumeric: "tabular-nums",
}

const panelStyle: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148,163,184,0.14)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
  backdropFilter: "blur(16px)",
  borderRadius: 16,
  padding: "16px 18px",
  marginBottom: 12,
}

const emptyStyle: React.CSSProperties = {
  margin: 0,
  color: "#7d8ca3",
  fontSize: 13,
  textAlign: "center",
  padding: "12px 0",
}

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  paddingBottom: 12,
  marginBottom: 12,
  borderBottom: "1px solid rgba(148,163,184,0.10)",
}

const solicitanteStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 15,
  fontWeight: 700,
}

const puestoStyle: React.CSSProperties = {
  margin: "3px 0 0",
  color: "#7d8ca3",
  fontSize: 12,
}

const statusBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  flexShrink: 0,
}

const cardBodyStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 14,
  flexWrap: "wrap",
}

const diasBlockStyle: React.CSSProperties = {
  display: "grid",
  gap: 1,
  padding: "8px 14px",
  borderRadius: 12,
  background: "rgba(124,58,237,0.10)",
  border: "1px solid rgba(167,139,250,0.16)",
  textAlign: "center",
  minWidth: 78,
}

const diasNumStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  color: "#ddd6fe",
  lineHeight: 1.1,
  fontVariantNumeric: "tabular-nums",
}

const diasLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "#a78bfa",
  fontWeight: 600,
}

const chipsStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
}

const chipStyle: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(148,163,184,0.14)",
  color: "#e2e8f0",
}

const saldoStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#7d8ca3",
  fontSize: 12,
}

const notaStyle: React.CSSProperties = {
  margin: "12px 0 0",
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  color: "#cbd5e1",
  fontSize: 13,
  fontStyle: "italic",
  lineHeight: 1.45,
}

const motivoRechazoStyle: React.CSSProperties = {
  margin: "12px 0 0",
  color: "#fca5a5",
  fontSize: 12,
  lineHeight: 1.45,
}

const resueltoPorStyle: React.CSSProperties = {
  margin: "10px 0 0",
  color: "#7d8ca3",
  fontSize: 11,
}

const accionesStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 14,
}

const approveButtonStyle: React.CSSProperties = {
  padding: "9px 18px",
  border: "none",
  borderRadius: 8,
  background: "linear-gradient(135deg, #059669, #10b981)",
  color: "white",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  boxShadow: "0 8px 24px rgba(5,150,105,0.22)",
}

const dangerButtonStyle: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 8,
  border: "1px solid rgba(248,113,113,0.28)",
  background: "rgba(248,113,113,0.10)",
  color: "#fca5a5",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "transparent",
  color: "#94a3b8",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
}

const rechazoPanelStyle: React.CSSProperties = {
  marginTop: 14,
  paddingTop: 14,
  borderTop: "1px solid rgba(148,163,184,0.10)",
}

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 5,
}

const fieldLabelStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 500,
}

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  resize: "vertical",
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(2,6,23,0.55)",
  color: "#f8fafc",
  outline: "none",
  fontSize: 13,
  lineHeight: 1.4,
  fontFamily: "inherit",
}
