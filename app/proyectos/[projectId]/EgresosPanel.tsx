"use client"

import { useEffect, useState } from "react"
import { supabase } from "../../../lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

type EgresoItem = {
  id: string
  description: string
  // liberado
  qty: number
  days: number
  unit_price: number
  real_expense: number
  // real (pueden estar vacíos)
  actual_qty: number | null
  actual_days: number | null
  actual_unit_price: number | null
  // proveedor resuelto
  supplierLabel: string
  supplierType: "proveedor" | "empleado"
  // agrupación
  section_name: string
  quote_id: string
  quote_name: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
}

/** Monto real a pagar: usa valores reales si alguno fue capturado.
 *  Si no hay datos reales capturados, devuelve 0 (sin asumir gasto). */
function montoEgreso(item: EgresoItem): number {
  const hasActual = item.actual_qty != null || item.actual_days != null || item.actual_unit_price != null
  if (!hasActual) return 0
  const q = item.actual_qty        ?? Math.max(item.qty, 1)
  const d = item.actual_days       ?? Math.max(item.days, 1)
  const p = item.actual_unit_price ?? item.unit_price
  return q * d * p
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EgresosPanel({
  projectId,
  isMobile,
}: {
  projectId: string
  isMobile: boolean
}) {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<EgresoItem[]>([])

  useEffect(() => {
    async function load() {
      setLoading(true)

      // 1. Solo la cotización LIBERADA del proyecto
      const { data: quotes } = await supabase
        .from("quotes")
        .select("id, name")
        .eq("project_id", projectId)
        .eq("released", true)
        .order("created_at", { ascending: true })

      if (!quotes || quotes.length === 0) { setLoading(false); return }

      const allItems: EgresoItem[] = []

      for (const quote of quotes) {
        // 2. Secciones de la cotización
        const { data: sections } = await supabase
          .from("quote_sections")
          .select("id, name")
          .eq("quote_id", quote.id)
          .order("order_index", { ascending: true })

        if (!sections) continue

        for (const section of sections) {
          // 3. Items con proveedor o empleado asignado en la liberación
          //    actual_supplier_id → proveedor externo del catálogo
          //    actual_employee_id → empleado interno RETRO
          const { data: raw } = await supabase
            .from("quote_items")
            .select(`
              id, description,
              qty, days, unit_price, real_expense,
              actual_qty, actual_days, actual_unit_price,
              actual_supplier_id, actual_employee_id,
              proveedores:actual_supplier_id ( nombre, apellido, empresa ),
              employees:actual_employee_id   ( nombre, apellido_paterno, apellido_materno )
            `)
            .eq("section_id", section.id)
            .order("order_index", { ascending: true })

          if (!raw) continue

          for (const row of raw as any[]) {
            const hasProv = !!row.actual_supplier_id
            const hasEmp  = !!row.actual_employee_id
            if (!hasProv && !hasEmp) continue   // sin proveedor/empleado → ignorar

            let supplierLabel = "—"
            let supplierType: "proveedor" | "empleado" = "proveedor"

            if (hasProv && row.proveedores) {
              const p = row.proveedores
              supplierLabel = p.empresa
                ? `${p.empresa} — ${p.nombre} ${p.apellido}`
                : `${p.nombre} ${p.apellido}`
              supplierType = "proveedor"
            } else if (hasEmp && row.employees) {
              const e = row.employees
              const ap = e.apellido_materno
                ? `${e.apellido_paterno} ${e.apellido_materno}`
                : e.apellido_paterno
              supplierLabel = `${e.nombre} ${ap}`
              supplierType = "empleado"
            }

            allItems.push({
              id:               row.id,
              description:      row.description,
              qty:              row.qty,
              days:             row.days,
              unit_price:       row.unit_price,
              real_expense:     row.real_expense,
              actual_qty:       row.actual_qty,
              actual_days:      row.actual_days,
              actual_unit_price:row.actual_unit_price,
              supplierLabel,
              supplierType,
              section_name:     section.name,
              quote_id:         quote.id,
              quote_name:       quote.name,
            })
          }
        }
      }

      setItems(allItems)
      setLoading(false)
    }

    load()
  }, [projectId])

  // ── Agrupar por cotización ─────────────────────────────────────────────────
  const byQuote: Record<string, { quote_name: string; items: EgresoItem[] }> = {}
  for (const item of items) {
    if (!byQuote[item.quote_id])
      byQuote[item.quote_id] = { quote_name: item.quote_name, items: [] }
    byQuote[item.quote_id].items.push(item)
  }

  const totalGlobal = items.reduce((s, i) => s + montoEgreso(i), 0)
  const quoteCount  = Object.keys(byQuote).length

  // ── Loading / empty ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <p style={{ color: "#64748b", textAlign: "center", padding: "40px 0" }}>
        Cargando egresos…
      </p>
    )
  }

  if (items.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", color: "#475569" }}>
        <p style={{ fontSize: 15, marginBottom: 8 }}>
          No hay rubros con proveedor asignado en este proyecto.
        </p>
        <p style={{ fontSize: 12, color: "#334155" }}>
          Asigna proveedores en la página de liberación de cada cotización.
        </p>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

      {/* Summary cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)",
        gap: 12,
      }}>
        <SummaryCard label="Total egresos"        value={fmt(totalGlobal)} color="#f87171" />
        <SummaryCard label="Rubros con proveedor" value={String(items.length)} color="#94a3b8" />
        <SummaryCard label="Cotizaciones"          value={String(quoteCount)}  color="#94a3b8" />
      </div>

      {/* Per-quote tables */}
      {Object.entries(byQuote).map(([quoteId, { quote_name, items: qItems }]) => {
        const quoteTotal = qItems.reduce((s, i) => s + montoEgreso(i), 0)
        return (
          <div key={quoteId}>
            {/* Quote header */}
            <div style={quoteHeaderStyle}>
              <span style={quoteLabelStyle}>📋 {quote_name}</span>
              <span style={quoteTotalStyle}>{fmt(quoteTotal)}</span>
            </div>

            {/* Table */}
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {["Sección", "Rubro / Concepto", "Proveedor / Empleado", "Qty", "Días", "P. Unitario", "Monto"].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {qItems.map((item, i) => {
                    const monto = montoEgreso(item)
                    const hasActual = item.actual_qty != null || item.actual_days != null || item.actual_unit_price != null
                    const qty   = hasActual ? (item.actual_qty   ?? Math.max(item.qty, 1))   : "—"
                    const days  = hasActual ? (item.actual_days  ?? Math.max(item.days, 1))  : "—"
                    const price = hasActual ? (item.actual_unit_price ?? item.unit_price) : null

                    return (
                      <tr key={item.id} style={{
                        background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.018)",
                        borderBottom: "1px solid rgba(148,163,184,0.07)",
                      }}>
                        <td style={{ ...tdStyle, color: "#64748b", fontSize: 12 }}>
                          {item.section_name}
                        </td>
                        <td style={{ ...tdStyle, color: "#e2e8f0", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.description}
                        </td>
                        <td style={tdStyle}>
                          <span style={supplierBadgeStyle(item.supplierType)}>
                            {item.supplierType === "empleado" ? "👤 " : "🏢 "}
                            {item.supplierLabel}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", color: "#64748b", fontSize: 12 }}>
                          {qty}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", color: "#64748b", fontSize: 12 }}>
                          {days}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", color: "#94a3b8", fontFamily: "monospace", fontSize: 12 }}>
                          {price != null ? fmt(price) : "—"}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", color: "#f87171", fontWeight: 600, fontFamily: "monospace" }}>
                          {fmt(monto)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "1px solid rgba(148,163,184,0.14)" }}>
                    <td colSpan={6} style={{ ...tdStyle, color: "#64748b", fontSize: 12, paddingTop: 10 }}>
                      {qItems.length} rubro{qItems.length !== 1 ? "s" : ""}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#f87171", fontFamily: "monospace", paddingTop: 10 }}>
                      {fmt(quoteTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      padding: "14px 18px",
      borderRadius: 12,
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(148,163,184,0.10)",
      boxShadow: `0 0 0 1px ${color}22`,
    }}>
      <p style={{ margin: 0, color: "#64748b", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>
        {label}
      </p>
      <p style={{ margin: "6px 0 0", color, fontSize: 20, fontWeight: 700, fontFamily: "monospace" }}>
        {value}
      </p>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const quoteHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 14px",
  borderRadius: "10px 10px 0 0",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(148,163,184,0.12)",
  borderBottom: "none",
}

const quoteLabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#e2e8f0",
}

const quoteTotalStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#f87171",
  fontFamily: "monospace",
}

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
  borderRadius: "0 0 10px 10px",
  border: "1px solid rgba(148,163,184,0.10)",
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  color: "#cbd5e1",
}

const thStyle: React.CSSProperties = {
  padding: "9px 12px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 700,
  color: "#475569",
  textTransform: "uppercase",
  letterSpacing: 0.6,
  borderBottom: "1px solid rgba(148,163,184,0.12)",
  background: "rgba(255,255,255,0.025)",
  whiteSpace: "nowrap",
}

const tdStyle: React.CSSProperties = {
  padding: "9px 12px",
  fontSize: 13,
  color: "#cbd5e1",
  verticalAlign: "middle",
}

function supplierBadgeStyle(type: "proveedor" | "empleado"): React.CSSProperties {
  const isEmp = type === "empleado"
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 9px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    color:       isEmp ? "#34d399" : "#a78bfa",
    background:  isEmp ? "rgba(52,211,153,0.10)"  : "rgba(124,58,237,0.12)",
    border:      isEmp ? "1px solid rgba(52,211,153,0.22)" : "1px solid rgba(167,139,250,0.22)",
    whiteSpace: "nowrap",
    maxWidth: 240,
    overflow: "hidden",
    textOverflow: "ellipsis",
  }
}
