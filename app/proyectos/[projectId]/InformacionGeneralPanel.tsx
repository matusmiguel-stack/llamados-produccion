"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "../../../lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

type Shoot = {
  id: string
  title: string
  start_time: string
  end_time: string
  all_day: boolean
  location: string | null
  address: string | null
  contact: string | null
  client: string | null
  client_id: string | null
  status: string
  director: string | null
  dop: string | null
  production_notes: string | null
}

type Quote = {
  id: string
  name: string
  status: string
  markup_percentage: number
  released: boolean | null
  actual_extra_expenses: number | null
}

type QuoteItem = {
  id: string
  section_id: string
  qty: number
  days: number
  unit_price: number
  released_expense: number
  real_expense: number
  actual_qty: number | null
  actual_days: number | null
  actual_unit_price: number | null
}

type QuoteSection = {
  id: string
  items: QuoteItem[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "America/Mexico_City",
  })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", {
    hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: "America/Mexico_City",
  })
}

function libItemFin(item: QuoteItem) {
  const amount = item.qty * item.days * item.unit_price
  if (item.real_expense === 1) return { gasto: 0, utilidad: amount, venta: amount }
  const u = amount * ((item.released_expense || 0) / 100)
  return { gasto: amount, utilidad: u, venta: amount + u }
}

function realItemGasto(item: QuoteItem): number {
  if (item.real_expense === 1) return 0
  const any = item.actual_qty != null || item.actual_days != null || item.actual_unit_price != null
  if (!any) return 0
  const q = item.actual_qty != null ? item.actual_qty : Math.max(item.qty, 1)
  const d = item.actual_days != null ? item.actual_days : Math.max(item.days, 1)
  const p = item.actual_unit_price != null ? item.actual_unit_price : item.unit_price
  return q * d * p
}

