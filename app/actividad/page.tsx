"use client"
import { PageLoader } from "../../components/PageLoader"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import { requireSessionProfile } from "../../lib/session-profile"
import { AppSidebar } from "../../components/AppSidebar"

type LogRow = {
  id: number
  occurred_at: string
  actor_id: string | null
  actor_email: string | null
  actor_name: string | null
  action: "INSERT" | "UPDATE" | "DELETE"
  table_name: string
  record_id: string | null
  summary: string | null
}

type LogDetail = LogRow & { old_data: any; new_data: any }

// Metadatos por tabla: etiqueta legible, emoji y a dónde enlaza el registro
const TABLE_META: Record<string, { label: string; emoji: string; href?: (id: string) => string }> = {
  shoots:            { label: "Llamado",              emoji: "🎬", href: () => "/" },
  juntas:            { label: "Junta",                emoji: "🤝", href: () => "/" },
  ensayos:           { label: "Ensayo",               emoji: "🎭", href: () => "/" },
  vacations:         { label: "Vacaciones",           emoji: "🏖️", href: () => "/empleados" },
  projects:          { label: "Proyecto",             emoji: "📁", href: id => `/proyectos/${id}` },
  clients:           { label: "Cliente",              emoji: "🏢" },
  quotes:            { label: "Cotización",           emoji: "📝", href: () => "/cotizaciones" },
  quote_sections:    { label: "Sección de cotización", emoji: "📝" },
  quote_items:       { label: "Partida de cotización", emoji: "📝" },
  ingresos:          { label: "Ingreso",              emoji: "💵", href: () => "/ingresos" },
  facturas:          { label: "Factura",              emoji: "🧾", href: () => "/finanzas" },
  proveedores:       { label: "Proveedor",            emoji: "🚚", href: id => `/proveedores/${id}` },
  employees:         { label: "Empleado",             emoji: "👤", href: () => "/empleados" },
  resources:         { label: "Inventario",           emoji: "📦", href: () => "/resources" },
  referencias:       { label: "Referencia",           emoji: "🔗", href: () => "/referencias" },
  user_tasks:        { label: "Tarea",                emoji: "✅", href: () => "/tasks" },
  flujo_movimientos: { label: "Flujo de caja",        emoji: "💰", href: () => "/flujo" },
  flujo_fijos:       { label: "Flujo fijo",           emoji: "💰", href: () => "/flujo" },
  entregas:          { label: "Entrega",              emoji: "🎞️", href: () => "/postproduccion" },
  external_contacts: { label: "Contacto externo",     emoji: "📇" },
  hoja_llamado:      { label: "Hoja de llamado",      emoji: "📋" },
  client_subfolders: { label: "Subcarpeta",           emoji: "📂" },
}

const tableMeta = (t: string) => TABLE_META[t] || { label: t, emoji: "•" }

const ACTION_META: Record<string, { verb: string; badge: string; bg: string; border: string; text: string }> = {
  INSERT: { verb: "creó",    badge: "Alta",   bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.30)", text: "#34d399" },
  UPDATE: { verb: "editó",   badge: "Cambio", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.30)", text: "#fbbf24" },
  DELETE: { verb: "eliminó", badge: "Baja",   bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.30)", text: "#f87171" },
}

// Columnas de ruido que no aportan al ver un detalle
const NOISE_KEYS = new Set(["updated_at", "created_at", "search_vector"])

function actorName(r: LogRow) {
  if (!r.actor_id) return "Sistema"
  return r.actor_name || r.actor_email || "Usuario"
}

