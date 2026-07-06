"use client"

import { useEffect, useRef, useState } from "react"
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

type ProvCatalog = { id: string; nombre: string; apellido: string; empresa: string | null; actividad: string }
type EmpCatalog  = { id: string; nombre: string; apellido_paterno: string; apellido_materno: string | null; puesto: string }

type EgresoRow = {
  id: string
  description: string
  // lib fallbacks
  base_qty: number; base_days: number; base_unit_price: number
  // actual
  actual_qty: number | null
  actual_days: number | null
  actual_unit_price: number | null
  actual_supplier_id: string | null
  actual_employee_id: string | null
  monto: number
  project_id: string
  project_name: string
  client_name: string
  quote_id: string
  quote_name: string
  section_name: string
}

type FacturaRow = {
  id: string
  subtotal: number | null
  status: "aceptada" | "rechazada" | "pagada"
  fecha_pago: string | null
  paid_at: string | null
  concepto: string | null
  origen: string | null
  forma_pago: string | null
  motivo_rechazo: string | null
  created_at: string
  codigo_proyecto: string | null
  comprobante_path: string | null
  project_name: string | null
  project_code: string | null
}

type EditState = { qty: string; days: string; unit_price: string; contact: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  const [y, m, d] = iso.split("T")[0].split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
}

// Estatus de factura (mismos nombres/colores que la página de Finanzas)
const FAC_STATUS: Record<string, { label: string; bg: string; border: string; text: string }> = {
  aceptada:  { label: "Por pagar", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.30)", text: "#fbbf24" },
  pagada:    { label: "Pagada",    bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.30)", text: "#34d399" },
  rechazada: { label: "Rechazada", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.30)", text: "#f87171" },
}

function initials(nombre: string, apellido: string) {
  return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase()
}

function calcMonto(row: EgresoRow, edit?: EditState): number {
  const q = edit?.qty        !== "" && edit?.qty        != null ? parseFloat(edit.qty)        : (row.actual_qty        ?? row.base_qty)
  const d = edit?.days       !== "" && edit?.days       != null ? parseFloat(edit.days)       : (row.actual_days       ?? row.base_days)
  const p = edit?.unit_price !== "" && edit?.unit_price != null ? parseFloat(edit.unit_price) : (row.actual_unit_price ?? row.base_unit_price)
  if (isNaN(q) || isNaN(d) || isNaN(p)) return 0
  return q * d * p
}

