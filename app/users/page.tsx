"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "../../lib/supabase"

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])

  const [editingId, setEditingId] = useState("")
  const [editingName, setEditingName] = useState("")
  const [editingRole, setEditingRole] = useState("viewer")

  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newRole, setNewRole] = useState("viewer")

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

    const response = await fetch(
      "https://bvmipundltcvijiueoio.supabase.co/functions/v1/create-user",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
      alert(result.error || "Error creando usuario")
      return
    }

    alert("Usuario creado")

    setNewName("")
    setNewEmail("")
    setNewPassword("")
    setNewRole("viewer")

    await loadPage()
  }

  return (
    <main style={{ padding: 20 }}>
      <nav style={{ marginBottom: 20 }}>
        <Link href="/">← Volver al calendario</Link>
      </nav>

      <h1>👥 Usuarios</h1>

      <section style={cardStyle}>
        <h2>Crear usuario</h2>

        <input
          placeholder="Nombre"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={inputStyle}
        />

        <input
          placeholder="Email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          style={inputStyle}
        />

        <input
          type="password"
          placeholder="Password temporal"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          style={inputStyle}
        />

        <select
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          style={inputStyle}
        >
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>

        <button onClick={createUser} style={primaryButton}>
          Crear usuario
        </button>
      </section>

      <section style={cardStyle}>
        <h2>Usuarios existentes</h2>

        {users.map((user) => {
          const isEditing = editingId === user.id

          return (
            <div key={user.id} style={rowStyle}>
              {isEditing ? (
                <>
                  <div style={{ flex: 1 }}>
                    <input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      style={inputStyle}
                    />

                    <p style={{ marginTop: 8 }}>
                      {user.email}
                    </p>
                  </div>

                  <select
                    value={editingRole}
                    onChange={(e) => setEditingRole(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>

                  <button
                    onClick={() => saveUser(user.id)}
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
                    <p style={{ margin: 0 }}>
                      <strong>
                        {user.full_name || user.email}
                      </strong>
                    </p>

                    <p style={{ marginTop: 4 }}>
                      {user.email} — {user.role}
                    </p>
                  </div>

                  <button
                    onClick={() => startEdit(user)}
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
  )
}

const cardStyle: React.CSSProperties = {
  background: "white",
  padding: 20,
  borderRadius: 16,
  marginTop: 20,
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  padding: "14px 0",
  borderBottom: "1px solid #eee",
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 8,
  border: "1px solid #ccc",
  marginTop: 10,
}

const primaryButton: React.CSSProperties = {
  padding: "10px 14px",
  background: "black",
  color: "white",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  marginTop: 10,
}

const secondaryButton: React.CSSProperties = {
  padding: "10px 14px",
  background: "#eeeeee",
  color: "black",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  marginTop: 10,
}