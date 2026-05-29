"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { supabase } from "../../../../../lib/supabase"
import { requireSessionProfile } from "../../../../../lib/session-profile"
import { AppSidebar } from "../../../../../components/AppSidebar"

type Proveedor = {
  id: string
  nombre: string
  apellido: string
  empresa: string | null
  actividad: string
}

type QuoteItemRow = {
  id: string
  section_id: string
  description: string
  qty: number
  days: number
  unit_price: number
  released_expense: number
  real_expense: number
  supplier: string | null
  order_index: number
  actual_qty: number | null
  actual_days: number | null
  actual_unit_price: number | null
  actual_supplier_id: string | null
}

type QuoteSection = {
  id: string
  quote_id: string
  name: string
  order_index: number
  items: QuoteItemRow[]
}

type Quote = {
  id: string
  project_id: string
  name: string
  status: string
  markup_percentage: number
  atencion: string | null
  released: boolean | null
}

type ItemActual = {
  qty: string
  days: string
  unit_price: string
  supplier_id: string
}

function fmt(n: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(n)
}

// Raw amount for an item (qty × days × unit_price)
function itemAmount(item: QuoteItemRow): number {
  return item.qty * item.days * item.unit_price
}

// Actual raw amount: use filled-in values; fall back to liberado
function itemActualAmount(item: QuoteItemRow, actual: ItemActual): number {
  const q = actual.qty !== "" ? parseFloat(actual.qty) : item.qty
  const d = actual.days !== "" ? parseFloat(actual.days) : item.days
  const p = actual.unit_price !== "" ? parseFloat(actual.unit_price) : item.unit_price
  if (isNaN(q) || isNaN(d) || isNaN(p)) return itemAmount(item)
  return q * d * p
}

// Liberado financials per item — mirrors calcItem() in cotizaciones/page.tsx
// real_expense === 1 → item is internal: gasto=0, all amount goes to utilidad
// released_expense → per-item markup %
function libItemFinancials(item: QuoteItemRow): { gasto: number; utilidad: number; venta: number } {
  const amount = itemAmount(item)
  if (item.real_expense === 1) {
    return { gasto: 0, utilidad: amount, venta: amount }
  }
  const u = amount * ((item.released_expense || 0) / 100)
  return { gasto: amount, utilidad: u, venta: amount + u }
}

// Real financials per item: same markup rate, but on actual amounts
// The venta to the client is FIXED (lib_venta); real_utilidad = lib_venta - real_gasto
function realItemGasto(item: QuoteItemRow, actual: ItemActual): number {
  // Internal items have gasto=0 regardless
  if (item.real_expense === 1) return 0
  return itemActualAmount(item, actual)
}

// Convenience: lib display total per item row (what appears in the "Total Lib." column)
function libTotal(item: QuoteItemRow): number {
  return libItemFinancials(item).venta
}

// Real display total per item row (what appears in the "Total Real" column)
function realTotal(item: QuoteItemRow, actual: ItemActual): number {
  if (item.real_expense === 1) return itemAmount(item) // internal stays fixed
  const actualAmt = itemActualAmount(item, actual)
  const u = actualAmt * ((item.released_expense || 0) / 100)
  return actualAmt + u
}

function proveedorLabel(p: Proveedor): string {
  if (p.empresa) return `${p.empresa} — ${p.nombre} ${p.apellido}`
  return `${p.nombre} ${p.apellido} · ${p.actividad}`
}