function resolveContactLabel(provs: ProvCatalog[], emps: EmpCatalog[], contact: string): string {
  if (contact.startsWith("prov:")) {
    const p = provs.find(x => x.id === contact.slice(5))
    if (p) return p.empresa ? `${p.empresa} — ${p.nombre} ${p.apellido}` : `${p.nombre} ${p.apellido}`
  }
  if (contact.startsWith("emp:")) {
    const e = emps.find(x => x.id === contact.slice(4))
    if (e) {
      const ap = e.apellido_materno ? `${e.apellido_paterno} ${e.apellido_materno}` : e.apellido_paterno
      return `${e.nombre} ${ap}`
    }
  }
  return "Sin asignar"
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProveedorDetailPage() {
  const { proveedorId } = useParams() as { proveedorId: string }

  const [profile, setProfile]       = useState<any>(null)
  const [menuOpen, setMenuOpen]     = useState(false)
  const [isMobile, setIsMobile]     = useState(false)
  const [proveedor, setProveedor]   = useState<Proveedor | null>(null)
  const [egresos, setEgresos]       = useState<EgresoRow[]>([])
  const [facturas, setFacturas]     = useState<FacturaRow[]>([])
  const [facFilter, setFacFilter]   = useState<"aceptada" | "pagada" | "rechazada">("aceptada")
  const [payingId, setPayingId]     = useState<string | null>(null)
  const [provCatalog, setProvCatalog] = useState<ProvCatalog[]>([])
  const [empCatalog, setEmpCatalog]   = useState<EmpCatalog[]>([])
  const [loading, setLoading]       = useState(true)

  // Edit state
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [editState, setEditState]   = useState<EditState>({ qty: "", days: "", unit_price: "", contact: "" })
  const [saving, setSaving]         = useState(false)

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
      if (!["admin", "editor", "editor_premium", "finanzas"].includes(auth.profile.role)) {
        window.location.href = "/"; return
      }
      setProfile(auth.profile)

      const [
        { data: prov, error },
        { data: provs },
        { data: emps },
      ] = await Promise.all([
        supabase.from("proveedores").select("*").eq("id", proveedorId).single(),
        supabase.from("proveedores").select("id,nombre,apellido,empresa,actividad").order("nombre"),
        supabase.from("employees").select("id,nombre,apellido_paterno,apellido_materno,puesto").order("nombre"),
      ])

      if (error || !prov) { window.location.href = "/proveedores"; return }
      setProveedor(prov)
      setProvCatalog(provs || [])
      setEmpCatalog(emps || [])

      await loadEgresos(provs || [], emps || [])

      // Facturas del proveedor (espejo de Finanzas) — RLS solo deja leerlas a
      // admin/finanzas; para otros roles regresa vacío sin error.
      if (["admin", "finanzas"].includes(auth.profile.role)) {
        const { data: facs } = await supabase
          .from("facturas")
          .select("id, subtotal, status, fecha_pago, paid_at, concepto, origen, forma_pago, motivo_rechazo, created_at, codigo_proyecto, comprobante_path, projects(name, code)")
          .eq("proveedor_id", proveedorId)
          .order("created_at", { ascending: false })
        setFacturas((facs || []).map((f: any) => ({
          id: f.id, subtotal: f.subtotal, status: f.status,
          fecha_pago: f.fecha_pago, paid_at: f.paid_at, concepto: f.concepto,
          origen: f.origen, forma_pago: f.forma_pago, motivo_rechazo: f.motivo_rechazo,
          created_at: f.created_at, codigo_proyecto: f.codigo_proyecto,
          comprobante_path: f.comprobante_path ?? null,
          project_name: f.projects?.name ?? null, project_code: f.projects?.code ?? null,
        })))
      }

      setLoading(false)
    }
    load()
  }, [proveedorId])

  async function loadEgresos(provs: ProvCatalog[], emps: EmpCatalog[]) {
    const { data: items } = await supabase
      .from("quote_items")
      .select(`
        id, description, qty, days, unit_price,
        actual_qty, actual_days, actual_unit_price, actual_supplier_id, actual_employee_id,
        quote_sections!inner(
          name,
          quotes!inner(
            id, name, project_id,
            projects!inner(id, name, clients!inner(name))
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
        id: item.id, description: item.description,
        base_qty: Math.max(item.qty || 0, 1), base_days: Math.max(item.days || 0, 1), base_unit_price: item.unit_price,
        actual_qty: item.actual_qty, actual_days: item.actual_days, actual_unit_price: item.actual_unit_price,
        actual_supplier_id: item.actual_supplier_id, actual_employee_id: item.actual_employee_id,
        monto,
        project_id: proj.id, project_name: proj.name,
        client_name: proj.clients?.name || "",
        quote_id: quote.id, quote_name: quote.name,
        section_name: sec.name,
      })
    }

    rows.sort((a, b) =>
      a.project_name.localeCompare(b.project_name) ||
      a.quote_name.localeCompare(b.quote_name) ||
      a.section_name.localeCompare(b.section_name)
    )
    setEgresos(rows)
  }

  // Marcar una factura como pagada — misma acción/endpoint que el módulo de
  // Finanzas (comprobante del banco obligatorio), así ambos quedan sincronizados.
  const [payModalFac, setPayModalFac] = useState<FacturaRow | null>(null)
  const [payFile, setPayFile] = useState<File | null>(null)

  function markFacturaPaid(f: FacturaRow) {
    setPayFile(null)
    setPayModalFac(f)
  }

  async function confirmMarkFacturaPaid() {
    if (!payModalFac) return
    if (!payFile) { alert("Sube el comprobante de pago del banco (PDF o JPG)"); return }
    const f = payModalFac
    setPayingId(f.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const fd = new FormData()
      fd.append("action", "mark-paid")
      fd.append("facturaId", f.id)
      fd.append("comprobante", payFile)
      const res = await fetch("/api/facturas/admin", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: fd,
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || "Error")
      setFacturas(prev => prev.map(x => x.id === f.id
        ? { ...x, status: "pagada", paid_at: new Date().toISOString(), comprobante_path: data.comprobante_path || null }
        : x))
      setPayModalFac(null)
      setPayFile(null)
    } catch (err: any) {
      alert("Error al marcar pago: " + err.message)
    } finally {
      setPayingId(null)
    }
  }

  // Descargar el comprobante de pago (link firmado del storage)
  async function downloadComprobante(path: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/facturas/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ action: "download", path }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || "Error")
      window.open(data.url, "_blank")
    } catch (err: any) {
      alert("Error al descargar: " + err.message)
    }
  }

  function startEdit(row: EgresoRow) {
    const contact = row.actual_supplier_id
      ? `prov:${row.actual_supplier_id}`
      : row.actual_employee_id ? `emp:${row.actual_employee_id}` : ""
    setEditState({
      qty:        row.actual_qty        != null ? String(row.actual_qty)        : "",
      days:       row.actual_days       != null ? String(row.actual_days)       : "",
      unit_price: row.actual_unit_price != null ? String(row.actual_unit_price) : "",
      contact,
    })
    setEditingId(row.id)
  }

  function cancelEdit() { setEditingId(null) }

  async function saveEdit(rowId: string) {
    setSaving(true)
    try {
      const actual_qty        = editState.qty        !== "" ? parseFloat(editState.qty)        : null
      const actual_days       = editState.days       !== "" ? parseFloat(editState.days)       : null
      const actual_unit_price = editState.unit_price !== "" ? parseFloat(editState.unit_price) : null
      let actual_supplier_id: string | null = null
      let actual_employee_id: string | null = null
      if (editState.contact.startsWith("prov:")) actual_supplier_id = editState.contact.slice(5)
      else if (editState.contact.startsWith("emp:")) actual_employee_id = editState.contact.slice(4)

      const { error } = await supabase
        .from("quote_items")
        .update({ actual_qty, actual_days, actual_unit_price, actual_supplier_id, actual_employee_id })
        .eq("id", rowId)
      if (error) throw error

      // Si el proveedor cambió, el ítem ya no pertenece a esta página → recargar
      const providerChanged = actual_supplier_id !== proveedorId
      if (providerChanged) {
        await loadEgresos(provCatalog, empCatalog)
      } else {
        // Actualizar localmente
        setEgresos(prev => prev.map(r => {
          if (r.id !== rowId) return r
          const updated = { ...r, actual_qty, actual_days, actual_unit_price, actual_supplier_id, actual_employee_id }
          const q2 = actual_qty        != null ? actual_qty        : r.base_qty
          const d2 = actual_days       != null ? actual_days       : r.base_days
          const p2 = actual_unit_price != null ? actual_unit_price : r.base_unit_price
          return { ...updated, monto: q2 * d2 * p2 }
        }).filter(r => r.monto > 0))
      }

      setEditingId(null)
    } catch (err: any) {
      alert("Error al guardar: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  function logout() {
    supabase.auth.signOut().then(() => { window.location.href = "/login" })
  }

  if (!profile || loading) return <PageLoader />

  const totalEgresos = egresos.reduce((s, e) => s + e.monto, 0)
  const isAdmin = profile.role === "admin"
  // Finanzas solo consulta: no puede editar los egresos del proveedor.
  const canEdit = ["admin", "editor", "editor_premium"].includes(profile.role)
  // Facturas: espejo de Finanzas (solo admin/finanzas pueden verlas).
  const canSeeFacturas = ["admin", "finanzas"].includes(profile.role)
  const hoyISO = new Date().toLocaleDateString("sv")
  // Total facturado = facturas metidas (por pagar + pagadas), SIN las rechazadas.
  const totalFacturado = facturas.filter(f => f.status !== "rechazada").reduce((s, f) => s + Number(f.subtotal || 0), 0)
  // Total por pagar = solo las que faltan por pagar (aceptadas, aún no pagadas).
  const totalPorPagar = facturas.filter(f => f.status === "aceptada").reduce((s, f) => s + Number(f.subtotal || 0), 0)
  // Total vencido = por pagar cuyo plazo (fecha_pago) ya pasó.
  const totalVencido = facturas.filter(f => f.status === "aceptada" && f.fecha_pago && f.fecha_pago < hoyISO).reduce((s, f) => s + Number(f.subtotal || 0), 0)
  const facCounts = {
    aceptada:  facturas.filter(f => f.status === "aceptada").length,
    pagada:    facturas.filter(f => f.status === "pagada").length,
    rechazada: facturas.filter(f => f.status === "rechazada").length,
  }
  const facturasFiltradas = facturas.filter(f => f.status === facFilter)

  const byProject: Record<string, { project_name: string; client_name: string; project_id: string; rows: EgresoRow[] }> = {}
  for (const e of egresos) {
    if (!byProject[e.project_id]) byProject[e.project_id] = { project_name: e.project_name, client_name: e.client_name, project_id: e.project_id, rows: [] }
    byProject[e.project_id].rows.push(e)
  }

  return (
    <div style={appShellStyle}>
      <AppSidebar
        profile={profile} user={null} isAdmin={isAdmin} isMobile={isMobile}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen(!menuOpen)}
        onMenuClose={() => setMenuOpen(false)}
        onLogout={logout}
      />

      <main style={{ ...mainStyle, padding: isMobile ? "76px 14px 40px" : "28px 32px 60px" }}>
        <div style={pageContainerStyle}>

          <Link href="/proveedores" style={backBtnStyle}>← Directorio de proveedores</Link>

          {/* Header */}
          <div style={profileCardStyle}>
            <div style={avatarBigStyle}>{initials(proveedor!.nombre, proveedor!.apellido)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={eyebrowStyle}>Proveedor</p>
              <h1 style={nameTitleStyle}>{proveedor!.nombre} {proveedor!.apellido}</h1>
              {proveedor!.empresa && <p style={empresaStyle}>{proveedor!.empresa}</p>}
              <span style={activityBadgeStyle}>{proveedor!.actividad}</span>
            </div>
            {canEdit && <Link href="/proveedores" style={editLinkStyle}>✎ Editar en directorio</Link>}
          </div>

          {/* Info cards */}
          <div style={infoGridStyle}>
            <InfoCard icon="📧" label="Email"     value={proveedor!.email    || "—"} />
            <InfoCard icon="📱" label="Teléfono"  value={proveedor!.telefono || "—"} />
            <InfoCard icon="💼" label="Actividad" value={proveedor!.actividad} />
            <InfoCard icon="📅" label="Alta"
              value={new Date(proveedor!.created_at).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" })} />
          </div>

          {/* Summary */}
          <div style={summaryRowStyle}>
            <SummaryCard label="Total egresado" value={fmt(totalEgresos)} color="#f87171" big />
            <SummaryCard label="Proyectos"      value={String(Object.keys(byProject).length)} color="#94a3b8" />
            <SummaryCard label="Ítems"          value={String(egresos.length)} color="#94a3b8" />
          </div>

          {/* Egresos */}
          <div style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <p style={sectionTitleStyle}>Egresos asignados</p>
              <p style={sectionHintStyle}>Todos los rubros liberados donde aparece este proveedor{canEdit ? " — editables desde aquí" : ""}</p>
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
                            {["Cotización", "Sección", "Descripción", "Proveedor", "Qty", "Días", "P.U.", "Monto", ""].map((h, i) => (
                              <th key={i} style={{ ...thStyle, textAlign: i >= 4 && i <= 7 ? "right" : "left" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, idx) => {
                            const isEditing = editingId === row.id

                            if (isEditing) {
                              const previewMonto = calcMonto(row, editState)
                              return (
                                <tr key={row.id} style={{ background: "rgba(167,139,250,0.06)", borderBottom: "1px solid rgba(167,139,250,0.15)" }}>
                                  {/* Cotización */}
                                  <td style={tdStyle}>
                                    <Link href={`/proyectos/${row.project_id}/liberar/${row.quote_id}`} style={quoteLinkStyle}>{row.quote_name}</Link>
                                  </td>
                                  {/* Sección */}
                                  <td style={{ ...tdStyle, color: "#64748b", fontSize: 12 }}>{row.section_name}</td>
                                  {/* Descripción */}
                                  <td style={{ ...tdStyle, color: "#e2e8f0", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.description}</td>
                                  {/* Combobox proveedor */}
                                  <td style={{ ...tdStyle, minWidth: 200 }}>
                                    <SupplierCombobox
                                      value={editState.contact}
                                      onChange={val => setEditState(s => ({ ...s, contact: val }))}
                                      proveedores={provCatalog}
                                      employees={empCatalog}
                                    />
                                  </td>
                                  {/* Qty */}
                                  <td style={tdStyle}>
                                    <input type="number" value={editState.qty}
                                      onChange={e => setEditState(s => ({ ...s, qty: e.target.value }))}
                                      placeholder={String(row.actual_qty ?? row.base_qty)}
                                      style={editInputStyle} />
                                  </td>
                                  {/* Días */}
                                  <td style={tdStyle}>
                                    <input type="number" value={editState.days}
                                      onChange={e => setEditState(s => ({ ...s, days: e.target.value }))}
                                      placeholder={String(row.actual_days ?? row.base_days)}
                                      style={editInputStyle} />
                                  </td>
                                  {/* P.U. */}
                                  <td style={tdStyle}>
                                    <input type="number" value={editState.unit_price}
                                      onChange={e => setEditState(s => ({ ...s, unit_price: e.target.value }))}
                                      placeholder={String(row.actual_unit_price ?? row.base_unit_price)}
                                      style={{ ...editInputStyle, width: 90 }} />
                                  </td>
                                  {/* Preview monto */}
                                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#f87171", fontFamily: "monospace" }}>
                                    {fmt(previewMonto)}
                                  </td>
                                  {/* Acciones */}
                                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                                    <button onClick={() => saveEdit(row.id)} disabled={saving} style={saveBtnStyle}>{saving ? "…" : "✓"}</button>
                                    <button onClick={cancelEdit} style={cancelBtnStyle}>✕</button>
                                  </td>
                                </tr>
                              )
                            }

                            // Vista normal
                            const qty   = row.actual_qty        ?? "—"
                            const days  = row.actual_days       ?? "—"
                            const price = row.actual_unit_price ?? null
                            const contactVal = row.actual_supplier_id
                              ? `prov:${row.actual_supplier_id}`
                              : row.actual_employee_id ? `emp:${row.actual_employee_id}` : ""
                            const contactLabel = resolveContactLabel(provCatalog, empCatalog, contactVal)
                            const isThisProv = row.actual_supplier_id === proveedorId

                            return (
                              <tr key={row.id} style={{ background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.018)", borderBottom: "1px solid rgba(148,163,184,0.07)" }}>
                                <td style={tdStyle}>
                                  <Link href={`/proyectos/${row.project_id}/liberar/${row.quote_id}`} style={quoteLinkStyle}>{row.quote_name}</Link>
                                </td>
                                <td style={{ ...tdStyle, color: "#64748b", fontSize: 12 }}>{row.section_name}</td>
                                <td style={{ ...tdStyle, color: "#e2e8f0", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.description}</td>
                                <td style={tdStyle}>
                                  <span style={isThisProv ? currentProvBadge : otherProvBadge}>{isThisProv ? "🏢 " : "👤 "}{contactLabel}</span>
                                </td>
                                <td style={{ ...tdStyle, textAlign: "right", color: "#94a3b8", fontSize: 12 }}>{qty}</td>
                                <td style={{ ...tdStyle, textAlign: "right", color: "#94a3b8", fontSize: 12 }}>{days}</td>
                                <td style={{ ...tdStyle, textAlign: "right", color: "#94a3b8", fontSize: 12, fontFamily: "monospace" }}>{price != null ? fmt(price) : "—"}</td>
                                <td style={{ ...tdStyle, textAlign: "right", color: "#f87171", fontWeight: 700, fontFamily: "monospace" }}>{fmt(row.monto)}</td>
                                <td style={{ ...tdStyle, textAlign: "right" }}>
                                  {canEdit && <button onClick={() => startEdit(row)} style={editBtnStyle}>✎ Editar</button>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: "1px solid rgba(148,163,184,0.14)" }}>
                            <td colSpan={7} style={{ ...tdStyle, color: "#64748b", fontSize: 12, paddingTop: 10 }}>
                              {rows.length} rubro{rows.length !== 1 ? "s" : ""}
                            </td>
                            <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#f87171", fontFamily: "monospace", paddingTop: 10 }}>
                              {fmt(projectTotal)}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Facturas (espejo de Finanzas) */}
          {canSeeFacturas && (
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>
                <p style={sectionTitleStyle}>Facturas</p>
                <p style={sectionHintStyle}>Facturas recibidas de este proveedor y su estatus de pago — mismo dato que en Finanzas</p>
              </div>

              <div style={summaryRowStyle}>
                <SummaryCard label="Total facturado" value={fmt(totalFacturado)} color="#a78bfa" />
                <SummaryCard label="Total por pagar" value={fmt(totalPorPagar)} color="#fbbf24" />
                <SummaryCard label="Total vencido"   value={fmt(totalVencido)} color="#f87171" />
              </div>

              {/* Filtros */}
              <div style={{ display: "flex", gap: 8, margin: "18px 0 14px", flexWrap: "wrap" }}>
                {([
                  ["aceptada", "Por pagar"],
                  ["pagada", "Pagadas"],
                  ["rechazada", "Rechazadas"],
                ] as const).map(([key, label]) => {
                  const active = facFilter === key
                  const cfg = FAC_STATUS[key]
                  return (
                    <button
                      key={key}
                      onClick={() => setFacFilter(key)}
                      style={{
                        padding: "6px 13px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                        border: `1px solid ${active ? cfg.border : "rgba(148,163,184,0.18)"}`,
                        background: active ? cfg.bg : "transparent",
                        color: active ? cfg.text : "#94a3b8",
                      }}
                    >
                      {label} ({facCounts[key]})
                    </button>
                  )
                })}
              </div>

              {facturasFiltradas.length === 0 ? (
                <div style={emptyStateStyle}>
                  <p style={{ margin: 0, fontSize: 15, color: "#475569" }}>
                    {facFilter === "aceptada" ? "Sin facturas por pagar" : facFilter === "pagada" ? "Sin facturas pagadas" : "Sin facturas rechazadas"}
                  </p>
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "#334155" }}>
                    {facturas.length === 0 ? "Este proveedor aún no ha subido facturas al sistema." : "Prueba con otro filtro."}
                  </p>
                </div>
              ) : (
                <div style={tableWrapStyle}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        {["Estatus", "Proyecto", "Concepto", "Monto", "Fecha de pago", ""].map((h, i) => (
                          <th key={i} style={{ ...thStyle, textAlign: i === 3 ? "right" : "left" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {facturasFiltradas.map((f, idx) => {
                        const cfg = FAC_STATUS[f.status] || FAC_STATUS.aceptada
                        const proyecto = f.project_code
                          ? `${f.project_code} ${f.project_name ?? ""}`.trim()
                          : (f.project_name || f.codigo_proyecto || "—")
                        const vencida = f.status === "aceptada" && !!f.fecha_pago && f.fecha_pago < hoyISO
                        const fecha = f.status === "pagada"
                          ? (f.paid_at ? `Pagada ${fmtDate(f.paid_at)}` : "Pagada")
                          : f.status === "aceptada"
                            ? fmtDate(f.fecha_pago)
                            : "—"
                        return (
                          <tr key={f.id} style={{ background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.018)", borderBottom: "1px solid rgba(148,163,184,0.07)" }}>
                            <td style={tdStyle}>
                              <span style={{ padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.text }}>{cfg.label}</span>
                              {vencida && <span style={{ marginLeft: 6, padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: "rgba(248,113,113,0.14)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171" }}>Vencida</span>}
                              {f.origen && f.origen !== "proveedor" && <span style={{ marginLeft: 6, fontSize: 11, color: "#93c5fd" }}>{f.origen}</span>}
                            </td>
                            <td style={{ ...tdStyle, color: "#e2e8f0" }}>{proyecto}</td>
                            <td style={{ ...tdStyle, color: "#cbd5e1", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {f.concepto || "—"}
                              {f.status === "rechazada" && f.motivo_rechazo ? ` · ${f.motivo_rechazo}` : ""}
                            </td>
                            <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: "#f8fafc", fontWeight: 700 }}>{f.subtotal != null ? fmt(Number(f.subtotal)) : "—"}</td>
                            <td style={{ ...tdStyle, color: f.status === "pagada" ? "#34d399" : vencida ? "#f87171" : "#94a3b8", whiteSpace: "nowrap", fontWeight: vencida ? 600 : undefined }}>{fecha}</td>
                            <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                              {f.status === "aceptada" && (
                                <button
                                  onClick={() => markFacturaPaid(f)}
                                  disabled={payingId === f.id}
                                  style={{
                                    padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                                    cursor: payingId === f.id ? "not-allowed" : "pointer", opacity: payingId === f.id ? 0.6 : 1,
                                    border: "1px solid rgba(249,115,22,0.4)", background: "rgba(249,115,22,0.14)", color: "#fdba74",
                                  }}
                                >
                                  {payingId === f.id ? "…" : "✓ Marcar Pago"}
                                </button>
                              )}
                              {f.comprobante_path && (
                                <button
                                  onClick={() => downloadComprobante(f.comprobante_path!)}
                                  title="Descargar comprobante de pago"
                                  style={{
                                    marginLeft: 6, padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                                    border: "1px solid rgba(52,211,153,0.35)", background: "rgba(52,211,153,0.10)", color: "#6ee7b7",
                                  }}
                                >
                                  📎
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal: comprobante obligatorio para marcar pagada */}
        {payModalFac && (
          <div
            style={{
              position: "fixed", inset: 0, zIndex: 10000,
              background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            }}
            onClick={() => payingId ? null : setPayModalFac(null)}
          >
            <div
              style={{
                width: "100%", maxWidth: 440,
                background: "#0b0e1c", border: "1px solid rgba(148,163,184,0.18)",
                borderRadius: 14, padding: 22, boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
              }}
              onClick={e => e.stopPropagation()}
            >
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>
                Marcar pago{payModalFac.concepto ? ` — ${payModalFac.concepto}` : ""}
              </p>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#94a3b8" }}>
                Monto: <span style={{ fontFamily: "monospace", color: "#e2e8f0", fontWeight: 700 }}>{fmt(Number(payModalFac.subtotal || 0))}</span>
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
                <button
                  onClick={() => setPayModalFac(null)}
                  disabled={payingId === payModalFac.id}
                  style={{
                    padding: "8px 16px", borderRadius: 8, cursor: "pointer",
                    border: "1px solid rgba(148,163,184,0.2)", background: "transparent",
                    color: "#94a3b8", fontSize: 13, fontWeight: 600,
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmMarkFacturaPaid}
                  disabled={payingId === payModalFac.id || !payFile}
                  style={{
                    padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                    cursor: payingId === payModalFac.id || !payFile ? "not-allowed" : "pointer",
                    opacity: !payFile ? 0.5 : 1,
                    border: "1px solid rgba(52,211,153,0.4)", background: "rgba(52,211,153,0.14)", color: "#34d399",
                  }}
                >
                  {payingId === payModalFac.id ? "Guardando…" : "✓ Confirmar pago"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// ─── SupplierCombobox ─────────────────────────────────────────────────────────

function SupplierCombobox({
  value, onChange, proveedores, employees,
}: {
  value: string
  onChange: (val: string) => void
  proveedores: ProvCatalog[]
  employees: EmpCatalog[]
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen]   = useState(false)
  const ref               = useRef<HTMLDivElement>(null)

  let displayText = ""
  if (value.startsWith("prov:")) {
    const p = proveedores.find(x => x.id === value.slice(5))
    if (p) displayText = p.empresa ? `${p.empresa} — ${p.nombre} ${p.apellido}` : `${p.nombre} ${p.apellido} · ${p.actividad}`
  } else if (value.startsWith("emp:")) {
    const e = employees.find(x => x.id === value.slice(4))
    if (e) {
      const ap = e.apellido_materno ? `${e.apellido_paterno} ${e.apellido_materno}` : e.apellido_paterno
      displayText = `${e.nombre} ${ap} · ${e.puesto}`
    }
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery("") }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const q             = query.toLowerCase()
  const filteredEmps  = employees.filter(e => {
    if (!q) return true
    const ap = e.apellido_materno ? `${e.apellido_paterno} ${e.apellido_materno}` : e.apellido_paterno
    return `${e.nombre} ${ap} ${e.puesto}`.toLowerCase().includes(q)
  })
  const filteredProvs = proveedores.filter(p => {
    if (!q) return true
    return `${p.nombre} ${p.apellido} ${p.empresa ?? ""} ${p.actividad}`.toLowerCase().includes(q)
  })
  const hasResults = filteredEmps.length > 0 || filteredProvs.length > 0

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          type="text"
          value={open ? query : displayText}
          placeholder="Buscar por nombre, empresa…"
          onFocus={() => { setOpen(true); setQuery("") }}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          style={{
            width: "100%", padding: "4px 24px 4px 8px", borderRadius: 6,
            border: "1px solid rgba(167,139,250,0.35)", background: "rgba(167,139,250,0.08)",
            color: open ? "#f8fafc" : (value ? "#e2e8f0" : "#475569"),
            fontSize: 12, outline: "none", boxSizing: "border-box" as const,
          }}
        />
        {value && !open && (
          <button type="button"
            onMouseDown={e => { e.preventDefault(); onChange(""); setQuery("") }}
            style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: 11, padding: "0 2px", lineHeight: 1 }}
          >✕</button>
        )}
        {!value && !open && (
          <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "#475569", fontSize: 10, pointerEvents: "none" as const }}>▾</span>
        )}
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 9999,
          background: "rgba(8,12,24,0.97)", border: "1px solid rgba(148,163,184,0.20)",
          borderRadius: 10, boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
          maxHeight: 260, overflowY: "auto" as const, padding: "4px 0",
        }}>
          {!hasResults && q && (
            <div style={{ padding: 12, color: "#475569", fontSize: 12, textAlign: "center" as const }}>Sin resultados para "{query}"</div>
          )}
          {filteredEmps.length > 0 && (
            <>
              <div style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase" as const, letterSpacing: 0.7 }}>👤 Empleados RETRO</div>
              {filteredEmps.map(e => {
                const ap = e.apellido_materno ? `${e.apellido_paterno} ${e.apellido_materno}` : e.apellido_paterno
                return (
                  <div key={e.id} onMouseDown={() => { onChange(`emp:${e.id}`); setOpen(false); setQuery("") }}
                    style={{ padding: "7px 12px", cursor: "pointer" }}>
                    <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 500 }}>{e.nombre} {ap}</div>
                    <div style={{ color: "#64748b", fontSize: 11 }}>{e.puesto}</div>
                  </div>
                )
              })}
            </>
          )}
          {filteredProvs.length > 0 && (
            <>
              <div style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase" as const, letterSpacing: 0.7, borderTop: "1px solid rgba(148,163,184,0.08)", marginTop: 2 }}>🏢 Proveedores</div>
              {filteredProvs.map(p => {
                const lbl = p.empresa ? `${p.empresa} — ${p.nombre} ${p.apellido}` : `${p.nombre} ${p.apellido}`
                const sub = p.empresa ? `${p.nombre} ${p.apellido} · ${p.actividad}` : p.actividad
                return (
                  <div key={p.id} onMouseDown={() => { onChange(`prov:${p.id}`); setOpen(false); setQuery("") }}
                    style={{ padding: "7px 12px", cursor: "pointer" }}>
                    <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 500 }}>{lbl}</div>
                    <div style={{ color: "#64748b", fontSize: 11 }}>{sub}</div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
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
const pageContainerStyle: React.CSSProperties = { maxWidth: 1200, margin: "0 auto", display: "grid", gap: 18 }

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
  border: "1px solid rgba(251,191,36,0.28)", color: "#f8fafc", fontSize: 22, fontWeight: 700,
}

const eyebrowStyle: React.CSSProperties = { margin: 0, color: "#fbbf24", fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 700 }
const nameTitleStyle: React.CSSProperties = { margin: "4px 0 2px", color: "#f8fafc", fontSize: 24, fontWeight: 700, letterSpacing: -0.4 }
const empresaStyle: React.CSSProperties = { margin: "0 0 6px", color: "#94a3b8", fontSize: 14 }

const activityBadgeStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 999,
  fontSize: 11, fontWeight: 600, background: "rgba(245,158,11,0.14)", border: "1px solid rgba(251,191,36,0.24)", color: "#fde68a",
}

const editLinkStyle: React.CSSProperties = {
  marginLeft: "auto", alignSelf: "flex-start", padding: "6px 12px", borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.16)", background: "rgba(255,255,255,0.04)",
  color: "#94a3b8", textDecoration: "none", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap",
}

const infoGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }

const infoCardStyle: React.CSSProperties = {
  display: "flex", alignItems: "flex-start", gap: 10,
  padding: "12px 16px", borderRadius: 12,
  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(148,163,184,0.10)",
}

const summaryRowStyle: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap" }

const sectionStyle: React.CSSProperties = {
  background: "rgba(15,23,42,0.72)", border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 16, padding: "16px 18px", backdropFilter: "blur(16px)",
}

const sectionHeaderStyle: React.CSSProperties = { marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid rgba(148,163,184,0.10)" }
const sectionTitleStyle: React.CSSProperties  = { margin: 0, color: "#f8fafc", fontSize: 14, fontWeight: 700 }
const sectionHintStyle: React.CSSProperties   = { margin: "4px 0 0", color: "#64748b", fontSize: 12 }

const projectHeaderStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "10px 14px", borderRadius: "10px 10px 0 0",
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(148,163,184,0.12)", borderBottom: "none",
  flexWrap: "wrap", gap: 8,
}

const projectNameLinkStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#e2e8f0", textDecoration: "none" }
const clientNameStyle: React.CSSProperties       = { fontSize: 12, color: "#64748b" }
const projectTotalStyle: React.CSSProperties     = { fontSize: 14, fontWeight: 700, color: "#f87171", fontFamily: "monospace" }

const tableWrapStyle: React.CSSProperties = { overflowX: "auto", borderRadius: "0 0 10px 10px", border: "1px solid rgba(148,163,184,0.10)" }
const tableStyle: React.CSSProperties     = { width: "100%", borderCollapse: "collapse", fontSize: 13, color: "#cbd5e1" }

const thStyle: React.CSSProperties = {
  padding: "9px 12px", fontSize: 11, fontWeight: 700, color: "#475569",
  textTransform: "uppercase", letterSpacing: 0.6,
  borderBottom: "1px solid rgba(148,163,184,0.12)", background: "rgba(255,255,255,0.025)", whiteSpace: "nowrap",
}

const tdStyle: React.CSSProperties = { padding: "9px 12px", fontSize: 13, color: "#cbd5e1", verticalAlign: "middle" }
const quoteLinkStyle: React.CSSProperties = { color: "#a78bfa", textDecoration: "none", fontSize: 12, fontWeight: 600 }

const emptyStateStyle: React.CSSProperties = {
  padding: "36px 24px", textAlign: "center", borderRadius: 12,
  background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(148,163,184,0.14)",
}

const editInputStyle: React.CSSProperties = {
  width: 64, padding: "4px 6px", borderRadius: 6,
  border: "1px solid rgba(167,139,250,0.35)", background: "rgba(167,139,250,0.08)",
  color: "#f8fafc", fontSize: 12, outline: "none", textAlign: "right" as const,
}

const saveBtnStyle: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 6, border: "none",
  background: "rgba(52,211,153,0.18)", color: "#34d399",
  cursor: "pointer", fontSize: 13, fontWeight: 700, marginRight: 4,
}

const cancelBtnStyle: React.CSSProperties = {
  padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(148,163,184,0.18)",
  background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 12,
}

const editBtnStyle: React.CSSProperties = {
  padding: "3px 10px", borderRadius: 6, border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(255,255,255,0.04)", color: "#94a3b8", cursor: "pointer", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
}

const currentProvBadge: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 999,
  fontSize: 11, fontWeight: 600, color: "#fbbf24",
  background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.22)",
  whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis",
}

const otherProvBadge: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 999,
  fontSize: 11, fontWeight: 600, color: "#34d399",
  background: "rgba(52,211,153,0.10)", border: "1px solid rgba(52,211,153,0.22)",
  whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis",
}
