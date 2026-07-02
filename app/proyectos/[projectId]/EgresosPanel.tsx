"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "../../../lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

type Proveedor = { id: string; nombre: string; apellido: string; empresa: string | null; actividad: string }
type Employee  = { id: string; nombre: string; apellido_paterno: string; apellido_materno: string | null; puesto: string; nickname: string | null }

// Mostrar siempre el nickname de la gente interna de Retro
const empNick = (e: { nombre: string; nickname?: string | null }) => e.nickname?.trim() || e.nombre

// Formatea una fecha "YYYY-MM-DD" como "12 jun" sin desfase de zona horaria
function fechaCorta(d: string | null): string {
  if (!d) return ""
  const [y, m, day] = d.split("T")[0].split("-").map(Number)
  return new Date(y, m - 1, day).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })
}

type EgresoItem = {
  id: string
  description: string
  qty: number; days: number; unit_price: number; real_expense: number
  actual_qty: number | null; actual_days: number | null; actual_unit_price: number | null
  actual_supplier_id: string | null; actual_employee_id: string | null
  supplierLabel: string; supplierType: "proveedor" | "empleado" | "none"
  section_id: string; section_name: string; quote_id: string; quote_name: string
  billing_sent_at: string | null
  pago_tipo: "anticipo" | "comprobacion" | null
  pago_estado: "pagado" | "pendiente_cierre" | null
  monto_comprobado: number | null
  pago_modo: "anticipo" | "comprobacion" | null
  pago_fecha: string | null
}