export default function LiberarPage() {
  const params = useParams()
  const projectId = String(params.projectId || "")
  const quoteId = String(params.quoteId || "")

  const [profile, setProfile] = useState<any>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const [quote, setQuote] = useState<Quote | null>(null)
  const [sections, setSections] = useState<QuoteSection[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [actuals, setActuals] = useState<Record<string, ItemActual>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [projectName, setProjectName] = useState("")
  const [clientName, setClientName] = useState("")

  // ── Add-proveedor modal ──────────────────────────────────────────────────
  const [showAddProv, setShowAddProv] = useState(false)
  const [addProvForItem, setAddProvForItem] = useState<string | null>(null)
  const [newProv, setNewProv] = useState({
    nombre: "", apellido: "", empresa: "", actividad: "", email: "", telefono: "",
  })
  const [savingProv, setSavingProv] = useState(false)

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => {
    async function load() {
      const auth = await requireSessionProfile()
      if (!auth) return
      if (auth.profile.role !== "admin") {
        window.location.href = "/"
        return
      }
      setProfile(auth.profile)

      const { data: quoteData, error: quoteErr } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", quoteId)
        .single()

      if (quoteErr || !quoteData) {
        alert("Cotización no encontrada")
        window.location.href = `/proyectos/${projectId}`
        return
      }
      setQuote(quoteData)

      const { data: project } = await supabase
        .from("projects")
        .select("name, client_id")
        .eq("id", projectId)
        .single()

      if (project) {
        setProjectName(project.name)
        const { data: client } = await supabase
          .from("clients")
          .select("name")
          .eq("id", project.client_id)
          .single()
        setClientName(client?.name || "")
      }

      const { data: sectionsData } = await supabase
        .from("quote_sections")
        .select("*")
        .eq("quote_id", quoteId)
        .order("order_index")

      const loadedSections: QuoteSection[] = []
      const initialActuals: Record<string, ItemActual> = {}

      for (const sec of sectionsData || []) {
        const { data: itemsData } = await supabase
          .from("quote_items")
          .select("*")
          .eq("section_id", sec.id)
          .order("order_index")

        const items = (itemsData || []) as QuoteItemRow[]
        for (const item of items) {
          initialActuals[item.id] = {
            qty: item.actual_qty != null ? String(item.actual_qty) : "",
            days: item.actual_days != null ? String(item.actual_days) : "",
            unit_price:
              item.actual_unit_price != null
                ? String(item.actual_unit_price)
                : "",
            supplier_id: item.actual_supplier_id || "",
          }
        }
        loadedSections.push({ ...sec, items })
      }

      setSections(loadedSections)
      setActuals(initialActuals)

      const { data: provsData } = await supabase
        .from("proveedores")
        .select("id, nombre, apellido, empresa, actividad")
        .order("nombre")
      setProveedores(provsData || [])

      setLoading(false)
    }
    load()
  }, [projectId, quoteId])

  function updateActual(
    itemId: string,
    field: keyof ItemActual,
    value: string
  ) {
    setSaved(false)
    setActuals((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }))
  }

  // Intercepts the sentinel "__NEW__" value from the supplier select
  function handleSelectProveedor(itemId: string, value: string) {
    if (value === "__NEW__") {
      setAddProvForItem(itemId)
      setNewProv({ nombre: "", apellido: "", empresa: "", actividad: "", email: "", telefono: "" })
      setShowAddProv(true)
    } else {
      updateActual(itemId, "supplier_id", value)
    }
  }

  async function handleSaveNewProv() {
    if (!newProv.nombre.trim() || !newProv.apellido.trim() || !newProv.actividad.trim()) {
      alert("Nombre, apellido y actividad son requeridos")
      return
    }
    setSavingProv(true)
    try {
      const { data, error } = await supabase
        .from("proveedores")
        .insert({
          nombre: newProv.nombre.trim(),
          apellido: newProv.apellido.trim(),
          empresa: newProv.empresa.trim() || null,
          actividad: newProv.actividad.trim(),
          email: newProv.email.trim() || null,
          telefono: newProv.telefono.trim() || null,
        })
        .select("id, nombre, apellido, empresa, actividad")
        .single()
      if (error) throw error
      // Add to local list (sorted)
      setProveedores((prev) =>
        [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre))
      )
      // Auto-select for the triggering item
      if (addProvForItem) updateActual(addProvForItem, "supplier_id", data.id)
      setShowAddProv(false)
      setAddProvForItem(null)
    } catch (err: any) {
      alert("Error al guardar proveedor: " + err.message)
    } finally {
      setSavingProv(false)
    }
  }

  const totals = useMemo(() => {
    // Sum per-item financials using the same logic as the cotizaciones form
    let libGasto = 0
    let libUtilidad = 0
    let libVenta = 0
    let realGasto = 0

    for (const sec of sections) {
      for (const item of sec.items) {
        const a = actuals[item.id] || { qty: "", days: "", unit_price: "", supplier_id: "" }
        const lf = libItemFinancials(item)
        libGasto += lf.gasto
        libUtilidad += lf.utilidad
        libVenta += lf.venta
        realGasto += realItemGasto(item, a)
      }
    }

    // Sale price to client is fixed at lib_venta; real utility = fixed_venta - real_gasto
    const realUtilidad = libVenta - realGasto
    const libPct = libVenta > 0 ? (libUtilidad / libVenta) * 100 : 0
    const realPct = libVenta > 0 ? (realUtilidad / libVenta) * 100 : 0

    return { libGasto, libUtilidad, libVenta, realGasto, realUtilidad, libPct, realPct }
  }, [sections, actuals])

  async function handleSave() {
    setSaving(true)
    try {
      for (const sec of sections) {
        for (const item of sec.items) {
          const a = actuals[item.id]
          if (!a) continue

          const actual_qty = a.qty !== "" ? parseFloat(a.qty) : null
          const actual_days = a.days !== "" ? parseFloat(a.days) : null
          const actual_unit_price =
            a.unit_price !== "" ? parseFloat(a.unit_price) : null
          const actual_supplier_id = a.supplier_id || null

          const { error } = await supabase
            .from("quote_items")
            .update({ actual_qty, actual_days, actual_unit_price, actual_supplier_id })
            .eq("id", item.id)

          if (error) throw error
        }
      }

      await supabase
        .from("quotes")
        .update({ released: true })
        .eq("id", quoteId)

      setSaved(true)
    } catch (err: any) {
      alert("Error al guardar: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  function logout() {
    supabase.auth.signOut().then(() => {
      window.location.href = "/login"
    })
  }

  const isAdmin = profile?.role === "admin"

  if (loading) {
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
        <main
          style={{
            ...mainStyle,
            padding: isMobile ? "76px 14px 24px" : "28px 32px",
          }}
        >
          <p style={{ color: "#64748b", fontSize: 14 }}>Cargando...</p>
        </main>
      </div>
    )
  }

  // Desktop grid: description | qty_lib | days_lib | pu_lib | total_lib | qty_real | days_real | pu_real | total_real | proveedor
  const GRID =
    "1.8fr 52px 52px 88px 88px 52px 52px 88px 88px 1fr"

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

      <main
        style={{
          ...mainStyle,
          padding: isMobile ? "76px 14px 64px" : "28px 32px 80px",
        }}
      >
        <div style={pageContainerStyle}>
          {/* Back link */}
          <Link href={`/proyectos/${projectId}`} style={backBtnStyle}>
            ← Volver al proyecto
          </Link>

          {/* Page header */}
          <div style={pageHeaderStyle}>
            <div>
              <p style={eyebrowStyle}>Liberación de presupuesto</p>
              <h1 style={pageTitleStyle}>{quote?.name}</h1>
              <p style={pageSubtitleStyle}>
                {clientName} · {projectName}
                {quote?.released && (
                  <span style={releasedBadgeStyle}>Liberado</span>
                )}
              </p>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              style={saved ? saveBtnSavedStyle : saveBtnStyle}
            >
              {saving ? "Guardando..." : saved ? "✓ Guardado" : "Guardar"}
            </button>
          </div>

          {/* Legend */}
          <div style={legendStyle}>
            <span style={legendItemStyle("#a78bfa", "rgba(167,139,250,0.12)")}>
              ■ Liberado
            </span>
            <span style={legendItemStyle("#34d399", "rgba(52,211,153,0.10)")}>
              ■ Real
            </span>
            <p style={{ margin: 0, color: "#475569", fontSize: 11 }}>
              Deja vacío un campo Real para usar el valor liberado
            </p>
          </div>

          {/* Sections */}
          {sections.map((sec) => {
            const secLib = sec.items.reduce((s, i) => s + libTotal(i), 0)
            const secReal = sec.items.reduce(
              (s, i) =>
                s +
                realTotal(
                  i,
                  actuals[i.id] || {
                    qty: "",
                    days: "",
                    unit_price: "",
                    supplier_id: "",
                  }
                ),
              0
            )
            const secDiff = secReal - secLib

            return (
              <div key={sec.id} style={sectionCardStyle}>
                {/* Section header */}
                <div style={sectionHeaderStyle}>
                  <p style={sectionTitleStyle}>{sec.name}</p>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ color: "#a78bfa", fontSize: 12, fontWeight: 600 }}>
                      Lib: {fmt(secLib)}
                    </span>
                    <span
                      style={{
                        color:
                          secDiff > 0
                            ? "#f87171"
                            : secDiff < 0
                              ? "#34d399"
                              : "#94a3b8",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      Real: {fmt(secReal)}
                      {secDiff !== 0 && (
                        <span style={{ fontSize: 11, marginLeft: 4 }}>
                          {secDiff > 0 ? `(+${fmt(secDiff)})` : `(${fmt(secDiff)})`}
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Column group headers (desktop) */}
                {!isMobile && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: GRID,
                      gap: 6,
                      padding: "6px 4px 0",
                    }}
                  >
                    <span />
                    <span
                      style={{
                        gridColumn: "2 / 6",
                        color: "#a78bfa",
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                        borderBottom: "2px solid rgba(167,139,250,0.3)",
                        paddingBottom: 4,
                      }}
                    >
                      Liberado
                    </span>
                    <span
                      style={{
                        gridColumn: "6 / 10",
                        color: "#34d399",
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                        borderBottom: "2px solid rgba(52,211,153,0.3)",
                        paddingBottom: 4,
                      }}
                    >
                      Real
                    </span>
                    <span />
                  </div>
                )}

                {/* Column field headers (desktop) */}
                {!isMobile && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: GRID,
                      gap: 6,
                      padding: "0 4px 6px",
                      color: "#475569",
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: 0.6,
                    }}
                  >
                    <span>Descripción</span>
                    <span style={{ textAlign: "right" }}>Cant.</span>
                    <span style={{ textAlign: "right" }}>Días</span>
                    <span style={{ textAlign: "right" }}>P.U.</span>
                    <span style={{ textAlign: "right" }}>Total</span>
                    <span style={{ textAlign: "right" }}>Cant.</span>
                    <span style={{ textAlign: "right" }}>Días</span>
                    <span style={{ textAlign: "right" }}>P.U.</span>
                    <span style={{ textAlign: "right" }}>Total</span>
                    <span>Proveedor</span>
                  </div>
                )}

                {/* Items */}
                <div style={{ display: "grid", gap: 6 }}>
                  {sec.items.map((item) => {
                    const a = actuals[item.id] || {
                      qty: "",
                      days: "",
                      unit_price: "",
                      supplier_id: "",
                    }
                    const libTot = libTotal(item)
                    const realTot = realTotal(item, a)
                    const itemDiff = realTot - libTot

                    if (isMobile) {
                      return (
                        <div key={item.id} style={itemRowStyle}>
                          <p
                            style={{
                              margin: "0 0 10px",
                              color: "#f8fafc",
                              fontSize: 13,
                              fontWeight: 600,
                            }}
                          >
                            {item.description || "—"}
                          </p>

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: 12,
                            }}
                          >
                            {/* Liberado */}
                            <div
                              style={{
                                ...mobileGroupStyle,
                                borderColor: "rgba(167,139,250,0.2)",
                                background: "rgba(167,139,250,0.04)",
                              }}
                            >
                              <p style={{ ...mobileGroupTitle, color: "#a78bfa" }}>
                                Liberado
                              </p>
                              <p style={mobileDetailStyle}>
                                {item.qty} × {item.days} días
                              </p>
                              <p style={mobileDetailStyle}>P.U. {fmt(item.unit_price)}</p>
                              <p
                                style={{
                                  margin: "4px 0 0",
                                  color: "#a78bfa",
                                  fontSize: 14,
                                  fontWeight: 700,
                                }}
                              >
                                {fmt(libTot)}
                              </p>
                            </div>

                            {/* Real */}
                            <div
                              style={{
                                ...mobileGroupStyle,
                                borderColor: "rgba(52,211,153,0.2)",
                                background: "rgba(52,211,153,0.04)",
                              }}
                            >
                              <p style={{ ...mobileGroupTitle, color: "#34d399" }}>
                                Real
                              </p>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1fr",
                                  gap: 4,
                                  marginBottom: 4,
                                }}
                              >
                                <div>
                                  <p style={inputLabelStyle}>Cant.</p>
                                  <input
                                    type="number"
                                    value={a.qty}
                                    placeholder={String(item.qty)}
                                    onChange={(e) =>
                                      updateActual(item.id, "qty", e.target.value)
                                    }
                                    style={inputStyle}
                                  />
                                </div>
                                <div>
                                  <p style={inputLabelStyle}>Días</p>
                                  <input
                                    type="number"
                                    value={a.days}
                                    placeholder={String(item.days)}
                                    onChange={(e) =>
                                      updateActual(item.id, "days", e.target.value)
                                    }
                                    style={inputStyle}
                                  />
                                </div>
                              </div>
                              <p style={inputLabelStyle}>P.U.</p>
                              <input
                                type="number"
                                value={a.unit_price}
                                placeholder={String(item.unit_price)}
                                onChange={(e) =>
                                  updateActual(
                                    item.id,
                                    "unit_price",
                                    e.target.value
                                  )
                                }
                                style={{ ...inputStyle, width: "100%" }}
                              />
                              <p
                                style={{
                                  margin: "6px 0 0",
                                  fontSize: 14,
                                  fontWeight: 700,
                                  color:
                                    itemDiff > 0
                                      ? "#f87171"
                                      : itemDiff < 0
                                        ? "#34d399"
                                        : "#94a3b8",
                                }}
                              >
                                {fmt(realTot)}
                              </p>
                            </div>
                          </div>

                          {/* Proveedor mobile */}
                          <div style={{ marginTop: 10 }}>
                            <p style={inputLabelStyle}>Proveedor</p>
                            <select
                              value={a.supplier_id}
                              onChange={(e) => handleSelectProveedor(item.id, e.target.value)}
                              style={selectStyle}
                            >
                              <option value="">Sin proveedor</option>
                              {proveedores.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {proveedorLabel(p)}
                                </option>
                              ))}
                              <option value="__NEW__">＋ Agregar nuevo proveedor...</option>
                            </select>
                          </div>
                        </div>
                      )
                    }

                    // Desktop row
                    return (
                      <div
                        key={item.id}
                        style={{
                          ...itemRowStyle,
                          display: "grid",
                          gridTemplateColumns: GRID,
                          gap: 6,
                          alignItems: "center",
                        }}
                      >
                        {/* Description */}
                        <span
                          style={{
                            color: "#e2e8f0",
                            fontSize: 13,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={item.description}
                        >
                          {item.description || "—"}
                        </span>

                        {/* Liberado cells */}
                        <span style={libCellStyle}>{item.qty}</span>
                        <span style={libCellStyle}>{item.days}</span>
                        <span style={libCellStyle}>{fmt(item.unit_price)}</span>
                        <span
                          style={{
                            ...libCellStyle,
                            color: "#a78bfa",
                            fontWeight: 600,
                          }}
                        >
                          {fmt(libTot)}
                        </span>

                        {/* Real inputs */}
                        <input
                          type="number"
                          value={a.qty}
                          placeholder={String(item.qty)}
                          onChange={(e) =>
                            updateActual(item.id, "qty", e.target.value)
                          }
                          style={inputStyle}
                        />
                        <input
                          type="number"
                          value={a.days}
                          placeholder={String(item.days)}
                          onChange={(e) =>
                            updateActual(item.id, "days", e.target.value)
                          }
                          style={inputStyle}
                        />
                        <input
                          type="number"
                          value={a.unit_price}
                          placeholder={String(item.unit_price)}
                          onChange={(e) =>
                            updateActual(item.id, "unit_price", e.target.value)
                          }
                          style={inputStyle}
                        />
                        <span
                          style={{
                            ...libCellStyle,
                            color:
                              itemDiff > 0
                                ? "#f87171"
                                : itemDiff < 0
                                  ? "#34d399"
                                  : "#94a3b8",
                            fontWeight: 600,
                          }}
                        >
                          {fmt(realTot)}
                        </span>

                        {/* Proveedor select */}
                        <select
                          value={a.supplier_id}
                          onChange={(e) => handleSelectProveedor(item.id, e.target.value)}
                          style={selectStyle}
                        >
                          <option value="">—</option>
                          {proveedores.map((p) => (
                            <option key={p.id} value={p.id}>
                              {proveedorLabel(p)}
                            </option>
                          ))}
                          <option value="__NEW__">＋ Agregar nuevo proveedor...</option>
                        </select>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Comparison panel */}
          <div style={comparisonPanelStyle}>
            <p style={comparisonTitleStyle}>Comparativo de utilidad</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: 12,
              }}
            >
              {/* Proyectado */}
              <div style={comparisonColStyle("rgba(167,139,250,0.06)", "rgba(167,139,250,0.18)")}>
                <p style={{ ...comparisonColTitleStyle, color: "#a78bfa" }}>
                  Proyectado — Liberado
                </p>
                <div style={comparisonRowStyle}>
                  <span style={comparisonLabelStyle}>Gasto liberado</span>
                  <span style={comparisonValueStyle}>{fmt(totals.libGasto)}</span>
                </div>
                <div style={comparisonRowStyle}>
                  <span style={comparisonLabelStyle}>Venta al cliente</span>
                  <span style={comparisonValueStyle}>{fmt(totals.libVenta)}</span>
                </div>
                <div
                  style={{
                    ...comparisonRowStyle,
                    borderTop: "1px solid rgba(148,163,184,0.12)",
                    paddingTop: 10,
                    marginTop: 4,
                  }}
                >
                  <span style={{ ...comparisonLabelStyle, color: "#e2e8f0", fontWeight: 600 }}>
                    Utilidad
                  </span>
                  <span
                    style={{
                      ...comparisonValueStyle,
                      color: "#a78bfa",
                      fontSize: 18,
                      fontWeight: 700,
                    }}
                  >
                    {fmt(totals.libUtilidad)}
                  </span>
                </div>
                <div style={comparisonRowStyle}>
                  <span style={comparisonLabelStyle}>% sobre venta</span>
                  <span style={{ ...comparisonValueStyle, color: "#a78bfa", fontWeight: 600 }}>
                    {totals.libPct.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Real */}
              <div
                style={comparisonColStyle(
                  totals.realUtilidad >= totals.libUtilidad
                    ? "rgba(52,211,153,0.06)"
                    : totals.realUtilidad > 0
                      ? "rgba(251,191,36,0.06)"
                      : "rgba(248,113,113,0.06)",
                  totals.realUtilidad >= totals.libUtilidad
                    ? "rgba(52,211,153,0.18)"
                    : totals.realUtilidad > 0
                      ? "rgba(251,191,36,0.20)"
                      : "rgba(248,113,113,0.20)"
                )}
              >
                <p
                  style={{
                    ...comparisonColTitleStyle,
                    color:
                      totals.realUtilidad >= totals.libUtilidad
                        ? "#34d399"
                        : totals.realUtilidad > 0
                          ? "#fbbf24"
                          : "#f87171",
                  }}
                >
                  Real — Gasto actual
                </p>
                <div style={comparisonRowStyle}>
                  <span style={comparisonLabelStyle}>Gasto real</span>
                  <span
                    style={{
                      ...comparisonValueStyle,
                      color:
                        totals.realGasto > totals.libGasto
                          ? "#f87171"
                          : totals.realGasto < totals.libGasto
                            ? "#34d399"
                            : "#94a3b8",
                    }}
                  >
                    {fmt(totals.realGasto)}
                  </span>
                </div>
                <div style={comparisonRowStyle}>
                  <span style={comparisonLabelStyle}>Venta al cliente</span>
                  <span style={comparisonValueStyle}>{fmt(totals.libVenta)}</span>
                </div>
                <div
                  style={{
                    ...comparisonRowStyle,
                    borderTop: "1px solid rgba(148,163,184,0.12)",
                    paddingTop: 10,
                    marginTop: 4,
                  }}
                >
                  <span style={{ ...comparisonLabelStyle, color: "#e2e8f0", fontWeight: 600 }}>
                    Utilidad real
                  </span>
                  <span
                    style={{
                      ...comparisonValueStyle,
                      fontSize: 18,
                      fontWeight: 700,
                      color:
                        totals.realUtilidad >= totals.libUtilidad
                          ? "#34d399"
                          : totals.realUtilidad > 0
                            ? "#fbbf24"
                            : "#f87171",
                    }}
                  >
                    {fmt(totals.realUtilidad)}
                  </span>
                </div>
                <div style={comparisonRowStyle}>
                  <span style={comparisonLabelStyle}>% sobre venta</span>
                  <span
                    style={{
                      ...comparisonValueStyle,
                      fontWeight: 600,
                      color:
                        totals.realPct >= totals.libPct
                          ? "#34d399"
                          : totals.realPct > 0
                            ? "#fbbf24"
                            : "#f87171",
                    }}
                  >
                    {totals.realPct.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom save button */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 20,
            }}
          >
            <button
              onClick={handleSave}
              disabled={saving}
              style={saved ? saveBtnSavedStyle : saveBtnStyle}
            >
              {saving ? "Guardando..." : saved ? "✓ Guardado" : "Guardar"}
            </button>
          </div>
        </div>
      </main>

      {/* ── Agregar nuevo proveedor modal ───────────────────────────────── */}
      {showAddProv && (
        <div
          className="modal-overlay"
          style={addProvOverlayStyle}
          onClick={() => setShowAddProv(false)}
        >
          <div
            className="modal-panel"
            style={addProvPanelStyle}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={addProvHeaderStyle}>
              <div>
                <p style={{ margin: 0, color: "#a78bfa", fontSize: 10, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 700 }}>
                  Proveedores
                </p>
                <h2 style={{ margin: "4px 0 0", color: "#f8fafc", fontSize: 18, fontWeight: 700, letterSpacing: -0.3 }}>
                  Nuevo proveedor
                </h2>
              </div>
              <button
                onClick={() => setShowAddProv(false)}
                style={addProvCloseStyle}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <div style={addProvBodyStyle}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={addProvLabelStyle}>Nombre *</label>
                  <input
                    type="text"
                    value={newProv.nombre}
                    onChange={(e) => setNewProv((p) => ({ ...p, nombre: e.target.value }))}
                    style={addProvInputStyle}
                    placeholder="Nombre"
                    autoFocus
                  />
                </div>
                <div>
                  <label style={addProvLabelStyle}>Apellido *</label>
                  <input
                    type="text"
                    value={newProv.apellido}
                    onChange={(e) => setNewProv((p) => ({ ...p, apellido: e.target.value }))}
                    style={addProvInputStyle}
                    placeholder="Apellido"
                  />
                </div>
                <div style={{ gridColumn: isMobile ? "auto" : "1 / -1" }}>
                  <label style={addProvLabelStyle}>Empresa</label>
                  <input
                    type="text"
                    value={newProv.empresa}
                    onChange={(e) => setNewProv((p) => ({ ...p, empresa: e.target.value }))}
                    style={addProvInputStyle}
                    placeholder="Nombre de la empresa (opcional)"
                  />
                </div>
                <div style={{ gridColumn: isMobile ? "auto" : "1 / -1" }}>
                  <label style={addProvLabelStyle}>Actividad *</label>
                  <input
                    type="text"
                    value={newProv.actividad}
                    onChange={(e) => setNewProv((p) => ({ ...p, actividad: e.target.value }))}
                    style={addProvInputStyle}
                    placeholder="Ej. Director de fotografía, Gaffer..."
                  />
                </div>
                <div>
                  <label style={addProvLabelStyle}>Email</label>
                  <input
                    type="email"
                    value={newProv.email}
                    onChange={(e) => setNewProv((p) => ({ ...p, email: e.target.value }))}
                    style={addProvInputStyle}
                    placeholder="email@ejemplo.com"
                  />
                </div>
                <div>
                  <label style={addProvLabelStyle}>Teléfono</label>
                  <input
                    type="tel"
                    value={newProv.telefono}
                    onChange={(e) => setNewProv((p) => ({ ...p, telefono: e.target.value }))}
                    style={addProvInputStyle}
                    placeholder="+52 55 0000 0000"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={addProvFooterStyle}>
              <button onClick={() => setShowAddProv(false)} style={addProvCancelStyle}>
                Cancelar
              </button>
              <button
                onClick={handleSaveNewProv}
                disabled={savingProv}
                style={addProvSaveStyle}
              >
                {savingProv ? "Guardando..." : "Agregar proveedor"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const appShellStyle: React.CSSProperties = {
  display: "flex",
  minHeight: "100vh",
}

const mainStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
}

const pageContainerStyle: React.CSSProperties = {
  maxWidth: 1200,
  margin: "0 auto",
  display: "grid",
  gap: 16,
}

const backBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(255,255,255,0.04)",
  color: "#cbd5e1",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 500,
}

const pageHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
}

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: "#fbbf24",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 1.2,
  fontWeight: 700,
}

const pageTitleStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#f8fafc",
  fontSize: 26,
  fontWeight: 700,
  letterSpacing: -0.5,
  lineHeight: 1.2,
}

const pageSubtitleStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#64748b",
  fontSize: 13,
  display: "flex",
  alignItems: "center",
  gap: 8,
}

const releasedBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: 999,
  background: "rgba(251,191,36,0.12)",
  border: "1px solid rgba(251,191,36,0.25)",
  color: "#fbbf24",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.6,
}

const saveBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "9px 20px",
  borderRadius: 9,
  border: "none",
  background: "linear-gradient(135deg, #7c3aed, #6366f1)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
  boxShadow: "0 8px 24px rgba(124,58,237,0.25)",
  flexShrink: 0,
}

const saveBtnSavedStyle: React.CSSProperties = {
  ...saveBtnStyle,
  background: "linear-gradient(135deg, #059669, #34d399)",
  boxShadow: "0 8px 24px rgba(52,211,153,0.20)",
}

const legendStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap",
  padding: "8px 14px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.10)",
  background: "rgba(255,255,255,0.02)",
}

function legendItemStyle(color: string, bg: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 8px",
    borderRadius: 6,
    background: bg,
    color,
    fontSize: 11,
    fontWeight: 600,
  }
}

