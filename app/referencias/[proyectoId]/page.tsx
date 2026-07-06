"use client"
import { PageLoader } from "../../../components/PageLoader"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import { requireSessionProfile } from "../../../lib/session-profile"
import { AppSidebar } from "../../../components/AppSidebar"

type Referencia = {
  id: string
  url: string
  titulo: string | null
  nota: string | null
  fuente: string
  created_by: string | null
  created_at: string
  autor: string
}

// Detecta la fuente a partir de la URL (para el badge de color)
function detectarFuente(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase()
    if (host.includes("instagram.com")) return "instagram"
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube"
    if (host.includes("tiktok.com")) return "tiktok"
    if (host.includes("vimeo.com")) return "vimeo"
    if (host.includes("pinterest.")) return "pinterest"
    if (host.includes("behance.net")) return "behance"
    if (host.includes("drive.google.com") || host.includes("docs.google.com")) return "drive"
    if (host.includes("x.com") || host.includes("twitter.com")) return "x"
    return "web"
  } catch {
    return "web"
  }
}

const FUENTES: Record<string, { label: string; emoji: string; color: string }> = {
  instagram: { label: "Instagram", emoji: "📸", color: "#e879a6" },
  youtube:   { label: "YouTube",   emoji: "▶️", color: "#f87171" },
  tiktok:    { label: "TikTok",    emoji: "🎵", color: "#5eead4" },
  vimeo:     { label: "Vimeo",     emoji: "🎬", color: "#60a5fa" },
  pinterest: { label: "Pinterest", emoji: "📌", color: "#fb7185" },
  behance:   { label: "Behance",   emoji: "🎨", color: "#818cf8" },
  drive:     { label: "Drive",     emoji: "📁", color: "#fbbf24" },
  x:         { label: "X",         emoji: "🐦", color: "#94a3b8" },
  web:       { label: "Web",       emoji: "🔗", color: "#a78bfa" },
}
const fuenteInfo = (f: string) => FUENTES[f] || FUENTES.web

function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "America/Mexico_City" })
}