const STATUS_LABEL: Record<string, string> = {
  tentative: "Tentativo",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
}
const STATUS_COLOR: Record<string, { bg: string; border: string; text: string }> = {
  tentative: { bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.30)", text: "#fbbf24" },
  confirmed: { bg: "rgba(34,197,94,0.12)", border: "rgba(74,222,128,0.22)", text: "#86efac" },
  cancelled: { bg: "rgba(248,113,113,0.10)", border: "rgba(248,113,113,0.22)", text: "#f87171" },
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InformacionGeneralPanel({
  projectId,
  projectName,
  projectDescription,
  projectResponsable,
  clientName,
  subfolderName,
  isMobile,
  isAdmin,
}: {
  projectId: string
  projectName: string
  projectDescription: string | null
  projectResponsable: string | null
  clientName: string
  subfolderName: string
  isMobile: boolean
  isAdmin: boolean
}) {
  const [shoots, setShoots] = useState<Shoot[]>([])
  const [shootsLoaded, setShootsLoaded] = useState(false)

  const [quotes, setQuotes] = useState<Quote[]>([])
  const [sections, setSections] = useState<QuoteSection[]>([])
  const [finLoaded, setFinLoaded] = useState(false)

  // ── Inline create shoot form ───────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false)
  const [fTitle, setFTitle] = useState("")
  const [fDate, setFDate] = useState("")
  const [fStart, setFStart] = useState("09:00")
  const [fEnd, setFEnd] = useState("18:00")
  const [fLocation, setFLocation] = useState("")
  const [fAddress, setFAddress] = useState("")
  const [fContact, setFContact] = useState("")
  const [fNotes, setFNotes] = useState("")
  const [saving, setSaving] = useState(false)

  // ── Load shoots ───────────────────────────────────────────────────────────
  const loadShoots = useCallback(async () => {
    const { data } = await supabase
      .from("shoots")
      .select("id,title,start_time,end_time,all_day,location,address,contact,client,client_id,status,director,dop,production_notes")
      .eq("project_id", projectId)
      .order("start_time", { ascending: true })
    setShoots((data || []) as Shoot[])
    setShootsLoaded(true)
  }, [projectId])

  // ── Load financials ───────────────────────────────────────────────────────
  const loadFinancials = useCallback(async () => {
    const { data: qs } = await supabase
      .from("quotes")
      .select("id,name,status,markup_percentage,released,actual_extra_expenses")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
    setQuotes((qs || []) as Quote[])

    const released = (qs || []).find((q: Quote) => q.released === true)
    if (!released) { setFinLoaded(true); return }

    const { data: secsData } = await supabase
      .from("quote_sections")
      .select("id")
      .eq("quote_id", released.id)

    const loadedSecs: QuoteSection[] = []
    for (const sec of secsData || []) {
      const { data: items } = await supabase
        .from("quote_items")
        .select("id,section_id,qty,days,unit_price,released_expense,real_expense,actual_qty,actual_days,actual_unit_price")
        .eq("section_id", sec.id)
      loadedSecs.push({ id: sec.id, items: (items || []) as QuoteItem[] })
    }
    setSections(loadedSecs)
    setFinLoaded(true)
  }, [projectId])

  useEffect(() => {
    loadShoots()
    loadFinancials()
  }, [loadShoots, loadFinancials])

  // ── Create shoot ──────────────────────────────────────────────────────────
  async function handleCreateShoot() {
    if (!fTitle.trim() || !fDate) return
    setSaving(true)
    try {
      const start = new Date(`${fDate}T${fStart}:00`)
      const end = new Date(`${fDate}T${fEnd}:00`)
      const { data: clientData } = await supabase
        .from("projects")
        .select("client_id, name, clients(name)")
        .eq("id", projectId)
        .single()

      await supabase.from("shoots").insert({
        title: fTitle.trim(),
        project_id: projectId,
        client_id: (clientData as any)?.client_id || null,
        client: (clientData?.clients as any)?.name || null,
        project: projectName,
        location: fLocation.trim() || null,
        address: fAddress.trim() || null,
        contact: fContact.trim() || null,
        production_notes: fNotes.trim() || null,
        status: "tentative",
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        all_day: false,
        color: "#fbbf24",
      })

      setFTitle(""); setFDate(""); setFStart("09:00"); setFEnd("18:00")
      setFLocation(""); setFAddress(""); setFContact(""); setFNotes("")
      setShowForm(false)
      await loadShoots()
    } catch (err: any) {
      alert("Error al crear llamado: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Financials calc ───────────────────────────────────────────────────────
  const releasedQuote = quotes.find((q) => q.released === true) ?? null
  const financials = useMemo(() => {
    if (!releasedQuote || !finLoaded || sections.length === 0) return null
    let libGasto = 0, libUtilidad = 0, libVenta = 0, realGasto = 0
    for (const sec of sections) {
      for (const item of sec.items) {
        const lf = libItemFin(item)
        libGasto += lf.gasto; libUtilidad += lf.utilidad; libVenta += lf.venta
        realGasto += realItemGasto(item)
      }
    }
    const extra = releasedQuote.actual_extra_expenses || 0
    const realTotal = realGasto + extra
    const realUtilidad = libVenta - realTotal
    const libPct = libVenta > 0 ? (libUtilidad / libVenta) * 100 : 0
    const realPct = libVenta > 0 ? (realUtilidad / libVenta) * 100 : 0
    const hasReal = sections.some((s) =>
      s.items.some((i) => i.actual_qty != null || i.actual_days != null || i.actual_unit_price != null)
    )
    return { libGasto, libUtilidad, libVenta, realTotal, realUtilidad, libPct, realPct, extra, hasReal }
  }, [releasedQuote, sections, finLoaded])

  const now = new Date()
  const upcoming = shoots.filter((s) => new Date(s.end_time) >= now)
  const past = shoots.filter((s) => new Date(s.end_time) < now)

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "grid", gap: 20 }}>

      {/* ══ 1. DATOS DEL PROYECTO ══════════════════════════════════════════ */}
      <div style={cardStyle}>
        <p style={cardEyebrowStyle}>Información general</p>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
          <KV label="Cliente" value={clientName} accent />
          <KV label="Proyecto" value={projectName} accent />
          <KV label="Carpeta" value={subfolderName} />
          {projectDescription && (
            <div style={{ gridColumn: isMobile ? "1" : "1 / -1" }}>
              <KV label="Descripción" value={projectDescription} />
            </div>
          )}
          <KV
            label="Responsable"
            value={projectResponsable || "—"}
            accent={!!projectResponsable}
          />
        </div>
      </div>

      {/* ══ 2. LLAMADOS ═══════════════════════════════════════════════════ */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <p style={cardEyebrowStyle}>Llamados del proyecto</p>
          {isAdmin && !showForm && (
            <button onClick={() => setShowForm(true)} style={addShootBtnStyle}>
              + Crear llamado
            </button>
          )}
        </div>

        {/* Inline create shoot form */}
        {showForm && (
          <div style={formBoxStyle}>
            <p style={{ margin: "0 0 12px", color: "#a78bfa", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>
              Nuevo llamado
            </p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              <FormField label="Nombre del llamado" style={{ gridColumn: isMobile ? "1" : "1 / 3" }}>
                <input
                  value={fTitle}
                  onChange={(e) => setFTitle(e.target.value)}
                  placeholder="Ej. Día 1 de rodaje"
                  style={fInputStyle}
                  autoFocus
                />
              </FormField>
              <FormField label="Fecha">
                <input
                  type="date"
                  value={fDate}
                  onChange={(e) => setFDate(e.target.value)}
                  style={fInputStyle}
                />
              </FormField>
              <FormField label="Hora inicio">
                <input type="time" value={fStart} onChange={(e) => setFStart(e.target.value)} style={fInputStyle} />
              </FormField>
              <FormField label="Hora fin">
                <input type="time" value={fEnd} onChange={(e) => setFEnd(e.target.value)} style={fInputStyle} />
              </FormField>
              <FormField label="Locación" style={{ gridColumn: isMobile ? "1" : "1 / 3" }}>
                <input
                  value={fLocation}
                  onChange={(e) => setFLocation(e.target.value)}
                  placeholder="Nombre de la locación"
                  style={fInputStyle}
                />
              </FormField>
              <FormField label="Dirección">
                <input
                  value={fAddress}
                  onChange={(e) => setFAddress(e.target.value)}
                  placeholder="Dirección completa"
                  style={fInputStyle}
                />
              </FormField>
              <FormField label="Contacto en locación">
                <input
                  value={fContact}
                  onChange={(e) => setFContact(e.target.value)}
                  placeholder="Nombre y teléfono"
                  style={fInputStyle}
                />
              </FormField>
              <FormField label="Notas de producción" style={{ gridColumn: isMobile ? "1" : "1 / -1" }}>
                <input
                  value={fNotes}
                  onChange={(e) => setFNotes(e.target.value)}
                  placeholder="Información adicional..."
                  style={fInputStyle}
                />
              </FormField>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => { setShowForm(false) }} style={cancelBtnStyle}>Cancelar</button>
              <button
                onClick={handleCreateShoot}
                disabled={saving || !fTitle.trim() || !fDate}
                style={{ ...saveBtnStyle, opacity: saving || !fTitle.trim() || !fDate ? 0.5 : 1 }}
              >
                {saving ? "Guardando..." : "✓ Publicar en calendario"}
              </button>
            </div>
          </div>
        )}

        {!shootsLoaded ? (
          <p style={mutedStyle}>Cargando llamados...</p>
        ) : shoots.length === 0 ? (
          <div style={emptyBoxStyle}>
            <p style={{ margin: 0, color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>Sin llamados registrados</p>
            <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
              {isAdmin ? "Usa el botón de arriba para crear el primer llamado." : "No hay llamados para este proyecto aún."}
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            {upcoming.length > 0 && (
              <>
                <p style={groupLabelStyle}>Próximos</p>
                {upcoming.map((s) => <ShootCard key={s.id} shoot={s} isMobile={isMobile} />)}
              </>
            )}
            {past.length > 0 && (
              <>
                <p style={{ ...groupLabelStyle, color: "#475569" }}>Anteriores</p>
                {past.map((s) => <ShootCard key={s.id} shoot={s} isMobile={isMobile} dimmed />)}
              </>
            )}
          </div>
        )}
      </div>

      {/* ══ 3. RESUMEN FINANCIERO ══════════════════════════════════════════ */}
      <div style={cardStyle}>
        <p style={cardEyebrowStyle}>Resumen financiero</p>

        {!finLoaded ? (
          <p style={mutedStyle}>Cargando...</p>
        ) : quotes.length === 0 ? (
          <p style={mutedStyle}>No hay cotizaciones en este proyecto.</p>
        ) : !releasedQuote ? (
          <div>
            <p style={mutedStyle}>
              {quotes.length} cotización{quotes.length !== 1 ? "es" : ""} — ninguna liberada aún.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 8, marginTop: 10 }}>
              {quotes.slice(0, 3).map((q) => (
                <div key={q.id} style={quoteChipStyle}>
                  <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{q.name}</span>
                  <span style={statusBadge(q.status as any)}>
                    {q.status === "draft" ? "Borrador" : q.status === "sent" ? "Enviada" : "Aprobada"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <p style={{ ...mutedStyle, marginBottom: 12 }}>
              Basado en: <strong style={{ color: "#e2e8f0" }}>{releasedQuote.name}</strong>
              {!financials?.hasReal && (
                <span style={{ color: "#fbbf24", marginLeft: 8 }}>· Sin costos reales aún</span>
              )}
            </p>
            {financials && (
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                {/* Proyectado */}
                <div style={finCardStyle("rgba(167,139,250,0.06)", "rgba(167,139,250,0.20)")}>
                  <p style={{ ...finTitleStyle, color: "#a78bfa" }}>Proyectado</p>
                  <FinRow label="Gasto liberado" value={fmt(financials.libGasto)} />
                  <FinRow label="Venta al cliente" value={fmt(financials.libVenta)} />
                  <div style={finDividerStyle} />
                  <FinRow
                    label="Utilidad"
                    value={fmt(financials.libUtilidad)}
                    valueColor="#a78bfa"
                    bold
                  />
                  <FinRow label="% sobre venta" value={`${financials.libPct.toFixed(1)}%`} valueColor="#a78bfa" />
                </div>
                {/* Real */}
                {(() => {
                  const rc = financials.realUtilidad >= financials.libUtilidad
                    ? "#34d399"
                    : financials.realUtilidad > 0 ? "#fbbf24" : "#f87171"
                  return (
                    <div style={finCardStyle(`${rc}0f`, `${rc}33`)}>
                      <p style={{ ...finTitleStyle, color: rc }}>
                        Real{!financials.hasReal ? " (sin datos)" : ""}
                      </p>
                      <FinRow label="Gasto real (ítems)" value={fmt(financials.realTotal - financials.extra)} />
                      {financials.extra > 0 && (
                        <FinRow label="Gastos adicionales" value={fmt(financials.extra)} valueColor="#f87171" />
                      )}
                      <FinRow label="Venta al cliente" value={fmt(financials.libVenta)} />
                      <div style={finDividerStyle} />
                      <FinRow
                        label="Utilidad real"
                        value={fmt(financials.realUtilidad)}
                        valueColor={rc}
                        bold
                      />
                      <FinRow label="% sobre venta" value={`${financials.realPct.toFixed(1)}%`} valueColor={rc} />
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ShootCard ────────────────────────────────────────────────────────────────

function ShootCard({ shoot, isMobile, dimmed }: { shoot: Shoot; isMobile: boolean; dimmed?: boolean }) {
  const sc = STATUS_COLOR[shoot.status] || STATUS_COLOR.tentative
  return (
    <div style={{ ...shootCardStyle, opacity: dimmed ? 0.6 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
        <div>
          <p style={{ margin: 0, color: "#f8fafc", fontSize: 14, fontWeight: 700 }}>{shoot.title}</p>
          <p style={{ margin: "3px 0 0", color: "#94a3b8", fontSize: 12 }}>
            {fmtDate(shoot.start_time)}
            {!shoot.all_day && ` · ${fmtTime(shoot.start_time)} – ${fmtTime(shoot.end_time)}`}
          </p>
        </div>
        <span style={{
          display: "inline-flex", alignItems: "center",
          padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 600,
          background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text,
          whiteSpace: "nowrap",
        }}>
          {STATUS_LABEL[shoot.status] || shoot.status}
        </span>
      </div>
      {(shoot.location || shoot.address || shoot.contact || shoot.director) && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill,minmax(160px,1fr))", gap: "4px 16px", marginTop: 8 }}>
          {shoot.location && <Detail label="Locación" value={shoot.location} />}
          {shoot.address && <Detail label="Dirección" value={shoot.address} />}
          {shoot.contact && <Detail label="Contacto" value={shoot.contact} />}
          {shoot.director && <Detail label="Director" value={shoot.director} />}
          {shoot.dop && <Detail label="DOP" value={shoot.dop} />}
        </div>
      )}
      {shoot.production_notes && (
        <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 12, fontStyle: "italic" }}>
          {shoot.production_notes}
        </p>
      )}
    </div>
  )
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function KV({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={kvStyle}>
      <p style={kvLabelStyle}>{label}</p>
      <p style={{ ...kvValueStyle, color: accent ? "#e2e8f0" : "#94a3b8", fontWeight: accent ? 600 : 400 }}>{value}</p>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ color: "#475569", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}: </span>
      <span style={{ color: "#cbd5e1", fontSize: 12 }}>{value}</span>
    </div>
  )
}

function FormField({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ color: "#64748b", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function FinRow({ label, value, valueColor, bold }: { label: string; value: string; valueColor?: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
      <span style={{ color: "#64748b", fontSize: 12 }}>{label}</span>
      <span style={{ color: valueColor || "#94a3b8", fontSize: bold ? 16 : 13, fontWeight: bold ? 700 : 500, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  )
}

function statusBadge(status: "draft" | "sent" | "approved"): React.CSSProperties {
  const m = {
    draft: { bg: "rgba(148,163,184,0.10)", border: "rgba(148,163,184,0.18)", text: "#94a3b8" },
    sent:  { bg: "rgba(14,165,233,0.12)",  border: "rgba(56,189,248,0.22)",  text: "#bae6fd" },
    approved: { bg: "rgba(34,197,94,0.12)", border: "rgba(74,222,128,0.22)", text: "#86efac" },
  }
  const c = m[status] || m.draft
  return {
    display: "inline-flex", alignItems: "center",
    padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
    background: c.bg, border: `1px solid ${c.border}`, color: c.text,
    whiteSpace: "nowrap",
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  padding: "16px 18px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.10)",
  background: "rgba(2,6,23,0.22)",
}

const cardEyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: "#a78bfa",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.8,
}

const kvStyle: React.CSSProperties = {
  display: "grid",
  gap: 3,
  padding: "10px 12px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(148,163,184,0.08)",
}

const kvLabelStyle: React.CSSProperties = {
  margin: 0,
  color: "#475569",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
}

const kvValueStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
}

const shootCardStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.10)",
  background: "rgba(255,255,255,0.025)",
}

const mutedStyle: React.CSSProperties = {
  margin: "10px 0 0",
  color: "#475569",
  fontSize: 13,
}

const emptyBoxStyle: React.CSSProperties = {
  marginTop: 12,
  padding: "20px 16px",
  borderRadius: 10,
  border: "1px dashed rgba(148,163,184,0.16)",
  background: "rgba(255,255,255,0.015)",
  textAlign: "center",
}

const groupLabelStyle: React.CSSProperties = {
  margin: "4px 0 6px",
  color: "#64748b",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
}

const addShootBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 13px",
  borderRadius: 8,
  border: "1px solid rgba(167,139,250,0.30)",
  background: "rgba(124,58,237,0.10)",
  color: "#c4b5fd",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
}

const formBoxStyle: React.CSSProperties = {
  marginTop: 14,
  padding: "14px 16px",
  borderRadius: 10,
  border: "1px solid rgba(167,139,250,0.16)",
  background: "rgba(124,58,237,0.05)",
}

const fInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 7,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(2,6,23,0.55)",
  color: "#f8fafc",
  outline: "none",
  fontSize: 13,
  boxSizing: "border-box",
}

const saveBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: "linear-gradient(135deg,#7c3aed,#6366f1)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: "nowrap",
}

const cancelBtnStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.20)",
  background: "transparent",
  color: "#64748b",
  cursor: "pointer",
  fontSize: 13,
}

const quoteChipStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.10)",
  background: "rgba(255,255,255,0.02)",
  gap: 8,
}

function finCardStyle(bg: string, border: string): React.CSSProperties {
  return {
    background: bg,
    border: `1px solid ${border}`,
    borderRadius: 10,
    padding: "14px 16px",
    display: "grid",
    gap: 8,
  }
}

const finTitleStyle: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.6,
}

const finDividerStyle: React.CSSProperties = {
  borderTop: "1px solid rgba(148,163,184,0.12)",
  paddingTop: 6,
  marginTop: 2,
}
