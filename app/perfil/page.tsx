"use client"

import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { AppSidebar } from "../../components/AppSidebar"
import { requireSessionProfile } from "../../lib/session-profile"

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [saving, setSaving] = useState(false)

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
  color: "#64748b",
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
  color: "#64748b",
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
