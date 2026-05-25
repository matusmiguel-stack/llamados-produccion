"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { supabase } from "../../lib/supabase"

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

  const isMobile =
    typeof window !== "undefined" &&
    window.innerWidth < 768

  const isAdmin = profile?.role === "admin"

  async function loadPage() {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      window.location.href = "/login"
      return
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .order("email")

    const myProfile = profiles?.find(
      (p) =>
        p.email?.trim().toLowerCase() ===
        session.user.email?.trim().toLowerCase()
    )

    if (!myProfile || myProfile.role !== "admin") {
      window.location.href = "/"
      return
    }

    setProfile(myProfile)
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
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: editingName,
        role: editingRole,
      })
      .eq("id", userId)

    if (error) {
      alert(error.message)
      return
    }

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
        }),
      }
    )

    const result = await response.json()

    if (!response.ok) {
      alert(JSON.stringify(result, null, 2))
      return
    }

    alert("Usuario creado")

    setNewName("")
    setNewEmail("")
    setNewPassword("")
    setNewRole("viewer")

    await loadPage()
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {isMobile && (
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={hamburgerButton}
        >
          ☰
        </button>
      )}

      <aside
        style={{
          ...sidebarStyle,

          position: isMobile ? "fixed" : "relative",

          left:
            isMobile && !menuOpen
              ? "-100%"
              : 0,

          width: isMobile ? 260 : 240,

          zIndex: 9999,

          transition: "0.25s",
        }}
      >
        <div
          style={{
            marginBottom: 24,
            textAlign: "center",
          }}
        >
          <Image
            src="/logo-retro.png"
            alt="Retro"
            width={160}
            height={70}
            style={{
              objectFit: "contain",
            }}
          />
        </div>

        <Link
          href="/"
          style={navLink}
          onClick={() =>
            isMobile && setMenuOpen(false)
          }
        >
          Calendario
        </Link>

        <Link
          href="/resources"
          style={navLink}
          onClick={() =>
            isMobile && setMenuOpen(false)
          }
        >
          Inventario
        </Link>

        <Link
          href="/users"
          style={activeNavLink}
          onClick={() =>
            isMobile && setMenuOpen(false)
          }
        >
          Usuarios
        </Link>

        <div
          style={{
            marginTop: 24,
            fontSize: 13,
            color: "#94a3b8",
          }}
        >
          <p>{profile?.email}</p>
          <p>Rol: {profile?.role}</p>
        </div>

        <button
          onClick={logout}
          style={logoutButton}
        >
          Cerrar sesión
        </button>
      </aside>

      <main
        style={{
          flex: 1,
          padding: isMobile
            ? "76px 14px 24px"
            : 32,
        }}
      >
        <p style={eyebrow}>Admin</p>

        <h1 style={titleStyle}>
          Gestión de usuarios
        </h1>

        <section style={cardStyle}>
          <h2>Crear usuario</h2>

          <input
            placeholder="Nombre"
            value={newName}
            onChange={(e) =>
              setNewName(e.target.value)
            }
            style={inputStyle}
          />

          <input
            placeholder="Email"
            value={newEmail}
            onChange={(e) =>
              setNewEmail(e.target.value)
            }
            style={inputStyle}
          />

          <input
            type="password"
            placeholder="Password temporal"
            value={newPassword}
            onChange={(e) =>
              setNewPassword(e.target.value)
            }
            style={inputStyle}
          />

          <select
            value={newRole}
            onChange={(e) =>
              setNewRole(e.target.value)
            }
            style={inputStyle}
          >
            <option value="viewer">
              Viewer
            </option>

            <option value="editor">
              Editor
            </option>

            <option value="admin">
              Admin
            </option>
          </select>

          <button
            onClick={createUser}
            style={primaryButton}
          >
            Crear usuario
          </button>
        </section>

        <section style={cardStyle}>
          <h2>Usuarios existentes</h2>

          {users.map((user) => {
            const isEditing =
              editingId === user.id

            return (
              <div
                key={user.id}
                style={rowStyle}
              >
                {isEditing ? (
                  <>
                    <div style={{ flex: 1 }}>
                      <input
                        value={editingName}
                        onChange={(e) =>
                          setEditingName(
                            e.target.value
                          )
                        }
                        style={inputStyle}
                      />

                      <p
                        style={{
                          marginTop: 8,
                          color: "#94a3b8",
                        }}
                      >
                        {user.email}
                      </p>
                    </div>

                    <select
                      value={editingRole}
                      onChange={(e) =>
                        setEditingRole(
                          e.target.value
                        )
                      }
                      style={inputStyle}
                    >
                      <option value="viewer">
                        Viewer
                      </option>

                      <option value="editor">
                        Editor
                      </option>

                      <option value="admin">
                        Admin
                      </option>
                    </select>

                    <button
                      onClick={() =>
                        saveUser(user.id)
                      }
                      style={primaryButton}
                    >
                      Guardar
                    </button>

                    <button
                      onClick={cancelEdit}
                      style={secondaryButton}
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1 }}>
                      <p
                        style={{
                          margin: 0,
                        }}
                      >
                        <strong>
                          {user.full_name ||
                            user.email}
                        </strong>
                      </p>

                      <p
                        style={{
                          marginTop: 4,
                          color: "#94a3b8",
                        }}
                      >
                        {user.email} —{" "}
                        {user.role}
                      </p>
                    </div>

                    <button
                      onClick={() =>
                        startEdit(user)
                      }
                      style={primaryButton}
                    >
                      Editar
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </section>
      </main>
    </div>
  )
}

const sidebarStyle: React.CSSProperties = {
  minHeight: "100vh",

  background:
    "rgba(15, 23, 42, 0.9)",

  borderRight:
    "1px solid rgba(148,163,184,0.16)",

  padding: 22,

  color: "white",

  backdropFilter: "blur(18px)",
}

const navLink: React.CSSProperties = {
  display: "block",

  color: "#cbd5e1",

  textDecoration: "none",

  marginTop: 12,

  padding: "12px 14px",

  borderRadius: 12,

  background:
    "rgba(255,255,255,0.05)",
}

const activeNavLink: React.CSSProperties = {
  ...navLink,

  color: "white",

  background:
    "linear-gradient(135deg, rgba(124,58,237,0.85), rgba(14,165,233,0.55))",
}

const logoutButton: React.CSSProperties = {
  marginTop: 24,

  width: "100%",

  padding: 12,

  borderRadius: 12,

  border:
    "1px solid rgba(255,255,255,0.14)",

  cursor: "pointer",

  color: "white",

  background:
    "rgba(255,255,255,0.08)",
}

const hamburgerButton: React.CSSProperties = {
  position: "fixed",

  top: 14,

  left: 14,

  zIndex: 10000,

  border: "none",

  borderRadius: 12,

  padding: "10px 14px",

  background: "#111827",

  color: "white",

  fontSize: 20,

  cursor: "pointer",
}

const eyebrow: React.CSSProperties = {
  color: "#a78bfa",

  textTransform: "uppercase",

  letterSpacing: 1.5,

  fontWeight: 700,

  fontSize: 13,
}

const titleStyle: React.CSSProperties = {
  color: "#f8fafc",

  fontSize: 36,

  marginTop: 8,
}

const cardStyle: React.CSSProperties = {
  background:
    "rgba(15, 23, 42, 0.82)",

  border:
    "1px solid rgba(148,163,184,0.18)",

  boxShadow:
    "0 24px 70px rgba(0,0,0,0.35)",

  backdropFilter: "blur(16px)",

  color: "#f8fafc",

  padding: 22,

  borderRadius: 20,

  marginTop: 20,
}

const inputStyle: React.CSSProperties = {
  width: "100%",

  padding: 14,

  marginTop: 12,

  border:
    "1px solid rgba(148,163,184,0.28)",

  borderRadius: 12,

  background:
    "rgba(2,6,23,0.7)",

  color: "#f8fafc",

  outline: "none",
}

const rowStyle: React.CSSProperties = {
  display: "flex",

  flexDirection: "column",

  gap: 12,

  padding: "18px 0",

  borderBottom:
    "1px solid rgba(148,163,184,0.14)",
}

const primaryButton: React.CSSProperties = {
  marginTop: 16,

  width: "100%",

  padding: 14,

  background:
    "linear-gradient(135deg, #7c3aed, #0ea5e9)",

  color: "white",

  border: "none",

  borderRadius: 12,

  cursor: "pointer",

  fontWeight: 700,
}

const secondaryButton: React.CSSProperties = {
  marginTop: 10,

  width: "100%",

  padding: 12,

  background:
    "rgba(255,255,255,0.08)",

  color: "white",

  border: "none",

  borderRadius: 12,

  cursor: "pointer",
}