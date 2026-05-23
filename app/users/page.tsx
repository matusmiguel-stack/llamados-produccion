"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "../../lib/supabase"

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [editingId, setEditingId] = useState("")
  const [editingName, setEditingName] = useState("")
  const [editingRole, setEditingRole] = useState("viewer")

  async function loadPage() {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      window.location.href = "/login"
      return
    }

    const { data: profiles } = await supabase.from("profiles").select("*")

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
    setEditingName(user.full_name || user.email || "")
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

  return (
    <main style={{ padding: 20 }}>
      <nav style={{ marginBottom: 20 }}>
        <Link href="/">← Volver al calendario</Link>
      </nav>

      <h1>👥 Usuarios</h1>

      <section style={cardStyle}>
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
                      placeholder="Nombre"
                      style={inputStyle}
                    />

                    <p style={{ margin: "8px 0 0 0", color: "#666" }}>
                      {user.email}
                    </p>
                  </div>

                  <select
                    value={editingRole}
                    onChange={(e) => setEditingRole(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>

                  <button onClick={() => saveUser(user.id)} style={primaryButton}>
                    Guardar
                  </button>

                  <button onClick={cancelEdit} style={secondaryButton}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0 }}>
                      <strong>{user.full_name || user.email}</strong>
                    </p>

                    <p style={{ margin: "4px 0 0 0", color: "#666" }}>
                      {user.email} — Rol: {user.role}
                    </p>
                  </div>

                  <button onClick={() => startEdit(user)} style={primaryButton}>
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
  borderRadius: 16,
  padding: 20,
  marginTop: 20,
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "14px 0",
  borderBottom: "1px solid #eee",
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ccc",
}

const selectStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ccc",
}

const primaryButton: React.CSSProperties = {
  padding: "10px 14px",
  background: "black",
  color: "white",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
}

const secondaryButton: React.CSSProperties = {
  padding: "10px 14px",
  background: "#eeeeee",
  color: "black",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
}