type EditState = { qty: string; days: string; unit_price: string; contact: string; fecha_pago: string }

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
      return { label: empNick(e), type: "empleado" }
    }
  }
  return { label: "Sin asignar", type: "none" }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EgresosPanel({
  projectId, isMobile, projectName, projectCode, empresa, projectResponsable,
}: {
  projectId: string
  isMobile: boolean
  projectName: string
  projectCode: string | null
  empresa: "retro_studio" | "retro_films" | null
  projectResponsable: string | null
}) {
  const [loading, setLoading]       = useState(true)
  const [items, setItems]           = useState<EgresoItem[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [employees, setEmployees]   = useState<Employee[]>([])
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [editState, setEditState]   = useState<EditState>({ qty: "", days: "", unit_price: "", contact: "", fecha_pago: "" })
  const [saving, setSaving]         = useState(false)
  const [sendingBilling, setSendingBilling] = useState<string | null>(null)
  const [sendingAll, setSendingAll]  = useState(false)

  // Filtro de estatus, orden de columnas, datos para reporte
  const [statusFilter, setStatusFilter] = useState<"todo" | "por_pagar" | "pagados" | "anticipos">("todo")
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [facturas, setFacturas] = useState<any[]>([])

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("asc") }
  }

  // Hoy CDMX (YYYY-MM-DD) para detectar pagos vencidos
  const hoyMx = new Date().toLocaleDateString("sv", { timeZone: "America/Mexico_City" })

  // Estatus de pago de un egreso: { label, color }
  function egresoStatus(item: EgresoItem): { label: string; color: string } {
    const GRIS = "#94a3b8", NARANJA = "#fb923c", VERDE = "#34d399", ROJO = "#f87171"
    if (item.pago_estado === "pagado") return { label: "Pagado", color: VERDE }
    const monto = montoEgreso(item)
    // Factura del proveedor vinculada (o por proveedor+monto)
    const fac =
      facturas.find(f => f.quote_item_id && f.quote_item_id === item.id) ||
      facturas.find(f => f.proveedor_id && f.proveedor_id === item.actual_supplier_id &&
        f.origen !== "anticipo" && f.origen !== "comprobacion" && f.origen !== "reembolso" &&
        Math.abs(Number(f.subtotal || 0) - monto) < 1.5)
    if (fac?.status === "pagada") return { label: "Pagado", color: VERDE }
    if (fac?.fecha_pago) {
      const vencida = String(fac.fecha_pago).split("T")[0] < hoyMx
      return vencida ? { label: "Vencido", color: ROJO } : { label: "Programado", color: NARANJA }
    }
    return { label: "Sin fecha", color: GRIS }
  }

  // ── Pagos (anticipo / comprobación) ───────────────────────────────────────
  const [payModal, setPayModal] = useState<{ item: EgresoItem; tipo: "anticipo" | "comprobacion" } | null>(null)
  const [payXml, setPayXml] = useState<File | null>(null)
  const [payPdf, setPayPdf] = useState<File | null>(null)
  const [payMonto, setPayMonto] = useState("")
  const [payForma, setPayForma] = useState("")
  const [payFecha, setPayFecha] = useState("")
  const [paying, setPaying] = useState(false)

  async function load() {
      setLoading(true)

      // Catálogos para el selector + facturas (para el estatus de pago)
      const [{ data: provs }, { data: emps }, { data: facts }] = await Promise.all([
        supabase.from("proveedores").select("id,nombre,apellido,empresa,actividad").order("nombre"),
        supabase.from("employees").select("id,nombre,apellido_paterno,apellido_materno,puesto,nickname").order("nombre"),
        supabase.from("facturas").select("proveedor_id,quote_item_id,subtotal,status,origen,fecha_pago").eq("project_id", projectId),
      ])
      setProveedores(provs || [])
      setEmployees(emps || [])
      setFacturas(facts || [])

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
            .select("id,description,qty,days,unit_price,real_expense,actual_qty,actual_days,actual_unit_price,actual_supplier_id,actual_employee_id,billing_sent_at,pago_tipo,pago_estado,monto_comprobado,pago_modo,pago_fecha")
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
                supplierLabel = empNick(emp)
                supplierType = "empleado"
              }
            }

            allItems.push({
              id: row.id, description: row.description,
              qty: row.qty, days: row.days, unit_price: row.unit_price, real_expense: row.real_expense,
              actual_qty: row.actual_qty, actual_days: row.actual_days, actual_unit_price: row.actual_unit_price,
              actual_supplier_id: row.actual_supplier_id, actual_employee_id: row.actual_employee_id,
              supplierLabel, supplierType,
              section_id: section.id, section_name: section.name, quote_id: quote.id, quote_name: quote.name,
              billing_sent_at: row.billing_sent_at ?? null,
              pago_tipo: row.pago_tipo ?? null,
              pago_estado: row.pago_estado ?? null,
              monto_comprobado: row.monto_comprobado ?? null,
              pago_modo: row.pago_modo ?? null,
              pago_fecha: row.pago_fecha ?? null,
            })
          }
        }
      }
      setItems(allItems)
      setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      fecha_pago: item.pago_fecha ? String(item.pago_fecha).split("T")[0] : "",
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

      const pago_fecha = editState.fecha_pago !== "" ? editState.fecha_pago : null

      const { error } = await supabase
        .from("quote_items")
        .update({ actual_qty, actual_days, actual_unit_price, actual_supplier_id, actual_employee_id, pago_fecha })
        .eq("id", itemId)
      if (error) throw error

      // Actualizar estado local
      const { label: supplierLabel, type: supplierType } = resolveLabel(proveedores, employees, editState.contact)
      setItems(prev => prev.map(it => {
        if (it.id !== itemId) return it
        const updated = { ...it, actual_qty, actual_days, actual_unit_price, actual_supplier_id, actual_employee_id, supplierLabel, supplierType, pago_fecha }
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

  const fmt2 = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
  const proyectoLabel = projectCode ? `${projectCode} ${projectName}` : projectName

  async function callBillingApi(proveedorId: string, billingItems: { monto: string; concepto: string }[]) {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch("/api/egresos/send-billing", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        proveedorId,
        items: billingItems,
        proyectoLabel,
        empresa: empresa || "retro_studio",
        responsableNombre: projectResponsable,
      }),
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error || "Error al enviar")
    return data
  }

  async function markBillingSent(itemIds: string[]) {
    const now = new Date().toISOString()
    await supabase.from("quote_items").update({ billing_sent_at: now }).in("id", itemIds)
    setItems(prev => prev.map(it => itemIds.includes(it.id) ? { ...it, billing_sent_at: now } : it))
  }

  async function sendBilling(item: EgresoItem, monto: number) {
    if (!item.actual_supplier_id) return
    setSendingBilling(item.id)
    try {
      const data = await callBillingApi(item.actual_supplier_id, [{ monto: fmt2(monto), concepto: item.description }])
      await markBillingSent([item.id])
      alert(`✓ Instrucciones enviadas a ${data.sentTo}${data.cc ? `\nCopia a: ${data.cc}` : ""}`)
    } catch (err: any) {
      alert("Error al enviar: " + err.message)
    } finally {
      setSendingBilling(null)
    }
  }

  async function sendAllBilling() {
    // Agrupar ítems de proveedores por actual_supplier_id
    const provItems: Record<string, { id: string; itemIds: string[]; billingItems: { monto: string; concepto: string }[] }> = {}
    for (const item of items) {
      if (item.supplierType !== "proveedor" || !item.actual_supplier_id) continue
      const monto = montoEgreso(item)
      if (monto === 0) continue
      if (!provItems[item.actual_supplier_id]) {
        provItems[item.actual_supplier_id] = { id: item.actual_supplier_id, itemIds: [], billingItems: [] }
      }
      provItems[item.actual_supplier_id].itemIds.push(item.id)
      provItems[item.actual_supplier_id].billingItems.push({ monto: fmt2(monto), concepto: item.description })
    }
    const provList = Object.values(provItems)
    if (provList.length === 0) { alert("No hay proveedores externos en este control de egresos."); return }
    if (!confirm(`¿Enviar instrucciones de facturación a ${provList.length} proveedor${provList.length !== 1 ? "es" : ""}?`)) return

    setSendingAll(true)
    const errors: string[] = []
    let sent = 0
    for (const prov of provList) {
      try {
        await callBillingApi(prov.id, prov.billingItems)
        await markBillingSent(prov.itemIds)
        sent++
      } catch (err: any) {
        errors.push(err.message)
      }
    }
    setSendingAll(false)
    if (errors.length) {
      alert(`Enviados: ${sent}/${provList.length}\nErrores:\n${errors.join("\n")}`)
    } else {
      alert(`✓ Instrucciones enviadas a ${sent} proveedor${sent !== 1 ? "es"  : ""}`)
    }
  }

  // ── Pagos ─────────────────────────────────────────────────────────────────
  function openPay(item: EgresoItem, tipo: "anticipo" | "comprobacion") {
    setPayModal({ item, tipo })
    setPayXml(null)
    setPayPdf(null)
    setPayForma("")
    setPayFecha(hoyMx)
    setPayMonto(String(montoEgreso(item)))
  }

  async function submitPay() {
    if (!payModal) return
    const { item, tipo } = payModal
    const original = montoEgreso(item)
    // Para anticipo el monto capturado es el pago. Para comprobación es el monto real.
    const capturado = parseFloat(payMonto)
    if (!capturado || capturado <= 0) { alert("Indica el monto"); return }
    if (!payForma) { alert("Selecciona de dónde salió el pago"); return }
    if (!payFecha) { alert("Indica la fecha en que se realizó el pago"); return }
    if (tipo === "anticipo" && (!payXml || !payPdf)) {
      alert("Para anticipo debes subir el XML y el PDF de la factura")
      return
    }
    setPaying(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const fd = new FormData()
      fd.append("itemId", item.id)
      fd.append("tipo", tipo)
      // monto pagado: anticipo = capturado; comprobación = el original ya pagado
      fd.append("monto", String(tipo === "comprobacion" ? original : capturado))
      if (tipo === "comprobacion") fd.append("montoReal", String(capturado))
      fd.append("formaPago", payForma)
      fd.append("fechaPago", payFecha)
      fd.append("sectionId", item.section_id)
      fd.append("concepto", `${item.description} — ${item.supplierLabel}`)
      if (item.actual_supplier_id) fd.append("proveedorId", item.actual_supplier_id)
      fd.append("projectId", projectId)
      fd.append("codigo", projectCode || "")
      if (tipo === "anticipo" && payXml && payPdf) {
        fd.append("xml", payXml)
        fd.append("pdf", payPdf)
      }
      const res = await fetch("/api/egresos/pay", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: fd,
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || "Error al registrar pago")
      setPayModal(null)
      if (data.reembolso) {
        alert(`✓ Pago registrado.\nSe generó un reembolso de ${fmt(data.reembolso)} para ${item.supplierLabel}, visible en Finanzas como REEMBOLSO por pagar.`)
      }
      // Recargar para reflejar el nuevo estado y, si aplica, la línea de reembolso
      await load()
    } catch (err: any) {
      alert("Error: " + err.message)
    } finally {
      setPaying(false)
    }
  }

  // ── Filtro de estatus ──────────────────────────────────────────────────────
  function passesFilter(it: EgresoItem): boolean {
    switch (statusFilter) {
      case "pagados":   return it.pago_estado === "pagado"
      case "por_pagar": return it.pago_estado !== "pagado"
      case "anticipos": return it.pago_modo === "anticipo" || it.pago_modo === "comprobacion"
      default:          return true
    }
  }

  // ── Orden de columnas ──────────────────────────────────────────────────────
  function sortItems(list: EgresoItem[]): EgresoItem[] {
    if (!sortKey) return list
    const get = (it: EgresoItem): string | number => {
      switch (sortKey) {
        case "section":  return it.section_name
        case "desc":     return it.description
        case "supplier": return it.supplierLabel
        case "qty":      return it.actual_qty ?? Math.max(it.qty, 1)
        case "days":     return it.actual_days ?? Math.max(it.days, 1)
        case "price":    return it.actual_unit_price ?? it.unit_price
        case "monto":    return montoEgreso(it)
        case "status":   return egresoStatus(it).label
        default:         return ""
      }
    }
    const dir = sortDir === "asc" ? 1 : -1
    return [...list].sort((a, b) => {
      const va = get(a), vb = get(b)
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir
      return String(va).localeCompare(String(vb), "es", { numeric: true, sensitivity: "base" }) * dir
    })
  }

  // ── Agrupar por cotización ─────────────────────────────────────────────────
  const visibleItems = items.filter(passesFilter)
  const byQuote: Record<string, { quote_name: string; items: EgresoItem[] }> = {}
  for (const item of visibleItems) {
    if (!byQuote[item.quote_id]) byQuote[item.quote_id] = { quote_name: item.quote_name, items: [] }
    byQuote[item.quote_id].items.push(item)
  }
  for (const k of Object.keys(byQuote)) byQuote[k].items = sortItems(byQuote[k].items)
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

      {/* Summary cards + Facturar todos */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 12, flex: 1 }}>
          <SummaryCard label="Total egresos"  value={fmt(totalGlobal)}     color="#f87171" />
          <SummaryCard label="Ítems"          value={String(items.length)} color="#94a3b8" />
          <SummaryCard label="Cotizaciones"   value={String(quoteCount)}   color="#94a3b8" />
        </div>
        <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", gap: 8, flexShrink: 0 }}>
          <button
            onClick={sendAllBilling}
            disabled={sendingAll}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "10px 18px", borderRadius: 10, cursor: sendingAll ? "not-allowed" : "pointer",
              background: sendingAll ? "rgba(6,182,212,0.06)" : "rgba(6,182,212,0.12)",
              border: "1px solid rgba(6,182,212,0.30)", color: "#67e8f9",
              fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
              opacity: sendingAll ? 0.6 : 1,
            }}
          >
            {sendingAll ? "⏳ Enviando..." : "✉ Facturar todos"}
          </button>
        </div>
      </div>

      {/* Filtros de estatus */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {([
          ["todo", "Todo"],
          ["por_pagar", "Por Pagar"],
          ["pagados", "Pagados"],
          ["anticipos", "Anticipos"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            style={{
              padding: "7px 16px", borderRadius: 999, fontSize: 12, fontWeight: 600,
              cursor: "pointer",
              border: statusFilter === key ? "1px solid rgba(167,139,250,0.45)" : "1px solid rgba(148,163,184,0.18)",
              background: statusFilter === key ? "rgba(167,139,250,0.14)" : "transparent",
              color: statusFilter === key ? "#c4b5fd" : "#94a3b8",
            }}
          >
            {label}
          </button>
        ))}
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
              <table style={{ ...tableStyle, width: isMobile ? "100%" : "auto" }}>
                <thead>
                  <tr>
                    {([
                      ["Sección", "section", "left", undefined],
                      ["Rubro / Concepto", "desc", "left", 170],
                      ["Proveedor / Empleado", "supplier", "left", 150],
                      ["P. Unitario", "price", "right", undefined],
                      ["Monto", "monto", "right", undefined],
                      ["Status", "status", "left", undefined],
                      ["", null, "left", undefined],
                    ] as [string, string | null, "left" | "right", number | undefined][]).map(([h, key, align, maxW], i) => (
                      <th
                        key={i}
                        onClick={key ? () => toggleSort(key) : undefined}
                        style={{
                          ...thStyle,
                          textAlign: align,
                          cursor: key ? "pointer" : "default",
                          userSelect: "none",
                          color: key && sortKey === key ? "#a78bfa" : thStyle.color,
                          whiteSpace: "nowrap",
                          ...(maxW ? { maxWidth: maxW } : {}),
                        }}
                      >
                        {h}{key && sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                      </th>
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
                          <td style={{ ...tdStyle, color: "#e2e8f0", wordBreak: "break-word" }}>
                            {item.description}
                          </td>
                          {/* Selector proveedor */}
                          <td style={tdStyle}>
                            <SupplierCombobox
                              value={editState.contact}
                              onChange={val => setEditState(s => ({ ...s, contact: val }))}
                              proveedores={proveedores}
                              employees={employees}
                            />
                          </td>
                          {/* Inputs qty × días × precio compactos */}
                          <td style={tdStyle}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <input type="number" value={editState.qty}
                                onChange={e => setEditState(s => ({ ...s, qty: e.target.value }))}
                                placeholder={String(qty)} title="Cantidad" style={{ ...editInputStyle, width: 38 }} />
                              <span style={{ color: "#475569", fontSize: 11 }}>×</span>
                              <input type="number" value={editState.days}
                                onChange={e => setEditState(s => ({ ...s, days: e.target.value }))}
                                placeholder={String(days)} title="Días" style={{ ...editInputStyle, width: 38 }} />
                              <span style={{ color: "#475569", fontSize: 11 }}>×</span>
                              <input type="number" value={editState.unit_price}
                                onChange={e => setEditState(s => ({ ...s, unit_price: e.target.value }))}
                                placeholder={String(price)} title="Precio unitario" style={{ ...editInputStyle, width: 70 }} />
                            </div>
                          </td>
                          {/* Preview monto */}
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#f87171", fontFamily: "monospace" }}>
                            {fmt(previewMonto)}
                          </td>
                          {/* Fecha de pago (solo anticipo/comprobación) */}
                          <td style={tdStyle}>
                            {(item.pago_modo === "anticipo" || item.pago_modo === "comprobacion") && (
                              <input
                                type="date"
                                value={editState.fecha_pago}
                                onChange={e => setEditState(s => ({ ...s, fecha_pago: e.target.value }))}
                                title="Fecha de pago"
                                style={{ ...editInputStyle, width: 130 }}
                              />
                            )}
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
                        <td style={{ ...tdStyle, color: "#e2e8f0", maxWidth: 170, wordBreak: "break-word", whiteSpace: "normal" }}>
                          {item.description}
                        </td>
                        <td style={{ ...tdStyle, maxWidth: 150, whiteSpace: "normal" }}>
                          {item.supplierType === "none" ? (
                            <span style={{ color: "#475569", fontSize: 12, fontStyle: "italic" }}>Sin asignar</span>
                          ) : (
                            <span style={{ ...supplierBadgeStyle(item.supplierType), whiteSpace: "normal", wordBreak: "break-word" }}>
                              {item.supplierType === "empleado" ? "👤 " : "🏢 "}
                              {item.supplierLabel}
                            </span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", color: "#94a3b8", fontFamily: "monospace", fontSize: 12 }}>{fmt(price)}</td>
                        <td style={{ ...tdStyle, textAlign: "right", color: "#f87171", fontWeight: 600, fontFamily: "monospace" }}>{fmt(monto)}</td>
                        <td style={tdStyle}>
                          {(() => {
                            const st = egresoStatus(item)
                            return (
                              <span style={{
                                display: "inline-flex", alignItems: "center", gap: 5,
                                padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                                color: st.color, background: `${st.color}1f`, border: `1px solid ${st.color}55`,
                              }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: st.color, display: "inline-block" }} />
                                {st.label}
                              </span>
                            )
                          })()}
                        </td>
                        <td style={tdStyle}>
                          <div style={actionGridStyle}>
                            {/* Columna izquierda: pagos */}
                            <div style={actionColStyle}>
                              {item.pago_estado === "pagado" ? (
                                <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                                  <span style={paidBadgeStyle} title={item.pago_fecha ? `Pago realizado el ${fechaCorta(item.pago_fecha)}` : item.pago_tipo === "anticipo" ? "Pagado por anticipo" : "Comprobación pagada"}>
                                    ✓ Pagado{item.pago_tipo === "anticipo" ? " (Ant.)" : item.pago_tipo === "comprobacion" ? " (Comp.)" : ""}
                                  </span>
                                  {item.pago_fecha && (
                                    <span style={{ fontSize: 10, color: "#64748b", whiteSpace: "nowrap" }}>📅 {fechaCorta(item.pago_fecha)}</span>
                                  )}
                                </span>
                              ) : item.pago_modo === "anticipo" && item.supplierType !== "none" ? (
                                <button onClick={() => openPay(item, "anticipo")} style={payAnticipoBtnStyle}>💵 Pagar Anticipo</button>
                              ) : item.pago_modo === "comprobacion" && item.supplierType !== "none" ? (
                                <>
                                  <span style={pendienteBadgeStyle}>⚠ Pendiente Cierre</span>
                                  <button onClick={() => openPay(item, "comprobacion")} style={payCompBtnStyle}>🧾 Pagar Comprob.</button>
                                </>
                              ) : null}
                            </div>

                            {/* Columna derecha: facturar + editar */}
                            <div style={actionColStyle}>
                              {item.supplierType === "proveedor" && (
                                <button
                                  onClick={() => sendBilling(item, monto)}
                                  disabled={sendingBilling === item.id}
                                  title={item.billing_sent_at ? "Volver a enviar instrucciones de facturación" : "Enviar instrucciones de facturación"}
                                  style={{
                                    ...editBtnStyle,
                                    background: sendingBilling === item.id ? "rgba(6,182,212,0.08)" : "rgba(6,182,212,0.10)",
                                    border: "1px solid rgba(6,182,212,0.25)",
                                    color: "#67e8f9",
                                    opacity: sendingBilling === item.id ? 0.6 : 1,
                                  }}
                                >
                                  {sendingBilling === item.id ? "…" : item.billing_sent_at ? "✉ Reenviar" : "✉ Facturar"}
                                </button>
                              )}
                              <button onClick={() => startEdit(item)} style={editBtnStyle}>✎ Editar</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "1px solid rgba(148,163,184,0.14)" }}>
                    <td colSpan={4} style={{ ...tdStyle, color: "#64748b", fontSize: 12, paddingTop: 10 }}>
                      {qItems.length} rubro{qItems.length !== 1 ? "s" : ""}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#f87171", fontFamily: "monospace", paddingTop: 10 }}>
                      {fmt(quoteTotal)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })}

      {/* Modal de pago (anticipo / comprobación) */}
      {payModal && (
        <div style={payOverlayStyle} onClick={() => !paying && setPayModal(null)}>
          <div style={payPanelStyle} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: payModal.tipo === "anticipo" ? "#34d399" : "#fbbf24" }}>
              {payModal.tipo === "anticipo" ? "Pagar anticipo" : "Pagar comprobación"}
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 15, fontWeight: 700, color: "#f8fafc" }}>{payModal.item.description}</p>
            <p style={{ margin: "2px 0 16px", fontSize: 12, color: "#94a3b8" }}>{payModal.item.supplierLabel}</p>

            <label style={payLabelStyle}>
              {payModal.tipo === "comprobacion" ? "Monto real comprobado" : "Monto del pago"}
            </label>
            <input type="number" value={payMonto} onChange={(e) => setPayMonto(e.target.value)} style={payInputStyle} />
            {payModal.tipo === "comprobacion" && (() => {
              const original = montoEgreso(payModal.item)
              const real = parseFloat(payMonto) || 0
              const reembolso = real - original
              return (
                <>
                  <p style={{ margin: "6px 0 0", fontSize: 11, color: "#64748b" }}>
                    Monto registrado originalmente: {fmt(original)}
                  </p>
                  {reembolso > 0 && (
                    <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(96,165,250,0.10)", border: "1px solid rgba(96,165,250,0.3)" }}>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#93c5fd", textTransform: "uppercase", letterSpacing: 0.4 }}>Monto a reembolsar</p>
                      <p style={{ margin: "3px 0 0", fontSize: 16, fontWeight: 700, color: "#bfdbfe", fontFamily: "monospace" }}>{fmt(reembolso)}</p>
                      <p style={{ margin: "4px 0 0", fontSize: 11, color: "#64748b" }}>
                        El pago original de {fmt(original)} queda registrado. Se generará una línea de reembolso por la diferencia con {payModal.item.supplierLabel}.
                      </p>
                    </div>
                  )}
                </>
              )
            })()}

            <label style={{ ...payLabelStyle, marginTop: 14 }}>Fecha en que se realizó el pago *</label>
            <input
              type="date"
              value={payFecha}
              max={hoyMx}
              onChange={(e) => setPayFecha(e.target.value)}
              style={payInputStyle}
            />
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#64748b" }}>
              El día real del pago (puede ser antes de hoy), no la fecha en que lo registras.
            </p>

            <label style={{ ...payLabelStyle, marginTop: 14 }}>¿De dónde salió el pago? *</label>
            <select value={payForma} onChange={(e) => setPayForma(e.target.value)} style={payInputStyle}>
              <option value="">Selecciona…</option>
              <option value="Retro Studio">Retro Studio</option>
              <option value="Retro Films">Retro Films</option>
              <option value="Konfio">Konfio</option>
              <option value="Banregio">Banregio</option>
              <option value="Efectivo">Efectivo</option>
            </select>

            {payModal.tipo === "anticipo" && (
              <>
                <label style={{ ...payLabelStyle, marginTop: 14 }}>Factura XML (CFDI) *</label>
                <input type="file" accept=".xml,text/xml" onChange={(e) => setPayXml(e.target.files?.[0] || null)} style={payFileStyle} />
                <label style={{ ...payLabelStyle, marginTop: 12 }}>Factura PDF *</label>
                <input type="file" accept=".pdf,application/pdf" onChange={(e) => setPayPdf(e.target.files?.[0] || null)} style={payFileStyle} />
              </>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setPayModal(null)} disabled={paying} style={payCancelStyle}>Cancelar</button>
              <button onClick={submitPay} disabled={paying} style={{ ...payConfirmStyle, opacity: paying ? 0.6 : 1 }}>
                {paying ? "Procesando…" : "✓ Registrar pago"}
              </button>
            </div>
          </div>
        </div>
      )}
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
  borderBottom: "1px solid rgba(148,163,184,0.12)", background: "rgba(255,255,255,0.025)",
}
const tdStyle: React.CSSProperties = { padding: "9px 12px", fontSize: 13, color: "#cbd5e1", verticalAlign: "middle" }

