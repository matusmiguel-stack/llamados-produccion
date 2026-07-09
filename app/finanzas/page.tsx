"use client"
import { PageLoader } from "../../components/PageLoader"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import { requireSessionProfile } from "../../lib/session-profile"
import { uploadComprobante } from "../../lib/upload-comprobante"
import { AppSidebar } from "../../components/AppSidebar"

type Factura = {
  id: string
  proveedor_id: string | null
  project_id: string | null
  proveedor_email: string | null
  codigo_proyecto: string | null
  subtotal: number | null
  total: number | null
  status: "aceptada" | "rechazada" | "pagada"
  motivo_rechazo: string | null
  fecha_pago: string | null
  paid_at: string | null
  uuid_fiscal: string | null
  xml_path: string | null
  pdf_path: string | null
  comprobante_path: string | null
  created_at: string
  concepto: string | null
  origen: "proveedor" | "anticipo" | "comprobacion" | "reembolso" | null
  forma_pago: string | null
  proveedores: { nombre: string; apellido: string; empresa: string | null } | null
  projects: { name: string; code: string | null } | null
}

const ORIGEN_LABEL: Record<string, string> = {
  anticipo: "Anticipo",
  comprobacion: "Comprobación",
  reembolso: "Reembolso",
  proveedor: "Factura proveedor",
}

const fmtMx = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)

// Monto final a pagar: total neto de impuestos del CFDI (IVA − retenciones).
// Fallback al subtotal para registros sin total.
const montoPagar = (f: Factura) => Number(f.total ?? f.subtotal ?? 0)

function provLabel(f: Factura) {
  if (!f.proveedores) return f.proveedor_email || "—"
  const p = f.proveedores
  return p.empresa || `${p.nombre} ${p.apellido}`
}

function projLabel(f: Factura) {
  if (f.projects) return `${f.projects.code || ""} ${f.projects.name}`.trim()
  return f.codigo_proyecto || "—"
}

// Proveedor como hipervínculo a su ficha (si tenemos su id)
function ProvLink({ f }: { f: Factura }) {
  const label = provLabel(f)
  if (f.proveedor_id) {
    return <Link href={`/proveedores/${f.proveedor_id}`} style={provLinkStyle} title={`Ver proveedor: ${label}`}>{label}</Link>
  }
  return <span style={{ color: "#e2e8f0" }}>{label}</span>
}

// Proyecto como hipervínculo a su ficha (si tenemos su id)
function ProjLink({ f }: { f: Factura }) {
  const label = projLabel(f)
  if (f.project_id) {
    return <Link href={`/proyectos/${f.project_id}`} style={projLinkStyle} title={`Ver proyecto: ${label}`}>{label}</Link>
  }
  return <span style={{ color: "#64748b" }}>{label}</span>
}

function nextFridayISO(): string {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1)
  return d.toLocaleDateString("sv")
}

function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("T")[0].split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  return dt.toLocaleDateString("sv")
}

function fechaCorta(iso: string | null): string {
  if (!iso) return "—"
  const [y, m, day] = iso.split("T")[0].split("-").map(Number)
  return new Date(y, m - 1, day).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
}

