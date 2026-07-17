"use client"
import { PageLoader } from "../../components/PageLoader"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import { requireSessionProfile } from "../../lib/session-profile"
import { AppSidebar } from "../../components/AppSidebar"

// ─── Types ────────────────────────────────────────────────────────────────────

type Empresa = "retro_studio" | "retro_films"
type Tab = Empresa | "combinado"

type FlujoConfig = {
  id: string
  empresa: Empresa
  saldo_inicial: number
  fecha_corte: string
  saldo_minimo: number
}

type FlujoFijo = {
  id: string
  empresa: Empresa
  concepto: string
  monto: number
  tipo: "ingreso" | "egreso"
  recurrencia: "mensual" | "quincenal" | "semanal"
  dia: number | null
  activo: boolean
}

type FlujoMov = {
  id: string
  empresa: Empresa
  fecha: string
  concepto: string
  monto: number
  tipo: "ingreso" | "egreso"
  notas: string | null
}

// Evento del flujo (cualquier fuente, normalizado)
type Evento = {
  fecha: string            // YYYY-MM-DD (los atrasados se recorren a hoy)
  fechaOriginal: string
  atrasado: boolean
  empresa: Empresa
  tipo: "ingreso" | "egreso"
  monto: number            // siempre positivo; el tipo define el signo
  concepto: string
  fuente: "cobro" | "factura" | "fijo" | "manual"
  movId?: string           // para poder borrar manuales desde el detalle
}

const EMPRESA_LABEL: Record<Empresa, string> = {
  retro_studio: "Retro Studio",
  retro_films: "Retro Films",
}

const FUENTE_META: Record<Evento["fuente"], { label: string; color: string }> = {
  cobro:   { label: "Cobro cliente",   color: "#4ade80" },
  factura: { label: "Pago proveedor",  color: "#f87171" },
  fijo:    { label: "Gasto fijo",      color: "#fbbf24" },
  manual:  { label: "Manual",          color: "#93c5fd" },
}

const HORIZONTE_SEMANAS = 12

// ─── Date helpers (todo en local, formato YYYY-MM-DD) ─────────────────────────

const toISO = (d: Date) => d.toLocaleDateString("sv")
const todayISO = () => toISO(new Date())