const editInputStyle: React.CSSProperties = {
  width: "100%", maxWidth: 90, boxSizing: "border-box", padding: "4px 6px", borderRadius: 6,
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
  width: "100%", boxSizing: "border-box", textAlign: "center",
  padding: "4px 10px", borderRadius: 6,
  border: "1px solid rgba(148,163,184,0.18)", background: "rgba(255,255,255,0.04)",
  color: "#94a3b8", cursor: "pointer", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
}

const actionStackStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "stretch", gap: 5,
  width: "100%", maxWidth: 160, margin: "0 auto",
}

const actionGridStyle: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, alignItems: "start",
  minWidth: 280,
}
const actionColStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 5,
}

const sentBadgeStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", textAlign: "center",
  padding: "4px 10px", borderRadius: 6,
  border: "1px solid rgba(52,211,153,0.24)", background: "rgba(52,211,153,0.10)",
  color: "#34d399", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
  cursor: "default",
}

const payBtnBase: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", textAlign: "center",
  padding: "4px 10px", borderRadius: 6, cursor: "pointer",
  fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
}
const payAnticipoBtnStyle: React.CSSProperties = {
  ...payBtnBase,
  border: "1px solid rgba(52,211,153,0.3)", background: "rgba(52,211,153,0.12)", color: "#34d399",
}
const payCompBtnStyle: React.CSSProperties = {
  ...payBtnBase,
  border: "1px solid rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.12)", color: "#fbbf24",
}
const pendienteBadgeStyle: React.CSSProperties = {
  ...payBtnBase,
  cursor: "default",
  border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.12)", color: "#fca5a5",
}
const paidBadgeStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", textAlign: "center",
  padding: "4px 10px", borderRadius: 6,
  border: "1px solid rgba(52,211,153,0.35)", background: "rgba(52,211,153,0.16)",
  color: "#34d399", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", cursor: "default",
}

const payOverlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 1000010,
  background: "rgba(2,6,23,0.78)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
}
const payPanelStyle: React.CSSProperties = {
  width: "100%", maxWidth: 400,
  background: "linear-gradient(160deg,#0d1b2e,#0f172a)",
  border: "1px solid rgba(148,163,184,0.16)", borderRadius: 16,
  padding: "22px 22px 18px", boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
}
const payLabelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, textTransform: "uppercase",
  letterSpacing: 0.5, color: "#64748b", marginBottom: 6,
}
const payInputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", background: "rgba(2,6,23,0.55)",
  border: "1px solid rgba(148,163,184,0.22)", borderRadius: 10, color: "#e2e8f0",
  fontSize: 14, boxSizing: "border-box", outline: "none",
}
const payFileStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", background: "rgba(2,6,23,0.55)",
  border: "1px dashed rgba(148,163,184,0.3)", borderRadius: 10, color: "#94a3b8",
  fontSize: 12, boxSizing: "border-box",
}
const payCancelStyle: React.CSSProperties = {
  padding: "9px 16px", borderRadius: 10, border: "1px solid rgba(148,163,184,0.22)",
  background: "transparent", color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer",
}
const payConfirmStyle: React.CSSProperties = {
  padding: "9px 16px", borderRadius: 10, border: "1px solid rgba(52,211,153,0.4)",
  background: "rgba(52,211,153,0.16)", color: "#34d399", fontSize: 13, fontWeight: 700, cursor: "pointer",
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
      displayText = `${empNick(e)} · ${e.puesto}`
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
    return `${e.nombre} ${ap} ${e.nickname ?? ""} ${e.puesto}`.toLowerCase().includes(q)
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
                return (
                  <div key={e.id}
                    onMouseDown={() => { onChange(`emp:${e.id}`); setOpen(false); setQuery("") }}
                    style={{ padding: "7px 12px", cursor: "pointer" }}>
                    <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 500 }}>{empNick(e)}</div>
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
    whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis",
  }
}