function fechaViernes(iso: string): string {
  const [y, m, day] = iso.split("T")[0].split("-").map(Number)
  const s = new Date(y, m - 1, day).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function todayISO(): string {
  return new Date().toLocaleDateString("sv")
}

// ── Mini calendario para saltar a un viernes específico ─────────────────────────
function MiniCalendar({ value, onPick, highlight }: {
  value: string
  onPick: (iso: string) => void
  highlight: Set<string>
}) {
  const [vy, setVy] = useState(() => Number(value.split("-")[0]))
  const [vm, setVm] = useState(() => Number(value.split("-")[1]) - 1)

  const first = new Date(vy, vm, 1)
  const startDay = first.getDay()
  const daysInMonth = new Date(vy, vm + 1, 0).getDate()
  const monthName = first.toLocaleDateString("es-MX", { month: "long", year: "numeric" })

  const cells: (number | null)[] = []
  for (let i = 0; i < startDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const iso = (d: number) => new Date(vy, vm, d).toLocaleDateString("sv")
  function prevMonth() {
    if (vm === 0) { setVy(vy - 1); setVm(11) } else setVm(vm - 1)
  }
  function nextMonth() {
    if (vm === 11) { setVy(vy + 1); setVm(0) } else setVm(vm + 1)
  }

  return (
    <div style={calPopupStyle} onClick={e => e.stopPropagation()}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button onClick={prevMonth} style={calNavBtn}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", textTransform: "capitalize" }}>{monthName}</span>
        <button onClick={nextMonth} style={calNavBtn}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {["D", "L", "M", "M", "J", "V", "S"].map((w, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "#475569", padding: "2px 0" }}>{w}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />
          const dateISO = iso(d)
          const isFriday = new Date(vy, vm, d).getDay() === 5
          const isSelected = dateISO === value
          const hasPago = highlight.has(dateISO)
          return (
            <button
              key={i}
              disabled={!isFriday}
              onClick={() => onPick(dateISO)}
              style={{
                position: "relative", aspectRatio: "1", padding: 0,
                border: isSelected ? "1px solid rgba(6,182,212,0.6)" : "1px solid transparent",
                borderRadius: 8,
                background: isSelected ? "rgba(6,182,212,0.18)" : isFriday ? "rgba(148,163,184,0.06)" : "transparent",
                color: !isFriday ? "#334155" : isSelected ? "#67e8f9" : "#cbd5e1",
                fontSize: 12, fontWeight: isFriday ? 600 : 400,
                cursor: isFriday ? "pointer" : "default",
              }}
            >
              {d}
              {hasPago && <span style={{ position: "absolute", bottom: 3, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: 999, background: "#fbbf24" }} />}
            </button>
          )
        })}
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 10, color: "#475569", textAlign: "center" }}>Solo se pueden elegir viernes · ● = con pagos</p>
    </div>
  )
}

