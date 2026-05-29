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

function libTotal(item: QuoteItemRow): number {
  return item.qty * item.days * item.unit_price
}

function realTotal(item: QuoteItemRow, actual: ItemActual): number {
  const q = actual.qty !== "" ? parseFloat(actual.qty) : item.qty
  const d = actual.days !== "" ? parseFloat(actual.days) : item.days
  const p = actual.unit_price !== "" ? parseFloat(actual.unit_price) : item.unit_price
  if (isNaN(q) || isNaN(d) || isNaN(p)) return libTotal(item)
  return q * d * p
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

  const totals = useMemo(() => {
    let libGasto = 0
    let realGasto = 0

    for (const sec of sections) {
      for (const item of sec.items) {
        libGasto += libTotal(item)
        realGasto += realTotal(
          item,
          actuals[item.id] || {
            qty: "",
            days: "",
            unit_price: "",
            supplier_id: "",
          }
        )
      }
    }

    if (!quote) {
      return {
        libGasto,
        realGasto,
        venta: 0,
        libUtilidad: 0,
        realUtilidad: 0,
        libPct: 0,
        realPct: 0,
      }
    }

    const venta = libGasto * (1 + quote.markup_percentage / 100)
    const libUtilidad = venta - libGasto
    const realUtilidad = venta - realGasto
    const libPct = venta > 0 ? (libUtilidad / venta) * 100 : 0
    const realPct = venta > 0 ? (realUtilidad / venta) * 100 : 0

    return { libGasto, realGasto, venta, libUtilidad, realUtilidad, libPct, realPct }
  }, [sections, actuals, quote])

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
                              onChange={(e) =>
                                updateActual(
                                  item.id,
                                  "supplier_id",
                                  e.target.value
                                )
                              }
                              style={selectStyle}
                            >
                              <option value="">Sin proveedor</option>
                              {proveedores.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {proveedorLabel(p)}
                                </option>
                              ))}
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
                          onChange={(e) =>
                            updateActual(
                              item.id,
                              "supplier_id",
                              e.target.value
                            )
                          }
                          style={selectStyle}
                        >
                          <option value="">—</option>
                          {proveedores.map((p) => (
                            <option key={p.id} value={p.id}>
                              {proveedorLabel(p)}
                            </option>
                          ))}
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
                  <span style={comparisonValueStyle}>{fmt(totals.venta)}</span>
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
                  <span style={comparisonValueStyle}>{fmt(totals.venta)}</span>
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