export default function ReferenciaProyectoPage() {
  const params = useParams()
  const proyectoId = String(params.proyectoId || "")

  const [profile, setProfile] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [loading, setLoading] = useState(true)

  const [proyecto, setProyecto] = useState<{ nombre: string; descripcion: string | null } | null>(null)
  const [referencias, setReferencias] = useState<Referencia[]>([])
  const [filtro, setFiltro] = useState<string>("todas")
  const [driveSheetId, setDriveSheetId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const [newUrl, setNewUrl] = useState("")
  const [newTitulo, setNewTitulo] = useState("")
  const [newNota, setNewNota] = useState("")
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    function checkMobile() { setIsMobile(window.innerWidth < 768) }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  async function loadReferencias() {
    const { data } = await supabase
      .from("referencias")
      .select("id,url,titulo,nota,fuente,created_by,created_at,profiles(full_name)")
      .eq("proyecto_id", proyectoId)
      .order("created_at", { ascending: false })
    setReferencias((data || []).map((r: any) => ({
      id: r.id, url: r.url, titulo: r.titulo, nota: r.nota,
      fuente: r.fuente || "web", created_by: r.created_by, created_at: r.created_at,
      autor: r.profiles?.full_name || "—",
    })))
  }

  useEffect(() => {
    if (!proyectoId) return
    (async () => {
      const auth = await requireSessionProfile()
      if (!auth) return
      setUser(auth.session.user)
      setProfile(auth.profile)
      const { data: proj } = await supabase
        .from("referencia_proyectos")
        .select("nombre,descripcion,drive_sheet_id")
        .eq("id", proyectoId)
        .maybeSingle()
      setProyecto(proj)
      setDriveSheetId(proj?.drive_sheet_id || null)
      await loadReferencias()
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId])

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  // Sincroniza la lista a la hoja de Google Sheets del Drive compartido.
  // manual=false: en silencio tras agregar/borrar (si aún no hay hoja, no crea).
  async function syncDrive(manual: boolean) {
    if (!manual && !driveSheetId) return
    if (manual) setSyncing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/referencias/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ proyectoId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al sincronizar")
      setDriveSheetId(data.sheetId)
      if (manual) window.open(data.url, "_blank", "noopener")
    } catch (err: any) {
      if (manual) alert(err.message)
    } finally {
      if (manual) setSyncing(false)
    }
  }

  async function addReferencia() {
    const url = newUrl.trim()
    if (!url || adding) return
    // Aceptar links pegados sin protocolo (instagram.com/p/...)
    const urlFinal = /^https?:\/\//i.test(url) ? url : `https://${url}`
    try { new URL(urlFinal) } catch { return alert("Ese link no parece válido") }
    setAdding(true)
    const { error } = await supabase.from("referencias").insert({
      proyecto_id: proyectoId,
      url: urlFinal,
      titulo: newTitulo.trim() || null,
      nota: newNota.trim() || null,
      fuente: detectarFuente(urlFinal),
      created_by: user.id,
    })
    setAdding(false)
    if (error) return alert(error.message)
    setNewUrl("")
    setNewTitulo("")
    setNewNota("")
    await loadReferencias()
    void syncDrive(false)
  }

  async function deleteReferencia(r: Referencia) {
    if (!confirm("¿Borrar esta referencia?")) return
    const { error } = await supabase.from("referencias").delete().eq("id", r.id)
    if (error) return alert(error.message)
    await loadReferencias()
    void syncDrive(false)
  }

  const puedeBorrar = (r: Referencia) =>
    profile?.role === "admin" || r.created_by === user?.id

  // Chips de filtro: solo las fuentes presentes en este proyecto
  const fuentesPresentes = [...new Set(referencias.map(r => r.fuente))]
  const visibles = filtro === "todas" ? referencias : referencias.filter(r => r.fuente === filtro)

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
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <Link href="/referencias" style={{ fontSize: 12, color: "#a78bfa", textDecoration: "none" }}>
            ← Referencias
          </Link>

          {!proyecto ? (
            <p style={{ color: "#64748b", marginTop: 24 }}>Este proyecto de referencias no existe (o fue borrado).</p>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", margin: "10px 0 4px" }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>
                  {proyecto.nombre}
                </h1>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {driveSheetId && (
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${driveSheetId}`}
                      target="_blank" rel="noopener noreferrer"
                      style={driveBtnStyle}
                    >
                      📄 Ver en Drive
                    </a>
                  )}
                  <button
                    onClick={() => syncDrive(true)}
                    disabled={syncing}
                    title={driveSheetId ? "Volver a sincronizar la hoja del Drive" : "Crear la hoja en el Drive compartido"}
                    style={{ ...driveBtnStyle, opacity: syncing ? 0.6 : 1, cursor: "pointer" }}
                  >
                    {syncing ? "Sincronizando…" : driveSheetId ? "↻ Sincronizar" : "🔗 Vincular a Drive"}
                  </button>
                </div>
              </div>
              <p style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>
                {proyecto.descripcion || "Referencias del proyecto"}
              </p>

              {/* Nueva referencia */}
              <section style={panelStyle}>
                <p style={panelTitleStyle}>Agregar referencia</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    value={newUrl}
                    onChange={e => setNewUrl(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addReferencia()}
                    placeholder="Pega el link (Instagram, YouTube, TikTok, lo que sea)…"
                    style={inputStyle}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input
                      value={newTitulo}
                      onChange={e => setNewTitulo(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addReferencia()}
                      placeholder="Título (opcional)"
                      style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                    />
                    <input
                      value={newNota}
                      onChange={e => setNewNota(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addReferencia()}
                      placeholder="Nota — qué te gustó, para qué sirve… (opcional)"
                      style={{ ...inputStyle, flex: 2, minWidth: 200 }}
                    />
                    <button onClick={addReferencia} disabled={adding} style={primaryButtonStyle}>
                      {adding ? "…" : "＋ Agregar"}
                    </button>
                  </div>
                  {newUrl.trim() && (
                    <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>
                      Se guardará como{" "}
                      <span style={{ color: fuenteInfo(detectarFuente(/^https?:\/\//i.test(newUrl.trim()) ? newUrl.trim() : `https://${newUrl.trim()}`)).color }}>
                        {fuenteInfo(detectarFuente(/^https?:\/\//i.test(newUrl.trim()) ? newUrl.trim() : `https://${newUrl.trim()}`)).emoji}{" "}
                        {fuenteInfo(detectarFuente(/^https?:\/\//i.test(newUrl.trim()) ? newUrl.trim() : `https://${newUrl.trim()}`)).label}
                      </span>
                    </p>
                  )}
                </div>
              </section>

              {/* Filtros por fuente */}
              {fuentesPresentes.length > 1 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 18 }}>
                  <button onClick={() => setFiltro("todas")} style={chipStyle(filtro === "todas", "#a78bfa")}>
                    Todas ({referencias.length})
                  </button>
                  {fuentesPresentes.map(f => {
                    const info = fuenteInfo(f)
                    const n = referencias.filter(r => r.fuente === f).length
                    return (
                      <button key={f} onClick={() => setFiltro(f)} style={chipStyle(filtro === f, info.color)}>
                        {info.emoji} {info.label} ({n})
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Lista de referencias */}
              {visibles.length === 0 ? (
                <p style={{ color: "#475569", fontSize: 14, marginTop: 32, textAlign: "center" }}>
                  Aún no hay referencias aquí. Pega el primer link arriba. 🎬
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
                  {visibles.map(r => {
                    const info = fuenteInfo(r.fuente)
                    let hostLabel = ""
                    try { hostLabel = new URL(r.url).hostname.replace(/^www\./, "") } catch {}
                    return (
                      <div key={r.id} style={refCardStyle}>
                        <span style={{
                          ...fuenteBadgeStyle,
                          color: info.color,
                          background: `${info.color}1a`,
                          border: `1px solid ${info.color}44`,
                        }}>
                          {info.emoji} {info.label}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <a href={r.url} target="_blank" rel="noopener noreferrer"
                            style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 600, textDecoration: "none", wordBreak: "break-word" }}>
                            {r.titulo || hostLabel || r.url} ↗
                          </a>
                          {r.titulo && (
                            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#475569", wordBreak: "break-all" }}>{hostLabel}</p>
                          )}
                          {r.nota && (
                            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#94a3b8", lineHeight: 1.5, wordBreak: "break-word" }}>{r.nota}</p>
                          )}
                          <p style={{ margin: "8px 0 0", fontSize: 11, color: "#64748b" }}>
                            👤 {r.autor} · {fechaCorta(r.created_at)}
                          </p>
                        </div>
                        {puedeBorrar(r) && (
                          <button onClick={() => deleteReferencia(r)} title="Borrar referencia" style={deleteBtnStyle}>🗑</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
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
const refCardStyle: React.CSSProperties = {
  display: "flex", alignItems: "flex-start", gap: 12,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(148,163,184,0.1)",
  borderRadius: 12, padding: "12px 14px",
}
const fuenteBadgeStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "3px 9px", borderRadius: 999,
  fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0,
  marginTop: 1,
}
const deleteBtnStyle: React.CSSProperties = {
  background: "transparent", border: "none", cursor: "pointer",
  color: "#64748b", fontSize: 14, padding: 4, flexShrink: 0,
}
const driveBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  padding: "6px 12px", borderRadius: 8,
  fontSize: 12, fontWeight: 600, textDecoration: "none",
  background: "rgba(52,211,153,0.10)",
  border: "1px solid rgba(52,211,153,0.28)",
  color: "#6ee7b7",
}
const chipStyle = (active: boolean, color: string): React.CSSProperties => ({
  padding: "5px 12px", borderRadius: 999, cursor: "pointer",
  fontSize: 12, fontWeight: 600,
  border: active ? `1px solid ${color}66` : "1px solid rgba(148,163,184,0.18)",
  background: active ? `${color}1f` : "transparent",
  color: active ? color : "#94a3b8",
})