const sectionCardStyle: React.CSSProperties = {
  background: "rgba(15,23,42,0.72)",
  border: "1px solid rgba(148,163,184,0.12)",
  borderRadius: 14,
  padding: "14px 16px",
  backdropFilter: "blur(12px)",
  display: "grid",
  gap: 6,
}

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  paddingBottom: 10,
  borderBottom: "1px solid rgba(148,163,184,0.10)",
  flexWrap: "wrap",
}

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 700,
}


const itemRowStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 9,
  background: "rgba(255,255,255,0.025)",
}

const libCellStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  textAlign: "right",
  whiteSpace: "nowrap",
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "5px 7px",
  borderRadius: 6,
  border: "1px solid rgba(52,211,153,0.25)",
  background: "rgba(52,211,153,0.06)",
  color: "#f8fafc",
  fontSize: 12,
  outline: "none",
  textAlign: "right",
  boxSizing: "border-box",
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "5px 7px",
  borderRadius: 6,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(2,6,23,0.55)",
  color: "#e2e8f0",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
}

const inputLabelStyle: React.CSSProperties = {
  margin: "0 0 3px",
  color: "#64748b",
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.5,
}

const mobileGroupStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid transparent",
}

const mobileGroupTitle: React.CSSProperties = {
  margin: "0 0 6px",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.8,
}