function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function addDays(iso: string, n: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

// Lunes de la semana de una fecha
function mondayOf(iso: string): string {
  const d = parseISO(iso)
  const dow = (d.getDay() + 6) % 7 // 0=Lun … 6=Dom
  d.setDate(d.getDate() - dow)
  return toISO(d)
}

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

function fmtDia(iso: string): string {
  const d = parseISO(iso)
  return `${DIAS_CORTOS[d.getDay()]} ${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`
}

function fmtRangoSemana(lunesISO: string): string {
  const a = parseISO(lunesISO)
  const b = parseISO(addDays(lunesISO, 6))
  const mesA = MESES_CORTOS[a.getMonth()]
  const mesB = MESES_CORTOS[b.getMonth()]
  return mesA === mesB
    ? `${a.getDate()}–${b.getDate()} ${mesA} ${b.getFullYear()}`
    : `${a.getDate()} ${mesA} – ${b.getDate()} ${mesB} ${b.getFullYear()}`
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n)

// Ocurrencias de un gasto fijo dentro del horizonte
function ocurrenciasFijo(f: FlujoFijo, desde: string, hasta: string): string[] {
  const out: string[] = []
  let d = parseISO(desde)
  const end = parseISO(hasta)
  while (d <= end) {
    const dom = d.getDate()
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    const isoDow = ((d.getDay() + 6) % 7) + 1 // 1=Lun … 7=Dom
    let hit = false
    if (f.recurrencia === "mensual") {
      const target = Math.min(f.dia || 1, lastDay)
      hit = dom === target
    } else if (f.recurrencia === "quincenal") {
      hit = dom === 15 || dom === Math.min(30, lastDay)
    } else if (f.recurrencia === "semanal") {
      hit = isoDow === (f.dia || 5)
    }
    if (hit) out.push(toISO(d))
    d.setDate(d.getDate() + 1)
  }
  return out
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FlujoPage() {
  const [profile, setProfile] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const [tab, setTab] = useState<Tab>("retro_studio")
  const [configs, setConfigs] = useState<FlujoConfig[]>([])
  const [fijos, setFijos] = useState<FlujoFijo[]>([])
  const [movs, setMovs] = useState<FlujoMov[]>([])
  const [eventosAuto, setEventosAuto] = useState<Evento[]>([])
  const [sinFecha, setSinFecha] = useState<{ count: number; total: number }>({ count: 0, total: 0 })

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editingConfig, setEditingConfig] = useState(false)
  const [configForm, setConfigForm] = useState({ saldo: "", minimo: "", corte: "" })

  const [showMovModal, setShowMovModal] = useState(false)
  const [movForm, setMovForm] = useState({ empresa: "retro_studio" as Empresa, fecha: todayISO(), concepto: "", monto: "", tipo: "egreso" as "ingreso" | "egreso" })
  const [showFijoModal, setShowFijoModal] = useState(false)
  const [fijoForm, setFijoForm] = useState({ empresa: "retro_studio" as Empresa, concepto: "", monto: "", tipo: "egreso" as "ingreso" | "egreso", recurrencia: "mensual" as FlujoFijo["recurrencia"], dia: "1" })
  const [showFijosPanel, setShowFijosPanel] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768) }
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  useEffect(() => { loadPage() }, [])

  async function loadPage() {
    const auth = await requireSessionProfile()
    if (!auth) return
    if (!["admin", "finanzas"].includes(auth.profile.role)) { window.location.href = "/"; return }
    setProfile(auth.profile)
    setUser(auth.session.user)

    const hoy = todayISO()

    const [
      { data: cfg },
      { data: fj },
      { data: mv },
      { data: ing },
      { data: fac },
    ] = await Promise.all([
      supabase.from("flujo_config").select("*"),
      supabase.from("flujo_fijos").select("*").order("created_at"),
      supabase.from("flujo_movimientos").select("*").order("fecha"),
      supabase.from("ingresos").select("id, empresa, estatus, cliente_agencia, proyecto, subtotal, iva, fecha_aprox_pago, fecha_pago").neq("estatus", "pagado"),
      supabase.from("facturas").select("id, subtotal, status, fecha_pago, concepto, proveedores(nombre, apellido, empresa), projects(empresa, name, code)").eq("status", "aceptada"),
    ])

    setConfigs((cfg || []) as FlujoConfig[])
    setFijos((fj || []) as FlujoFijo[])
    setMovs((mv || []) as FlujoMov[])

    // ── Cobros esperados (ingresos no pagados, monto con IVA) ────────────────
    const evts: Evento[] = []
    let sfCount = 0, sfTotal = 0
    for (const r of (ing || []) as any[]) {
      const monto = Number(r.subtotal || 0) + Number(r.iva || 0)
      if (monto === 0) continue
      const fecha = (r.fecha_pago || r.fecha_aprox_pago || "").split("T")[0]
      if (!fecha) { sfCount++; sfTotal += monto; continue }
      const atrasado = fecha < hoy
      evts.push({
        fecha: atrasado ? hoy : fecha,
        fechaOriginal: fecha,
        atrasado,
        empresa: (r.empresa === "retro_films" ? "retro_films" : "retro_studio"),
        tipo: "ingreso",
        monto,
        concepto: `${r.cliente_agencia} · ${r.proyecto}`,
        fuente: "cobro",
      })
    }
    setSinFecha({ count: sfCount, total: sfTotal })

    // ── Pagos a proveedores (facturas aceptadas, monto con IVA) ──────────────
    for (const f of (fac || []) as any[]) {
      const monto = Number(f.subtotal || 0) * 1.16
      if (monto === 0) continue
      const fecha = (f.fecha_pago || "").split("T")[0]
      if (!fecha) continue
      const atrasado = fecha < hoy
      const prov = f.proveedores
      const provLabel = prov ? (prov.empresa || `${prov.nombre} ${prov.apellido}`) : "Proveedor"
      const projEmpresa: Empresa = f.projects?.empresa === "retro_films" ? "retro_films" : "retro_studio"
      evts.push({
        fecha: atrasado ? hoy : fecha,
        fechaOriginal: fecha,
        atrasado,
        empresa: projEmpresa,
        tipo: "egreso",
        monto,
        concepto: `${provLabel}${f.projects ? ` · ${f.projects.code || ""} ${f.projects.name || ""}`.trimEnd() : ""}`,
        fuente: "factura",
      })
    }
    setEventosAuto(evts)
    setLoading(false)
  }

  // ── Construcción del flujo ──────────────────────────────────────────────────

  const hoy = todayISO()
  const finHorizonte = addDays(hoy, HORIZONTE_SEMANAS * 7)

  const flujo = useMemo(() => {
    const filtra = (e: Empresa) => tab === "combinado" || tab === e

    const evts: Evento[] = [...eventosAuto.filter(e => filtra(e.empresa))]

    // Gastos fijos → ocurrencias
    for (const f of fijos) {
      if (!f.activo || !filtra(f.empresa)) continue
      for (const fecha of ocurrenciasFijo(f, hoy, finHorizonte)) {
        evts.push({
          fecha, fechaOriginal: fecha, atrasado: false,
          empresa: f.empresa, tipo: f.tipo, monto: Number(f.monto || 0),
          concepto: f.concepto, fuente: "fijo",
        })
      }
    }

    // Movimientos manuales
    for (const m of movs) {
      if (!filtra(m.empresa)) continue
      const atrasado = m.fecha < hoy
      // Manuales pasados: ya no cuentan si son de antes de hoy? Los mostramos hoy como atrasados solo si son de esta semana hacia atrás… mejor: los futuros y hoy cuentan; los pasados se ignoran (ya sucedieron y deberían estar en el saldo).
      if (m.fecha < hoy) continue
      evts.push({
        fecha: m.fecha, fechaOriginal: m.fecha, atrasado,
        empresa: m.empresa, tipo: m.tipo, monto: Number(m.monto || 0),
        concepto: m.concepto, fuente: "manual", movId: m.id,
      })
    }

    // Agrupar por día
    const porDia = new Map<string, Evento[]>()
    for (const e of evts) {
      if (e.fecha > finHorizonte) continue
      if (!porDia.has(e.fecha)) porDia.set(e.fecha, [])
      porDia.get(e.fecha)!.push(e)
    }

    const dias = [...porDia.keys()].sort()

    // Saldo inicial según tab
    const saldoInicial = configs
      .filter(c => tab === "combinado" || c.empresa === tab)
      .reduce((s, c) => s + Number(c.saldo_inicial || 0), 0)
    const saldoMinimo = configs
      .filter(c => tab === "combinado" || c.empresa === tab)
      .reduce((s, c) => s + Number(c.saldo_minimo || 0), 0)

    // Recorrido con saldo corrido + agrupado por semana
    type Dia = { fecha: string; entradas: number; salidas: number; neto: number; saldo: number; eventos: Evento[]; alerta: boolean }
    type Semana = { lunes: string; dias: Dia[]; entradas: number; salidas: number; neto: number; saldoCierre: number; alerta: boolean }

    let saldo = saldoInicial
    const semanas: Semana[] = []
    let semanaActual: Semana | null = null

    for (const fecha of dias) {
      const evs = porDia.get(fecha)!
      const entradas = evs.filter(e => e.tipo === "ingreso").reduce((s, e) => s + e.monto, 0)
      const salidas = evs.filter(e => e.tipo === "egreso").reduce((s, e) => s + e.monto, 0)
      const neto = entradas - salidas
      saldo += neto
      const dia: Dia = { fecha, entradas, salidas, neto, saldo, eventos: evs, alerta: saldo < saldoMinimo }

      const lunes = mondayOf(fecha)
      if (!semanaActual || semanaActual.lunes !== lunes) {
        semanaActual = { lunes, dias: [], entradas: 0, salidas: 0, neto: 0, saldoCierre: saldo, alerta: false }
        semanas.push(semanaActual)
      }
      semanaActual.dias.push(dia)
      semanaActual.entradas += entradas
      semanaActual.salidas += salidas
      semanaActual.neto += neto
      semanaActual.saldoCierre = saldo
      if (dia.alerta) semanaActual.alerta = true
    }

    return { semanas, saldoInicial, saldoMinimo, saldoFinal: saldo }
  }, [eventosAuto, fijos, movs, configs, tab, hoy, finHorizonte])

  // ── Config (saldo inicial) ──────────────────────────────────────────────────

  const cfgActual = tab !== "combinado" ? configs.find(c => c.empresa === tab) : null

  function startEditConfig() {
    if (!cfgActual) return
    setConfigForm({
      saldo: String(cfgActual.saldo_inicial ?? 0),
      minimo: String(cfgActual.saldo_minimo ?? 0),
      corte: cfgActual.fecha_corte || todayISO(),
    })
    setEditingConfig(true)
  }

  async function saveConfig() {
    if (!cfgActual) return
    setSaving(true)
    const { error } = await supabase.from("flujo_config").update({
      saldo_inicial: parseFloat(configForm.saldo) || 0,
      saldo_minimo: parseFloat(configForm.minimo) || 0,
      fecha_corte: configForm.corte || todayISO(),
      updated_at: new Date().toISOString(),
    }).eq("id", cfgActual.id)
    setSaving(false)
    if (error) { alert(error.message); return }
    setConfigs(prev => prev.map(c => c.id === cfgActual.id
      ? { ...c, saldo_inicial: parseFloat(configForm.saldo) || 0, saldo_minimo: parseFloat(configForm.minimo) || 0, fecha_corte: configForm.corte }
      : c))
    setEditingConfig(false)
  }

  // ── Movimientos manuales ────────────────────────────────────────────────────

  async function saveMov() {
    if (!movForm.concepto.trim() || !(parseFloat(movForm.monto) > 0)) { alert("Concepto y monto son obligatorios."); return }
    setSaving(true)
    const { data, error } = await supabase.from("flujo_movimientos").insert({
      empresa: movForm.empresa, fecha: movForm.fecha, concepto: movForm.concepto.trim(),
      monto: parseFloat(movForm.monto) || 0, tipo: movForm.tipo,
    }).select("*").single()
    setSaving(false)
    if (error) { alert(error.message); return }
    setMovs(prev => [...prev, data as FlujoMov])
    setShowMovModal(false)
    setMovForm({ empresa: tab === "retro_films" ? "retro_films" : "retro_studio", fecha: todayISO(), concepto: "", monto: "", tipo: "egreso" })
  }

  async function deleteMov(id: string) {
    if (!confirm("¿Eliminar este movimiento?")) return
    await supabase.from("flujo_movimientos").delete().eq("id", id)
    setMovs(prev => prev.filter(m => m.id !== id))
  }

  // ── Gastos fijos ────────────────────────────────────────────────────────────

  async function saveFijo() {
    if (!fijoForm.concepto.trim() || !(parseFloat(fijoForm.monto) > 0)) { alert("Concepto y monto son obligatorios."); return }
    setSaving(true)
    const { data, error } = await supabase.from("flujo_fijos").insert({
      empresa: fijoForm.empresa, concepto: fijoForm.concepto.trim(), monto: parseFloat(fijoForm.monto) || 0,
      tipo: fijoForm.tipo, recurrencia: fijoForm.recurrencia,
      dia: fijoForm.recurrencia === "quincenal" ? null : (parseInt(fijoForm.dia) || 1),
    }).select("*").single()
    setSaving(false)
    if (error) { alert(error.message); return }
    setFijos(prev => [...prev, data as FlujoFijo])
    setShowFijoModal(false)
    setFijoForm({ empresa: tab === "retro_films" ? "retro_films" : "retro_studio", concepto: "", monto: "", tipo: "egreso", recurrencia: "mensual", dia: "1" })
  }

  async function toggleFijo(f: FlujoFijo) {
    await supabase.from("flujo_fijos").update({ activo: !f.activo, updated_at: new Date().toISOString() }).eq("id", f.id)
    setFijos(prev => prev.map(x => x.id === f.id ? { ...x, activo: !x.activo } : x))
  }

  async function deleteFijo(id: string) {
    if (!confirm("¿Eliminar este gasto fijo?")) return
    await supabase.from("flujo_fijos").delete().eq("id", id)
    setFijos(prev => prev.filter(f => f.id !== id))
  }

  function fijoRecLabel(f: FlujoFijo): string {
    if (f.recurrencia === "mensual") return `Mensual · día ${f.dia || 1}`
    if (f.recurrencia === "quincenal") return "Quincenal · 15 y 30"
    const dias = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
    return `Semanal · ${dias[f.dia || 5]}`
  }

  function toggleDay(fecha: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(fecha)) next.delete(fecha); else next.add(fecha)
      return next
    })
  }

  if (loading || !profile) return <PageLoader />

  const fijosVisibles = fijos.filter(f => tab === "combinado" || f.empresa === tab)

  return (
    <div style={layoutStyle}>
      <AppSidebar
        profile={profile} user={user} isAdmin={profile?.role === "admin"} isMobile={isMobile}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen(v => !v)}
        onMenuClose={() => setMenuOpen(false)}
        onLogout={async () => { await supabase.auth.signOut(); window.location.href = "/login" }}
      />

      <main style={mainStyle(isMobile)}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#f1f5f9" }}>📊 Flujo de Caja</h1>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b" }}>
              Planeación día a día · cobros esperados vs pagos programados · próximas {HORIZONTE_SEMANAS} semanas
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => { setFijoForm(f => ({ ...f, empresa: tab === "retro_films" ? "retro_films" : "retro_studio" })); setShowFijoModal(true) }} style={secondaryBtnStyle}>+ Gasto fijo</button>
            <button onClick={() => setShowFijosPanel(v => !v)} style={secondaryBtnStyle}>⚙ Fijos ({fijosVisibles.length})</button>
            <button onClick={() => { setMovForm(m => ({ ...m, empresa: tab === "retro_films" ? "retro_films" : "retro_studio", fecha: todayISO() })); setShowMovModal(true) }} style={primaryBtnStyle}>+ Movimiento</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          {(["retro_studio", "retro_films", "combinado"] as Tab[]).map(t => (
            <button key={t} onClick={() => { setTab(t); setEditingConfig(false) }}
              style={{ ...tabStyle, ...(tab === t ? tabActiveStyle : {}) }}>
              {t === "combinado" ? "◎ Combinado" : EMPRESA_LABEL[t as Empresa]}
            </button>
          ))}
        </div>

        {/* Saldo / config */}
        <div style={configCardStyle}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={cardLabelStyle}>Saldo inicial {tab === "combinado" ? "(ambas empresas)" : `· ${EMPRESA_LABEL[tab as Empresa]}`}</p>
            {editingConfig && cfgActual ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
                <input type="number" value={configForm.saldo} onChange={e => setConfigForm(f => ({ ...f, saldo: e.target.value }))} style={{ ...inputStyle, width: 160 }} placeholder="Saldo" />
                <label style={{ fontSize: 11, color: "#64748b" }}>Mínimo alerta:</label>
                <input type="number" value={configForm.minimo} onChange={e => setConfigForm(f => ({ ...f, minimo: e.target.value }))} style={{ ...inputStyle, width: 120 }} placeholder="Mínimo" />
                <label style={{ fontSize: 11, color: "#64748b" }}>Corte:</label>
                <input type="date" value={configForm.corte} onChange={e => setConfigForm(f => ({ ...f, corte: e.target.value }))} style={{ ...inputStyle, width: 150, colorScheme: "dark" }} />
                <button onClick={saveConfig} disabled={saving} style={miniPrimaryBtnStyle}>{saving ? "…" : "✓ Guardar"}</button>
                <button onClick={() => setEditingConfig(false)} style={miniBtnStyle}>Cancelar</button>
              </div>
            ) : (
              <p style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 700, fontFamily: "monospace", color: "#f8fafc" }}>
                {fmt(flujo.saldoInicial)}
                {tab !== "combinado" && (
                  <button onClick={startEditConfig} style={{ ...miniBtnStyle, marginLeft: 12, verticalAlign: "middle" }}>✎ Editar</button>
                )}
              </p>
            )}
            {tab !== "combinado" && cfgActual && !editingConfig && (
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#475569" }}>
                Corte: {cfgActual.fecha_corte} · Alerta si baja de {fmt(Number(cfgActual.saldo_minimo || 0))}
              </p>
            )}
            {tab === "combinado" && (
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#475569" }}>El saldo se edita en el tab de cada empresa.</p>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={cardLabelStyle}>Saldo proyectado al final ({HORIZONTE_SEMANAS} sem)</p>
            <p style={{ margin: "6px 0 0", fontSize: 26, fontWeight: 700, fontFamily: "monospace", color: flujo.saldoFinal < flujo.saldoMinimo ? "#f87171" : "#4ade80" }}>
              {fmt(flujo.saldoFinal)}
            </p>
          </div>
        </div>

        {/* Nota de ingresos sin fecha */}
        {sinFecha.count > 0 && (
          <div style={notaStyle}>
            ℹ Hay <strong>{sinFecha.count}</strong> cobro{sinFecha.count !== 1 ? "s" : ""} pendiente{sinFecha.count !== 1 ? "s" : ""} <strong>sin fecha de pago</strong> por {fmt(sinFecha.total)} que no aparece{sinFecha.count !== 1 ? "n" : ""} en el flujo.
            Ponles fecha aproximada en <Link href="/ingresos" style={{ color: "#93c5fd" }}>Ingresos</Link> para incluirlos.
          </div>
        )}

        {/* Panel de gastos fijos */}
        {showFijosPanel && (
          <div style={fijosPanelStyle}>
            <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: 0.6 }}>Gastos fijos recurrentes</p>
            {fijosVisibles.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "#475569" }}>Sin gastos fijos. Agrega nómina, renta, servicios, etc. con "+ Gasto fijo".</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {fijosVisibles.map(f => (
                  <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0", borderBottom: "1px solid rgba(148,163,184,0.07)" }}>
                    <span style={{ flex: 1, minWidth: 160, color: f.activo ? "#e2e8f0" : "#475569", fontSize: 13, fontWeight: 600, textDecoration: f.activo ? "none" : "line-through" }}>
                      {f.concepto}
                    </span>
                    <span style={{ fontSize: 11, color: "#64748b" }}>{EMPRESA_LABEL[f.empresa]}</span>
                    <span style={{ fontSize: 11, color: "#64748b" }}>{fijoRecLabel(f)}</span>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: f.tipo === "egreso" ? "#f87171" : "#4ade80" }}>
                      {f.tipo === "egreso" ? "–" : "+"}{fmt(Number(f.monto))}
                    </span>
                    <button onClick={() => toggleFijo(f)} style={miniBtnStyle}>{f.activo ? "Pausar" : "Activar"}</button>
                    <button onClick={() => deleteFijo(f.id)} style={{ ...miniBtnStyle, color: "#f87171" }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Semanas ── */}
        {flujo.semanas.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", borderRadius: 14, border: "1px dashed rgba(148,163,184,0.14)" }}>
            <p style={{ color: "#475569", fontSize: 14 }}>Sin movimientos proyectados en las próximas {HORIZONTE_SEMANAS} semanas.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {flujo.semanas.map(sem => (
              <div key={sem.lunes} style={{ ...semanaCardStyle, ...(sem.alerta ? { border: "1px solid rgba(248,113,113,0.35)" } : {}) }}>
                {/* Header semana */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>
                    Semana {fmtRangoSemana(sem.lunes)}
                    {sem.alerta && <span style={alertaBadgeStyle}>⚠ saldo bajo</span>}
                  </p>
                  <div style={{ display: "flex", gap: 16, fontSize: 12, fontFamily: "monospace", flexWrap: "wrap" }}>
                    <span style={{ color: "#4ade80" }}>+{fmt(sem.entradas)}</span>
                    <span style={{ color: "#f87171" }}>–{fmt(sem.salidas)}</span>
                    <span style={{ color: sem.neto >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>= {sem.neto >= 0 ? "+" : ""}{fmt(sem.neto)}</span>
                    <span style={{ color: "#94a3b8" }}>cierra <strong style={{ color: sem.saldoCierre < flujo.saldoMinimo ? "#f87171" : "#f8fafc" }}>{fmt(sem.saldoCierre)}</strong></span>
                  </div>
                </div>

                {/* Días */}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      {["Día", "Entradas", "Salidas", "Neto", "Saldo", ""].map((h, i) => (
                        <th key={i} style={{ ...thStyle, textAlign: i === 0 ? "left" : "right", width: i === 5 ? 30 : undefined }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sem.dias.map(dia => (
                      <FragmentoDia
                        key={dia.fecha}
                        dia={dia}
                        alertaMin={flujo.saldoMinimo}
                        expandido={expanded.has(dia.fecha)}
                        onToggle={() => toggleDay(dia.fecha)}
                        onDeleteMov={deleteMov}
                        esHoy={dia.fecha === hoy}
                        mostrarEmpresa={tab === "combinado"}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Modal movimiento manual ── */}
      {showMovModal && (
        <div style={overlayStyle}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <h2 style={modalTitleStyle}>Nuevo movimiento</h2>
            <div style={{ display: "flex", gap: 10 }}>
              {(["egreso", "ingreso"] as const).map(t => (
                <button key={t} onClick={() => setMovForm(f => ({ ...f, tipo: t }))}
                  style={{ ...toggleBtnStyle, ...(movForm.tipo === t ? (t === "egreso" ? toggleActiveRedStyle : toggleActiveGreenStyle) : {}) }}>
                  {t === "egreso" ? "– Salida" : "+ Entrada"}
                </button>
              ))}
            </div>
            <Field label="Empresa">
              <select value={movForm.empresa} onChange={e => setMovForm(f => ({ ...f, empresa: e.target.value as Empresa }))} style={inputStyle}>
                <option value="retro_studio">Retro Studio</option>
                <option value="retro_films">Retro Films</option>
              </select>
            </Field>
            <Field label="Concepto *">
              <input value={movForm.concepto} onChange={e => setMovForm(f => ({ ...f, concepto: e.target.value }))} style={inputStyle} placeholder="ej. Anticipo renta de foro" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Monto (con IVA) *">
                <input type="number" value={movForm.monto} onChange={e => setMovForm(f => ({ ...f, monto: e.target.value }))} style={inputStyle} placeholder="0.00" min={0} />
              </Field>
              <Field label="Fecha">
                <input type="date" value={movForm.fecha} onChange={e => setMovForm(f => ({ ...f, fecha: e.target.value }))} style={{ ...inputStyle, colorScheme: "dark" }} />
              </Field>
            </div>
            <div style={modalActionsStyle}>
              <button onClick={() => setShowMovModal(false)} disabled={saving} style={cancelBtnStyle}>Cancelar</button>
              <button onClick={saveMov} disabled={saving} style={confirmBtnStyle}>{saving ? "Guardando…" : "✓ Agregar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal gasto fijo ── */}
      {showFijoModal && (
        <div style={overlayStyle}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <h2 style={modalTitleStyle}>Nuevo gasto fijo</h2>
            <div style={{ display: "flex", gap: 10 }}>
              {(["egreso", "ingreso"] as const).map(t => (
                <button key={t} onClick={() => setFijoForm(f => ({ ...f, tipo: t }))}
                  style={{ ...toggleBtnStyle, ...(fijoForm.tipo === t ? (t === "egreso" ? toggleActiveRedStyle : toggleActiveGreenStyle) : {}) }}>
                  {t === "egreso" ? "– Salida" : "+ Entrada"}
                </button>
              ))}
            </div>
            <Field label="Empresa">
              <select value={fijoForm.empresa} onChange={e => setFijoForm(f => ({ ...f, empresa: e.target.value as Empresa }))} style={inputStyle}>
                <option value="retro_studio">Retro Studio</option>
                <option value="retro_films">Retro Films</option>
              </select>
            </Field>
            <Field label="Concepto *">
              <input value={fijoForm.concepto} onChange={e => setFijoForm(f => ({ ...f, concepto: e.target.value }))} style={inputStyle} placeholder="ej. Nómina · Renta oficina · Luz" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Monto (con IVA) *">
                <input type="number" value={fijoForm.monto} onChange={e => setFijoForm(f => ({ ...f, monto: e.target.value }))} style={inputStyle} placeholder="0.00" min={0} />
              </Field>
              <Field label="Recurrencia">
                <select value={fijoForm.recurrencia} onChange={e => setFijoForm(f => ({ ...f, recurrencia: e.target.value as FlujoFijo["recurrencia"] }))} style={inputStyle}>
                  <option value="mensual">Mensual</option>
                  <option value="quincenal">Quincenal (15 y 30)</option>
                  <option value="semanal">Semanal</option>
                </select>
              </Field>
            </div>
            {fijoForm.recurrencia === "mensual" && (
              <Field label="Día del mes">
                <input type="number" value={fijoForm.dia} onChange={e => setFijoForm(f => ({ ...f, dia: e.target.value }))} style={inputStyle} min={1} max={31} />
              </Field>
            )}
            {fijoForm.recurrencia === "semanal" && (
              <Field label="Día de la semana">
                <select value={fijoForm.dia} onChange={e => setFijoForm(f => ({ ...f, dia: e.target.value }))} style={inputStyle}>
                  {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((d, i) => (
                    <option key={d} value={i + 1}>{d}</option>
                  ))}
                </select>
              </Field>
            )}
            <div style={modalActionsStyle}>
              <button onClick={() => setShowFijoModal(false)} disabled={saving} style={cancelBtnStyle}>Cancelar</button>
              <button onClick={saveFijo} disabled={saving} style={confirmBtnStyle}>{saving ? "Guardando…" : "✓ Agregar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Fila de día (con detalle expandible) ─────────────────────────────────────

function FragmentoDia({ dia, alertaMin, expandido, onToggle, onDeleteMov, esHoy, mostrarEmpresa }: {
  dia: { fecha: string; entradas: number; salidas: number; neto: number; saldo: number; eventos: Evento[]; alerta: boolean }
  alertaMin: number
  expandido: boolean
  onToggle: () => void
  onDeleteMov: (id: string) => void
  esHoy: boolean
  mostrarEmpresa: boolean
}) {
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: "pointer", background: dia.alerta ? "rgba(239,68,68,0.07)" : "transparent", borderBottom: "1px solid rgba(148,163,184,0.07)" }}>
        <td style={{ ...tdStyle, fontWeight: 600, color: esHoy ? "#a78bfa" : "#e2e8f0", whiteSpace: "nowrap" }}>
          {fmtDia(dia.fecha)}{esHoy ? " · HOY" : ""}
          {dia.eventos.some(e => e.atrasado) && <span style={{ marginLeft: 6, fontSize: 10, color: "#f87171" }}>⚠ incluye atrasados</span>}
        </td>
        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: dia.entradas > 0 ? "#4ade80" : "#334155" }}>{dia.entradas > 0 ? `+${fmt(dia.entradas)}` : "—"}</td>
        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", color: dia.salidas > 0 ? "#f87171" : "#334155" }}>{dia.salidas > 0 ? `–${fmt(dia.salidas)}` : "—"}</td>
        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: dia.neto >= 0 ? "#4ade80" : "#f87171" }}>{dia.neto >= 0 ? "+" : ""}{fmt(dia.neto)}</td>
        <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: dia.saldo < alertaMin ? "#f87171" : "#f8fafc" }}>{fmt(dia.saldo)}</td>
        <td style={{ ...tdStyle, textAlign: "right", color: "#475569", fontSize: 11 }}>{expandido ? "▲" : "▼"}</td>
      </tr>
      {expandido && dia.eventos.map((e, i) => (
        <tr key={i} style={{ background: "rgba(255,255,255,0.015)", borderBottom: "1px solid rgba(148,163,184,0.05)" }}>
          <td colSpan={4} style={{ ...tdStyle, paddingLeft: 26, fontSize: 12, color: "#cbd5e1" }}>
            <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, marginRight: 8, background: `${FUENTE_META[e.fuente].color}22`, color: FUENTE_META[e.fuente].color, border: `1px solid ${FUENTE_META[e.fuente].color}44` }}>
              {FUENTE_META[e.fuente].label}
            </span>
            {e.concepto}
            {mostrarEmpresa && <span style={{ marginLeft: 8, fontSize: 10, color: "#64748b" }}>{EMPRESA_LABEL[e.empresa]}</span>}
            {e.atrasado && <span style={{ marginLeft: 8, fontSize: 10, color: "#f87171" }}>⚠ venció {fmtDia(e.fechaOriginal)}</span>}
          </td>
          <td style={{ ...tdStyle, textAlign: "right", fontFamily: "monospace", fontSize: 12, color: e.tipo === "ingreso" ? "#4ade80" : "#f87171" }}>
            {e.tipo === "ingreso" ? "+" : "–"}{fmt(e.monto)}
          </td>
          <td style={{ ...tdStyle, textAlign: "right" }}>
            {e.fuente === "manual" && e.movId && (
              <button onClick={(ev) => { ev.stopPropagation(); onDeleteMov(e.movId!) }} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 12 }}>✕</button>
            )}
          </td>
        </tr>
      ))}
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 12 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const layoutStyle: React.CSSProperties = {
  display: "flex", minHeight: "100vh",
  background: "linear-gradient(135deg, #07090f 0%, #0d1117 100%)", color: "#f8fafc",
}

const mainStyle = (isMobile: boolean): React.CSSProperties => ({
  flex: 1, padding: isMobile ? "76px 14px 40px" : "32px 36px 48px",
  maxWidth: 1200, margin: "0 auto", width: "100%", boxSizing: "border-box", minWidth: 0,
})

const tabStyle: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer",
  border: "1px solid rgba(148,163,184,0.14)", background: "transparent", color: "#94a3b8",
}

const tabActiveStyle: React.CSSProperties = {
  border: "1px solid rgba(167,139,250,0.4)", background: "rgba(124,58,237,0.15)", color: "#c4b5fd",
}

const configCardStyle: React.CSSProperties = {
  display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
  padding: "18px 22px", borderRadius: 14, marginBottom: 16,
  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(148,163,184,0.10)",
}

const cardLabelStyle: React.CSSProperties = {
  margin: 0, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, color: "#64748b",
}

const notaStyle: React.CSSProperties = {
  padding: "10px 16px", borderRadius: 10, marginBottom: 16, fontSize: 12, color: "#94a3b8",
  background: "rgba(59,130,246,0.07)", border: "1px solid rgba(96,165,250,0.2)", lineHeight: 1.6,
}

const fijosPanelStyle: React.CSSProperties = {
  padding: "16px 20px", borderRadius: 14, marginBottom: 16,
  background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.2)",
}

const semanaCardStyle: React.CSSProperties = {
  padding: "16px 20px", borderRadius: 14,
  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(148,163,184,0.10)",
}

const alertaBadgeStyle: React.CSSProperties = {
  marginLeft: 10, padding: "2px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700,
  background: "rgba(248,113,113,0.14)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171",
}

const thStyle: React.CSSProperties = {
  padding: "7px 10px", fontSize: 10, fontWeight: 700, color: "#475569",
  textTransform: "uppercase", letterSpacing: 0.6, borderBottom: "1px solid rgba(148,163,184,0.12)",
}

const tdStyle: React.CSSProperties = {
  padding: "8px 10px", fontSize: 13, color: "#cbd5e1", verticalAlign: "middle",
}

const primaryBtnStyle: React.CSSProperties = {
  padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer",
  background: "linear-gradient(135deg, rgba(124,58,237,0.85), rgba(109,40,217,0.85))",
  border: "1px solid rgba(167,139,250,0.3)", color: "#f8fafc", whiteSpace: "nowrap",
}

const secondaryBtnStyle: React.CSSProperties = {
  padding: "9px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer",
  background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.22)", color: "#cbd5e1", whiteSpace: "nowrap",
}

const miniBtnStyle: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer",
  background: "rgba(148,163,184,0.08)", border: "1px solid rgba(148,163,184,0.2)", color: "#94a3b8",
}

const miniPrimaryBtnStyle: React.CSSProperties = {
  padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer",
  background: "rgba(16,185,129,0.15)", border: "1px solid rgba(52,211,153,0.4)", color: "#34d399",
}

const inputStyle: React.CSSProperties = {
  padding: "8px 11px", borderRadius: 8, border: "1px solid rgba(148,163,184,0.14)",
  background: "rgba(255,255,255,0.04)", color: "#f8fafc", fontSize: 13, outline: "none",
  width: "100%", boxSizing: "border-box",
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
  zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
}

const modalStyle: React.CSSProperties = {
  width: "100%", maxWidth: 420, padding: "22px 24px", borderRadius: 16,
  background: "linear-gradient(160deg, #131a2e, #0c1120)", border: "1px solid rgba(148,163,184,0.16)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
}

const modalTitleStyle: React.CSSProperties = {
  margin: "0 0 14px", fontSize: 17, fontWeight: 700, color: "#f8fafc",
}

const modalActionsStyle: React.CSSProperties = {
  display: "flex", gap: 10, marginTop: 20,
}

const cancelBtnStyle: React.CSSProperties = {
  flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid rgba(148,163,184,0.14)",
  background: "transparent", color: "#94a3b8", fontSize: 13, cursor: "pointer",
}

const confirmBtnStyle: React.CSSProperties = {
  flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid rgba(52,211,153,0.4)",
  background: "rgba(16,185,129,0.15)", color: "#34d399", fontSize: 13, fontWeight: 700, cursor: "pointer",
}

const toggleBtnStyle: React.CSSProperties = {
  flex: 1, padding: "9px 0", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer",
  border: "1px solid rgba(148,163,184,0.14)", background: "transparent", color: "#64748b",
}

const toggleActiveRedStyle: React.CSSProperties = {
  border: "1px solid rgba(248,113,113,0.4)", background: "rgba(239,68,68,0.12)", color: "#f87171",
}

const toggleActiveGreenStyle: React.CSSProperties = {
  border: "1px solid rgba(52,211,153,0.4)", background: "rgba(16,185,129,0.15)", color: "#34d399",
}
