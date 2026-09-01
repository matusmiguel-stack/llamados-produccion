"use client"

import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { AppSidebar } from "../../components/AppSidebar"
import { requireSessionProfile } from "../../lib/session-profile"
import { VacacionesPicker } from "../../components/VacacionesPicker"
import {
  MESES,
  STATUS_INFO,
  agruparDiasEnRangos,
  describirRango,
  expandirRango,
  proximoReseteoISO,
  resumenVacaciones,
  type SolicitudStatus,
} from "../../lib/vacaciones"

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [saving, setSaving] = useState(false)

  const [employee, setEmployee] = useState<any>(null)
  const [vacRanges, setVacRanges] = useState<{ start_date: string; end_date: string }[]>([])
  const [misSolicitudes, setMisSolicitudes] = useState<any[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const isAdmin = profile?.role === "admin"
  const mustChangePassword = !!profile?.must_change_password

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  async function loadPage() {
    const auth = await requireSessionProfile({ allowPasswordChangePage: true })
    if (!auth) return

    setUser(auth.session.user)
    setProfile(auth.profile)
    await cargarVacaciones(auth.session.user.id, auth.profile.email)
  }

  // Vacaciones: el usuario se liga a su ficha de empleado por correo.
  async function cargarVacaciones(userId: string, email: string) {
    // Hay fichas de empleado con el correo vacío: sin correo no hay a quién ligar
    const correo = (email || "").trim().toLowerCase()
    const { data: emp } = correo
      ? await supabase
          .from("employees")
          .select("id, nombre, apellido_paterno, vac_anios, vac_mes_reseteo, vac_dias_base, vac_ultimo_reset_anio")
          .eq("email", correo)
          .maybeSingle()
      : { data: null }

    setEmployee(emp || null)

    const [{ data: asignaciones }, { data: solicitudes }] = await Promise.all([
      emp
        ? supabase
            .from("vacation_employees")
            .select("vacations(start_date, end_date)")
            .eq("employee_id", emp.id)
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from("vacation_requests")
        .select("*")
        .eq("requester_id", userId)
        .order("created_at", { ascending: false }),
    ])

    setVacRanges(
      ((asignaciones as any[]) || [])
        .map((row) => row.vacations)
        .filter((v: any) => v?.start_date && v?.end_date),
    )
    setMisSolicitudes((solicitudes as any[]) || [])
  }

  async function enviarSolicitud(dias: string[], nota: string) {
    setEnviando(true)

    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/vacaciones/solicitar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ dias, nota }),
    })
    const json = await res.json().catch(() => ({}))
    setEnviando(false)

    if (!res.ok) return alert(json.error || "No se pudo enviar la solicitud")

    setPickerOpen(false)
    if (json.emailWarning) {
      alert("Tu solicitud quedó registrada, pero el correo de aviso falló. Avísale a Adriana o Miguel.")
    } else {
      alert("Solicitud enviada. Adriana y Miguel ya recibieron el aviso.")
    }
    await cargarVacaciones(user?.id || profile?.id, profile?.email)
  }

  useEffect(() => {
    loadPage()
  }, [])

  async function changePassword() {
    if (!profile?.email) return

    if (!currentPassword || !newPassword || !confirmPassword) {
      return alert("Completa todos los campos de contraseña")
    }

    if (newPassword.length < 8) {
      return alert("La nueva contraseña debe tener al menos 8 caracteres")
    }

    if (newPassword !== confirmPassword) {
      return alert("La confirmación no coincide con la nueva contraseña")
    }

    if (newPassword === currentPassword) {
      return alert("La nueva contraseña debe ser diferente a la actual")
    }

    setSaving(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: currentPassword,
    })

    if (signInError) {
      setSaving(false)
      return alert("La contraseña actual no es correcta")
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (updateError) {
      setSaving(false)
      return alert(updateError.message)
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", profile.id)

    setSaving(false)

    if (profileError) {
      return alert(profileError.message)
    }

    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setProfile({ ...profile, must_change_password: false })

    if (mustChangePassword) {
      alert("Contraseña actualizada. Ya puedes usar la app con normalidad.")
      window.location.href = "/"
      return
    }

    alert("Contraseña actualizada correctamente")
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const displayName =
    profile?.full_name || profile?.email?.split("@")[0] || "Usuario"

  // Saldo de vacaciones del período vigente
  const vacConfigurado =
    !!employee && employee.vac_mes_reseteo != null && employee.vac_anios != null
  const resumenVac = vacConfigurado ? resumenVacaciones(employee, vacRanges) : null
  const solicitudesPendientes = misSolicitudes.filter((s) => s.status === "pendiente")
  const diasEnEspera = solicitudesPendientes.reduce(
    (total, s) => total + Number(s.dias_habiles || 0),
    0,
  )
  const disponibles = resumenVac ? Math.max(0, resumenVac.restantes - diasEnEspera) : 0
  const reseteoISO = vacConfigurado ? proximoReseteoISO(employee.vac_mes_reseteo) : null

  // Días que ya no se pueden volver a pedir (aprobados o en espera)
  const ocupados: Record<string, "aprobada" | "pendiente"> = {}
  for (const r of vacRanges) {
    for (const dia of expandirRango(r.start_date, r.end_date)) ocupados[dia] = "aprobada"
  }
  for (const s of solicitudesPendientes) {
    for (const dia of (s.dias || []) as string[]) ocupados[dia] ??= "pendiente"
  }

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
              <p style={eyebrowStyle}>Cuenta</p>
              <h1 style={pageTitleStyle}>Mi perfil</h1>
              <p style={pageSubtitleStyle}>
                Administra tu acceso y cambia tu contraseña
              </p>
            </div>
          </header>

          {mustChangePassword && (
            <section style={alertPanelStyle}>
              <p style={alertTitleStyle}>Contraseña temporal</p>
              <p style={alertTextStyle}>
                Debes cambiar tu contraseña provisional por una definitiva antes
                de continuar usando la app.
              </p>
            </section>
          )}

          <section style={panelStyle}>
            <div style={panelHeaderStyle}>
              <p style={panelTitleStyle}>Datos de la cuenta</p>
              <p style={panelHintStyle}>Información asociada a tu usuario</p>
            </div>

            <div
              style={{
                ...infoGridStyle,
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              }}
            >
              <InfoField label="Nombre" value={displayName} />
              <InfoField label="Correo" value={profile?.email} />
              <InfoField label="Rol" value={profile?.role || "viewer"} />
            </div>
          </section>

          {!mustChangePassword && (
            <section style={panelStyle}>
              <div style={{ ...panelHeaderStyle, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <p style={panelTitleStyle}>Mis vacaciones 🏖️</p>
                  <p style={panelHintStyle}>
                    {vacConfigurado
                      ? `Período en curso · ${resumenVac!.anios} año${resumenVac!.anios !== 1 ? "s" : ""} de antigüedad`
                      : "Aún no tienes vacaciones configuradas"}
                  </p>
                </div>
                {vacConfigurado && (
                  <button onClick={() => setPickerOpen(true)} style={primaryButtonStyle}>
                    Solicitar vacaciones
                  </button>
                )}
              </div>

              {!vacConfigurado ? (
                <p style={vacEmptyStyle}>
                  {employee
                    ? "Pide a Adriana o Miguel que capturen tus años trabajados y tu mes de reseteo en el módulo de Empleados."
                    : "Tu usuario todavía no está ligado a una ficha de empleado. Pide a Adriana o Miguel que registren este correo en el módulo de Empleados."}
                </p>
              ) : (
                <>
                  <div
                    style={{
                      ...vacStatsStyle,
                      gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
                    }}
                  >
                    <VacStat
                      valor={resumenVac!.restantes}
                      label="Días restantes"
                      color={resumenVac!.restantes <= 0 ? "#f87171" : resumenVac!.restantes <= 3 ? "#fb923c" : "#34d399"}
                    />
                    <VacStat valor={resumenVac!.corresponden} label="Te corresponden" />
                    <VacStat valor={resumenVac!.tomados} label="Ya tomados" />
                    <VacStat
                      valor={diasEnEspera}
                      label="En espera"
                      color={diasEnEspera > 0 ? "#fbbf24" : undefined}
                    />
                  </div>

                  <p style={vacResetStyle}>
                    Se reinician el <strong style={{ color: "#e2e8f0" }}>1 de {MESES[resumenVac!.mesReseteo - 1]}
                    {" "}de {reseteoISO!.slice(0, 4)}</strong>
                    {diasEnEspera > 0 && ` · puedes solicitar ${disponibles} día${disponibles !== 1 ? "s" : ""} más`}
                  </p>

                  {misSolicitudes.length > 0 && (
                    <div style={solicitudesListStyle}>
                      <p style={vacSubtitleStyle}>Mis solicitudes</p>
                      {misSolicitudes.map((s) => {
                        const info = STATUS_INFO[s.status as SolicitudStatus]
                        return (
                          <div key={s.id} style={solicitudRowStyle}>
                            <span style={{ ...statusBadgeStyle, background: info.bg, color: info.color }}>
                              {info.emoji} {info.label}
                            </span>
                            <div style={{ flex: 1, minWidth: 160 }}>
                              <p style={solicitudFechasStyle}>
                                {agruparDiasEnRangos(s.dias || [])
                                  .map((r) => describirRango(r.start_date, r.end_date))
                                  .join(" · ")}
                              </p>
                              {s.status === "rechazada" && s.motivo_rechazo && (
                                <p style={solicitudMotivoStyle}>Motivo: {s.motivo_rechazo}</p>
                              )}
                              {s.status === "aprobada" && s.decided_by_name && (
                                <p style={solicitudMetaStyle}>Aprobó {s.decided_by_name}</p>
                              )}
                            </div>
                            <span style={solicitudDiasStyle}>
                              {Number(s.dias_habiles)} día{Number(s.dias_habiles) !== 1 ? "s" : ""}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          <section style={panelStyle}>
            <div style={panelHeaderStyle}>
              <p style={panelTitleStyle}>Cambiar contraseña</p>
              <p style={panelHintStyle}>
                Usa una contraseña privada que solo tú conozcas
              </p>
            </div>

            <div style={formGridStyle}>
              <Field label="Contraseña actual">
                <input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  style={inputStyle}
                />
              </Field>

              <div
                style={{
                  ...formRowStyle,
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                }}
              >
                <Field label="Nueva contraseña">
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    style={inputStyle}
                  />
                </Field>

                <Field label="Confirmar nueva contraseña">
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    style={inputStyle}
                  />
                </Field>
              </div>

              <div style={formActionStyle}>
                <button
                  onClick={changePassword}
                  disabled={saving}
                  style={primaryButtonStyle}
                >
                  {saving ? "Guardando..." : "Actualizar contraseña"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>

      {pickerOpen && (
        <VacacionesPicker
          ocupados={ocupados}
          disponibles={disponibles}
          saving={enviando}
          onCancel={() => setPickerOpen(false)}
          onSubmit={enviarSolicitud}
        />
      )}
    </div>
  )
}

function VacStat({ valor, label, color }: { valor: number; label: string; color?: string }) {
  return (
    <div style={vacStatStyle}>
      <span style={{ ...vacStatValueStyle, color: color || "#f8fafc" }}>{valor}</span>
      <span style={vacStatLabelStyle}>{label}</span>
    </div>
  )
}

function InfoField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={infoFieldStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      <span style={infoValueStyle}>{value?.trim() || "—"}</span>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label style={fieldStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
    </label>
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
  maxWidth: 720,
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

const alertPanelStyle: React.CSSProperties = {
  marginBottom: 14,
  padding: "14px 16px",
  borderRadius: 14,
  background: "rgba(234, 179, 8, 0.10)",
  border: "1px solid rgba(234, 179, 8, 0.24)",
}

const alertTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#fde68a",
  fontSize: 14,
  fontWeight: 700,
}

const alertTextStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#fcd34d",
  fontSize: 13,
  lineHeight: 1.45,
}

const panelStyle: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148,163,184,0.14)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
  backdropFilter: "blur(16px)",
  borderRadius: 16,
  padding: "16px 18px",
  marginBottom: 14,
}

const panelHeaderStyle: React.CSSProperties = {
  marginBottom: 14,
  paddingBottom: 12,
  borderBottom: "1px solid rgba(148,163,184,0.10)",
}

const panelTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 600,
}

const panelHintStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#7d8ca3",
  fontSize: 12,
}

const infoGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
}

const infoFieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
}

const infoValueStyle: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 600,
  textTransform: "capitalize",
}

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
}

const formRowStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
}

const formActionStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
}

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 5,
  minWidth: 0,
}

const fieldLabelStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 500,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 8,
  background: "rgba(2,6,23,0.55)",
  color: "#f8fafc",
  outline: "none",
  fontSize: 13,
  lineHeight: 1.35,
}

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "linear-gradient(135deg, #7c3aed, #6366f1)",
  color: "white",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
  boxShadow: "0 8px 24px rgba(124,58,237,0.22)",
}