const mobileDetailStyle: React.CSSProperties = {
  margin: 0,
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.5,
}

const comparisonPanelStyle: React.CSSProperties = {
  padding: "18px 20px",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.14)",
  background: "rgba(15,23,42,0.72)",
  backdropFilter: "blur(12px)",
}

const comparisonTitleStyle: React.CSSProperties = {
  margin: "0 0 14px",
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: -0.2,
}

function comparisonColStyle(bg: string, borderColor: string): React.CSSProperties {
  return {
    padding: "14px 16px",
    borderRadius: 12,
    background: bg,
    border: `1px solid ${borderColor}`,
    display: "grid",
    gap: 10,
  }
}

const comparisonColTitleStyle: React.CSSProperties = {
  margin: "0 0 6px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.8,
}

const comparisonRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
}

const comparisonLabelStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 13,
}

const comparisonValueStyle: React.CSSProperties = {
  color: "#e2e8f0",
  fontSize: 13,
  fontWeight: 600,
}

// ─── Add-proveedor modal styles ───────────────────────────────────────────────

const addProvOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  backdropFilter: "blur(4px)",
  zIndex: 20000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px 16px",
}

const addProvPanelStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 520,
  background: "linear-gradient(180deg, rgba(10,14,26,0.99) 0%, rgba(6,9,18,0.99) 100%)",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 18,
  boxShadow: "0 40px 120px rgba(0,0,0,0.65)",
  overflow: "hidden",
}

const addProvHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  padding: "20px 24px",
  borderBottom: "1px solid rgba(148,163,184,0.10)",
}

const addProvCloseStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(255,255,255,0.04)",
  color: "#94a3b8",
  cursor: "pointer",
  fontSize: 13,
  flexShrink: 0,
}

const addProvBodyStyle: React.CSSProperties = {
  padding: "20px 24px",
}

const addProvLabelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 5,
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.6,
}

const addProvInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.20)",
  background: "rgba(255,255,255,0.04)",
  color: "#f8fafc",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
}

const addProvFooterStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  padding: "16px 24px",
  borderTop: "1px solid rgba(148,163,184,0.10)",
}

const addProvCancelStyle: React.CSSProperties = {
  padding: "9px 16px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.20)",
  background: "transparent",
  color: "#64748b",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
}

const addProvSaveStyle: React.CSSProperties = {
  padding: "9px 20px",
  borderRadius: 8,
  border: "none",
  background: "linear-gradient(135deg, #7c3aed, #6366f1)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  boxShadow: "0 6px 20px rgba(124,58,237,0.25)",
}
