"use client"
import { PageLoader } from "../../components/PageLoader"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "../../lib/supabase"
import { requireSessionProfile } from "../../lib/session-profile"
import { AppSidebar } from "../../components/AppSidebar"

type Factura = {
  id: string
  proveedor_email: string | null
  codigo_proyecto: string | null
  subtotal: number | null
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

function provLabel(f: Factura) {
  if (!f.proveedores) return f.proveedor_email || "—"
  const p = f.proveedores
  return p.empresa || `${p.nombre} ${p.apellido}`
}

function projLabel(f: Factura) {
  if (f.projects) return `${f.projects.code || ""} ${f.projects.name}`.trim()
  return f.codigo_proyecto || "—"
}

function nextFridayISO(): string {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1)
  return d.toLocaleDateString("sv")
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

export default function FinanzasPage() {
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [filter, setFilter] = useState<"todas" | "aceptada" | "pagada" | "rechazada" | "reembolso">("todas")
  const [view, setView] = useState<"lista" | "viernes">("lista")
  const [search, setSearch] = useState("")
  const [working, setWorking] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    function checkMobile() { setIsMobile(window.innerWidth < 768) }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => { loadPage() }, [])

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
      const { data: { session } } = await supabase.auth.getSession()
      const fd = new FormData()
      fd.append("action", "mark-paid")
      fd.append("facturaId", factura.id)
      fd.append("comprobante", payFile)
      const res = await fetch("/api/facturas/admin", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: fd,
      })
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
  }, [facturas, filter, search])

  const totalPorPagar = useMemo(
    () => facturas.filter(f => f.status === "aceptada").reduce((s, f) => s + Number(f.subtotal || 0), 0),
    [facturas]
  )
  const totalViernes = pagosEsteViernes.reduce((s, f) => s + Number(f.subtotal || 0), 0)

  // Agrupar las facturas por pagar según su viernes de vencimiento (fecha_pago).
  // fecha_pago ya viene redondeada a viernes desde la recepción de facturas.
  const pagosPorViernes = useMemo(() => {
    const hoy = todayISO()
    const map = new Map<string, Factura[]>()
    for (const f of facturas) {
      if (f.status !== "aceptada" || !f.fecha_pago) continue
      const k = f.fecha_pago.split("T")[0]
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(f)
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([fecha, fs]) => {
        const total = fs.reduce((s, f) => s + Number(f.subtotal || 0), 0)
        const provMap = new Map<string, { nombre: string; total: number; count: number; proyectos: Set<string> }>()
        for (const f of fs) {
          const key = provLabel(f)
          if (!provMap.has(key)) provMap.set(key, { nombre: key, total: 0, count: 0, proyectos: new Set() })
          const p = provMap.get(key)!
          p.total += Number(f.subtotal || 0)
          p.count += 1
          p.proyectos.add(projLabel(f))
        }
        const proveedores = [...provMap.values()].sort((a, b) => b.total - a.total)
        return { fecha, total, count: fs.length, proveedores, vencido: fecha < hoy }
      })
  }, [facturas])

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
              {fmtMx(facturas.filter(f => f.status === "pagada").reduce((s, f) => s + Number(f.subtotal || 0), 0))}
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

        {view === "viernes" && (
          pagosPorViernes.length === 0 ? (
            <p style={{ color: "#475569", textAlign: "center", padding: "48px 0" }}>
              No hay pagos pendientes programados.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {pagosPorViernes.map(v => (
                <div key={v.fecha} style={{ padding: "18px 20px", background: "rgba(255,255,255,0.03)", border: `1px solid ${v.vencido ? "rgba(248,113,113,0.30)" : "rgba(148,163,184,0.12)"}`, borderRadius: 14 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>{fechaViernes(v.fecha)}</span>
                        {v.vencido && (
                          <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: "rgba(248,113,113,0.14)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171" }}>Atrasado</span>
                        )}
                      </div>
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                        {v.proveedores.length} proveedor{v.proveedores.length !== 1 ? "es" : ""} · {v.count} factura{v.count !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <span style={{ fontSize: 20, fontWeight: 700, fontFamily: "monospace", color: v.vencido ? "#f87171" : "#fbbf24" }}>{fmtMx(v.total)}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {v.proveedores.map(p => (
                      <div key={p.nombre} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid rgba(148,163,184,0.08)" }}>
                        <div style={{ minWidth: 0 }}>
                          <span style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>{p.nombre}</span>
                          <span style={{ color: "#64748b", fontSize: 12, marginLeft: 8 }}>
                            {[...p.proyectos].join(", ")}{p.count > 1 ? ` · ${p.count} facturas` : ""}
                          </span>
                        </div>
                        <span style={{ color: "#cbd5e1", fontWeight: 700, fontFamily: "monospace", fontSize: 14 }}>{fmtMx(p.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

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
                    <span style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>{provLabel(f)}</span>
                    <span style={{ color: "#64748b", fontSize: 12, marginLeft: 8 }}>{projLabel(f)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: "#fbbf24", fontWeight: 700, fontFamily: "monospace", fontSize: 14 }}>
                      {fmtMx(Number(f.subtotal || 0))}
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

        {/* Filtros */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          {(["todas", "aceptada", "pagada", "reembolso", "rechazada"] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)} style={filterBtnStyle(filter === s)}>
              {s === "todas" ? "Todas" : s === "aceptada" ? "Por pagar" : s === "pagada" ? "Pagadas" : s === "reembolso" ? "Reembolsos" : "Rechazadas"}
            </button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar proveedor, proyecto, UUID..."
            style={{ marginLeft: "auto", padding: "8px 12px", background: "rgba(2,6,23,0.55)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 8, color: "#e2e8f0", fontSize: 13, outline: "none", width: isMobile ? "100%" : 260 }}
          />
        </div>

        {/* Lista */}
        {filtered.length === 0 ? (
          <p style={{ color: "#475569", textAlign: "center", padding: "48px 0" }}>
            No hay facturas {filter !== "todas" ? "con ese estatus" : "todavía"}.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map(f => (
              <div key={f.id} style={{ padding: "16px 18px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(148,163,184,0.10)", borderRadius: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 600 }}>{provLabel(f)}</span>
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
                      {projLabel(f)} · Registrada {fechaCorta(f.created_at)}
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
                    {f.subtotal != null && (
                      <span style={{ color: "#e2e8f0", fontWeight: 700, fontFamily: "monospace", fontSize: 15 }}>
                        {fmtMx(Number(f.subtotal))}
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
                {projLabel(payModal)} · <span style={{ fontFamily: "monospace", color: "#e2e8f0", fontWeight: 700 }}>{fmtMx(Number(payModal.subtotal || 0))}</span>
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
