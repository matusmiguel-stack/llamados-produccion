"use client"

import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { requireSessionProfile } from "../../lib/session-profile"
import { AppSidebar } from "../../components/AppSidebar"

const ROLE_LABELS: Record<string, string> = {
  admin:     "Admin",
  editor:    "Editor",
  productor: "Editor Post",
  viewer:    "Viewer",
}
const roleLabel = (r?: string) => (r ? (ROLE_LABELS[r] ?? r) : "—")

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)

  const [editingId, setEditingId] = useState("")
  const [editingName, setEditingName] = useState("")
  const [editingRole, setEditingRole] = useState("viewer")

  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newRole, setNewRole] = useState("viewer")

  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

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

    const myProfile = auth.profile

    if (myProfile.role !== "admin") {
      window.location.href = "/"
      return
    }

    setProfile(myProfile)

    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .order("email")

    setUsers(profiles || [])
  }

  useEffect(() => {
    loadPage()
  }, [])

  function startEdit(user: any) {
    setEditingId(user.id)
    setEditingName(user.full_name || "")
    setEditingRole(user.role || "viewer")
  }

  function cancelEdit() {
    setEditingId("")
    setEditingName("")
    setEditingRole("viewer")
  }

  async function saveUser(userId: string) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { alert("Sesión expirada"); return }

    const res = await fetch("/api/admin/update-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userId, role: editingRole, full_name: editingName }),
    })

    const json = await res.json()
    if (!res.ok) { alert(json.error || "Error al guardar"); return }

    cancelEdit()
    await loadPage()
  }

  async function createUser() {
    if (!newName || !newEmail || !newPassword) {
      alert("Completa todos los campos")
      return
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      alert("Tu sesión expiró")
      return
    }

    const response = await fetch(
      "https://bvmipundltcvijiueoio.supabase.co/functions/v1/create-user",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          full_name: newName,
          role: newRole,
          must_change_password: true,
        }),
      }
    )

    const result = await response.json()

    if (!response.ok) {
      alert(JSON.stringify(result, null, 2))
      return
    }

    const createdUserId = result.user?.id || result.id

    if (createdUserId) {
      await supabase
        .from("profiles")
        .update({ must_change_password: true })
        .eq("id", createdUserId)
    } else {
      await supabase
        .from("profiles")
        .update({ must_change_password: true })
        .eq("email", newEmail.trim().toLowerCase())
    }

    alert("Usuario creado")

    setNewName("")
    setNewEmail("")
    setNewPassword("")
    setNewRole("viewer")

    await loadPage()
  }

  async function deleteUser(userId: string, userEmail: string) {
    if (userId === profile?.id) {
      alert("No puedes eliminar tu propia cuenta")
      return
    }

    if (
      !confirm(
        `¿Eliminar a ${userEmail}? Esta acción no se puede deshacer.`
      )
    ) {
      return
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      alert("Tu sesión expiró")
      return
    }

    const response = await fetch("/api/admin/delete-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ userId }),
    })

    const result = await response.json()

    if (!response.ok) {
      alert(result.error || "No se pudo eliminar el usuario")
      return
    }

    if (editingId === userId) {
      cancelEdit()
    }

    await loadPage()
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  return (
    <div style={appShellStyle}>
      <AppSidebar
        profile={profile}
        user={null}
        isAdmin
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
              <p style={eyebrowStyle}>Admin</p>
              <h1 style={pageTitleStyle}>Usuarios</h1>
              <p style={pageSubtitleStyle}>
                {users.length} miembro{users.length === 1 ? "" : "s"} en el equipo
              </p>
            </div>
          </header>

          <section style={panelStyle}>
            <div style={panelHeaderStyle}>
              <p style={panelTitleStyle}>Nuevo usuario</p>
              <p style={panelHintStyle}>Invita a alguien con rol y contraseña temporal</p>
            </div>

            <div
              style={{
                ...formGridStyle,
                gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1.4fr 1fr 140px auto",
              }}
            >
              <Field label="Nombre">
                <input
                  placeholder="Nombre completo"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={inputStyle}
                />
              </Field>

              <Field label="Email">
                <input
                  type="email"
                  placeholder="correo@empresa.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  style={inputStyle}
                />
              </Field>

              <Field label="Contraseña">
                <input
                  type="password"
                  placeholder="Temporal"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={inputStyle}
                />
              </Field>

              <Field label="Rol">
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  style={inputStyle}
                >
                  <option value="viewer">Viewer</option>
                  <option value="productor">Editor Post</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </Field>

              <div style={formActionStyle}>
                <button onClick={createUser} style={primaryButtonStyle}>
                  Crear
                </button>
              </div>
            </div>
          </section>

          <section style={panelStyle}>
            <div style={panelHeaderStyle}>
              <p style={panelTitleStyle}>Equipo</p>
              <p style={panelHintStyle}>Edita nombre y permisos de cada miembro</p>
            </div>

            {!isMobile && (
              <div style={tableHeaderStyle}>
                <span>Usuario</span>
                <span>Rol</span>
                <span>Acciones</span>
              </div>
            )}

            <div style={tableBodyStyle}>
              {users.map((user) => {
                const isEditing = editingId === user.id

                return (
                  <div
                    key={user.id}
                    style={{
                      ...rowStyle,
                      gridTemplateColumns: isMobile
                        ? "1fr"
                        : "minmax(220px, 1.4fr) 140px 220px",
                    }}
                  >
                    {isEditing ? (
                      <>
                        <div style={userCellStyle}>
                          <input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            style={inputStyle}
                          />
                          <span style={userEmailStyle}>{user.email}</span>
                        </div>

                        <select
                          value={editingRole}
                          onChange={(e) => setEditingRole(e.target.value)}
                          style={inputStyle}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="productor">Editor Post</option>
                          <option value="editor">Editor</option>
                          <option value="admin">Admin</option>
                        </select>

                        <div style={rowActionsStyle}>
                          <button
                            onClick={() => saveUser(user.id)}
                            style={primaryButtonStyle}
                          >
                            Guardar
                          </button>
                          <button onClick={cancelEdit} style={secondaryButtonStyle}>
                            Cancelar
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={userCellStyle}>
                          <div style={userNameRowStyle}>
                            <span style={avatarStyle(user.full_name || user.email)}>
                              {(user.full_name || user.email || "?").charAt(0).toUpperCase()}
                            </span>
                            <div>
                              <p style={userNameStyle}>
                                {user.full_name || "Sin nombre"}
                              </p>
                              <p style={userEmailStyle}>{user.email}</p>
                            </div>
                          </div>
                        </div>

                        <div style={roleCellStyle}>
                          <span style={roleBadgeStyle(user.role)}>{roleLabel(user.role)}</span>
                        </div>

                        <div style={rowActionsStyle}>
                          <button
                            onClick={() => startEdit(user)}
                            style={secondaryButtonStyle}
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => deleteUser(user.id, user.email)}
                            style={dangerButtonStyle}
                            disabled={user.id === profile?.id}
                            title={
                              user.id === profile?.id
                                ? "No puedes eliminar tu propia cuenta"
                                : "Eliminar usuario"
                            }
                          >
                            Borrar
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </main>
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

function roleBadgeStyle(role?: string): React.CSSProperties {
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    admin: {
      bg: "rgba(124,58,237,0.18)",
      border: "rgba(167,139,250,0.28)",
      text: "#ddd6fe",
    },
    editor: {
      bg: "rgba(14,165,233,0.14)",
      border: "rgba(56,189,248,0.24)",
      text: "#bae6fd",
    },
    productor: {
      bg: "rgba(52,211,153,0.12)",
      border: "rgba(52,211,153,0.22)",
      text: "#6ee7b7",
    },
    viewer: {
      bg: "rgba(148,163,184,0.12)",
      border: "rgba(148,163,184,0.22)",
      text: "#cbd5e1",
    },
  }

  const palette = colors[role || "viewer"] || colors.viewer

  return {
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "none",
    background: palette.bg,
    border: `1px solid ${palette.border}`,
    color: palette.text,
  }
}

function avatarStyle(name: string): React.CSSProperties {
  return {
    width: 34,
    height: 34,
    borderRadius: 10,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    background: "linear-gradient(135deg, rgba(124,58,237,0.35), rgba(14,165,233,0.25))",
    border: "1px solid rgba(167,139,250,0.22)",
    color: "#f8fafc",
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
  maxWidth: 980,
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

const panelStyle: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148,163,184,0.14)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
  backdropFilter: "blur(16px)",
  borderRadius: 16,
  padding: "16px 18px",
  marginTop: 14,
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

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  alignItems: "end",
}

const formActionStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  height: "100%",
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

const tableHeaderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1.4fr) 140px 220px",
  gap: 12,
  padding: "0 4px 10px",
  color: "#64748b",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.6,
}

const tableBodyStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
}

const rowStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  alignItems: "center",
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
}

const userCellStyle: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 6,
}

const userNameRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
}

const userNameStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 600,
}

const userEmailStyle: React.CSSProperties = {
  margin: 0,
  color: "#64748b",
  fontSize: 12,
  wordBreak: "break-word",
}

const roleCellStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
}

const rowActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
}

const primaryButtonStyle: React.CSSProperties = {
  padding: "8px 14px",
  background: "linear-gradient(135deg, #7c3aed, #6366f1)",
  color: "white",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
  boxShadow: "0 8px 24px rgba(124,58,237,0.22)",
  whiteSpace: "nowrap",
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "transparent",
  color: "#94a3b8",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 500,
  fontSize: 13,
  whiteSpace: "nowrap",
}

const dangerButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "transparent",
  color: "#f87171",
  border: "1px solid rgba(248,113,113,0.24)",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 500,
  fontSize: 13,
  whiteSpace: "nowrap",
}