export default function FinanzasPage() {
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [filter, setFilter] = useState<"todas" | "aceptada" | "pagada" | "rechazada" | "reembolso">("todas")
  const [view, setView] = useState<"lista" | "viernes">("lista")
  const [search, setSearch] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [working, setWorking] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // Estado del calendario de viernes
  const [selViernes, setSelViernes] = useState<string | null>(null)
  const [calOpen, setCalOpen] = useState(false)
  const calWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function checkMobile() { setIsMobile(window.innerWidth < 768) }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => { loadPage() }, [])

  // Cerrar el mini-calendario al hacer clic fuera
  useEffect(() => {
    if (!calOpen) return
    function onDoc(e: MouseEvent) {
      if (calWrapRef.current && !calWrapRef.current.contains(e.target as Node)) setCalOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [calOpen])

  async function authedFetch(body?: any) {
    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = { Authorization: `Bearer ${session?.access_token}` }
    if (body) headers["Content-Type"] = "application/json"
    return fetch("/api/facturas/admin", body
      ? { method: "POST", headers, body: JSON.stringify(body) }
      : { headers })
  }

  async function loadPage() {
    const auth = await requireSessionProfile()
    if (!auth) return
    if (!["admin", "finanzas"].includes(auth.profile.role)) {
      window.location.href = "/"
      return
    }
    setProfile(auth.profile)

    const res = await authedFetch()
    const data = await res.json()
    setFacturas(data.facturas || [])
    setLoading(false)
  }

  // Modal de pago: pide el comprobante del banco (obligatorio) antes de marcar
  const [payModal, setPayModal] = useState<Factura | null>(null)
  const [payFile, setPayFile] = useState<File | null>(null)

  function markPaid(factura: Factura) {
    setPayFile(null)
    setPayModal(factura)
  }

  async function confirmMarkPaid() {
    if (!payModal) return
    if (!payFile) { alert("Sube el comprobante de pago del banco (PDF o JPG)"); return }
    const factura = payModal
    setWorking(factura.id)
    try {
      // Subida directa a Storage (los archivos grandes truenan si pasan por la API)
      const comprobantePath = await uploadComprobante(payFile, factura.codigo_proyecto || factura.projects?.code || null)
      const res = await authedFetch({ action: "mark-paid", facturaId: factura.id, comprobantePath })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || "Error")
      setFacturas(prev => prev.map(f =>
        f.id === factura.id
          ? { ...f, status: "pagada" as const, paid_at: new Date().toISOString(), comprobante_path: data.comprobante_path || null }
          : f
      ))
      setPayModal(null)
      setPayFile(null)
    } catch (err: any) {
      alert("Error: " + err.message)
    } finally {
      setWorking(null)
    }
  }

  async function download(path: string) {
    try {
      const res = await authedFetch({ action: "download", path })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || "Error")
      window.open(data.url, "_blank")
    } catch (err: any) {
      alert("Error al descargar: " + err.message)
    }
  }

  const viernes = nextFridayISO()

  const pagosEsteViernes = useMemo(
    () => facturas.filter(f => f.status === "aceptada" && f.fecha_pago && f.fecha_pago <= viernes),
    [facturas, viernes]
  )

  const filtered = useMemo(() => {
    let list = facturas
    if (filter === "reembolso") list = list.filter(f => f.origen === "reembolso")
    else if (filter !== "todas") list = list.filter(f => f.status === filter)
    if (dateFrom) list = list.filter(f => f.created_at.split("T")[0] >= dateFrom)
    if (dateTo) list = list.filter(f => f.created_at.split("T")[0] <= dateTo)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(f =>
        provLabel(f).toLowerCase().includes(q) ||
        projLabel(f).toLowerCase().includes(q) ||
        (f.proveedor_email || "").toLowerCase().includes(q) ||
        (f.concepto || "").toLowerCase().includes(q) ||
        (f.uuid_fiscal || "").toLowerCase().includes(q)
      )
    }
    return list
  }, [facturas, filter, search, dateFrom, dateTo])

  const totalPorPagar = useMemo(
    () => facturas.filter(f => f.status === "aceptada").reduce((s, f) => s + montoPagar(f), 0),
    [facturas]
  )
  const totalViernes = pagosEsteViernes.reduce((s, f) => s + montoPagar(f), 0)

  // Facturas por pagar agrupadas por su viernes de vencimiento (fecha_pago).
  const pagosViernesMap = useMemo(() => {
    const map = new Map<string, Factura[]>()
    for (const f of facturas) {
      if (f.status !== "aceptada" || !f.fecha_pago) continue
      const k = f.fecha_pago.split("T")[0]
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(f)
    }
    return map
  }, [facturas])

  const viernesList = useMemo(() => {
    const hoy = todayISO()
    return [...pagosViernesMap.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([fecha, fs]) => ({
        fecha,
        total: fs.reduce((s, f) => s + montoPagar(f), 0),
        count: fs.length,
        vencido: fecha < hoy,
      }))
  }, [pagosViernesMap])

  const fridaysWithPagos = useMemo(() => new Set(viernesList.map(v => v.fecha)), [viernesList])

  // Viernes seleccionado: por defecto el primer viernes con pagos (o el próximo)
  const selectedViernes = selViernes ?? (viernesList[0]?.fecha ?? viernes)
  const selFacturas = useMemo(
    () => (pagosViernesMap.get(selectedViernes) || []).slice().sort((a, b) => montoPagar(b) - montoPagar(a)),
    [pagosViernesMap, selectedViernes]
  )
  const selTotal = selFacturas.reduce((s, f) => s + montoPagar(f), 0)
  const selVencido = selectedViernes < todayISO()

  function goViernes(iso: string) { setSelViernes(iso); setCalOpen(false) }

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
        isAdmin={profile?.role === "admin"}
        isMobile={isMobile}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen(!menuOpen)}
        onMenuClose={() => setMenuOpen(false)}
        onLogout={logout}
      />

      <main style={{ flex: 1, padding: isMobile ? "76px 14px 32px" : "32px 36px", maxWidth: 1200, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#f1f5f9" }}>💰 Finanzas — Facturas</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b" }}>
            Facturas recibidas de proveedores y programación de pagos
          </p>
        </div>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          <div style={cardStyle("#f59e0b")}>
            <p style={cardLabelStyle}>Pagos este viernes ({fechaCorta(viernes)})</p>
            <p style={{ ...cardValueStyle, color: "#fbbf24" }}>{fmtMx(totalViernes)}</p>
            <p style={cardHintStyle}>{pagosEsteViernes.length} factura{pagosEsteViernes.length !== 1 ? "s" : ""}</p>
          </div>
          <div style={cardStyle("#f87171")}>
            <p style={cardLabelStyle}>Total por pagar</p>
            <p style={{ ...cardValueStyle, color: "#f87171" }}>{fmtMx(totalPorPagar)}</p>
            <p style={cardHintStyle}>{facturas.filter(f => f.status === "aceptada").length} pendientes</p>
          </div>
          <div style={cardStyle("#34d399")}>
            <p style={cardLabelStyle}>Pagadas</p>
            <p style={{ ...cardValueStyle, color: "#34d399" }}>
              {fmtMx(facturas.filter(f => f.status === "pagada").reduce((s, f) => s + montoPagar(f), 0))}
            </p>
            <p style={cardHintStyle}>{facturas.filter(f => f.status === "pagada").length} facturas</p>
          </div>
        </div>

        {/* Toggle de vista */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {(["lista", "viernes"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={filterBtnStyle(view === v)}>
              {v === "lista" ? "📋 Lista" : "📅 Calendario de viernes"}
            </button>
          ))}
        </div>

        {/* ── Vista: calendario de viernes (uno a la vez, con todo el detalle) ── */}
        {view === "viernes" && (
          <div>
            {/* Navegación entre viernes */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 16 }}>
              <button onClick={() => setSelViernes(addDaysISO(selectedViernes, -7))} style={navArrowStyle} title="Viernes anterior">←</button>

              <div ref={calWrapRef} style={{ position: "relative" }}>
                <button onClick={() => setCalOpen(o => !o)} style={dateJumpBtnStyle} title="Saltar a un viernes específico">
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>{fechaViernes(selectedViernes)}</span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>📅</span>
                </button>
                {calOpen && (
                  <MiniCalendar value={selectedViernes} onPick={goViernes} highlight={fridaysWithPagos} />
                )}
              </div>

              <button onClick={() => setSelViernes(addDaysISO(selectedViernes, 7))} style={navArrowStyle} title="Viernes siguiente">→</button>
            </div>

            {/* Chips de acceso rápido a viernes con pagos */}
            {viernesList.length > 0 && (
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, marginBottom: 18 }}>
                {viernesList.map(v => {
                  const active = v.fecha === selectedViernes
                  return (
                    <button key={v.fecha} onClick={() => setSelViernes(v.fecha)} style={chipStyle(active, v.vencido)}>
                      <span style={{ fontWeight: 700 }}>{fechaCorta(v.fecha)}</span>
                      <span style={{ opacity: 0.85, marginLeft: 6 }}>{fmtMx(v.total)}</span>
                      {v.vencido && <span style={{ marginLeft: 6, fontSize: 9 }}>⚠</span>}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Encabezado del viernes seleccionado */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14, padding: "14px 18px", background: selVencido && selFacturas.length ? "rgba(248,113,113,0.07)" : "rgba(245,158,11,0.06)", border: `1px solid ${selVencido && selFacturas.length ? "rgba(248,113,113,0.28)" : "rgba(245,158,11,0.22)"}`, borderRadius: 14 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#cbd5e1", textTransform: "uppercase", letterSpacing: 0.6 }}>A liberar</span>
                  {selVencido && selFacturas.length > 0 && (
                    <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: "rgba(248,113,113,0.14)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171" }}>Atrasado</span>
                  )}
                </div>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                  {selFacturas.length} factura{selFacturas.length !== 1 ? "s" : ""}
                </p>
              </div>
              <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace", color: selVencido && selFacturas.length ? "#f87171" : "#fbbf24" }}>{fmtMx(selTotal)}</span>
            </div>

            {/* Detalle completo de cada factura de este viernes */}
            {selFacturas.length === 0 ? (
              <p style={{ color: "#475569", textAlign: "center", padding: "48px 0" }}>
                No hay pagos programados para este viernes.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {selFacturas.map(f => (
                  <div key={f.id} style={{ padding: "16px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(148,163,184,0.10)", borderRadius: 12 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 15, fontWeight: 600 }}><ProvLink f={f} /></span>
                          {f.origen && f.origen !== "proveedor" && (
                            <span style={origenBadgeStyle}>{ORIGEN_LABEL[f.origen]}</span>
                          )}
                        </div>
                        {f.concepto && (
                          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#cbd5e1" }}>{f.concepto}</p>
                        )}
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                          <ProjLink f={f} />
                          {f.forma_pago && <> · <span style={{ color: "#93c5fd" }}>Pago: {f.forma_pago}</span></>}
                        </p>
                        {f.uuid_fiscal && (
                          <p style={{ margin: "4px 0 0", fontSize: 10, color: "#475569", fontFamily: "monospace" }}>UUID: {f.uuid_fiscal}</p>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                        <span style={{ color: "#fbbf24", fontWeight: 700, fontFamily: "monospace", fontSize: 15 }} title="Total a pagar (IVA − retenciones)">
                          {fmtMx(montoPagar(f))}
                        </span>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {f.xml_path && <button onClick={() => download(f.xml_path!)} style={miniBtnStyle}>⬇ XML</button>}
                          {f.pdf_path && <button onClick={() => download(f.pdf_path!)} style={miniBtnStyle}>⬇ PDF</button>}
                          <button onClick={() => markPaid(f)} disabled={working === f.id} style={payBtnStyle(working === f.id)}>
                            {working === f.id ? "..." : "✓ Marcar Pago"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Vista: lista ── */}
        {view === "lista" && (<>

        {/* Pagos este viernes */}
        {pagosEsteViernes.length > 0 && (
          <div style={{ marginBottom: 28, padding: "18px 20px", background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 14 }}>
            <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: 0.6 }}>
              ⚡ Liberar este viernes
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pagosEsteViernes.map(f => (
                <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 600 }}><ProvLink f={f} /></span>
                    <span style={{ fontSize: 12, marginLeft: 8 }}><ProjLink f={f} /></span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: "#fbbf24", fontWeight: 700, fontFamily: "monospace", fontSize: 14 }}>
                      {fmtMx(montoPagar(f))}
                    </span>
                    <button
                      onClick={() => markPaid(f)}
                      disabled={working === f.id}
                      style={payBtnStyle(working === f.id)}
                    >
                      {working === f.id ? "..." : "✓ Marcar Pago"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Toolbar: filtros + rango de fechas + búsqueda */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {(["todas", "aceptada", "pagada", "reembolso", "rechazada"] as const).map(s => (
              <button key={s} onClick={() => setFilter(s)} style={filterBtnStyle(filter === s)}>
                {s === "todas" ? "Todas" : s === "aceptada" ? "Por pagar" : s === "pagada" ? "Pagadas" : s === "reembolso" ? "Reembolsos" : "Rechazadas"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "4px 10px 4px 12px", background: "rgba(2,6,23,0.35)", border: "1px solid rgba(148,163,184,0.14)", borderRadius: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Periodo</span>
              <span style={dateLabelStyle}>Del</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} max={dateTo || undefined} style={dateInputStyle} />
              <span style={dateLabelStyle}>al</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} min={dateFrom || undefined} style={dateInputStyle} />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(""); setDateTo("") }} style={clearDateBtnStyle} title="Limpiar rango de fechas">✕</button>
              )}
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar proveedor, proyecto, UUID..."
              style={{ marginLeft: isMobile ? 0 : "auto", padding: "8px 12px", background: "rgba(2,6,23,0.55)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 8, color: "#e2e8f0", fontSize: 13, outline: "none", width: isMobile ? "100%" : 260 }}
            />
          </div>
        </div>

        {/* Lista */}
        {filtered.length === 0 ? (
          <p style={{ color: "#475569", textAlign: "center", padding: "48px 0" }}>
            No hay facturas {filter !== "todas" || dateFrom || dateTo ? "con esos filtros" : "todavía"}.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map(f => (
              <div key={f.id} style={{ padding: "16px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(148,163,184,0.10)", borderRadius: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}><ProvLink f={f} /></span>
                      <span style={statusBadgeStyle(f.status)}>
                        {f.status === "aceptada" ? "Por pagar" : f.status === "pagada" ? "Pagada" : "Rechazada"}
                      </span>
                      {f.origen && f.origen !== "proveedor" && (
                        <span style={origenBadgeStyle}>{ORIGEN_LABEL[f.origen]}</span>
                      )}
                    </div>
                    {f.concepto && (
                      <p style={{ margin: "4px 0 0", fontSize: 13, color: "#cbd5e1" }}>{f.concepto}</p>
                    )}
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                      <ProjLink f={f} /> · Registrada {fechaCorta(f.created_at)}
                      {f.status === "aceptada" && f.fecha_pago && <> · <span style={{ color: "#fbbf24" }}>Pago: {fechaCorta(f.fecha_pago)}</span></>}
                      {f.status === "pagada" && f.paid_at && <> · <span style={{ color: "#34d399" }}>Pagada {fechaCorta(f.paid_at)}</span></>}
                      {f.forma_pago && <> · <span style={{ color: "#93c5fd" }}>Pago: {f.forma_pago}</span></>}
                    </p>
                    {f.status === "rechazada" && f.motivo_rechazo && (
                      <p style={{ margin: "6px 0 0", fontSize: 12, color: "#fca5a5", lineHeight: 1.5 }}>{f.motivo_rechazo}</p>
                    )}
                    {f.uuid_fiscal && (
                      <p style={{ margin: "4px 0 0", fontSize: 10, color: "#475569", fontFamily: "monospace" }}>UUID: {f.uuid_fiscal}</p>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                    {(f.total != null || f.subtotal != null) && (
                      <span style={{ color: "#e2e8f0", fontWeight: 700, fontFamily: "monospace", fontSize: 15 }} title="Total a pagar (IVA − retenciones)">
                        {fmtMx(montoPagar(f))}
                      </span>
                    )}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {f.xml_path && (
                        <button onClick={() => download(f.xml_path!)} style={miniBtnStyle}>⬇ XML</button>
                      )}
                      {f.pdf_path && (
                        <button onClick={() => download(f.pdf_path!)} style={miniBtnStyle}>⬇ PDF</button>
                      )}
                      {f.comprobante_path && (
                        <button onClick={() => download(f.comprobante_path!)} style={miniBtnStyle} title="Comprobante de pago del banco">📎 Comprobante</button>
                      )}
                      {f.status === "aceptada" && (
                        <button onClick={() => markPaid(f)} disabled={working === f.id} style={payBtnStyle(working === f.id)}>
                          {working === f.id ? "..." : "✓ Marcar Pago"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        </>)}

        {/* Modal: comprobante obligatorio para marcar pagada */}
        {payModal && (
          <div style={modalBackdropStyle} onClick={() => working ? null : setPayModal(null)}>
            <div style={modalPanelStyle} onClick={e => e.stopPropagation()}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>
                Marcar pago — {provLabel(payModal)}
              </p>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#94a3b8" }}>
                {projLabel(payModal)} · <span style={{ fontFamily: "monospace", color: "#e2e8f0", fontWeight: 700 }}>{fmtMx(montoPagar(payModal))}</span>
              </p>
              <p style={{ margin: "14px 0 6px", fontSize: 12, fontWeight: 600, color: "#cbd5e1" }}>
                Comprobante de pago del banco <span style={{ color: "#f87171" }}>*</span>
              </p>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={e => setPayFile(e.target.files?.[0] || null)}
                style={{ fontSize: 12, color: "#94a3b8", width: "100%" }}
              />
              <p style={{ margin: "8px 0 0", fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>
                PDF o JPG. Queda guardado y vinculado a esta transacción. Al confirmar se
                le envía el correo de pago al proveedor.
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                <button onClick={() => setPayModal(null)} disabled={working === payModal.id} style={modalCancelBtnStyle}>
                  Cancelar
                </button>
                <button onClick={confirmMarkPaid} disabled={working === payModal.id || !payFile} style={{ ...payBtnStyle(working === payModal.id), opacity: !payFile ? 0.5 : 1 }}>
                  {working === payModal.id ? "Guardando…" : "✓ Confirmar pago"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const provLinkStyle: React.CSSProperties = { color: "#7dd3fc", textDecoration: "none", fontWeight: 600 }
const projLinkStyle: React.CSSProperties = { color: "#a78bfa", textDecoration: "none" }

function cardStyle(accent: string): React.CSSProperties {
  return {
    padding: "16px 20px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(148,163,184,0.10)",
    boxShadow: `0 0 0 1px ${accent}22`,
  }
}

const cardLabelStyle: React.CSSProperties = {
  margin: 0, fontSize: 11, fontWeight: 600, textTransform: "uppercase",
  letterSpacing: 0.6, color: "#64748b",
}

const cardValueStyle: React.CSSProperties = {
  margin: "8px 0 0", fontSize: 22, fontWeight: 700, fontFamily: "monospace",
}

const cardHintStyle: React.CSSProperties = {
  margin: "4px 0 0", fontSize: 11, color: "#475569",
}

function filterBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
    border: active ? "1px solid rgba(6,182,212,0.45)" : "1px solid rgba(148,163,184,0.18)",
    background: active ? "rgba(6,182,212,0.14)" : "transparent",
    color: active ? "#67e8f9" : "#94a3b8",
  }
}

function statusBadgeStyle(status: string): React.CSSProperties {
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    aceptada:  { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.30)", text: "#fbbf24" },
    pagada:    { bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.30)", text: "#34d399" },
    rechazada: { bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.30)", text: "#f87171" },
  }
  const c = colors[status] || colors.aceptada
  return {
    padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
    background: c.bg, border: `1px solid ${c.border}`, color: c.text,
  }
}

// Navegación de viernes
const navArrowStyle: React.CSSProperties = {
  width: 38, height: 38, borderRadius: 10, cursor: "pointer",
  border: "1px solid rgba(148,163,184,0.2)", background: "rgba(148,163,184,0.06)",
  color: "#cbd5e1", fontSize: 18, fontWeight: 700, lineHeight: 1,
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
}

const dateJumpBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 12, cursor: "pointer",
  border: "1px solid rgba(148,163,184,0.2)", background: "rgba(255,255,255,0.03)",
}

function chipStyle(active: boolean, vencido: boolean): React.CSSProperties {
  return {
    flexShrink: 0, padding: "7px 12px", borderRadius: 999, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
    border: active
      ? "1px solid rgba(6,182,212,0.5)"
      : vencido ? "1px solid rgba(248,113,113,0.3)" : "1px solid rgba(148,163,184,0.18)",
    background: active ? "rgba(6,182,212,0.14)" : "transparent",
    color: active ? "#67e8f9" : vencido ? "#f87171" : "#94a3b8",
  }
}

// Mini-calendario
const calPopupStyle: React.CSSProperties = {
  position: "absolute", top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", zIndex: 50,
  width: 268, padding: 14, background: "#0b0e1c", border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 14, boxShadow: "0 20px 48px rgba(0,0,0,0.5)",
}

const calNavBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8, cursor: "pointer",
  border: "1px solid rgba(148,163,184,0.18)", background: "transparent",
  color: "#cbd5e1", fontSize: 16, fontWeight: 700, lineHeight: 1,
}

// Rango de fechas
const dateLabelStyle: React.CSSProperties = { fontSize: 11, color: "#64748b" }

const dateInputStyle: React.CSSProperties = {
  padding: "6px 8px", background: "rgba(2,6,23,0.55)", border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 8, color: "#e2e8f0", fontSize: 12, outline: "none", colorScheme: "dark",
}

const clearDateBtnStyle: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 6, cursor: "pointer",
  border: "1px solid rgba(148,163,184,0.18)", background: "transparent",
  color: "#94a3b8", fontSize: 12, lineHeight: 1,
}

const modalBackdropStyle: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 10000,
  background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
}

const modalPanelStyle: React.CSSProperties = {
  width: "100%", maxWidth: 440,
  background: "#0b0e1c", border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 14, padding: 22,
  boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
}

const modalCancelBtnStyle: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 8, cursor: "pointer",
  border: "1px solid rgba(148,163,184,0.2)", background: "transparent",
  color: "#94a3b8", fontSize: 13, fontWeight: 600,
}

const miniBtnStyle: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer",
  border: "1px solid rgba(148,163,184,0.22)", background: "rgba(148,163,184,0.08)", color: "#cbd5e1",
}

const origenBadgeStyle: React.CSSProperties = {
  padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 700,
  background: "rgba(96,165,250,0.14)", border: "1px solid rgba(96,165,250,0.3)", color: "#93c5fd",
}

function payBtnStyle(busy: boolean): React.CSSProperties {
  return {
    padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700,
    cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1,
    border: "1px solid rgba(249,115,22,0.4)", background: "rgba(249,115,22,0.14)", color: "#fdba74",
  }
}
