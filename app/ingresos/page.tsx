"use client"

import { useEffect, useState, useCallback } from "react"
import { supabase } from "../../lib/supabase"
import { requireSessionProfile } from "../../lib/session-profile"
import { AppSidebar } from "../../components/AppSidebar"

// ─── Types ────────────────────────────────────────────────────────────────────

type Empresa = "retro_studio" | "retro_films"
type Estatus =
  | "en_produccion"
  | "proceso_facturado"
  | "facturado"
  | "por_cobrar"
  | "factorado"
  | "pagado"

type Ingreso = {
  id: string
  empresa: Empresa
  odc: string | null
  estatus: Estatus
  cliente_agencia: string
  responsable: string | null
  proyecto: string
  numero_factura: string | null
  subtotal: number
  iva: number
  fecha_aprox_pago: string | null
  fecha_pago: string | null
  mes_cierre: string | null
  notas: string | null
  created_at: string
  project_id: string | null
  quote_id: string | null
}

type IngresoForm = {
  empresa: Empresa
  odc: string
  estatus: Estatus
  cliente_agencia: string
  responsable: string
  proyecto: string
  numero_factura: string
  subtotal: string
  iva: string
  fecha_aprox_pago: string
  fecha_pago: string
  mes_cierre: string
  notas: string
}

const emptyForm: IngresoForm = {
  empresa: "retro_studio",
  odc: "",
  estatus: "en_produccion",
  cliente_agencia: "",
  responsable: "",
  proyecto: "",
  numero_factura: "",
  subtotal: "",
  iva: "",
  fecha_aprox_pago: "",
  fecha_pago: "",
  mes_cierre: "",
  notas: "",
}

// ─── Status config ────────────────────────────────────────────────────────────

const ESTATUS: Record<Estatus, { label: string; color: string; bg: string; border: string }> = {
  en_produccion:    { label: "En Producción",       color: "#fbbf24", bg: "rgba(245,158,11,0.15)", border: "rgba(251,191,36,0.25)" },
  proceso_facturado:{ label: "Proceso Facturado",   color: "#38bdf8", bg: "rgba(14,165,233,0.15)", border: "rgba(56,189,248,0.25)" },
  facturado:        { label: "Facturado",            color: "#a78bfa", bg: "rgba(124,58,237,0.15)", border: "rgba(167,139,250,0.25)" },
  por_cobrar:       { label: "Por Cobrar",           color: "#fb923c", bg: "rgba(249,115,22,0.15)", border: "rgba(251,146,60,0.25)" },
  factorado:        { label: "Factorado",            color: "#f472b6", bg: "rgba(236,72,153,0.12)", border: "rgba(244,114,182,0.25)" },
  pagado:           { label: "Pagado",               color: "#4ade80", bg: "rgba(16,185,129,0.15)", border: "rgba(74,222,128,0.25)" },
}

const MESES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
]

const RESPONSABLES = [
  "Miguel","Charlie","Diana","Fer","Chelita","Karla","Pau",
]

type ProjectOption = {
  id: string
  name: string
  responsable: string | null
  clientName: string
}

function fmt(n: number) {
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 })
}