function fechaHora(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function diaLargo(iso: string) {
  const d = new Date(iso)
  const s = d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function fmtVal(v: any): string {
  if (v === null || v === undefined) return "—"
  if (typeof v === "object") return JSON.stringify(v)
  if (typeof v === "boolean") return v ? "sí" : "no"
  return String(v)
}

export default function ActividadPage() {
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const [rows, setRows] = useState<LogRow[]>([])
  const [total, setTotal] = useState(0)
  const [fetching, setFetching] = useState(false)

  const [tables, setTables] = useState<string[]>([])
  const [actors, setActors] = useState<{ id: string | null; name: string | null; email: string | null }[]>([])

  const [fTable, setFTable] = useState("")
  const [fAction, setFAction] = useState("")
  const [fActor, setFActor] = useState("")
  const [fFrom, setFFrom] = useState("")
  const [fTo, setFTo] = useState("")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  const [detail, setDetail] = useState<LogDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const PAGE = 50

  useEffect(() => {
    function checkMobile() { setIsMobile(window.innerWidth < 768) }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  async function authedFetch(path: string, body?: any) {
    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = { Authorization: `Bearer ${session?.access_token}` }
    if (body) headers["Content-Type"] = "application/json"
    return fetch(path, body ? { method: "POST", headers, body: JSON.stringify(body) } : { headers })
  }

  const loadRows = useCallback(async (offset: number) => {
    setFetching(true)
    try {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) })
      if (fTable) params.set("table", fTable)
      if (fAction) params.set("action", fAction)
      if (fActor) params.set("actor", fActor)
      if (fFrom) params.set("from", fFrom)
      if (fTo) params.set("to", fTo)
      if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim())
      const res = await authedFetch(`/api/activity?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error")
      setTotal(data.total || 0)
      setRows(prev => offset === 0 ? data.rows : [...prev, ...data.rows])
    } catch (err: any) {
      alert("Error al cargar el historial: " + err.message)
    } finally {
      setFetching(false)
    }
  }, [fTable, fAction, fActor, fFrom, fTo, debouncedSearch])

  // Carga inicial: valida rol admin y trae facetas
  useEffect(() => {
    (async () => {
      const auth = await requireSessionProfile()
      if (!auth) return
      if (auth.profile.role !== "admin") { window.location.href = "/"; return }
      setProfile(auth.profile)
      const res = await authedFetch("/api/activity", { action: "facets" })
      const data = await res.json()
      if (res.ok) { setTables(data.tables || []); setActors(data.actors || []) }
      setLoading(false)
    })()
  }, [])

  // Recarga cuando cambian los filtros
  useEffect(() => {
    if (loading) return
    loadRows(0)
  }, [loading, loadRows])

  async function openDetail(id: number) {
    setDetailLoading(true)
    setDetail({ id } as any)
    try {
      const res = await authedFetch("/api/activity", { action: "detail", id })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error")
      setDetail(data.row)
    } catch (err: any) {
      alert("Error: " + err.message)
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  function resetFiltros() {
    setFTable(""); setFAction(""); setFActor(""); setFFrom(""); setFTo(""); setSearch("")
  }
  const anyFilter = fTable || fAction || fActor || fFrom || fTo || search

  // Agrupar filas por día para un timeline ordenado
  const grouped = useMemo(() => {
    const map = new Map<string, LogRow[]>()
    for (const r of rows) {
      const k = r.occurred_at.split("T")[0]
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(r)
    }
    return [...map.entries()]
  }, [rows])

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  if (loading) return <PageLoader />

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0b1322" }}>
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

      <main style={{ flex: 1, padding: isMobile ? "76px 14px 32px" : "32px 36px", maxWidth: 1100, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#f1f5f9" }}>🕓 Historial de movimientos</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b" }}>
            Registro de todo lo que se crea, edita y elimina en la app. Solo visible para administradores.
          </p>
        </div>

        {/* Filtros */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={fAction} onChange={e => setFAction(e.target.value)} style={selectStyle}>
              <option value="">Todas las acciones</option>
              <option value="INSERT">Altas</option>
              <option value="UPDATE">Cambios</option>
              <option value="DELETE">Bajas</option>
            </select>
            <select value={fTable} onChange={e => setFTable(e.target.value)} style={selectStyle}>
              <option value="">Todos los módulos</option>
              {tables.map(t => <option key={t} value={t}>{tableMeta(t).label}</option>)}
            </select>
            <select value={fActor} onChange={e => setFActor(e.target.value)} style={selectStyle}>
              <option value="">Todos los usuarios</option>
              {actors.map(a => (
                <option key={a.id || "sistema"} value={a.id || "sistema"}>
                  {a.id ? (a.name || a.email || "Usuario") : "Sistema"}
                </option>
              ))}
            </select>
            {anyFilter && (
              <button onClick={resetFiltros} style={clearBtnStyle}>✕ Limpiar</button>
            )}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "4px 10px 4px 12px", background: "rgba(2,6,23,0.35)", border: "1px solid rgba(148,163,184,0.14)", borderRadius: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Periodo</span>
              <span style={dateLabelStyle}>del</span>
              <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} max={fTo || undefined} style={dateInputStyle} />
              <span style={dateLabelStyle}>al</span>
              <input type="date" value={fTo} onChange={e => setFTo(e.target.value)} min={fFrom || undefined} style={dateInputStyle} />
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre, usuario, ID..."
              style={{ marginLeft: isMobile ? 0 : "auto", padding: "8px 12px", background: "rgba(2,6,23,0.55)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 8, color: "#e2e8f0", fontSize: 13, outline: "none", width: isMobile ? "100%" : 260 }}
            />
          </div>
        </div>

        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#475569" }}>
          {total.toLocaleString("es-MX")} movimiento{total !== 1 ? "s" : ""}{anyFilter ? " (filtrados)" : ""}
        </p>

        {/* Timeline */}
        {rows.length === 0 && !fetching ? (
          <p style={{ color: "#475569", textAlign: "center", padding: "48px 0" }}>
            No hay movimientos {anyFilter ? "con esos filtros" : "registrados todavía"}.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {grouped.map(([dia, items]) => (
              <div key={dia}>
                <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "capitalize" }}>
                  {diaLargo(dia)}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {items.map(r => {
                    const meta = tableMeta(r.table_name)
                    const act = ACTION_META[r.action]
                    const href = r.action !== "DELETE" && meta.href && r.record_id ? meta.href(r.record_id) : null
                    return (
                      <div key={r.id} style={rowStyle}>
                        <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }} aria-hidden>{meta.emoji}</span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 14, color: "#e2e8f0" }}>
                              <b style={{ fontWeight: 700 }}>{actorName(r)}</b>{" "}
                              <span style={{ color: "#94a3b8" }}>{act.verb}</span>{" "}
                              <span style={{ color: "#cbd5e1" }}>{meta.label.toLowerCase()}</span>
                            </span>
                            <span style={actionBadgeStyle(act)}>{act.badge}</span>
                          </div>
                          {r.summary && (
                            <p style={{ margin: "3px 0 0", fontSize: 13, color: "#f1f5f9", fontWeight: 500 }}>
                              {href ? <Link href={href} style={{ color: "#7dd3fc", textDecoration: "none" }}>{r.summary}</Link> : r.summary}
                            </p>
                          )}
                          <p style={{ margin: "3px 0 0", fontSize: 11, color: "#64748b" }}>
                            {fechaHora(r.occurred_at)}
                            {r.actor_email && <> · {r.actor_email}</>}
                          </p>
                        </div>
                        <button onClick={() => openDetail(r.id)} style={detailBtnStyle} title="Ver detalle del cambio">Detalle</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Cargar más */}
        {rows.length < total && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 22 }}>
            <button onClick={() => loadRows(rows.length)} disabled={fetching} style={loadMoreStyle}>
              {fetching ? "Cargando…" : `Cargar más (${(total - rows.length).toLocaleString("es-MX")} restantes)`}
            </button>
          </div>
        )}

        {/* Modal de detalle */}
        {detail && (
          <div style={modalBackdropStyle}>
            <div style={modalPanelStyle} onClick={e => e.stopPropagation()}>
              <DetailContent detail={detail} loading={detailLoading} />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                <button onClick={() => setDetail(null)} style={modalCancelBtnStyle}>Cerrar</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function DetailContent({ detail, loading }: { detail: LogDetail; loading: boolean }) {
  if (loading || !detail.action) {
    return <p style={{ color: "#94a3b8", fontSize: 13, padding: "20px 0", textAlign: "center" }}>Cargando detalle…</p>
  }
  const meta = tableMeta(detail.table_name)
  const act = ACTION_META[detail.action]

  // Construir la lista de campos a mostrar según la acción
  let fields: { key: string; before?: any; after?: any }[] = []
  if (detail.action === "UPDATE") {
    const before = detail.old_data || {}
    const after = detail.new_data || {}
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    for (const k of keys) {
      if (NOISE_KEYS.has(k)) continue
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) fields.push({ key: k, before: before[k], after: after[k] })
    }
  } else {
    const data = detail.action === "DELETE" ? (detail.old_data || {}) : (detail.new_data || {})
    for (const k of Object.keys(data)) {
      if (NOISE_KEYS.has(k)) continue
      fields.push({ key: k, after: data[k] })
    }
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 20 }} aria-hidden>{meta.emoji}</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>{meta.label}</span>
        <span style={actionBadgeStyle(act)}>{act.badge}</span>
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 13, color: "#94a3b8" }}>
        <b style={{ color: "#e2e8f0" }}>{actorName(detail)}</b> {act.verb} este registro · {fechaHora(detail.occurred_at)}
      </p>
      {detail.summary && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#cbd5e1" }}>{detail.summary}</p>}

      <div style={{ marginTop: 16, maxHeight: "52vh", overflowY: "auto" }}>
        {fields.length === 0 ? (
          <p style={{ fontSize: 12, color: "#64748b" }}>Sin cambios de datos que mostrar.</p>
        ) : detail.action === "UPDATE" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {fields.map(f => (
              <div key={f.key} style={fieldRowStyle}>
                <span style={fieldKeyStyle}>{f.key}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                  <span style={{ ...valPillStyle, color: "#fca5a5", textDecoration: "line-through", background: "rgba(248,113,113,0.08)" }}>{fmtVal(f.before)}</span>
                  <span style={{ color: "#64748b" }}>→</span>
                  <span style={{ ...valPillStyle, color: "#86efac", background: "rgba(52,211,153,0.08)" }}>{fmtVal(f.after)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {fields.map(f => (
              <div key={f.key} style={fieldRowStyle}>
                <span style={fieldKeyStyle}>{f.key}</span>
                <span style={{ ...valPillStyle, color: "#cbd5e1" }}>{fmtVal(f.after)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  padding: "7px 10px", background: "rgba(2,6,23,0.55)", border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 8, color: "#e2e8f0", fontSize: 12, outline: "none", cursor: "pointer",
}

const clearBtnStyle: React.CSSProperties = {
  padding: "7px 12px", borderRadius: 8, cursor: "pointer",
  border: "1px solid rgba(148,163,184,0.18)", background: "transparent", color: "#94a3b8", fontSize: 12, fontWeight: 600,
}

const dateLabelStyle: React.CSSProperties = { fontSize: 11, color: "#64748b" }

const dateInputStyle: React.CSSProperties = {
  padding: "6px 8px", background: "rgba(2,6,23,0.55)", border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 8, color: "#e2e8f0", fontSize: 12, outline: "none", colorScheme: "dark",
}

const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "flex-start", gap: 12,
  padding: "12px 14px", background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(148,163,184,0.10)", borderRadius: 12,
}

function actionBadgeStyle(a: { bg: string; border: string; text: string }): React.CSSProperties {
  return {
    padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 700,
    background: a.bg, border: `1px solid ${a.border}`, color: a.text, flexShrink: 0,
  }
}

const detailBtnStyle: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", flexShrink: 0,
  border: "1px solid rgba(148,163,184,0.22)", background: "rgba(148,163,184,0.08)", color: "#cbd5e1",
}

const loadMoreStyle: React.CSSProperties = {
  padding: "9px 18px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
  border: "1px solid rgba(6,182,212,0.35)", background: "rgba(6,182,212,0.10)", color: "#67e8f9",
}

const modalBackdropStyle: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 10000,
  background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
}

const modalPanelStyle: React.CSSProperties = {
  width: "100%", maxWidth: 560,
  background: "#0b0e1c", border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 14, padding: 22, boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
}

const modalCancelBtnStyle: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 8, cursor: "pointer",
  border: "1px solid rgba(148,163,184,0.2)", background: "transparent", color: "#94a3b8", fontSize: 13, fontWeight: 600,
}

const fieldRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
  padding: "8px 10px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(148,163,184,0.08)", borderRadius: 8,
}

const fieldKeyStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "#94a3b8", fontFamily: "monospace",
}

const valPillStyle: React.CSSProperties = {
  padding: "2px 8px", borderRadius: 6, fontSize: 12, fontFamily: "monospace",
  maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
}
