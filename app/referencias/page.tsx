"use client"
import { PageLoader } from "../../components/PageLoader"
import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import { requireSessionProfile } from "../../lib/session-profile"
import { AppSidebar } from "../../components/AppSidebar"

type RefProyecto = {
  id: string
  nombre: string
  descripcion: string | null
  created_by: string | null
  created_at: string
  creador: string
  total: number
  drive_url: string | null
}

export default function ReferenciasPage() {
  const [profile, setProfile] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [loading, setLoading] = useState(true)

  const [proyectos, setProyectos] = useState<RefProyecto[]>([])
  const [newNombre, setNewNombre] = useState("")
  const [newDescripcion, setNewDescripcion] = useState("")
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    function checkMobile() { setIsMobile(window.innerWidth < 768) }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  async function loadProyectos() {
    const { data } = await supabase
      .from("referencia_proyectos")
      .select("id,nombre,descripcion,created_by,created_at,drive_url,profiles(full_name),referencias(count)")
      .order("created_at", { ascending: false })
    setProyectos((data || []).map((p: any) => ({
      id: p.id, nombre: p.nombre, descripcion: p.descripcion,
      created_by: p.created_by, created_at: p.created_at,
      creador: p.profiles?.full_name || "—",
      total: p.referencias?.[0]?.count ?? 0,
      drive_url: p.drive_url || null,
    })))
  }

  useEffect(() => {
    (async () => {
      const auth = await requireSessionProfile()
      if (!auth) return
      setUser(auth.session.user)
      setProfile(auth.profile)
      await loadProyectos()
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  async function createProyecto() {
    if (!newNombre.trim() || creating) return
    setCreating(true)
    const { error } = await supabase.from("referencia_proyectos").insert({
      nombre: newNombre.trim(),
      descripcion: newDescripcion.trim() || null,
      created_by: user.id,
    })
    setCreating(false)
    if (error) return alert(error.message)
    setNewNombre("")
    setNewDescripcion("")
    await loadProyectos()
  }

  async function deleteProyecto(p: RefProyecto) {
    if (!confirm(`¿Borrar el proyecto "${p.nombre}" y sus ${p.total} referencia(s)? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from("referencia_proyectos").delete().eq("id", p.id)
    if (error) return alert(error.message)
    await loadProyectos()
  }

  const puedeBorrar = (p: RefProyecto) =>
    profile?.role === "admin" || p.created_by === user?.id

  // ── Editar nombre/descripción de una carpeta ──────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNombre, setEditNombre] = useState("")
  const [editDescripcion, setEditDescripcion] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)

  function startEdit(p: RefProyecto) {
    setEditingId(p.id)
    setEditNombre(p.nombre)
    setEditDescripcion(p.descripcion || "")
  }

  async function saveEdit(p: RefProyecto) {
    const nombre = editNombre.trim()
    if (!nombre || savingEdit) return
    setSavingEdit(true)
    const { error } = await supabase
      .from("referencia_proyectos")
      .update({ nombre, descripcion: editDescripcion.trim() || null })
      .eq("id", p.id)
    setSavingEdit(false)
    if (error) return alert(error.message)
    setEditingId(null)
    await loadProyectos()
    // Si ya está vinculada al Drive, renombrar también su pestaña
    if (p.drive_url && nombre !== p.nombre) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        void fetch("/api/referencias/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ proyectoId: p.id }),
        })
      } catch { /* la app ya quedó bien; el Drive se corrige en el siguiente sync */ }
    }
  }

  if (!profile || loading) return <PageLoader />

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

      <main style={{ flex: 1, minWidth: 0, padding: isMobile ? "76px 14px 24px" : "28px 32px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>
            Referencias
          </h1>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 28 }}>
            Tableros de referencias por proyecto — todos pueden ver y aportar
          </p>

          {/* Nuevo proyecto */}
          <section style={panelStyle}>
            <p style={panelTitleStyle}>Nuevo proyecto de referencias</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={newNombre}
                onChange={e => setNewNombre(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createProyecto()}
                placeholder="Nombre del proyecto…"
                style={{ ...inputStyle, flex: 2, minWidth: 200 }}
              />
              <input
                value={newDescripcion}
                onChange={e => setNewDescripcion(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createProyecto()}
                placeholder="Descripción (opcional)"
                style={{ ...inputStyle, flex: 3, minWidth: 220 }}
              />
              <button onClick={createProyecto} disabled={creating} style={primaryButtonStyle}>
                {creating ? "…" : "＋ Crear"}
              </button>
            </div>
          </section>

          {/* Grid de proyectos */}
          {proyectos.length === 0 ? (
            <p style={{ color: "#475569", fontSize: 14, marginTop: 32, textAlign: "center" }}>
              Aún no hay proyectos de referencias. Crea el primero arriba. ✨
            </p>
          ) : (
            <div style={{
              display: "grid", gap: 14, marginTop: 24,
              gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(270px, 1fr))",
            }}>
              {proyectos.map(p => {
                if (editingId === p.id) {
                  return (
                    <div key={p.id} style={{ ...cardStyle, flexDirection: "column", alignItems: "stretch", border: "1px solid rgba(167,139,250,0.35)" }}>
                      <input
                        value={editNombre}
                        onChange={e => setEditNombre(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && saveEdit(p)}
                        placeholder="Nombre del proyecto…"
                        autoFocus
                        style={inputStyle}
                      />
                      <input
                        value={editDescripcion}
                        onChange={e => setEditDescripcion(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && saveEdit(p)}
                        placeholder="Descripción (opcional)"
                        style={{ ...inputStyle, marginTop: 8 }}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button onClick={() => saveEdit(p)} disabled={savingEdit} style={primaryButtonStyle}>
                          {savingEdit ? "…" : "✓ Guardar"}
                        </button>
                        <button onClick={() => setEditingId(null)} style={cancelBtnStyle}>✕ Cancelar</button>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={p.id} style={cardStyle}>
                    <Link href={`/referencias/${p.id}`} style={{ textDecoration: "none", flex: 1, display: "block" }}>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#f1f5f9", wordBreak: "break-word" }}>
                        {p.nombre}
                      </p>
                      {p.descripcion && (
                        <p style={{ margin: "6px 0 0", fontSize: 12, color: "#94a3b8", lineHeight: 1.5, wordBreak: "break-word" }}>
                          {p.descripcion}
                        </p>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                        <span style={countBadgeStyle}>
                          🔗 {p.total} referencia{p.total === 1 ? "" : "s"}
                        </span>
                        <span style={{ fontSize: 11, color: "#475569" }}>
                          por {p.creador}
                        </span>
                      </div>
                    </Link>
                    {puedeBorrar(p) && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                        <button
                          onClick={() => startEdit(p)}
                          title="Editar nombre y descripción"
                          style={deleteBtnStyle}
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => deleteProyecto(p)}
                          title="Borrar proyecto"
                          style={deleteBtnStyle}
                        >
                          🗑
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

const appShellStyle: React.CSSProperties = {
  display: "flex", minHeight: "100vh",
  background: "#05070d", fontFamily: "Inter, system-ui, sans-serif",
}
const panelStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(148,163,184,0.1)",
  borderRadius: 12, padding: 16,
}
const panelTitleStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: "#94a3b8",
  textTransform: "uppercase", letterSpacing: "0.05em",
  marginBottom: 12,
}
const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 8, padding: "8px 12px",
  color: "#f1f5f9", fontSize: 14, boxSizing: "border-box",
}
const primaryButtonStyle: React.CSSProperties = {
  background: "rgba(124,58,237,0.25)",
  border: "1px solid rgba(124,58,237,0.4)",
  borderRadius: 8, padding: "8px 16px",
  color: "#a78bfa", fontSize: 13, fontWeight: 600, cursor: "pointer",
}
const cardStyle: React.CSSProperties = {
  position: "relative",
  display: "flex", alignItems: "flex-start", gap: 8,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(148,163,184,0.1)",
  borderRadius: 12, padding: 16,
  transition: "border-color 0.15s ease",
}
const countBadgeStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "3px 9px", borderRadius: 999,
  fontSize: 11, fontWeight: 600,
  color: "#a78bfa", background: "rgba(124,58,237,0.12)",
  border: "1px solid rgba(167,139,250,0.25)",
}
const deleteBtnStyle: React.CSSProperties = {
  background: "transparent", border: "none", cursor: "pointer",
  color: "#64748b", fontSize: 14, padding: 4, flexShrink: 0,
}
const cancelBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 8, padding: "8px 16px",
  color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer",
}