function fmtDateField(s: string | null): string {
  if (!s) return "—"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(s + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })
  }
  return s
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function IngresosPage() {
  const [profile, setProfile]     = useState<any>(null)
  const [user, setUser]           = useState<any>(null)
  const [isMobile, setIsMobile]   = useState(false)
  const [menuOpen, setMenuOpen]   = useState(false)
  const [ingresos, setIngresos]   = useState<Ingreso[]>([])
  const [loading, setLoading]     = useState(true)

  const [activeEmpresa, setActiveEmpresa] = useState<Empresa>("retro_studio")
  const [filtroEstatus, setFiltroEstatus] = useState<Estatus | "todos">("todos")

  const [projects, setProjects]     = useState<ProjectOption[]>([])

  const [showModal, setShowModal]   = useState(false)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [form, setForm]             = useState<IngresoForm>(emptyForm)
  const [saving, setSaving]         = useState(false)

  // ── Mobile detection ────────────────────────────────────────────────────────
  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768) }
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  // ── Load ────────────────────────────────────────────────────────────────────
  const loadPage = useCallback(async () => {
    const auth = await requireSessionProfile()
    if (!auth) return
    if (auth.profile.role !== "admin") { window.location.href = "/"; return }
    setProfile(auth.profile)
    setUser(auth.session.user)

    const [{ data }, { data: projs }] = await Promise.all([
      supabase.from("ingresos").select("*").order("created_at", { ascending: false }),
      supabase.from("projects").select("id, name, responsable, clients(name)").order("name"),
    ])
    setIngresos((data || []) as Ingreso[])
    setProjects((projs || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      responsable: p.responsable || null,
      clientName: (p.clients as any)?.name || "",
    })))
    setLoading(false)
  }, [])

  useEffect(() => { loadPage() }, [loadPage])

  // ── Auto-calculate IVA ──────────────────────────────────────────────────────
  function handleSubtotalChange(val: string) {
    const n = parseFloat(val.replace(/,/g, ""))
    const iva = isNaN(n) ? "" : (n * 0.16).toFixed(2)
    setForm(f => ({ ...f, subtotal: val, iva }))
  }

  // ── Open modal ──────────────────────────────────────────────────────────────
  function openCreate() {
    setEditingId(null)
    setForm({ ...emptyForm, empresa: activeEmpresa })
    setShowModal(true)
  }

  function openEdit(r: Ingreso) {
    setEditingId(r.id)
    setForm({
      empresa:          r.empresa,
      odc:              r.odc || "",
      estatus:          r.estatus,
      cliente_agencia:  r.cliente_agencia,
      responsable:      r.responsable || "",
      proyecto:         r.proyecto,
      numero_factura:   r.numero_factura || "",
      subtotal:         String(r.subtotal),
      iva:              String(r.iva),
      fecha_aprox_pago: r.fecha_aprox_pago || "",
      fecha_pago:       r.fecha_pago || "",
      mes_cierre:       r.mes_cierre || "",
      notas:            r.notas || "",
    })
    setShowModal(true)
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.cliente_agencia.trim() || !form.proyecto.trim()) {
      alert("Cliente/Agencia y Proyecto son obligatorios.")
      return
    }
    setSaving(true)
    const payload = {
      empresa:          form.empresa,
      odc:              form.odc.trim() || null,
      estatus:          form.estatus,
      cliente_agencia:  form.cliente_agencia.trim(),
      responsable:      form.responsable.trim() || null,
      proyecto:         form.proyecto.trim(),
      numero_factura:   form.numero_factura.trim() || null,
      subtotal:         parseFloat(form.subtotal) || 0,
      iva:              parseFloat(form.iva) || 0,
      fecha_aprox_pago: form.fecha_aprox_pago.trim() || null,
      fecha_pago:       form.fecha_pago.trim() || null,
      mes_cierre:       form.mes_cierre || null,
      notas:            form.notas.trim() || null,
      updated_at:       new Date().toISOString(),
    }
    if (editingId) {
      const { error } = await supabase.from("ingresos").update(payload).eq("id", editingId)
      if (error) { alert(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from("ingresos").insert(payload)
      if (error) { alert(error.message); setSaving(false); return }
    }
    setSaving(false)
    setShowModal(false)
    loadPage()
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este ingreso?")) return
    await supabase.from("ingresos").delete().eq("id", id)
    loadPage()
  }

  // ── Filtered rows ───────────────────────────────────────────────────────────
  const rows = ingresos.filter(r =>
    r.empresa === activeEmpresa &&
    (filtroEstatus === "todos" || r.estatus === filtroEstatus)
  )

  // ── Totals ──────────────────────────────────────────────────────────────────
  const empresaRows = ingresos.filter(r => r.empresa === activeEmpresa)
  const totalVendido   = empresaRows.reduce((s, r) => s + r.subtotal, 0)
  const totalCobrado   = empresaRows.filter(r => r.estatus === "pagado").reduce((s, r) => s + r.subtotal, 0)
  const totalPendiente = totalVendido - totalCobrado

  // Global totals (both empresas)
  const globalVendido   = ingresos.reduce((s, r) => s + r.subtotal, 0)
  const globalCobrado   = ingresos.filter(r => r.estatus === "pagado").reduce((s, r) => s + r.subtotal, 0)
  const globalPendiente = globalVendido - globalCobrado

  if (!profile) return null

  return (
    <div style={layoutStyle}>
      <AppSidebar
        profile={profile}
        user={user}
        isAdmin={profile?.role === "admin"}
        isMobile={isMobile}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen(v => !v)}
        onMenuClose={() => setMenuOpen(false)}
        onLogout={async () => { await supabase.auth.signOut(); window.location.href = "/login" }}
      />

      <main style={mainStyle(isMobile)}>
        {/* ── Header ── */}
        <div style={headerStyle}>
          <div>
            <h1 style={pageTitleStyle}>Control de Ingresos</h1>
            <p style={pageSubStyle}>Proyectos aprobados · seguimiento financiero</p>
          </div>
          <button onClick={openCreate} style={newBtnStyle}>+ Nuevo ingreso</button>
        </div>

        {/* ── Global summary ── */}
        <div style={summaryRowStyle}>
          <SummaryCard label="Total vendido" value={globalVendido} color="#a78bfa" />
          <SummaryCard label="Cobrado"        value={globalCobrado}   color="#4ade80" />
          <SummaryCard label="Por cobrar"     value={globalPendiente} color="#fb923c" />
        </div>

        {/* ── Empresa tabs ── */}
        <div style={tabBarStyle}>
          {(["retro_studio", "retro_films"] as Empresa[]).map(e => (
            <button
              key={e}
              onClick={() => { setActiveEmpresa(e); setFiltroEstatus("todos") }}
              style={{ ...tabStyle, ...(activeEmpresa === e ? tabActiveStyle : {}) }}
            >
              {e === "retro_studio" ? "Retro Studio" : "Retro Films"}
            </button>
          ))}
        </div>

        {/* ── Empresa summary ── */}
        <div style={empresaSummaryStyle}>
          <span style={empresaSumItemStyle}>
            <span style={{ color: "#64748b" }}>Vendido:</span>{" "}
            <span style={{ color: "#f8fafc", fontWeight: 600 }}>{fmt(totalVendido)}</span>
          </span>
          <span style={empresaSumItemStyle}>
            <span style={{ color: "#64748b" }}>Cobrado:</span>{" "}
            <span style={{ color: "#4ade80", fontWeight: 600 }}>{fmt(totalCobrado)}</span>
          </span>
          <span style={empresaSumItemStyle}>
            <span style={{ color: "#64748b" }}>Pendiente:</span>{" "}
            <span style={{ color: "#fb923c", fontWeight: 600 }}>{fmt(totalPendiente)}</span>
          </span>
        </div>

        {/* ── Status filter ── */}
        <div style={statusFilterStyle}>
          <button
            onClick={() => setFiltroEstatus("todos")}
            style={{ ...statusPillStyle, ...(filtroEstatus === "todos" ? statusPillActiveStyle : {}) }}
          >
            Todos ({empresaRows.length})
          </button>
          {(Object.entries(ESTATUS) as [Estatus, typeof ESTATUS[Estatus]][]).map(([key, cfg]) => {
            const count = empresaRows.filter(r => r.estatus === key).length
            if (count === 0) return null
            return (
              <button
                key={key}
                onClick={() => setFiltroEstatus(key)}
                style={{
                  ...statusPillStyle,
                  ...(filtroEstatus === key ? { background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` } : {}),
                }}
              >
                {cfg.label} ({count})
              </button>
            )
          })}
        </div>

        {/* ── Table ── */}
        {loading ? (
          <p style={{ color: "#64748b", padding: "32px 0", textAlign: "center" }}>Cargando…</p>
        ) : rows.length === 0 ? (
          <div style={emptyStyle}>
            <p style={{ color: "#475569", fontSize: 14 }}>
              No hay ingresos registrados{filtroEstatus !== "todos" ? " con este estatus" : ""}.
            </p>
            <button onClick={openCreate} style={{ ...newBtnStyle, marginTop: 12 }}>+ Agregar primero</button>
          </div>
        ) : (
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  {["Estatus","ODC","Cliente / Agencia","Resp.","Proyecto","Factura","Subtotal","IVA","Total c/IVA","Fecha Pago","Mes Cierre",""].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const cfg = ESTATUS[r.estatus]
                  return (
                    <tr
                      key={r.id}
                      style={{ ...trStyle, background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.018)" }}
                    >
                      <td style={tdStyle}>
                        <span style={estatusBadgeStyle(cfg)}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color, display: "inline-block", marginRight: 5, flexShrink: 0 }} />
                          {cfg.label}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: "#64748b", fontSize: 11 }}>{r.odc || "—"}</td>
                      <td style={{ ...tdStyle, fontWeight: 600, color: "#e2e8f0" }}>{r.cliente_agencia}</td>
                      <td style={{ ...tdStyle, color: "#94a3b8", fontSize: 12 }}>{r.responsable || "—"}</td>
                      <td style={{ ...tdStyle, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.proyecto}
                      </td>
                      <td style={{ ...tdStyle, color: "#64748b", fontSize: 11, fontFamily: "monospace" }}>{r.numero_factura || "—"}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "#f8fafc" }}>
                        {fmt(r.subtotal)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "#64748b", fontSize: 12 }}>
                        {fmt(r.iva)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "#a78bfa", fontWeight: 600 }}>
                        {fmt(r.subtotal + r.iva)}
                      </td>
                      <td style={{ ...tdStyle, color: r.fecha_pago ? "#4ade80" : "#64748b", fontSize: 12 }}>
                        {fmtDateField(r.fecha_pago || r.fecha_aprox_pago || null)}
                      </td>
                      <td style={{ ...tdStyle, color: "#64748b", fontSize: 12 }}>{r.mes_cierre || "—"}</td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        <button onClick={() => openEdit(r)} style={actionBtnStyle}>✎</button>
                        <button onClick={() => handleDelete(r.id)} style={{ ...actionBtnStyle, color: "#f87171" }}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "1px solid rgba(148,163,184,0.14)" }}>
                  <td colSpan={6} style={{ ...tdStyle, color: "#64748b", fontSize: 12, paddingTop: 10 }}>
                    {rows.length} registro{rows.length !== 1 ? "s" : ""}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#f8fafc", paddingTop: 10, fontFamily: "monospace" }}>
                    {fmt(rows.reduce((s, r) => s + r.subtotal, 0))}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", color: "#64748b", paddingTop: 10, fontFamily: "monospace" }}>
                    {fmt(rows.reduce((s, r) => s + r.iva, 0))}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#a78bfa", paddingTop: 10, fontFamily: "monospace" }}>
                    {fmt(rows.reduce((s, r) => s + r.subtotal + r.iva, 0))}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </main>

      {/* ── Modal ── */}
      {showModal && (
        <div style={overlayStyle} onClick={() => setShowModal(false)}>
          <div style={modalStyle(isMobile)} onClick={e => e.stopPropagation()}>
            {/* header */}
            <div style={modalHeaderStyle}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#f8fafc" }}>
                {editingId ? "Editar ingreso" : "Nuevo ingreso"}
              </h2>
              <button onClick={() => setShowModal(false)} style={closeBtnStyle}>✕</button>
            </div>

            <div style={modalBodyStyle}>
              {/* Row 1: Empresa + Estatus */}
              <div style={rowStyle}>
                <FormField label="Empresa">
                  <select value={form.empresa} onChange={e => setForm(f => ({ ...f, empresa: e.target.value as Empresa }))} style={inputStyle}>
                    <option value="retro_studio">Retro Studio</option>
                    <option value="retro_films">Retro Films</option>
                  </select>
                </FormField>
                <FormField label="Estatus">
                  <select value={form.estatus} onChange={e => setForm(f => ({ ...f, estatus: e.target.value as Estatus }))} style={inputStyle}>
                    {(Object.entries(ESTATUS) as [Estatus, typeof ESTATUS[Estatus]][]).map(([k, cfg]) => (
                      <option key={k} value={k}>{cfg.label}</option>
                    ))}
                  </select>
                </FormField>
              </div>

              {/* Row 2: Cliente + Responsable */}
              <div style={rowStyle}>
                <FormField label="Cliente / Agencia *">
                  <input value={form.cliente_agencia} onChange={e => setForm(f => ({ ...f, cliente_agencia: e.target.value }))} style={inputStyle} placeholder="ej. Compartamos Banco" />
                </FormField>
                <FormField label="Responsable">
                  <select value={form.responsable} onChange={e => setForm(f => ({ ...f, responsable: e.target.value }))} style={inputStyle}>
                    <option value="">— Sin asignar —</option>
                    {RESPONSABLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </FormField>
              </div>

              {/* Row 3: Proyecto vinculado (auto-fill responsable) */}
              <FormField label="Vincular a proyecto (opcional — auto-rellena responsable)">
                <select
                  style={inputStyle}
                  value=""
                  onChange={e => {
                    const proj = projects.find(p => p.id === e.target.value)
                    if (!proj) return
                    setForm(f => ({
                      ...f,
                      proyecto:        f.proyecto || proj.name,
                      cliente_agencia: f.cliente_agencia || proj.clientName,
                      responsable:     proj.responsable || f.responsable,
                    }))
                  }}
                >
                  <option value="">— Seleccionar proyecto —</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.clientName ? `${p.clientName} · ` : ""}{p.name}</option>
                  ))}
                </select>
              </FormField>

              {/* Row 3b: Nombre del proyecto (texto libre) */}
              <FormField label="Proyecto *">
                <input value={form.proyecto} onChange={e => setForm(f => ({ ...f, proyecto: e.target.value }))} style={inputStyle} placeholder="ej. RS1126 - Hazle Caso a tu Negocio" />
              </FormField>

              {/* Row 4: ODC + Factura */}
              <div style={rowStyle}>
                <FormField label="ODC">
                  <input value={form.odc} onChange={e => setForm(f => ({ ...f, odc: e.target.value }))} style={inputStyle} placeholder="ej. 4500122805" />
                </FormField>
                <FormField label="Número de Factura">
                  <input value={form.numero_factura} onChange={e => setForm(f => ({ ...f, numero_factura: e.target.value }))} style={inputStyle} placeholder="ej. F3711" />
                </FormField>
              </div>

              {/* Row 5: Subtotal + IVA */}
              <div style={rowStyle}>
                <FormField label="Subtotal (sin IVA)">
                  <input
                    type="number"
                    value={form.subtotal}
                    onChange={e => handleSubtotalChange(e.target.value)}
                    style={inputStyle}
                    placeholder="0.00"
                    min={0}
                  />
                </FormField>
                <FormField label="IVA (16% auto)">
                  <input
                    type="number"
                    value={form.iva}
                    onChange={e => setForm(f => ({ ...f, iva: e.target.value }))}
                    style={inputStyle}
                    placeholder="0.00"
                    min={0}
                  />
                </FormField>
              </div>

              {/* Row 6: Fechas */}
              <div style={rowStyle}>
                <FormField label="Fecha aprox. de pago">
                  <input
                    type="date"
                    value={form.fecha_aprox_pago}
                    onChange={e => setForm(f => ({ ...f, fecha_aprox_pago: e.target.value }))}
                    style={{ ...inputStyle, colorScheme: "dark" }}
                  />
                </FormField>
                <FormField label="Fecha de pago real">
                  <input
                    type="date"
                    value={form.fecha_pago}
                    onChange={e => setForm(f => ({ ...f, fecha_pago: e.target.value }))}
                    style={{ ...inputStyle, colorScheme: "dark" }}
                  />
                </FormField>
              </div>

              {/* Row 7: Mes cierre */}
              <FormField label="Mes de cierre del proyecto">
                <select value={form.mes_cierre} onChange={e => setForm(f => ({ ...f, mes_cierre: e.target.value }))} style={inputStyle}>
                  <option value="">— Sin mes —</option>
                  {MESES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </FormField>

              {/* Row 8: Notas */}
              <FormField label="Notas">
                <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} style={{ ...inputStyle, minHeight: 64, resize: "vertical" }} placeholder="Observaciones opcionales…" />
              </FormField>

              {/* Preview total */}
              {(parseFloat(form.subtotal) > 0) && (
                <div style={totalPreviewStyle}>
                  <span style={{ color: "#64748b", fontSize: 12 }}>Total con IVA:</span>
                  <span style={{ color: "#f8fafc", fontWeight: 700, fontFamily: "monospace", fontSize: 15 }}>
                    {fmt((parseFloat(form.subtotal) || 0) + (parseFloat(form.iva) || 0))}
                  </span>
                </div>
              )}
            </div>

            {/* footer */}
            <div style={modalFooterStyle}>
              <button onClick={() => setShowModal(false)} style={cancelBtnStyle}>Cancelar</button>
              <button onClick={handleSave} disabled={saving} style={saveBtnStyle}>
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear ingreso"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={summaryCardStyle(color)}>
      <p style={{ margin: 0, color: "#64748b", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</p>
      <p style={{ margin: "6px 0 0", color, fontSize: 20, fontWeight: 700, fontFamily: "monospace" }}>
        {value.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })}
      </p>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 5, flex: 1 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const layoutStyle: React.CSSProperties = {
  display: "flex",
  minHeight: "100vh",
  background: "linear-gradient(135deg, #07090f 0%, #0d1117 100%)",
  color: "#f8fafc",
}

const mainStyle = (isMobile: boolean): React.CSSProperties => ({
  flex: 1,
  padding: isMobile ? "20px 14px 40px" : "32px 36px 48px",
  overflowX: "auto",
  minWidth: 0,
})

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 24,
  flexWrap: "wrap",
  gap: 12,
}

const pageTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 700,
  color: "#f8fafc",
}

const pageSubStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#475569",
  fontSize: 13,
}

const newBtnStyle: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: 10,
  background: "linear-gradient(135deg, rgba(124,58,237,0.85), rgba(109,40,217,0.85))",
  border: "1px solid rgba(167,139,250,0.3)",
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
}

const summaryRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 14,
  marginBottom: 24,
}

const summaryCardStyle = (color: string): React.CSSProperties => ({
  padding: "16px 20px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.04)",
  border: `1px solid rgba(148,163,184,0.10)`,
  boxShadow: `0 0 0 1px ${color}22`,
})

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  marginBottom: 16,
}

const tabStyle: React.CSSProperties = {
  padding: "7px 18px",
  borderRadius: 9,
  border: "1px solid rgba(148,163,184,0.12)",
  background: "transparent",
  color: "#64748b",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
}

const tabActiveStyle: React.CSSProperties = {
  background: "rgba(124,58,237,0.18)",
  border: "1px solid rgba(167,139,250,0.25)",
  color: "#ddd6fe",
}

const empresaSummaryStyle: React.CSSProperties = {
  display: "flex",
  gap: 20,
  marginBottom: 14,
  padding: "10px 16px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(148,163,184,0.08)",
  flexWrap: "wrap",
}

const empresaSumItemStyle: React.CSSProperties = {
  fontSize: 13,
  display: "flex",
  gap: 6,
}

const statusFilterStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginBottom: 18,
}

const statusPillStyle: React.CSSProperties = {
  padding: "4px 12px",
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.14)",
  background: "transparent",
  color: "#64748b",
  fontSize: 12,
  cursor: "pointer",
}

const statusPillActiveStyle: React.CSSProperties = {
  background: "rgba(148,163,184,0.12)",
  color: "#f8fafc",
  border: "1px solid rgba(148,163,184,0.22)",
}

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.10)",
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  color: "#cbd5e1",
}

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 700,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: 0.6,
  borderBottom: "1px solid rgba(148,163,184,0.12)",
  background: "rgba(255,255,255,0.03)",
  whiteSpace: "nowrap",
}

const trStyle: React.CSSProperties = {
  borderBottom: "1px solid rgba(148,163,184,0.07)",
}

const tdStyle: React.CSSProperties = {
  padding: "9px 12px",
  fontSize: 13,
  color: "#cbd5e1",
  verticalAlign: "middle",
}

const estatusBadgeStyle = (cfg: typeof ESTATUS[Estatus]): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 9px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  color: cfg.color,
  background: cfg.bg,
  border: `1px solid ${cfg.border}`,
  whiteSpace: "nowrap",
})

const actionBtnStyle: React.CSSProperties = {
  padding: "3px 7px",
  border: "none",
  background: "none",
  color: "#475569",
  cursor: "pointer",
  fontSize: 13,
}

const emptyStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "60px 20px",
  borderRadius: 14,
  border: "1px dashed rgba(148,163,184,0.14)",
}

// ── Modal styles ──

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  backdropFilter: "blur(6px)",
  zIndex: 99999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
}

const modalStyle = (isMobile: boolean): React.CSSProperties => ({
  background: "linear-gradient(160deg, rgba(13,20,38,0.99), rgba(8,12,24,0.99))",
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 18,
  boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
  width: "100%",
  maxWidth: isMobile ? "100%" : 640,
  maxHeight: "90vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
})

const modalHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "18px 24px 14px",
  borderBottom: "1px solid rgba(148,163,184,0.10)",
}

const modalBodyStyle: React.CSSProperties = {
  padding: "20px 24px",
  overflowY: "auto",
  display: "grid",
  gap: 14,
  flex: 1,
}

const modalFooterStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  padding: "14px 24px 20px",
  borderTop: "1px solid rgba(148,163,184,0.10)",
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 14,
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#64748b",
}

const inputStyle: React.CSSProperties = {
  padding: "8px 11px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.14)",
  background: "rgba(255,255,255,0.04)",
  color: "#f8fafc",
  fontSize: 13,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
}

const totalPreviewStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(124,58,237,0.10)",
  border: "1px solid rgba(167,139,250,0.18)",
}

const saveBtnStyle: React.CSSProperties = {
  padding: "9px 22px",
  borderRadius: 9,
  background: "linear-gradient(135deg, rgba(124,58,237,0.85), rgba(109,40,217,0.85))",
  border: "1px solid rgba(167,139,250,0.25)",
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
}

const cancelBtnStyle: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: 9,
  background: "transparent",
  border: "1px solid rgba(148,163,184,0.14)",
  color: "#94a3b8",
  fontSize: 13,
  cursor: "pointer",
}

const closeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#64748b",
  fontSize: 16,
  cursor: "pointer",
  padding: "2px 6px",
}
