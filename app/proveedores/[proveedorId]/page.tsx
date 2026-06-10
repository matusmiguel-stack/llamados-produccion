"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import { requireSessionProfile } from "../../../lib/session-profile"
import { AppSidebar } from "../../../components/AppSidebar"
import { PageLoader } from "../../../components/PageLoader"

// ─── Types ────────────────────────────────────────────────────────────────────

type Proveedor = {
  id: string
  nombre: string
  apellido: string
  empresa: string | null
  actividad: string
  email: string | null
  telefono: string | null
  created_at: string
}

type EgresoRow = {
  id: string
  description: string
  actual_qty: number | null
  actual_days: number | null
  actual_unit_price: number | null
  monto: number
  project_id: string
  project_name: string
  client_name: string
  quote_id: string
  quote_name: string
  section_name: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
}

function initials(nombre: string, apellido: string) {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase()
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProveedorDetailPage() {
  const { proveedorId } = useParams() as { proveedorId: string }

  const [profile, setProfile]     = useState<any>(null)
  const [menuOpen, setMenuOpen]   = useState(false)
  const [isMobile, setIsMobile]   = useState(false)
  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [egresos, setEgresos]     = useState<EgresoRow[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768) }
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  useEffect(() => {
    async function load() {
      const auth = await requireSessionProfile()
      if (!auth) return
      if (!["admin", "editor"].includes(auth.profile.role)) {
        window.location.href = "/"
        return
      }
      setProfile(auth.profile)

      // Datos del proveedor
      const { data: prov, error } = await supabase
        .from("proveedores")
        .select("*")
        .eq("id", proveedorId)
        .single()

      if (error || !prov) {
        window.location.href = "/proveedores"
        return
      }
      setProveedor(prov)

      // Egresos: quote_items con actual_supplier_id = este proveedor
      // Necesitamos navegar: quote_items → quote_sections → quotes → projects → clients
      const { data: items } = await supabase
        .from("quote_items")
        .select(`
          id,
          description,
          actual_qty,
          actual_days,
          actual_unit_price,
          qty,
          days,
          unit_price,
          quote_sections!inner(
            name,
            quotes!inner(
              id,
              name,
              project_id,
              projects!inner(
                id,
                name,
                clients!inner(name)
              )
            )
          )
        `)
        .eq("actual_supplier_id", proveedorId)

      const rows: EgresoRow[] = []
      for (const item of (items || []) as any[]) {
        const hasActual = item.actual_qty != null || item.actual_days != null || item.actual_unit_price != null
        if (!hasActual) continue
        const q = item.actual_qty        != null ? item.actual_qty        : Math.max(item.qty  || 0, 1)
        const d = item.actual_days       != null ? item.actual_days       : Math.max(item.days || 0, 1)
        const p = item.actual_unit_price != null ? item.actual_unit_price : item.unit_price
        const monto = q * d * p
        if (monto === 0) continue

        const sec   = item.quote_sections
        const quote = sec.quotes
        const proj  = quote.projects

        rows.push({
          id:           item.id,
          description:  item.description,
          actual_qty:   item.actual_qty,
          actual_days:  item.actual_days,
          actual_unit_price: item.actual_unit_price,
          monto,
          project_id:   proj.id,
          project_name: proj.name,
          client_name:  proj.clients?.name || "",
          quote_id:     quote.id,
          quote_name:   quote.name,
          section_name: sec.name,
        })
      }

      // Ordenar: proyecto → cotización → sección
      rows.sort((a, b) =>
        a.project_name.localeCompare(b.project_name) ||
        a.quote_name.localeCompare(b.quote_name) ||
        a.section_name.localeCompare(b.section_name)
      )
      setEgresos(rows)
      setLoading(false)
    }
    load()
  }, [proveedorId])

  function logout() {
    supabase.auth.signOut().then(() => { window.location.href = "/login" })
  }

  if (!profile || loading) return <PageLoader />

  const totalEgresos = egresos.reduce((s, e) => s + e.monto, 0)
  const isAdmin = profile.role === "admin"

  // Agrupar por proyecto
  const byProject: Record<string, { project_name: string; client_name: string; project_id: string; rows: EgresoRow[] }> = {}
  for (const e of egresos) {
    if (!byProject[e.project_id]) byProject[e.project_id] = { project_name: e.project_name, client_name: e.client_name, project_id: e.project_id, rows: [] }
    byProject[e.project_id].rows.push(e)
  }

  return (
    <div style={appShellStyle}>
      <AppSidebar
        profile={profile}
        user={null}
        isAdmin={isAdmin}
        isMobile={isMobile}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen(!menuOpen)}
        onMenuClose={() => setMenuOpen(false)}
        onLogout={logout}
      />

      <main style={{ ...mainStyle, padding: isMobile ? "76px 14px 40px" : "28px 32px 60px" }}>
        <div style={pageContainerStyle}>

          {/* Back */}
          <Link href="/proveedores" style={backBtnStyle}>← Directorio de proveedores</Link>

          {/* Header del proveedor */}
          <div style={profileCardStyle}>
            <div style={avatarBigStyle}>{initials(proveedor!.nombre, proveedor!.apellido)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={eyebrowStyle}>Proveedor</p>
              <h1 style={nameTitleStyle}>{proveedor!.nombre} {proveedor!.apellido}</h1>
              {proveedor!.empresa && <p style={empresaStyle}>{proveedor!.empresa}</p>}
              <span style={activityBadgeStyle}>{proveedor!.actividad}</span>
            </div>
            <Link href="/proveedores" style={editLinkStyle}>✎ Editar en directorio</Link>
          </div>

          {/* Datos de contacto */}
          <div style={infoGridStyle}>
            <InfoCard icon="📧" label="Email"    value={proveedor!.email    || "—"} />
            <InfoCard icon="📱" label="Teléfono" value={proveedor!.telefono || "—"} />
            <InfoCard icon="💼" label="Actividad" value={proveedor!.actividad} />
            <InfoCard icon="📅" label="Alta"
              value={new Date(proveedor!.created_at).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })} />
          </div>

          {/* Resumen numérico */}
          <div style={summaryRowStyle}>
            <SummaryCard label="Total egresado" value={fmt(totalEgresos)} color="#f87171" big />
            <SummaryCard label="Proyectos"      value={String(Object.keys(byProject).length)} color="#94a3b8" />
            <SummaryCard label="Ítems"          value={String(egresos.length)}                color="#94a3b8" />
          </div>

          {/* Tabla de egresos */}
          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <p style={sectionTitleStyle}>Egresos asignados</p>
              <p style={sectionHintStyle}>Todos los rubros liberados en cotizaciones donde aparece este proveedor</p>
            </div>

            {egresos.length === 0 ? (
              <div style={emptyStateStyle}>
                <p style={{ margin: 0, fontSize: 15, color: "#475569" }}>Sin egresos asignados</p>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#334155" }}>Este proveedor aún no tiene rubros capturados en ninguna liberación.</p>
              </div>
            ) : (
              Object.entries(byProject).map(([pid, { project_name, client_name, rows }]) => {
                const projectTotal = rows.reduce((s, r) => s + r.monto, 0)
                return (
                  <div key={pid} style={{ marginBottom: 20 }}>
                    {/* Project header */}
                    <div style={projectHeaderStyle}>
                      <div>
                        <Link href={`/proyectos/${pid}`} style={projectNameLinkStyle}>{project_name}</Link>
                        <span style={clientNameStyle}> · {client_name}</span>
                      </div>
                      <span style={projectTotalStyle}>{fmt(projectTotal)}</span>
                    </div>

                    <div style={tableWrapStyle}>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            {["Cotización", "Sección", "Descripción", "Qty", "Días", "P.U.", "Monto"].map((h, i) => (
                              <th key={i} style={{ ...thStyle, textAlign: i >= 3 ? "right" : "left" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, idx) => {
                            const qty   = row.actual_qty        ?? "—"
                            const days  = row.actual_days       ?? "—"
                            const price = row.actual_unit_price ?? null
                            return (
                              <tr key={row.id} style={{ background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.018)", borderBottom: "1px solid rgba(148,163,184,0.07)" }}>
                                <td style={tdStyle}>
                                  <Link href={`/proyectos/${row.project_id}/liberar/${row.quote_id}`} style={quoteLinkStyle}>{row.quote_name}</Link>
                                </td>
                                <td style={{ ...tdStyle, color: "#64748b", fontSize: 12 }}>{row.section_name}</td>
                                <td style={{ ...tdStyle, color: "#e2e8f0", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.description}</td>
                                <td style={{ ...tdStyle, textAlign: "right", color: "#94a3b8", fontSize: 12 }}>{qty}</td>
                                <td style={{ ...tdStyle, textAlign: "right", color: "#94a3b8", fontSize: 12 }}>{days}</td>
                                <td style={{ ...tdStyle, textAlign: "right", color: "#94a3b8", fontSize: 12, fontFamily: "monospace" }}>{price != null ? fmt(price) : "—"}</td>
                                <td style={{ ...tdStyle, textAlign: "right", color: "#f87171", fontWeight: 700, fontFamily: "monospace" }}>{fmt(row.monto)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: "1px solid rgba(148,163,184,0.14)" }}>
                            <td colSpan={6} style={{ ...tdStyle, color: "#64748b", fontSize: 12, paddingTop: 10 }}>
                              {rows.length} rubro{rows.length !== 1 ? "s" : ""}
                            </td>
                            <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#f87171", fontFamily: "monospace", paddingTop: 10 }}>
                              {fmt(projectTotal)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )
              })
            )}
          </div>

        </div>
      </main>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={infoCardStyle}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div>
        <p style={{ margin: 0, color: "#64748b", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</p>
        <p style={{ margin: "3px 0 0", color: "#e2e8f0", fontSize: 13, wordBreak: "break-word" }}>{value}</p>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color, big }: { label: string; value: string; color: string; big?: boolean }) {
  return (
    <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(148,163,184,0.10)", flex: big ? "1.5 1 0" : "1 1 0", minWidth: 0, boxShadow: `0 0 0 1px ${color}22` }}>
      <p style={{ margin: 0, color: "#64748b", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</p>
      <p style={{ margin: "6px 0 0", color, fontSize: big ? 22 : 20, fontWeight: 700, fontFamily: "monospace" }}>{value}</p>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const appShellStyle: React.CSSProperties = { display: "flex", minHeight: "100vh" }
const mainStyle: React.CSSProperties     = { flex: 1, minWidth: 0 }
const pageContainerStyle: React.CSSProperties = { maxWidth: 1100, margin: "0 auto", display: "grid", gap: 18 }

const backBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", width: "fit-content",
  padding: "7px 12px", borderRadius: 8, border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(255,255,255,0.04)", color: "#cbd5e1", textDecoration: "none", fontSize: 13, fontWeight: 500,
}

const profileCardStyle: React.CSSProperties = {
  display: "flex", alignItems: "flex-start", gap: 18, flexWrap: "wrap",
  padding: "20px 22px", borderRadius: 16,
  background: "rgba(15,23,42,0.72)", border: "1px solid rgba(148,163,184,0.14)",
  backdropFilter: "blur(16px)",
}

const avatarBigStyle: React.CSSProperties = {
  width: 64, height: 64, borderRadius: 16, flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "linear-gradient(135deg, rgba(245,158,11,0.40), rgba(234,88,12,0.28))",
  border: "1px solid rgba(251,191,36,0.28)",
  color: "#f8fafc", fontSize: 22, fontWeight: 700,
}

const eyebrowStyle: React.CSSProperties = {
  margin: 0, color: "#fbbf24", fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 700,
}

const nameTitleStyle: React.CSSProperties = {
  margin: "4px 0 2px", color: "#f8fafc", fontSize: 24, fontWeight: 700, letterSpacing: -0.4,
}

const empresaStyle: React.CSSProperties = {
  margin: "0 0 6px", color: "#94a3b8", fontSize: 14,
}

const activityBadgeStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 999,
  fontSize: 11, fontWeight: 600,
  background: "rgba(245,158,11,0.14)", border: "1px solid rgba(251,191,36,0.24)", color: "#fde68a",
}

const editLinkStyle: React.CSSProperties = {
  marginLeft: "auto", alignSelf: "flex-start",
  padding: "6px 12px", borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.16)", background: "rgba(255,255,255,0.04)",
  color: "#94a3b8", textDecoration: "none", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap",
}

const infoGridStyle: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10,
}

const infoCardStyle: React.CSSProperties = {
  display: "flex", alignItems: "flex-start", gap: 10,
  padding: "12px 16px", borderRadius: 12,
  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(148,163,184,0.10)",
}

const summaryRowStyle: React.CSSProperties = {
  display: "flex", gap: 12, flexWrap: "wrap",
}

const sectionStyle: React.CSSProperties = {
  background: "rgba(15,23,42,0.72)", border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 16, padding: "16px 18px", backdropFilter: "blur(16px)",
}

const sectionHeaderStyle: React.CSSProperties = {
  marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid rgba(148,163,184,0.10)",
}

const sectionTitleStyle: React.CSSProperties = {
  margin: 0, color: "#f8fafc", fontSize: 14, fontWeight: 700,
}

const sectionHintStyle: React.CSSProperties = {
  margin: "4px 0 0", color: "#64748b", fontSize: 12,
}

const projectHeaderStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "10px 14px", borderRadius: "10px 10px 0 0",
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(148,163,184,0.12)", borderBottom: "none",
  flexWrap: "wrap", gap: 8,
}

const projectNameLinkStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: "#e2e8f0", textDecoration: "none",
}

const clientNameStyle: React.CSSProperties = {
  fontSize: 12, color: "#64748b",
}

const projectTotalStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, color: "#f87171", fontFamily: "monospace",
}

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto", borderRadius: "0 0 10px 10px", border: "1px solid rgba(148,163,184,0.10)",
}

const tableStyle: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse", fontSize: 13, color: "#cbd5e1",
}

const thStyle: React.CSSProperties = {
  padding: "9px 12px", fontSize: 11, fontWeight: 700, color: "#475569",
  textTransform: "uppercase", letterSpacing: 0.6,
  borderBottom: "1px solid rgba(148,163,184,0.12)", background: "rgba(255,255,255,0.025)",
  whiteSpace: "nowrap",
}

const tdStyle: React.CSSProperties = {
  padding: "9px 12px", fontSize: 13, color: "#cbd5e1", verticalAlign: "middle",
}

const quoteLinkStyle: React.CSSProperties = {
  color: "#a78bfa", textDecoration: "none", fontSize: 12, fontWeight: 600,
}

const emptyStateStyle: React.CSSProperties = {
  padding: "36px 24px", textAlign: "center", borderRadius: 12,
  background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(148,163,184,0.14)",
}
