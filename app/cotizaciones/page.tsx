"use client"

import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { requireSessionProfile } from "../../lib/session-profile"
import { AppSidebar } from "../../components/AppSidebar"

type Client = { id: string; name: string }
type Project = { id: string; name: string; client_id: string }

type ItemValues = {
  qty: string
  days: string
  unit_price: string
}

type ExtraItem = {
  tempId: string
  description: string
  qty: string
  days: string
  unit_price: string
}

type ItemDef = {
  id: string
  label: string
  special?: "agency_commission"
}

type RubroDef = {
  id: string
  num: number
  label: string
  color: string
  items: ItemDef[]
}

const RUBROS: RubroDef[] = [
  {
    id: "r1", num: 1, label: "Preproducción", color: "#6366f1",
    items: [
      { id: "guiones", label: "Desarrollo de guiones" },
    ],
  },
  {
    id: "r2", num: 2, label: "Personal Técnico", color: "#a78bfa",
    items: [
      { id: "personal_tecnico_gen", label: "Personal Técnico" },
      { id: "productor", label: "Productor" },
      { id: "asist_produccion", label: "Asistente Producción" },
      { id: "director", label: "Director" },
      { id: "ad", label: "AD" },
      { id: "dp", label: "DP" },
      { id: "asist_camara", label: "Asist. cámara" },
      { id: "fotografo", label: "Fotógrafo" },
      { id: "asist_fotografo", label: "Asist. Fotógrafo" },
      { id: "gaffer", label: "Gaffer" },
      { id: "staff", label: "Staff" },
      { id: "vestuarista", label: "Vestuarista" },
      { id: "asist_vestuario", label: "Asist. Vestuario" },
      { id: "makeup", label: "Make up" },
      { id: "asist_makeup", label: "Asist. Makeup" },
      { id: "dir_arte", label: "Director de Arte" },
      { id: "decorador", label: "Decorador" },
      { id: "swing_arte", label: "Swing Arte" },
      { id: "sonidista", label: "Sonidista" },
    ],
  },
  {
    id: "r3", num: 3, label: "Gastos de Producción", color: "#38bdf8",
    items: [
      { id: "alimentacion", label: "Alimentación" },
      { id: "camionetas", label: "Camionetas de producción" },
      { id: "videoassist", label: "Videoassist" },
      { id: "disco_duro", label: "Disco Duro" },
      { id: "radios", label: "Radios" },
      { id: "caja_chica", label: "Caja chica" },
      { id: "gastos_prod", label: "Gastos de producción" },
    ],
  },
  {
    id: "r4", num: 4, label: "Utilería y Vestuario", color: "#34d399",
    items: [
      { id: "presup_vestuario", label: "Presupuesto Vestuario" },
      { id: "presup_arte", label: "Presupuesto Arte y Props" },
    ],
  },
  {
    id: "r5", num: 5, label: "Foro y Escenografía", color: "#fbbf24",
    items: [
      { id: "renta_locacion", label: "Renta de locación" },
      { id: "construccion_sets", label: "Construcción de sets" },
      { id: "scouter", label: "Scouter" },
    ],
  },
  {
    id: "r6", num: 6, label: "Renta de Equipo", color: "#fb923c",
    items: [
      { id: "paquete_camara", label: "Paquete de cámara" },
      { id: "optica", label: "Óptica" },
      { id: "equipo_ilum", label: "Equipo de iluminación y tramoya" },
      { id: "equipo_ilum_foto", label: "Equipo de iluminación fotográfica" },
      { id: "planta_luz", label: "Planta de luz" },
    ],
  },
  {
    id: "r7", num: 7, label: "Talento", color: "#f472b6",
    items: [
      { id: "talento_principal", label: "Talento Principal" },
      { id: "talento_secundario", label: "Talento Secundario" },
      { id: "extras", label: "Extras" },
      { id: "comision_agencia", label: "Comisión de agencia", special: "agency_commission" },
    ],
  },
  {
    id: "r8", num: 8, label: "Edición y Audio", color: "#818cf8",
    items: [
      { id: "edicion_video", label: "Edición de video" },
    ],
  },
  {
    id: "r9", num: 9, label: "Postproducción", color: "#c084fc",
    items: [
      { id: "correccion_color", label: "Corrección de color" },
      { id: "diseno_sonoro", label: "Diseño sonoro" },
      { id: "retoque_foto", label: "Retoque fotográfico" },
    ],
  },
]

