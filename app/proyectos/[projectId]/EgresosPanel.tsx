"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "../../../lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

type Proveedor = { id: string; nombre: string; apellido: string; empresa: string | null; actividad: string }
type Employee  = { id: string; nombre: string; apellido_paterno: string; apellido_materno: string | null; puesto: string }

type EgresoItem = {
  id: string
  description: string
  qty: number; days: number; unit_price: number; real_expense: number
  actual_qty: number | null; actual_days: number | null; actual_unit_price: number | null
  actual_supplier_id: string | null; actual_employee_id: string | null
  supplierLabel: string; supplierType: "proveedor" | "empleado" | "none"
  section_name: string; quote_id: string; quote_name: string
}

type EditState = { qty: string; days: string; unit_price: string; contact: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
}

function montoEgreso(item: EgresoItem): number {
  const hasActual = item.actual_qty != null || item.actual_days != null || item.actual_unit_price != null
  if (!hasActual) return 0
  const q = item.actual_qty        ?? Math.max(item.qty, 1)
  const d = item.actual_days       ?? Math.max(item.days, 1)
  const p = item.actual_unit_price ?? item.unit_price
  return q * d * p
}

function resolveLabel(proveedores: Proveedor[], employees: Employee[], contact: string): { label: string; type: "proveedor" | "empleado" | "none" } {
  if (contact.startsWith("prov:")) {
    const p = proveedores.find(x => x.id === contact.slice(5))
    if (p) return { label: p.empresa ? `${p.empresa} — ${p.nombre} ${p.apellido}` : `${p.nombre} ${p.apellido}`, type: "proveedor" }
  }
  if (contact.startsWith("emp:")) {
    const e = employees.find(x => x.id === contact.slice(4))
    if (e) {
      const ap = e.apellido_materno ? `${e.apellido_paterno} ${e.apellido_materno}` : e.apellido_paterno
      return { label: `${e.nombre} ${ap}`, type: "empleado" }
    }
  }
  return { label: "Sin asignar", type: "none" }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EgresosPanel({ projectId, isMobile }: { projectId: string; isMobile: boolean }) {
  const [loading, setLoading]       = useState(true)
  const [items, setItems]           = useState<EgresoItem[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [employees, setEmployees]   = useState<Employee[]>([])
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [editState, setEditState]   = useState<EditState>({ qty: "", days: "", unit_price: "", contact: "" })
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)

      // Catálogos para el selector
      const [{ data: provs }, { data: emps }] = await Promise.all([
        supabase.from("proveedores").select("id,nombre,apellido,empresa,actividad").order("nombre"),
        supabase.from("employees").select("id,nombre,apellido_paterno,apellido_materno,puesto").order("nombre"),
      ])
      setProveedores(provs || [])
      setEmployees(emps || [])

      // Solo la cotización liberada
      const { data: quotes } = await supabase
        .from("quotes").select("id,name")
        .eq("project_id", projectId).eq("released", true)
        .order("created_at", { ascending: true })
      if (!quotes || quotes.length === 0) { setLoading(false); return }

      const allItems: EgresoItem[] = []
      for (const quote of quotes) {
        const { data: sections } = await supabase
          .from("quote_sections").select("id,name")
          .eq("quote_id", quote.id).order("order_index", { ascending: true })
        if (!sections) continue

        for (const section of sections) {
          const { data: raw } = await supabase
            .from("quote_items")
            .select("id,description,qty,days,unit_price,real_expense,actual_qty,actual_days,actual_unit_price,actual_supplier_id,actual_employee_id")
            .eq("section_id", section.id).order("order_index", { ascending: true })
          if (!raw) continue

          for (const row of raw as any[]) {
            const hasReal = row.actual_qty != null || row.actual_days != null || row.actual_unit_price != null
            if (!hasReal) continue
            const q = row.actual_qty        != null ? row.actual_qty        : Math.max(row.qty  || 0, 1)
            const d = row.actual_days       != null ? row.actual_days       : Math.max(row.days || 0, 1)
            const p = row.actual_unit_price != null ? row.actual_unit_price : row.unit_price
            if (q * d * p === 0) continue

            // Resolver label
            let supplierLabel = "Sin asignar"
            let supplierType: "proveedor" | "empleado" | "none" = "none"
            if (row.actual_supplier_id) {
              const prov = (provs || []).find((x: Proveedor) => x.id === row.actual_supplier_id)
              if (prov) {
                supplierLabel = prov.empresa ? `${prov.empresa} — ${prov.nombre} ${prov.apellido}` : `${prov.nombre} ${prov.apellido}`
                supplierType = "proveedor"
              }
            } else if (row.actual_employee_id) {
              const emp = (emps || []).find((x: Employee) => x.id === row.actual_employee_id)
              if (emp) {
                const ap = emp.apellido_materno ? `${emp.apellido_paterno} ${emp.apellido_materno}` : emp.apellido_paterno
                supplierLabel = `${emp.nombre} ${ap}`
                supplierType = "empleado"
              }
            }

            allItems.push({
              id: row.id, description: row.description,
              qty: row.qty, days: row.days, unit_price: row.unit_price, real_expense: row.real_expense,
              actual_qty: row.actual_qty, actual_days: row.actual_days, actual_unit_price: row.actual_unit_price,
              actual_supplier_id: row.actual_supplier_id, actual_employee_id: row.actual_employee_id,
              supplierLabel, supplierType,
              section_name: section.name, quote_id: quote.id, quote_name: quote.name,
            })
          }
        }
      }
      setItems(allItems)
      setLoading(false)
    }
    load()
  }, [projectId])

  function startEdit(item: EgresoItem) {
    const contact = item.actual_supplier_id
      ? `prov:${item.actual_supplier_id}`
      : item.actual_employee_id ? `emp:${item.actual_employee_id}` : ""
    setEditState({
      qty:        item.actual_qty        != null ? String(item.actual_qty)        : "",
      days:       item.actual_days       != null ? String(item.actual_days)       : "",
      unit_price: item.actual_unit_price != null ? String(item.actual_unit_price) : "",
      contact,
    })
    setEditingId(item.id)
  }

  function cancelEdit() { setEditingId(null) }

  async function saveEdit(itemId: string) {
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
        .eq("id", itemId)
      if (error) throw error

      // Actualizar estado local
      const { label: supplierLabel, type: supplierType } = resolveLabel(proveedores, employees, editState.contact)
      setItems(prev => prev.map(it => {
        if (it.id !== itemId) return it
        const updated = { ...it, actual_qty, actual_days, actual_unit_price, actual_supplier_id, actual_employee_id, supplierLabel, supplierType }
        // Recalcular monto — si queda en 0 lo quitamos
        const q2 = actual_qty        != null ? actual_qty        : Math.max(it.qty, 1)
        const d2 = actual_days       != null ? actual_days       : Math.max(it.days, 1)
        const p2 = actual_unit_price != null ? actual_unit_price : it.unit_price
        if (q2 * d2 * p2 === 0) return null as any  // marcar para eliminar
        return updated
      }).filter(Boolean))

      setEditingId(null)
    } catch (err: any) {
      alert("Error al guardar: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Agrupar por cotización ─────────────────────────────────────────────────
  const byQuote: Record<string, { quote_name: string; items: EgresoItem[] }> = {}
  for (const item of items) {
    if (!byQuote[item.quote_id]) byQuote[item.quote_id] = { quote_name: item.quote_name, items: [] }
    byQuote[item.quote_id].items.push(item)
  }
  const totalGlobal = items.reduce((s, i) => s + montoEgreso(i), 0)
  const quoteCount  = Object.keys(byQuote).length

  if (loading) return <p style={{ color: "#64748b", textAlign: "center", padding: "40px 0" }}>Cargando egresos…</p>

  if (items.length === 0) return (
    <div style={{ textAlign: "center", padding: "48px 0", color: "#475569" }}>
      <p style={{ fontSize: 15, marginBottom: 8 }}>No hay egresos registrados en este proyecto.</p>
      <p style={{ fontSize: 12, color: "#334155" }}>Captura costos reales en la página de liberación.</p>
    </div>
  )

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 12 }}>
        <SummaryCard label="Total egresos"  value={fmt(totalGlobal)}     color="#f87171" />
        <SummaryCard label="Ítems"          value={String(items.length)} color="#94a3b8" />
        <SummaryCard label="Cotizaciones"   value={String(quoteCount)}   color="#94a3b8" />
      </div>

      {/* Per-quote tables */}
      {Object.entries(byQuote).map(([quoteId, { quote_name, items: qItems }]) => {
        const quoteTotal = qItems.reduce((s, i) => s + montoEgreso(i), 0)
        return (
          <div key={quoteId}>
            <div style={quoteHeaderStyle}>
              <span style={quoteLabelStyle}>📋 {quote_name}</span>
              <span style={quoteTotalStyle}>{fmt(quoteTotal)}</span>
            </div>

            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {["Sección", "Rubro / Concepto", "Proveedor / Empleado", "Qty", "Días", "P. Unitario", "Monto", ""].map((h, i) => (
                      <th key={i} style={{ ...thStyle, textAlign: i >= 3 && i <= 6 ? "right" : "left" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {qItems.map((item, idx) => {
                    const isEditing = editingId === item.id
                    const monto = montoEgreso(item)
                    const qty   = item.actual_qty        != null ? item.actual_qty        : Math.max(item.qty, 1)
                    const days  = item.actual_days       != null ? item.actual_days       : Math.max(item.days, 1)
                    const price = item.actual_unit_price != null ? item.actual_unit_price : item.unit_price

                    if (isEditing) {
                      // Calcular preview del monto mientras editas
                      const pq = editState.qty        !== "" ? parseFloat(editState.qty)        : qty
                      const pd = editState.days       !== "" ? parseFloat(editState.days)       : days
                      const pp = editState.unit_price !== "" ? parseFloat(editState.unit_price) : price
                      const previewMonto = (!isNaN(pq) && !isNaN(pd) && !isNaN(pp)) ? pq * pd * pp : 0

                      return (
                        <tr key={item.id} style={{ background: "rgba(167,139,250,0.06)", borderBottom: "1px solid rgba(167,139,250,0.15)" }}>
                          <td style={{ ...tdStyle, color: "#64748b", fontSize: 12 }}>{item.section_name}</td>
                          <td style={{ ...tdStyle, color: "#e2e8f0", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.description}
                          </td>
                          {/* Selector proveedor */}
                          <td style={{ ...tdStyle, minWidth: 200 }}>
                            <SupplierCombobox
                              value={editState.contact}
                              onChange={val => setEditState(s => ({ ...s, contact: val }))}
                              proveedores={proveedores}
                              employees={employees}
                            />
                          </td>
                          {/* Inputs qty / days / price */}
                          <td style={tdStyle}>
                            <input type="number" value={editState.qty}
                              onChange={e => setEditState(s => ({ ...s, qty: e.target.value }))}
                              placeholder={String(qty)} style={editInputStyle} />
                          </td>
                          <td style={tdStyle}>
                            <input type="number" value={editState.days}
                              onChange={e => setEditState(s => ({ ...s, days: e.target.value }))}
                              placeholder={String(days)} style={editInputStyle} />
                          </td>
                          <td style={tdStyle}>
                            <input type="number" value={editState.unit_price}
                              onChange={e => setEditState(s => ({ ...s, unit_price: e.target.value }))}
                              placeholder={String(price)} style={{ ...editInputStyle, width: 90 }} />
                          </td>
                          {/* Preview monto */}
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#f87171", fontFamily: "monospace" }}>
                            {fmt(previewMonto)}
                          </td>
                          {/* Acciones */}
                          <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                            <button onClick={() => saveEdit(item.id)} disabled={saving} style={saveBtnStyle}>
                              {saving ? "…" : "✓"}
                            </button>
                            <button onClick={cancelEdit} style={cancelBtnStyle}>✕</button>
                          </td>
                        </tr>
                      )
                    }

                    // Vista normal
                    return (
                      <tr key={item.id} style={{
                        background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.018)",
                        borderBottom: "1px solid rgba(148,163,184,0.07)",
                      }}>
                        <td style={{ ...tdStyle, color: "#64748b", fontSize: 12 }}>{item.section_name}</td>
                        <td style={{ ...tdStyle, color: "#e2e8f0", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.description}
                        </td>
                        <td style={tdStyle}>
                          {item.supplierType === "none" ? (
                            <span style={{ color: "#475569", fontSize: 12, fontStyle: "italic" }}>Sin asignar</span>
                          ) : (
                            <span style={supplierBadgeStyle(item.supplierType)}>
                              {item.supplierType === "empleado" ? "👤 " : "🏢 "}
                              {item.supplierLabel}
                            </span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", color: "#64748b", fontSize: 12 }}>{qty}</td>
                        <td style={{ ...tdStyle, textAlign: "right", color: "#64748b", fontSize: 12 }}>{days}</td>
                        <td style={{ ...tdStyle, textAlign: "right", color: "#94a3b8", fontFamily: "monospace", fontSize: 12 }}>{fmt(price)}</td>
                        <td style={{ ...tdStyle, textAlign: "right", color: "#f87171", fontWeight: 600, fontFamily: "monospace" }}>{fmt(monto)}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          <button onClick={() => startEdit(item)} style={editBtnStyle}>✎ Editar</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "1px solid rgba(148,163,184,0.14)" }}>
                    <td colSpan={7} style={{ ...tdStyle, color: "#64748b", fontSize: 12, paddingTop: 10 }}>
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
    <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(148,163,184,0.10)", boxShadow: `0 0 0 1px ${color}22` }}>
      <p style={{ margin: 0, color: "#64748b", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</p>
      <p style={{ margin: "6px 0 0", color, fontSize: 20, fontWeight: 700, fontFamily: "monospace" }}>{value}</p>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const quoteHeaderStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "10px 14px", borderRadius: "10px 10px 0 0",
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(148,163,184,0.12)", borderBottom: "none",
}
const quoteLabelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#e2e8f0" }
const quoteTotalStyle: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: "#f87171", fontFamily: "monospace" }
const tableWrapStyle: React.CSSProperties  = { overflowX: "auto", borderRadius: "0 0 10px 10px", border: "1px solid rgba(148,163,184,0.10)" }
const tableStyle: React.CSSProperties      = { width: "100%", borderCollapse: "collapse", fontSize: 13, color: "#cbd5e1" }

const thStyle: React.CSSProperties = {
  padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 700,
  color: "#475569", textTransform: "uppercase", letterSpacing: 0.6,
  borderBottom: "1px solid rgba(148,163,184,0.12)", background: "rgba(255,255,255,0.025)", whiteSpace: "nowrap",
}
const tdStyle: React.CSSProperties = { padding: "9px 12px", fontSize: 13, color: "#cbd5e1", verticalAlign: "middle" }

const editInputStyle: React.CSSProperties = {
  width: 64, padding: "4px 6px", borderRadius: 6,
  border: "1px solid rgba(167,139,250,0.35)", background: "rgba(167,139,250,0.08)",
  color: "#f8fafc", fontSize: 12, outline: "none", textAlign: "right",
}
const saveBtnStyle: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 6, border: "none",
  background: "rgba(52,211,153,0.18)", color: "#34d399",
  cursor: "pointer", fontSize: 13, fontWeight: 700, marginRight: 4,
}
const cancelBtnStyle: React.CSSProperties = {
  padding: "4px 8px", borderRadius: 6,
  border: "1px solid rgba(148,163,184,0.18)", background: "transparent",
  color: "#64748b", cursor: "pointer", fontSize: 12,
}
const editBtnStyle: React.CSSProperties = {
  padding: "3px 10px", borderRadius: 6,
  border: "1px solid rgba(148,163,184,0.18)", background: "rgba(255,255,255,0.04)",
  color: "#94a3b8", cursor: "pointer", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
}

// ─── SupplierCombobox ─────────────────────────────────────────────────────────

function SupplierCombobox({
  value,
  onChange,
  proveedores,
  employees,
}: {
  value: string
  onChange: (val: string) => void
  proveedores: Proveedor[]
  employees: Employee[]
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
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setQuery("")
      }
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
                const ap  = e.apellido_materno ? `${e.apellido_paterno} ${e.apellido_materno}` : e.apellido_paterno
                return (
                  <div key={e.id}
                    onMouseDown={() => { onChange(`emp:${e.id}`); setOpen(false); setQuery("") }}
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
                  <div key={p.id}
                    onMouseDown={() => { onChange(`prov:${p.id}`); setOpen(false); setQuery("") }}
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

function supplierBadgeStyle(type: "proveedor" | "empleado" | "none"): React.CSSProperties {
  const isEmp = type === "empleado"
  return {
    display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 999,
    fontSize: 11, fontWeight: 600,
    color:      isEmp ? "#34d399" : "#a78bfa",
    background: isEmp ? "rgba(52,211,153,0.10)"  : "rgba(124,58,237,0.12)",
    border:     isEmp ? "1px solid rgba(52,211,153,0.22)" : "1px solid rgba(167,139,250,0.22)",
    whiteSpace: "nowrap", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis",
  }
}