const vacEmptyStyle: React.CSSProperties = {
  margin: 0,
  color: "#7d8ca3",
  fontSize: 13,
  lineHeight: 1.5,
}

const vacStatsStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
}

const vacStatStyle: React.CSSProperties = {
  display: "grid",
  gap: 2,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
}

const vacStatValueStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  lineHeight: 1.1,
  fontVariantNumeric: "tabular-nums",
}

const vacStatLabelStyle: React.CSSProperties = {
  color: "#7d8ca3",
  fontSize: 11,
  fontWeight: 500,
}

const vacResetStyle: React.CSSProperties = {
  margin: "12px 0 0",
  color: "#7d8ca3",
  fontSize: 12,
}

const vacSubtitleStyle: React.CSSProperties = {
  margin: "0 0 8px",
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.6,
}

const solicitudesListStyle: React.CSSProperties = {
  marginTop: 16,
  paddingTop: 14,
  borderTop: "1px solid rgba(148,163,184,0.10)",
  display: "grid",
  gap: 8,
}

const solicitudRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
}

const statusBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 9px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  flexShrink: 0,
}

const solicitudFechasStyle: React.CSSProperties = {
  margin: 0,
  color: "#e2e8f0",
  fontSize: 13,
  fontWeight: 600,
}

const solicitudMotivoStyle: React.CSSProperties = {
  margin: "3px 0 0",
  color: "#fca5a5",
  fontSize: 12,
  lineHeight: 1.4,
}

const solicitudMetaStyle: React.CSSProperties = {
  margin: "3px 0 0",
  color: "#7d8ca3",
  fontSize: 11,
}

const solicitudDiasStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 600,
  marginLeft: "auto",
  fontVariantNumeric: "tabular-nums",
}