const DEFAULT_ITEM: ItemValues = { qty: "1", days: "1", unit_price: "0" }

function initValues(): Record<string, ItemValues> {
  const vals: Record<string, ItemValues> = {}
  for (const rubro of RUBROS) {
    for (const item of rubro.items) {
      if (!item.special) vals[item.id] = { ...DEFAULT_ITEM }
    }
  }
  return vals
}

function calcItem(v: ItemValues): number {
  return (parseFloat(v.qty) || 0) * (parseFloat(v.days) || 0) * (parseFloat(v.unit_price) || 0)
}

function fmt(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
}

export default function CotizacionesPage() {
  const [profile, setProfile] = useState<any>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [saving, setSaving] = useState(false)

  const [clientId, setClientId] = useState("")
  const [projectId, setProjectId] = useState("")
  const [quoteName, setQuoteName] = useState("")
  const [markup, setMarkup] = useState("0")
  const [status, setStatus] = useState<"draft" | "sent" | "approved">("draft")
  const [values, setValues] = useState<Record<string, ItemValues>>(initValues())
  const [commissionPct, setCommissionPct] = useState("30")
  const [extras, setExtras] = useState<Record<string, ExtraItem[]>>({})

  const isAdmin = profile?.role === "admin"
  const filteredProjects = projects.filter((p) => p.client_id === clientId)

  const commissionBase =
    calcItem(values["talento_principal"] || DEFAULT_ITEM) +
    calcItem(values["talento_secundario"] || DEFAULT_ITEM) +
    calcItem(values["extras"] || DEFAULT_ITEM)
  const commissionAmt = commissionBase * ((parseFloat(commissionPct) || 0) / 100)

  function addExtra(rubroId: string) {
    setExtras((prev) => ({
      ...prev,
      [rubroId]: [
        ...(prev[rubroId] || []),
        { tempId: crypto.randomUUID(), description: "", qty: "1", days: "1", unit_price: "0" },
      ],
    }))
  }

  function updateExtra(rubroId: string, tempId: string, patch: Partial<ExtraItem>) {
    setExtras((prev) => ({
      ...prev,
      [rubroId]: (prev[rubroId] || []).map((i) =>
        i.tempId === tempId ? { ...i, ...patch } : i
      ),
    }))
  }

  function removeExtra(rubroId: string, tempId: string) {
    setExtras((prev) => ({
      ...prev,
      [rubroId]: (prev[rubroId] || []).filter((i) => i.tempId !== tempId),
    }))
  }

  function getRubroTotal(rubro: RubroDef): number {
    const predefined = rubro.items.reduce((sum, item) => {
      if (item.special === "agency_commission") return sum + commissionAmt
      return sum + calcItem(values[item.id] || DEFAULT_ITEM)
    }, 0)
    const extraTotal = (extras[rubro.id] || []).reduce(
      (sum, i) => sum + calcItem({ qty: i.qty, days: i.days, unit_price: i.unit_price }),
      0
    )
    return predefined + extraTotal
  }

  const grandSubtotal = RUBROS.reduce((sum, r) => sum + getRubroTotal(r), 0)
  const markupAmt = grandSubtotal * ((parseFloat(markup) || 0) / 100)
  const grandTotal = grandSubtotal + markupAmt

  function updateItem(itemId: string, patch: Partial<ItemValues>) {
    setValues((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] || DEFAULT_ITEM), ...patch } }))
  }

  useEffect(() => {
    function checkMobile() { setIsMobile(window.innerWidth < 768) }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => {
    async function load() {
      const auth = await requireSessionProfile()
      if (!auth) return
      if (auth.profile.role !== "admin") { window.location.href = "/"; return }
      setProfile(auth.profile)
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from("clients").select("id, name").order("name"),
        supabase.from("projects").select("id, name, client_id").order("name"),
      ])
      setClients(c || [])
      setProjects(p || [])
    }
    load()
  }, [])

  useEffect(() => { setProjectId("") }, [clientId])

  async function handleSave() {
    if (!clientId) return alert("Selecciona un cliente")
    if (!projectId) return alert("Selecciona un proyecto")
    if (!quoteName.trim()) return alert("Escribe el nombre de la cotización")

    setSaving(true)
    try {
      const { data: quoteData, error: quoteErr } = await supabase
        .from("quotes")
        .insert({
          project_id: projectId,
          name: quoteName.trim(),
          status,
          markup_percentage: parseFloat(markup) || 0,
          created_by: profile.id,
        })
        .select("id")
        .single()

      if (quoteErr) throw quoteErr

      for (let ri = 0; ri < RUBROS.length; ri++) {
        const rubro = RUBROS[ri]
        const { data: secData, error: secErr } = await supabase
          .from("quote_sections")
          .insert({ quote_id: quoteData.id, name: rubro.label, order_index: ri })
          .select("id")
          .single()

        if (secErr) throw secErr

        const predefinedRows = rubro.items.map((item, ii) => {
          if (item.special === "agency_commission") {
            return {
              section_id: secData.id,
              description: `Comisión de agencia (${commissionPct}%)`,
              qty: 1,
              days: 1,
              unit_price: commissionAmt,
              released_expense: 0,
              real_expense: 0,
              supplier: commissionPct,
              order_index: ii,
            }
          }
          const v = values[item.id] || DEFAULT_ITEM
          return {
            section_id: secData.id,
            description: item.label,
            qty: parseFloat(v.qty) || 0,
            days: parseFloat(v.days) || 0,
            unit_price: parseFloat(v.unit_price) || 0,
            released_expense: 0,
            real_expense: 0,
            supplier: null,
            order_index: ii,
          }
        })

        const extraRows = (extras[rubro.id] || []).map((item, ei) => ({
          section_id: secData.id,
          description: item.description || "Concepto adicional",
          qty: parseFloat(item.qty) || 0,
          days: parseFloat(item.days) || 0,
          unit_price: parseFloat(item.unit_price) || 0,
          released_expense: 0,
          real_expense: 0,
          supplier: null,
          order_index: rubro.items.length + ei,
        }))

        const itemsToInsert = [...predefinedRows, ...extraRows]

        const { error: itemsErr } = await supabase.from("quote_items").insert(itemsToInsert)
        if (itemsErr) throw itemsErr
      }

      setValues(initValues())
      setExtras({})
      setClientId("")
      setProjectId("")
      setQuoteName("")
      setMarkup("0")
      setCommissionPct("30")
      setStatus("draft")
      alert("Cotización guardada. Revísala desde la sección de Proyectos.")
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const twoCol = { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }

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

      <main style={{ ...mainStyle, padding: isMobile ? "76px 14px 40px" : "28px 32px 40px" }}>
        <div style={pageContainerStyle}>
          <header style={pageHeaderStyle}>
            <p style={eyebrowStyle}>Finanzas</p>
            <h1 style={pageTitleStyle}>Nueva cotización</h1>
            <p style={pageSubtitleStyle}>Presupuesto estructurado por rubros</p>
          </header>

          {/* Datos generales */}
          <section style={panelStyle}>
            <div style={panelHeaderStyle}>
              <p style={panelTitleStyle}>Datos generales</p>
            </div>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr 120px 140px" }}>
              <Field label="Cliente">
                <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={inputStyle}>
                  <option value="">Selecciona...</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Proyecto">
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle} disabled={!clientId}>
                  <option value="">Selecciona...</option>
                  {filteredProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Nombre de la cotización">
                <input value={quoteName} onChange={(e) => setQuoteName(e.target.value)} placeholder="Ej. Propuesta v1" style={inputStyle} />
              </Field>
              <Field label="Markup (%)">
                <input type="number" value={markup} onChange={(e) => setMarkup(e.target.value)} min="0" style={inputStyle} />
              </Field>
              <Field label="Estado">
                <select value={status} onChange={(e) => setStatus(e.target.value as any)} style={inputStyle}>
                  <option value="draft">Borrador</option>
                  <option value="sent">Enviada</option>
                  <option value="approved">Aprobada</option>
                </select>
              </Field>
            </div>
          </section>

          {/* Rubros */}
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>

            {/* Fila A: Preproducción + Edición y Audio */}
            <div style={twoCol}>
              <RubroCard rubro={RUBROS[0]} values={values} onUpdate={updateItem} rubroTotal={getRubroTotal(RUBROS[0])} extraItems={extras[RUBROS[0].id] || []} onAddExtra={() => addExtra(RUBROS[0].id)} onUpdateExtra={(tid, p) => updateExtra(RUBROS[0].id, tid, p)} onRemoveExtra={(tid) => removeExtra(RUBROS[0].id, tid)} />
              <RubroCard rubro={RUBROS[7]} values={values} onUpdate={updateItem} rubroTotal={getRubroTotal(RUBROS[7])} extraItems={extras[RUBROS[7].id] || []} onAddExtra={() => addExtra(RUBROS[7].id)} onUpdateExtra={(tid, p) => updateExtra(RUBROS[7].id, tid, p)} onRemoveExtra={(tid) => removeExtra(RUBROS[7].id, tid)} />
            </div>

            {/* Fila B: Personal Técnico — full width por su tamaño */}
            <RubroCard
              rubro={RUBROS[1]}
              values={values}
              onUpdate={updateItem}
              rubroTotal={getRubroTotal(RUBROS[1])}
              twoColItems={!isMobile}
              extraItems={extras[RUBROS[1].id] || []}
              onAddExtra={() => addExtra(RUBROS[1].id)}
              onUpdateExtra={(tid, p) => updateExtra(RUBROS[1].id, tid, p)}
              onRemoveExtra={(tid) => removeExtra(RUBROS[1].id, tid)}
            />

            {/* Fila C: Gastos de Producción + Utilería y Vestuario */}
            <div style={twoCol}>
              <RubroCard rubro={RUBROS[2]} values={values} onUpdate={updateItem} rubroTotal={getRubroTotal(RUBROS[2])} extraItems={extras[RUBROS[2].id] || []} onAddExtra={() => addExtra(RUBROS[2].id)} onUpdateExtra={(tid, p) => updateExtra(RUBROS[2].id, tid, p)} onRemoveExtra={(tid) => removeExtra(RUBROS[2].id, tid)} />
              <RubroCard rubro={RUBROS[3]} values={values} onUpdate={updateItem} rubroTotal={getRubroTotal(RUBROS[3])} extraItems={extras[RUBROS[3].id] || []} onAddExtra={() => addExtra(RUBROS[3].id)} onUpdateExtra={(tid, p) => updateExtra(RUBROS[3].id, tid, p)} onRemoveExtra={(tid) => removeExtra(RUBROS[3].id, tid)} />
            </div>

            {/* Fila D: Foro y Escenografía + Renta de Equipo */}
            <div style={twoCol}>
              <RubroCard rubro={RUBROS[4]} values={values} onUpdate={updateItem} rubroTotal={getRubroTotal(RUBROS[4])} extraItems={extras[RUBROS[4].id] || []} onAddExtra={() => addExtra(RUBROS[4].id)} onUpdateExtra={(tid, p) => updateExtra(RUBROS[4].id, tid, p)} onRemoveExtra={(tid) => removeExtra(RUBROS[4].id, tid)} />
              <RubroCard rubro={RUBROS[5]} values={values} onUpdate={updateItem} rubroTotal={getRubroTotal(RUBROS[5])} extraItems={extras[RUBROS[5].id] || []} onAddExtra={() => addExtra(RUBROS[5].id)} onUpdateExtra={(tid, p) => updateExtra(RUBROS[5].id, tid, p)} onRemoveExtra={(tid) => removeExtra(RUBROS[5].id, tid)} />
            </div>

            {/* Fila E: Talento + Postproducción */}
            <div style={twoCol}>
              <RubroCard
                rubro={RUBROS[6]}
                values={values}
                onUpdate={updateItem}
                rubroTotal={getRubroTotal(RUBROS[6])}
                commissionPct={commissionPct}
                commissionAmt={commissionAmt}
                onCommissionChange={setCommissionPct}
                extraItems={extras[RUBROS[6].id] || []}
                onAddExtra={() => addExtra(RUBROS[6].id)}
                onUpdateExtra={(tid, p) => updateExtra(RUBROS[6].id, tid, p)}
                onRemoveExtra={(tid) => removeExtra(RUBROS[6].id, tid)}
              />
              <RubroCard rubro={RUBROS[8]} values={values} onUpdate={updateItem} rubroTotal={getRubroTotal(RUBROS[8])} extraItems={extras[RUBROS[8].id] || []} onAddExtra={() => addExtra(RUBROS[8].id)} onUpdateExtra={(tid, p) => updateExtra(RUBROS[8].id, tid, p)} onRemoveExtra={(tid) => removeExtra(RUBROS[8].id, tid)} />
            </div>
          </div>

          {/* Totales + guardar */}
          <section style={{ ...panelStyle, marginTop: 12 }}>
            <div style={{ display: "grid", gap: isMobile ? 20 : 0, gridTemplateColumns: isMobile ? "1fr" : "1fr auto" }}>

              {/* Breakdown por rubro */}
              <div style={{ display: "grid", gap: 6, paddingRight: isMobile ? 0 : 32, borderRight: isMobile ? "none" : "1px solid rgba(148,163,184,0.10)" }}>
                <p style={{ margin: "0 0 6px", color: "#94a3b8", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>
                  Resumen por rubro
                </p>
                {RUBROS.map((r) => {
                  const t = getRubroTotal(r)
                  return (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 999, background: r.color, flexShrink: 0 }} />
                        <span style={{ color: t > 0 ? "#cbd5e1" : "#475569", fontSize: 12 }}>
                          {r.num}. {r.label}
                        </span>
                      </div>
                      <span style={{ color: t > 0 ? "#e2e8f0" : "#475569", fontSize: 12, fontWeight: t > 0 ? 600 : 400 }}>
                        {fmt(t)}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Totales finales + botón */}
              <div style={{ display: "grid", gap: 10, alignContent: "start", paddingLeft: isMobile ? 0 : 32, minWidth: 260 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <span style={{ color: "#64748b", fontSize: 13 }}>Subtotal</span>
                  <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{fmt(grandSubtotal)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <span style={{ color: "#64748b", fontSize: 13 }}>Markup ({markup || 0}%)</span>
                  <span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{fmt(markupAmt)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, borderTop: "1px solid rgba(148,163,184,0.16)", paddingTop: 10 }}>
                  <span style={{ color: "#f8fafc", fontSize: 15, fontWeight: 700 }}>Total</span>
                  <span style={{ color: "#a78bfa", fontSize: 22, fontWeight: 700 }}>{fmt(grandTotal)}</span>
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{ ...primaryButtonStyle, marginTop: 6, padding: "11px 20px", fontSize: 14 }}
                >
                  {saving ? "Guardando..." : "Guardar cotización"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

function RubroCard({
  rubro,
  values,
  onUpdate,
  rubroTotal,
  twoColItems,
  commissionPct,
  commissionAmt,
  onCommissionChange,
  extraItems,
  onAddExtra,
  onUpdateExtra,
  onRemoveExtra,
}: {
  rubro: RubroDef
  values: Record<string, ItemValues>
  onUpdate: (id: string, patch: Partial<ItemValues>) => void
  rubroTotal: number
  twoColItems?: boolean
  commissionPct?: string
  commissionAmt?: number
  onCommissionChange?: (v: string) => void
  extraItems: ExtraItem[]
  onAddExtra: () => void
  onUpdateExtra: (tempId: string, patch: Partial<ExtraItem>) => void
  onRemoveExtra: (tempId: string) => void
}) {
  const items = rubro.items
  const mid = twoColItems ? Math.ceil(items.length / 2) : items.length
  const col1 = twoColItems ? items.slice(0, mid) : items
  const col2 = twoColItems ? items.slice(mid) : []

  return (
    <div style={rubroCardStyle(rubro.color)}>
      {/* Header */}
      <div style={rubroHeaderStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={rubroNumStyle(rubro.color)}>{rubro.num}</span>
          <p style={rubroLabelStyle}>{rubro.label}</p>
        </div>
        <span style={{ color: rubroTotal > 0 ? rubro.color : "#475569", fontSize: 13, fontWeight: 700 }}>
          {fmt(rubroTotal)}
        </span>
      </div>

      {/* Items predefinidos */}
      <div style={{ display: "grid", gridTemplateColumns: twoColItems ? "1fr 1fr" : "1fr", gap: "4px 16px" }}>
        {[col1, col2].map((col, ci) => (
          <div key={ci} style={{ display: "grid", gap: 2 }}>
            {col.map((item, idx) => {
              const isLast = idx === col.length - 1
              const v = values[item.id] || DEFAULT_ITEM
              const tot = calcItem(v)

              if (item.special === "agency_commission") {
                return (
                  <div key={item.id} style={{ ...itemRowStyle, borderBottom: isLast ? "none" : "1px solid rgba(148,163,184,0.06)" }}>
                    <span style={itemLabelStyle}>{item.label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="number"
                        value={commissionPct}
                        onChange={(e) => onCommissionChange?.(e.target.value)}
                        min="0"
                        style={{ ...numInputStyle, width: 46 }}
                        title="% de comisión"
                      />
                      <span style={{ color: "#64748b", fontSize: 11 }}>%</span>
                      <span style={itemTotalStyle}>{fmt(commissionAmt || 0)}</span>
                    </div>
                  </div>
                )
              }

              return (
                <div key={item.id} style={{ ...itemRowStyle, borderBottom: isLast ? "none" : "1px solid rgba(148,163,184,0.06)" }}>
                  <span style={itemLabelStyle}>{item.label}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input type="number" value={v.qty} onChange={(e) => onUpdate(item.id, { qty: e.target.value })} min="0" style={numInputStyle} title="Cantidad" />
                    <span style={sepStyle}>×</span>
                    <input type="number" value={v.days} onChange={(e) => onUpdate(item.id, { days: e.target.value })} min="0" style={numInputStyle} title="Días" />
                    <span style={sepStyle}>×</span>
                    <input type="number" value={v.unit_price} onChange={(e) => onUpdate(item.id, { unit_price: e.target.value })} min="0" style={priceInputStyle} title="Precio unitario" />
                    <span style={itemTotalStyle}>{fmt(tot)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Conceptos adicionales */}
      {extraItems.length > 0 && (
        <div style={{ display: "grid", gap: 2, paddingTop: 6, borderTop: "1px dashed rgba(148,163,184,0.12)" }}>
          {extraItems.map((item) => {
            const tot = calcItem({ qty: item.qty, days: item.days, unit_price: item.unit_price })
            return (
              <div key={item.tempId} style={{ ...itemRowStyle, gap: 6 }}>
                <input
                  value={item.description}
                  onChange={(e) => onUpdateExtra(item.tempId, { description: e.target.value })}
                  placeholder="Nombre del concepto"
                  style={{ ...extraDescInputStyle, flex: 1 }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <input type="number" value={item.qty} onChange={(e) => onUpdateExtra(item.tempId, { qty: e.target.value })} min="0" style={numInputStyle} title="Cantidad" />
                  <span style={sepStyle}>×</span>
                  <input type="number" value={item.days} onChange={(e) => onUpdateExtra(item.tempId, { days: e.target.value })} min="0" style={numInputStyle} title="Días" />
                  <span style={sepStyle}>×</span>
                  <input type="number" value={item.unit_price} onChange={(e) => onUpdateExtra(item.tempId, { unit_price: e.target.value })} min="0" style={priceInputStyle} title="Precio unitario" />
                  <span style={itemTotalStyle}>{fmt(tot)}</span>
                  <button onClick={() => onRemoveExtra(item.tempId)} style={removeExtraStyle} title="Quitar">✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Botón agregar concepto */}
      <button onClick={onAddExtra} style={addExtraButtonStyle(rubro.color)}>
        + Agregar concepto
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 5, minWidth: 0 }}>
      <span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 500 }}>{label}</span>
      {children}
    </label>
  )
}

function rubroCardStyle(color: string): React.CSSProperties {
  return {
    background: "rgba(15, 23, 42, 0.72)",
    border: "1px solid rgba(148,163,184,0.12)",
    borderLeft: `3px solid ${color}`,
    backdropFilter: "blur(16px)",
    borderRadius: 14,
    padding: "14px 16px",
    display: "grid",
    gap: 10,
  }
}

const rubroHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  paddingBottom: 10,
  borderBottom: "1px solid rgba(148,163,184,0.08)",
}

function rubroNumStyle(color: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    borderRadius: 6,
    background: `${color}22`,
    border: `1px solid ${color}44`,
    color,
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  }
}

const rubroLabelStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 600,
}

const itemRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "5px 0",
}

const itemLabelStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const itemTotalStyle: React.CSSProperties = {
  color: "#c4b5fd",
  fontSize: 12,
  fontWeight: 600,
  minWidth: 80,
  textAlign: "right",
}

const numInputStyle: React.CSSProperties = {
  width: 46,
  padding: "4px 6px",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 6,
  background: "rgba(2,6,23,0.55)",
  color: "#f8fafc",
  outline: "none",
  fontSize: 12,
  textAlign: "right",
  boxSizing: "border-box",
}

const priceInputStyle: React.CSSProperties = {
  ...numInputStyle,
  width: 88,
}

const sepStyle: React.CSSProperties = {
  color: "#475569",
  fontSize: 11,
  flexShrink: 0,
}

const appShellStyle: React.CSSProperties = { display: "flex", minHeight: "100vh" }
const mainStyle: React.CSSProperties = { flex: 1, minWidth: 0 }
const pageContainerStyle: React.CSSProperties = { maxWidth: 1100, margin: "0 auto" }
const pageHeaderStyle: React.CSSProperties = { marginBottom: 18 }

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: "#a78bfa",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 1.2,
  fontWeight: 700,
}

const pageTitleStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#f8fafc",
  fontSize: 28,
  letterSpacing: -0.6,
  lineHeight: 1.1,
}

const pageSubtitleStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#64748b",
  fontSize: 13,
}

const panelStyle: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148,163,184,0.14)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
  backdropFilter: "blur(16px)",
  borderRadius: 16,
  padding: "16px 18px",
}

const panelHeaderStyle: React.CSSProperties = {
  marginBottom: 14,
  paddingBottom: 12,
  borderBottom: "1px solid rgba(148,163,184,0.10)",
}

const panelTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 600,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 8,
  background: "rgba(2,6,23,0.55)",
  color: "#f8fafc",
  outline: "none",
  fontSize: 13,
  lineHeight: 1.35,
  boxSizing: "border-box",
}

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 16px",
  background: "linear-gradient(135deg, #7c3aed, #6366f1)",
  color: "white",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
  boxShadow: "0 8px 24px rgba(124,58,237,0.22)",
}

const extraDescInputStyle: React.CSSProperties = {
  padding: "4px 8px",
  border: "1px solid rgba(148,163,184,0.20)",
  borderRadius: 6,
  background: "rgba(124,58,237,0.06)",
  color: "#e2e8f0",
  outline: "none",
  fontSize: 12,
  minWidth: 0,
  boxSizing: "border-box",
}

const removeExtraStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 5,
  border: "1px solid rgba(248,113,113,0.24)",
  background: "transparent",
  color: "#f87171",
  cursor: "pointer",
  fontSize: 10,
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
}

function addExtraButtonStyle(color: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 10px",
    borderRadius: 7,
    border: `1px dashed ${color}55`,
    background: "transparent",
    color,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 4,
    opacity: 0.8,
  }
}
