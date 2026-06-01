"use client"

import { useEffect, useState } from "react"
import { supabase } from "../../../lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

type EgresoItem = {
  id: string
  description: string
  qty: number
  days: number
  unit_price: number
  supplier: string | null
  section_name: string
  quote_id: string
  quote_name: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
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

      // 1. Load all quotes for this project
      const { data: quotes } = await supabase
        .from("quotes")
        .select("id, name")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true })

      if (!quotes || quotes.length === 0) {
        setLoading(false)
        return
      }

      const allItems: EgresoItem[] = []

      for (const quote of quotes) {
        // 2. Load sections for this quote
        const { data: sections } = await supabase
          .from("quote_sections")
          .select("id, name")
          .eq("quote_id", quote.id)
          .order("order_index", { ascending: true })

        if (!sections) continue

        for (const section of sections) {
          // 3. Load items that have a supplier assigned
          const { data: sectionItems } = await supabase
            .from("quote_items")
            .select("id, description, qty, days, unit_price, supplier")
            .eq("section_id", section.id)
            .not("supplier", "is", null)
            .order("order_index", { ascending: true })

          if (!sectionItems) continue

          for (const item of sectionItems) {
            if (!item.supplier) continue
            allItems.push({
              ...item,
              section_name: section.name,
              quote_id: quote.id,
              quote_name: quote.name,
            })
          }
        }
      }

      setItems(allItems)
      setLoading(false)
    }

    load()
  }, [projectId])

  // ── Group by quote ─────────────────────────────────────────────────────────
  const byQuote: Record<string, { quote_name: string; items: EgresoItem[] }> = {}
  for (const item of items) {
    if (!byQuote[item.quote_id]) {
      byQuote[item.quote_id] = { quote_name: item.quote_name, items: [] }
    }
    byQuote[item.quote_id].items.push(item)
  }

  const totalGlobal = items.reduce((s, i) => s + i.qty * i.days * i.unit_price, 0)
  const quoteCount  = Object.keys(byQuote).length

  // ── Empty / loading states ─────────────────────────────────────────────────
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
          Asigna proveedores a los rubros de las cotizaciones para verlos aquí.
        </p>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

      {/* Summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)",
          gap: 12,
        }}
      >
        <SummaryCard label="Total egresos"        value={fmt(totalGlobal)} color="#f87171" />
        <SummaryCard label="Rubros con proveedor" value={String(items.length)} color="#94a3b8" />
        <SummaryCard label="Cotizaciones"          value={String(quoteCount)}  color="#94a3b8" />
      </div>

      {/* Per-quote tables */}
      {Object.entries(byQuote).map(([quoteId, { quote_name, items: qItems }]) => {
        const quoteTotal = qItems.reduce((s, i) => s + i.qty * i.days * i.unit_price, 0)
        return (
          <div key={quoteId}>
            {/* Quote header */}
            <div style={quoteHeaderStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={quoteLabelStyle}>📋 {quote_name}</span>
              </div>
              <span style={quoteTotalStyle}>{fmt(quoteTotal)}</span>
            </div>

            {/* Table */}
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {["Sección", "Rubro / Concepto", "Proveedor", "Qty", "Días", "P. Unitario", "Monto"].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {qItems.map((item, i) => {
                    const monto = item.qty * item.days * item.unit_price
                    return (
                      <tr
                        key={item.id}
                        style={{
                          background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.018)",
                          borderBottom: "1px solid rgba(148,163,184,0.07)",
                        }}
                      >
                        <td style={{ ...tdStyle, color: "#64748b", fontSize: 12 }}>
                          {item.section_name}
                        </td>
                        <td style={{ ...tdStyle, color: "#e2e8f0", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.description}
                        </td>
                        <td style={tdStyle}>
                          <span style={supplierBadgeStyle}>{item.supplier}</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", color: "#64748b", fontSize: 12 }}>
                          {item.qty}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", color: "#64748b", fontSize: 12 }}>
                          {item.days}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", color: "#94a3b8", fontFamily: "monospace", fontSize: 12 }}>
                          {fmt(item.unit_price)}
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
                    <td
                      colSpan={6}
                      style={{ ...tdStyle, color: "#64748b", fontSize: 12, paddingTop: 10 }}
                    >
                      {qItems.length} rubro{qItems.length !== 1 ? "s" : ""}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontWeight: 700,
                        color: "#f87171",
                        fontFamily: "monospace",
                        paddingTop: 10,
                      }}
                    >
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

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <div
      style={{
        padding: "14px 18px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(148,163,184,0.10)",
        boxShadow: `0 0 0 1px ${color}22`,
      }}
    >
      <p
        style={{
          margin: 0,
          color: "#64748b",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: "6px 0 0",
          color,
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "monospace",
        }}
      >
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
  marginBottom: 0,
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

const supplierBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 9px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  color: "#a78bfa",
  background: "rgba(124,58,237,0.12)",
  border: "1px solid rgba(167,139,250,0.22)",
  whiteSpace: "nowrap",
}
