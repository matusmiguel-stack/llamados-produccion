"use client"

import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { requireSessionProfile } from "../../lib/session-profile"
import { AppSidebar } from "../../components/AppSidebar"
import type { QuoteRubroPDF, QuotePDFData } from "../../lib/exportQuotePdf"

type Client = { id: string; name: string }
type Project = { id: string; name: string; client_id: string }
type Subfolder = { id: string; client_id: string; name: string }

type ItemValues = {
  qty: string
  days: string
  cost: string
  markup: string
  isInternal: boolean
}

type ExtraItem = {
  tempId: string
  description: string
  qty: string
  days: string
  cost: string
  markup: string
  isInternal: boolean
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
    items: [{ id: "guiones", label: "Desarrollo de guiones" }],
  },
  {
    id: "r2", num: 2, label: "Personal Técnico", color: "#a78bfa",
    items: [
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
    items: [{ id: "edicion_video", label: "Edición de video" }],
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

const DEFAULT_ITEM: ItemValues = { qty: "1", days: "1", cost: "", markup: "0", isInternal: false }

function initValues(): Record<string, ItemValues> {
  const vals: Record<string, ItemValues> = {}
  for (const rubro of RUBROS) {
    for (const item of rubro.items) {
      if (!item.special) vals[item.id] = { ...DEFAULT_ITEM }
    }
  }
  return vals
}

function rawAmt(v: { qty: string; days: string; cost: string }): number {
  return (parseFloat(v.qty) || 0) * (parseFloat(v.days) || 0) * (parseFloat(v.cost) || 0)
}

function calcItem(v: { qty: string; days: string; cost: string; markup: string; isInternal: boolean }): { gasto: number; utilidad: number; venta: number } {
  const amount = rawAmt(v)
  if (v.isInternal) return { gasto: 0, utilidad: amount, venta: amount }
  const u = amount * ((parseFloat(v.markup) || 0) / 100)
  return { gasto: amount, utilidad: u, venta: amount + u }
}

function calcCommission(g: number, markupPct: string): { gasto: number; utilidad: number; venta: number } {
  const u = g * ((parseFloat(markupPct) || 0) / 100)
  return { gasto: g, utilidad: u, venta: g + u }
}

function fmt(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`
}

type RubroFinancials = { gasto: number; utilidad: number; venta: number }

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
  const [status, setStatus] = useState<"draft" | "sent" | "approved">("draft")
  const [values, setValues] = useState<Record<string, ItemValues>>(initValues())
  const [extras, setExtras] = useState<Record<string, ExtraItem[]>>({})
  const [commissionPct, setCommissionPct] = useState("30")
  const [commissionMarkup, setCommissionMarkup] = useState("0")

  // Inline creation state
  const [subfolders, setSubfolders] = useState<Subfolder[]>([])
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientName, setNewClientName] = useState("")
  const [creatingClient, setCreatingClient] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")
  const [newProjectSubfolderId, setNewProjectSubfolderId] = useState("")
  const [showNewSubfolder, setShowNewSubfolder] = useState(false)
  const [newSubfolderName, setNewSubfolderName] = useState("")
  const [creatingProject, setCreatingProject] = useState(false)

  const isAdmin = profile?.role === "admin"
  const filteredProjects = projects.filter((p) => p.client_id === clientId)
  const clientSubfolders = subfolders.filter((sf) => sf.client_id === clientId)

  // Comisión: % del gasto base de talento
  const talentoBaseGasto =
    rawAmt(values["talento_principal"] || DEFAULT_ITEM) +
    rawAmt(values["talento_secundario"] || DEFAULT_ITEM) +
    rawAmt(values["extras"] || DEFAULT_ITEM)
  const commissionGasto = talentoBaseGasto * ((parseFloat(commissionPct) || 0) / 100)

  function getRubroFinancials(rubro: RubroDef): RubroFinancials {
    let g = 0
    let u = 0

    for (const item of rubro.items) {
      if (item.special === "agency_commission") {
        const c = calcCommission(commissionGasto, commissionMarkup)
        g += c.gasto
        u += c.utilidad
      } else {
        const v = values[item.id] || DEFAULT_ITEM
        const c = calcItem(v)
        g += c.gasto
        u += c.utilidad
      }
    }

    for (const item of extras[rubro.id] || []) {
      const c = calcItem(item)
      g += c.gasto
      u += c.utilidad
    }

    return { gasto: g, utilidad: u, venta: g + u }
  }

  const globalFinancials = RUBROS.reduce(
    (acc, r) => {
      const f = getRubroFinancials(r)
      return { gasto: acc.gasto + f.gasto, utilidad: acc.utilidad + f.utilidad, venta: acc.venta + f.venta }
    },
    { gasto: 0, utilidad: 0, venta: 0 }
  )

  const marginPct =
    globalFinancials.venta > 0
      ? (globalFinancials.utilidad / globalFinancials.venta) * 100
      : 0

  function updateItem(itemId: string, patch: Partial<ItemValues>) {
    setValues((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] || DEFAULT_ITEM), ...patch } }))
  }

  function addExtra(rubroId: string) {
    setExtras((prev) => ({
      ...prev,
      [rubroId]: [...(prev[rubroId] || []), { tempId: crypto.randomUUID(), description: "", qty: "1", days: "1", cost: "", markup: "0", isInternal: false }],
    }))
  }

  function updateExtra(rubroId: string, tempId: string, patch: Partial<ExtraItem>) {
    setExtras((prev) => ({
      ...prev,
      [rubroId]: (prev[rubroId] || []).map((i) => i.tempId === tempId ? { ...i, ...patch } : i),
    }))
  }

  function removeExtra(rubroId: string, tempId: string) {
    setExtras((prev) => ({
      ...prev,
      [rubroId]: (prev[rubroId] || []).filter((i) => i.tempId !== tempId),
    }))
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
      const [{ data: c }, { data: p }, { data: sf }] = await Promise.all([
        supabase.from("clients").select("id, name").order("name"),
        supabase.from("projects").select("id, name, client_id").order("name"),
        supabase.from("client_subfolders").select("id, client_id, name").order("name"),
      ])
      setClients(c || [])
      setProjects(p || [])
      setSubfolders(sf || [])
    }
    load()
  }, [])

  useEffect(() => {
    setProjectId("")
    setShowNewProject(false)
    setNewProjectName("")
    setNewProjectSubfolderId("")
    setNewSubfolderName("")
    setShowNewSubfolder(false)
  }, [clientId])

  async function handleCreateClient() {
    if (!newClientName.trim()) return
    setCreatingClient(true)
    try {
      const { data, error } = await supabase
        .from("clients")
        .insert({ name: newClientName.trim() })
        .select("id, name")
        .single()
      if (error) { alert(error.message); return }
      setClients((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, "es")))
      setClientId(data.id)
      setShowNewClient(false)
      setNewClientName("")
    } finally {
      setCreatingClient(false)
    }
  }

  async function handleCreateProject() {
    if (!newProjectName.trim()) return
    if (!clientId) return
    setCreatingProject(true)
    try {
      let subfolderId = newProjectSubfolderId
      if (showNewSubfolder || !subfolderId) {
        if (!newSubfolderName.trim()) { alert("Escribe el nombre de la subcarpeta"); return }
        const { data: sfData, error: sfErr } = await supabase
          .from("client_subfolders")
          .insert({ client_id: clientId, name: newSubfolderName.trim() })
          .select("id, client_id, name")
          .single()
        if (sfErr) { alert(sfErr.message); return }
        setSubfolders((prev) => [...prev, sfData].sort((a, b) => a.name.localeCompare(b.name, "es")))
        subfolderId = sfData.id
      }
      const { data: projData, error: projErr } = await supabase
        .from("projects")
        .insert({ client_id: clientId, subfolder_id: subfolderId, name: newProjectName.trim() })
        .select("id, name, client_id")
        .single()
      if (projErr) { alert(projErr.message); return }
      setProjects((prev) => [...prev, projData].sort((a, b) => a.name.localeCompare(b.name, "es")))
      setProjectId(projData.id)
      setShowNewProject(false)
      setNewProjectName("")
      setNewProjectSubfolderId("")
      setNewSubfolderName("")
      setShowNewSubfolder(false)
    } finally {
      setCreatingProject(false)
    }
  }

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
          markup_percentage: 0,
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
              unit_price: commissionGasto,       // costo real
              released_expense: parseFloat(commissionMarkup) || 0, // markup %
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
            unit_price: parseFloat(v.cost) || 0,
            released_expense: parseFloat(v.markup) || 0,
            real_expense: v.isInternal ? 1 : 0,
            supplier: null,
            order_index: ii,
          }
        })

        const extraRows = (extras[rubro.id] || []).map((item, ei) => ({
          section_id: secData.id,
          description: item.description || "Concepto adicional",
          qty: parseFloat(item.qty) || 0,
          days: parseFloat(item.days) || 0,
          unit_price: parseFloat(item.cost) || 0,
          released_expense: parseFloat(item.markup) || 0,
          real_expense: item.isInternal ? 1 : 0,
          supplier: null,
          order_index: rubro.items.length + ei,
        }))

        const { error: itemsErr } = await supabase.from("quote_items").insert([...predefinedRows, ...extraRows])
        if (itemsErr) throw itemsErr
      }

      setValues(initValues())
      setExtras({})
      setClientId("")
      setProjectId("")
      setQuoteName("")
      setCommissionPct("30")
      setCommissionMarkup("0")
      setStatus("draft")
      alert("Cotización guardada. Revísala desde la sección de Proyectos.")
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleExportPdf() {
    const { exportQuotePdf } = await import("../../lib/exportQuotePdf")

    const clientName = clients.find((c) => c.id === clientId)?.name || "—"
    const projectName = projects.find((p) => p.id === projectId)?.name || "—"
    const date = new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(new Date())

    const rubros: QuoteRubroPDF[] = RUBROS.map((rubro) => {
      const items = rubro.items.map((item) => {
        if (item.special === "agency_commission") {
          return {
            label: item.label,
            qty: "1",
            days: "1",
            cost: String(commissionGasto),
            markup: commissionMarkup,
            isInternal: false,
            isCommission: true,
            commissionPct,
          }
        }
        const v = values[item.id] || DEFAULT_ITEM
        return { label: item.label, qty: v.qty, days: v.days, cost: v.cost, markup: v.markup, isInternal: v.isInternal }
      })
      const extraItems = (extras[rubro.id] || []).map((e) => ({
        label: e.description || "Concepto adicional",
        qty: e.qty,
        days: e.days,
        cost: e.cost,
        markup: e.markup,
        isInternal: e.isInternal,
      }))
      return {
        num: rubro.num,
        label: rubro.label,
        hexColor: rubro.color,
        items: [...items, ...extraItems],
        financials: getRubroFinancials(rubro),
      }
    })

    const pdfData: QuotePDFData = {
      quoteName: quoteName || "Cotización",
      clientName,
      projectName,
      status,
      date,
      rubros,
      globalFinancials,
      visibleMarkupPct: 0,
    }

    await exportQuotePdf(pdfData)
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
            <p style={pageSubtitleStyle}>Presupuesto estructurado por rubros con análisis de utilidad</p>
          </header>

          {/* Datos generales */}
          <section style={panelStyle}>
            <div style={panelHeaderStyle}>
              <p style={panelTitleStyle}>Datos generales</p>
            </div>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr 140px" }}>
              <Field label="Cliente">
                {showNewClient ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder="Nombre del cliente"
                      style={{ ...inputStyle, flex: 1 }}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateClient()}
                      autoFocus
                    />
                    <button onClick={handleCreateClient} disabled={creatingClient || !newClientName.trim()} style={inlineBtnStyle("#6366f1")}>
                      {creatingClient ? "…" : "✓"}
                    </button>
                    <button onClick={() => { setShowNewClient(false); setNewClientName("") }} style={inlineBtnStyle("#475569")}>✕</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <select value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                      <option value="">Selecciona...</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button onClick={() => setShowNewClient(true)} style={inlineBtnStyle("#6366f1")} title="Nuevo cliente">+</button>
                  </div>
                )}
              </Field>
              <Field label="Proyecto">
                {showNewProject ? (
                  <div style={{ display: "grid", gap: 6 }}>
                    <input
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="Nombre del proyecto"
                      style={inputStyle}
                      autoFocus
                    />
                    {(clientSubfolders.length > 0 && !showNewSubfolder) ? (
                      <select
                        value={newProjectSubfolderId}
                        onChange={(e) => {
                          if (e.target.value === "__new__") { setShowNewSubfolder(true); setNewProjectSubfolderId("") }
                          else setNewProjectSubfolderId(e.target.value)
                        }}
                        style={inputStyle}
                      >
                        <option value="">Subcarpeta...</option>
                        {clientSubfolders.map((sf) => <option key={sf.id} value={sf.id}>{sf.name}</option>)}
                        <option value="__new__">+ Nueva subcarpeta</option>
                      </select>
                    ) : (
                      <input
                        value={newSubfolderName}
                        onChange={(e) => setNewSubfolderName(e.target.value)}
                        placeholder="Nombre de la subcarpeta"
                        style={inputStyle}
                      />
                    )}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={handleCreateProject} disabled={creatingProject || !newProjectName.trim()} style={{ ...inlineBtnStyle("#6366f1"), flex: 1, fontSize: 12 }}>
                        {creatingProject ? "Creando..." : "✓ Crear proyecto"}
                      </button>
                      <button onClick={() => { setShowNewProject(false); setNewProjectName(""); setNewSubfolderName(""); setShowNewSubfolder(false); setNewProjectSubfolderId("") }} style={inlineBtnStyle("#475569")}>✕</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ ...inputStyle, flex: 1 }} disabled={!clientId}>
                      <option value="">Selecciona...</option>
                      {filteredProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {clientId && (
                      <button
                        onClick={() => { setShowNewProject(true); setShowNewSubfolder(clientSubfolders.length === 0) }}
                        style={inlineBtnStyle("#6366f1")}
                        title="Nuevo proyecto"
                      >+</button>
                    )}
                  </div>
                )}
              </Field>
              <Field label="Nombre de la cotización">
                <input value={quoteName} onChange={(e) => setQuoteName(e.target.value)} placeholder="Ej. Propuesta v1" style={inputStyle} />
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
          <div style={{ display: "grid", gap: 12 }}>

            {/* R1 */}
            <RubroCard rubro={RUBROS[0]} values={values} onUpdate={updateItem} financials={getRubroFinancials(RUBROS[0])} extras={extras[RUBROS[0].id] || []} onAddExtra={() => addExtra(RUBROS[0].id)} onUpdateExtra={(t, p) => updateExtra(RUBROS[0].id, t, p)} onRemoveExtra={(t) => removeExtra(RUBROS[0].id, t)} isMobile={isMobile} />

            {/* R2 ancho completo */}
            <RubroCard
              rubro={RUBROS[1]}
              values={values}
              onUpdate={updateItem}
              financials={getRubroFinancials(RUBROS[1])}
              twoColItems={!isMobile}
              extras={extras[RUBROS[1].id] || []}
              onAddExtra={() => addExtra(RUBROS[1].id)}
              onUpdateExtra={(t, p) => updateExtra(RUBROS[1].id, t, p)}
              onRemoveExtra={(t) => removeExtra(RUBROS[1].id, t)}
              isMobile={isMobile}
            />

            {/* R3 + R4 */}
            <div style={twoCol}>
              <RubroCard rubro={RUBROS[2]} values={values} onUpdate={updateItem} financials={getRubroFinancials(RUBROS[2])} extras={extras[RUBROS[2].id] || []} onAddExtra={() => addExtra(RUBROS[2].id)} onUpdateExtra={(t, p) => updateExtra(RUBROS[2].id, t, p)} onRemoveExtra={(t) => removeExtra(RUBROS[2].id, t)} isMobile={isMobile} />
              <RubroCard rubro={RUBROS[3]} values={values} onUpdate={updateItem} financials={getRubroFinancials(RUBROS[3])} extras={extras[RUBROS[3].id] || []} onAddExtra={() => addExtra(RUBROS[3].id)} onUpdateExtra={(t, p) => updateExtra(RUBROS[3].id, t, p)} onRemoveExtra={(t) => removeExtra(RUBROS[3].id, t)} isMobile={isMobile} />
            </div>

            {/* R5 + R6 */}
            <div style={twoCol}>
              <RubroCard rubro={RUBROS[4]} values={values} onUpdate={updateItem} financials={getRubroFinancials(RUBROS[4])} extras={extras[RUBROS[4].id] || []} onAddExtra={() => addExtra(RUBROS[4].id)} onUpdateExtra={(t, p) => updateExtra(RUBROS[4].id, t, p)} onRemoveExtra={(t) => removeExtra(RUBROS[4].id, t)} isMobile={isMobile} />
              <RubroCard rubro={RUBROS[5]} values={values} onUpdate={updateItem} financials={getRubroFinancials(RUBROS[5])} extras={extras[RUBROS[5].id] || []} onAddExtra={() => addExtra(RUBROS[5].id)} onUpdateExtra={(t, p) => updateExtra(RUBROS[5].id, t, p)} onRemoveExtra={(t) => removeExtra(RUBROS[5].id, t)} isMobile={isMobile} />
            </div>

            {/* R7 solo (comisión de agencia) */}
            <RubroCard
              rubro={RUBROS[6]}
              values={values}
              onUpdate={updateItem}
              financials={getRubroFinancials(RUBROS[6])}
              commissionPct={commissionPct}
              commissionMarkup={commissionMarkup}
              commissionGasto={commissionGasto}
              onCommissionPctChange={setCommissionPct}
              onCommissionMarkupChange={setCommissionMarkup}
              extras={extras[RUBROS[6].id] || []}
              onAddExtra={() => addExtra(RUBROS[6].id)}
              onUpdateExtra={(t, p) => updateExtra(RUBROS[6].id, t, p)}
              onRemoveExtra={(t) => removeExtra(RUBROS[6].id, t)}
              isMobile={isMobile}
            />

            {/* R8 + R9 */}
            <div style={twoCol}>
              <RubroCard rubro={RUBROS[7]} values={values} onUpdate={updateItem} financials={getRubroFinancials(RUBROS[7])} extras={extras[RUBROS[7].id] || []} onAddExtra={() => addExtra(RUBROS[7].id)} onUpdateExtra={(t, p) => updateExtra(RUBROS[7].id, t, p)} onRemoveExtra={(t) => removeExtra(RUBROS[7].id, t)} isMobile={isMobile} />
              <RubroCard rubro={RUBROS[8]} values={values} onUpdate={updateItem} financials={getRubroFinancials(RUBROS[8])} extras={extras[RUBROS[8].id] || []} onAddExtra={() => addExtra(RUBROS[8].id)} onUpdateExtra={(t, p) => updateExtra(RUBROS[8].id, t, p)} onRemoveExtra={(t) => removeExtra(RUBROS[8].id, t)} isMobile={isMobile} />
            </div>
          </div>

          {/* Resumen financiero global */}
          <section style={{ ...panelStyle, marginTop: 12 }}>
            <div style={panelHeaderStyle}>
              <p style={panelTitleStyle}>Resumen financiero</p>
            </div>

            <div style={{ display: "grid", gap: isMobile ? 20 : 0, gridTemplateColumns: isMobile ? "1fr" : "1fr auto" }}>
              {/* Breakdown por rubro */}
              <div style={{ paddingRight: isMobile ? 0 : 32, borderRight: isMobile ? "none" : "1px solid rgba(148,163,184,0.10)" }}>
                {/* Header */}
                <div style={summaryHeaderRowStyle}>
                  <span style={{ flex: 1, color: "#475569", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Rubro</span>
                  <span style={summaryColHeaderStyle}>Gasto</span>
                  <span style={summaryColHeaderStyle}>Utilidad</span>
                  <span style={summaryColHeaderStyle}>Venta</span>
                </div>

                {RUBROS.map((r) => {
                  const f = getRubroFinancials(r)
                  const hasValue = f.venta > 0
                  return (
                    <div key={r.id} style={summaryRowStyle}>
                      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                        <span style={{ width: 5, height: 5, borderRadius: 999, background: r.color, flexShrink: 0 }} />
                        <span style={{ color: hasValue ? "#cbd5e1" : "#475569", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.num}. {r.label}
                        </span>
                      </div>
                      <span style={{ ...summaryColStyle, color: hasValue ? "#94a3b8" : "#334155" }}>{fmt(f.gasto)}</span>
                      <span style={{ ...summaryColStyle, color: hasValue ? "#34d399" : "#334155" }}>{fmt(f.utilidad)}</span>
                      <span style={{ ...summaryColStyle, color: hasValue ? "#e2e8f0" : "#334155", fontWeight: hasValue ? 600 : 400 }}>{fmt(f.venta)}</span>
                    </div>
                  )
                })}
              </div>

              {/* Totales globales + guardar */}
              <div style={{ paddingLeft: isMobile ? 0 : 32, display: "grid", gap: 0, alignContent: "start", minWidth: 240 }}>
                <TotalBlock label="Total gasto" value={fmt(globalFinancials.gasto)} color="#94a3b8" />
                <TotalBlock label="Total utilidad" value={fmt(globalFinancials.utilidad)} color="#34d399" />
                <div style={{ margin: "8px 0", borderTop: "1px solid rgba(148,163,184,0.14)" }} />
                <TotalBlock label="Total precio de venta" value={fmt(globalFinancials.venta)} color="#a78bfa" large />

                {/* Margen */}
                <div style={marginBarContainerStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ color: "#64748b", fontSize: 11 }}>Margen de utilidad</span>
                    <span style={{ color: marginPct >= 20 ? "#34d399" : marginPct >= 10 ? "#fbbf24" : "#f87171", fontSize: 12, fontWeight: 700 }}>
                      {fmtPct(marginPct)}
                    </span>
                  </div>
                  <div style={marginBarBgStyle}>
                    <div style={{ ...marginBarFillStyle, width: `${Math.min(marginPct, 100)}%`, background: marginPct >= 20 ? "#34d399" : marginPct >= 10 ? "#fbbf24" : "#f87171" }} />
                  </div>
                </div>

                <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
                  <button onClick={handleSave} disabled={saving} style={primaryButtonStyle}>
                    {saving ? "Guardando..." : "Guardar cotización"}
                  </button>
                  <button onClick={handleExportPdf} style={pdfButtonStyle}>
                    ↓ Exportar PDF
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

function TotalBlock({ label, value, color, large }: { label: string; value: string; color: string; large?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "8px 0" }}>
      <span style={{ color: "#64748b", fontSize: large ? 13 : 12 }}>{label}</span>
      <span style={{ color, fontSize: large ? 20 : 14, fontWeight: 700 }}>{value}</span>
    </div>
  )
}

function RubroCard({
  rubro, values, onUpdate, financials, twoColItems, isMobile,
  commissionPct, commissionMarkup, commissionGasto,
  onCommissionPctChange, onCommissionMarkupChange,
  extras, onAddExtra, onUpdateExtra, onRemoveExtra,
}: {
  rubro: RubroDef
  values: Record<string, ItemValues>
  onUpdate: (id: string, patch: Partial<ItemValues>) => void
  financials: RubroFinancials
  twoColItems?: boolean
  isMobile: boolean
  commissionPct?: string
  commissionMarkup?: string
  commissionGasto?: number
  onCommissionPctChange?: (v: string) => void
  onCommissionMarkupChange?: (v: string) => void
  extras: ExtraItem[]
  onAddExtra: () => void
  onUpdateExtra: (tempId: string, patch: Partial<ExtraItem>) => void
  onRemoveExtra: (tempId: string) => void
}) {
  const items = rubro.items
  const mid = twoColItems ? Math.ceil(items.length / 2) : items.length
  const col1 = twoColItems ? items.slice(0, mid) : items
  const col2 = twoColItems ? items.slice(mid) : []

  const hasValue = financials.venta > 0

  return (
    <div style={rubroCardStyle(rubro.color)}>
      {/* Header */}
      <div style={rubroHeaderStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={rubroNumStyle(rubro.color)}>{rubro.num}</span>
          <p style={rubroLabelStyle}>{rubro.label}</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {hasValue && (
            <>
              <span style={{ color: "#64748b", fontSize: 11 }}>
                Gasto <strong style={{ color: "#94a3b8" }}>{fmt(financials.gasto)}</strong>
              </span>
              <span style={{ color: "#64748b", fontSize: 11 }}>
                Utilidad <strong style={{ color: "#34d399" }}>{fmt(financials.utilidad)}</strong>
              </span>
            </>
          )}
          <span style={{ color: hasValue ? rubro.color : "#334155", fontSize: 13, fontWeight: 700 }}>
            {fmt(financials.venta)}
          </span>
        </div>
      </div>

      {/* Encabezados de columna */}
      {!isMobile && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, paddingBottom: 4, borderBottom: "1px solid rgba(148,163,184,0.07)" }}>
          <span style={colHdrStyle}>Cantidad</span>
          <span style={{ width: 10, flexShrink: 0 }} />
          <span style={colHdrStyle}>Días</span>
          <span style={{ width: 10, flexShrink: 0 }} />
          <span style={{ ...colHdrStyle, minWidth: 64 }}>Costo</span>
          <span style={{ width: 34, flexShrink: 0 }} />
          <span style={{ width: 30, flexShrink: 0 }} />
          <span style={{ width: 70, flexShrink: 0 }} />
          <span style={{ ...colHdrStyle, minWidth: 78, textAlign: "right" }}>Utilidad</span>
        </div>
      )}

      {/* Columnas predefinidas */}
      <div style={{ display: "grid", gridTemplateColumns: twoColItems ? "1fr 1fr" : "1fr", gap: "2px 16px" }}>
        {[col1, col2].map((col, ci) => (
          <div key={ci} style={{ display: "grid", gap: 0 }}>
            {col.map((item, idx) => {
              const isLast = idx === col.length - 1

              if (item.special === "agency_commission") {
                const cg = commissionGasto || 0
                const commCalc = calcCommission(cg, commissionMarkup || "0")
                const cv = commCalc.venta
                return (
                  <div key={item.id} style={{ ...itemRowStyle, borderBottom: isLast ? "none" : "1px solid rgba(148,163,184,0.06)", flexWrap: isMobile ? "wrap" : "nowrap" }}>
                    <span style={itemLabelStyle}>{item.label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <input type="number" value={commissionPct} onChange={(e) => onCommissionPctChange?.(e.target.value)} min="0" style={{ ...numInputStyle, width: 34 }} title="% comisión" />
                      <span style={sepStyle}>%  ·  Mkp</span>
                      <input type="number" value={commissionMarkup} onChange={(e) => onCommissionMarkupChange?.(e.target.value)} min="0" style={{ ...numInputStyle, width: 34 }} title="% markup" />
                      <span style={sepStyle}>%</span>
                      <span style={gastoStyle}>{fmt(cg)}</span>
                      <span style={ventaStyle}>{fmt(cv)}</span>
                    </div>
                  </div>
                )
              }

              const v = values[item.id] || DEFAULT_ITEM
              const c = calcItem(v)

              if (isMobile) {
                return (
                  <div key={item.id} style={{ borderBottom: isLast ? "none" : "1px solid rgba(148,163,184,0.08)", background: v.isInternal ? "rgba(5,46,22,0.18)" : "transparent", borderRadius: 6, padding: "7px 4px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ color: "#94a3b8", fontSize: 12 }}>{item.label}</span>
                      <button onClick={() => onUpdate(item.id, { isInternal: !v.isInternal })} style={internalToggleStyle(v.isInternal)}>INT</button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input type="number" value={v.qty} onChange={(e) => onUpdate(item.id, { qty: e.target.value })} min="0" style={{ ...numInputStyle, width: 38 }} placeholder="1" />
                      <span style={sepStyle}>×</span>
                      <input type="number" value={v.days} onChange={(e) => onUpdate(item.id, { days: e.target.value })} min="0" style={{ ...numInputStyle, width: 38 }} placeholder="1" />
                      <span style={sepStyle}>×</span>
                      <input type="number" value={v.cost} onChange={(e) => onUpdate(item.id, { cost: e.target.value })} min="0" style={{ ...numInputStyle, width: 80 }} placeholder="0" />
                      <input type="number" value={v.markup} onChange={(e) => onUpdate(item.id, { markup: e.target.value })} min="0" style={{ ...numInputStyle, width: 38, opacity: v.isInternal ? 0.25 : 1 }} disabled={v.isInternal} placeholder="%" />
                      <span style={{ ...sepStyle, opacity: v.isInternal ? 0.25 : 1 }}>%</span>
                      <span style={{ color: v.isInternal ? "#4ade80" : "#c4b5fd", fontSize: 12, fontWeight: 700, marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{fmt(c.venta)}</span>
                    </div>
                  </div>
                )
              }

              return (
                <div key={item.id} style={{ ...itemRowStyle, borderBottom: isLast ? "none" : "1px solid rgba(148,163,184,0.06)", background: v.isInternal ? "rgba(5,46,22,0.18)" : "transparent", borderRadius: 6, paddingLeft: v.isInternal ? 4 : 0 }}>
                  <span style={itemLabelStyle}>{item.label}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <input type="number" value={v.qty} onChange={(e) => onUpdate(item.id, { qty: e.target.value })} min="0" style={numInputStyle} title="Cantidad" />
                    <span style={sepStyle}>×</span>
                    <input type="number" value={v.days} onChange={(e) => onUpdate(item.id, { days: e.target.value })} min="0" style={numInputStyle} title="Días" />
                    <span style={sepStyle}>×</span>
                    <input type="number" value={v.cost} onChange={(e) => onUpdate(item.id, { cost: e.target.value })} min="0" style={costInputStyle} placeholder="0" title="Costo real" />
                    <input type="number" value={v.markup} onChange={(e) => onUpdate(item.id, { markup: e.target.value })} min="0" style={{ ...numInputStyle, width: 34, opacity: v.isInternal ? 0.25 : 1 }} title="Markup %" disabled={v.isInternal} />
                    <span style={{ ...sepStyle, opacity: v.isInternal ? 0.25 : 1 }}>%</span>
                    <button onClick={() => onUpdate(item.id, { isInternal: !v.isInternal })} style={internalToggleStyle(v.isInternal)} title={v.isInternal ? "Interno: click para quitar" : "Marcar como interno (va directo a utilidad)"}>INT</button>
                    <span style={{ ...gastoStyle, opacity: v.isInternal ? 0.3 : 1 }}>{fmt(c.gasto)}</span>
                    <span style={{ ...ventaStyle, color: v.isInternal ? "#4ade80" : "#c4b5fd" }}>{fmt(c.venta)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Conceptos adicionales */}
      {extras.length > 0 && (
        <div style={{ display: "grid", gap: 2, paddingTop: 6, borderTop: "1px dashed rgba(148,163,184,0.12)" }}>
          {extras.map((item) => {
            const c = calcItem(item)

            if (isMobile) {
              return (
                <div key={item.tempId} style={{ borderBottom: "1px solid rgba(148,163,184,0.08)", background: item.isInternal ? "rgba(5,46,22,0.18)" : "transparent", borderRadius: 6, padding: "7px 4px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <input value={item.description} onChange={(e) => onUpdateExtra(item.tempId, { description: e.target.value })} placeholder="Nombre del concepto" style={{ ...extraDescInputStyle, flex: 1 }} />
                    <button onClick={() => onUpdateExtra(item.tempId, { isInternal: !item.isInternal })} style={internalToggleStyle(item.isInternal)}>INT</button>
                    <button onClick={() => onRemoveExtra(item.tempId)} style={removeExtraStyle}>✕</button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input type="number" value={item.qty} onChange={(e) => onUpdateExtra(item.tempId, { qty: e.target.value })} min="0" style={{ ...numInputStyle, width: 38 }} placeholder="1" />
                    <span style={sepStyle}>×</span>
                    <input type="number" value={item.days} onChange={(e) => onUpdateExtra(item.tempId, { days: e.target.value })} min="0" style={{ ...numInputStyle, width: 38 }} placeholder="1" />
                    <span style={sepStyle}>×</span>
                    <input type="number" value={item.cost} onChange={(e) => onUpdateExtra(item.tempId, { cost: e.target.value })} min="0" style={{ ...numInputStyle, width: 80 }} placeholder="0" />
                    <input type="number" value={item.markup} onChange={(e) => onUpdateExtra(item.tempId, { markup: e.target.value })} min="0" style={{ ...numInputStyle, width: 38, opacity: item.isInternal ? 0.25 : 1 }} disabled={item.isInternal} placeholder="%" />
                    <span style={{ ...sepStyle, opacity: item.isInternal ? 0.25 : 1 }}>%</span>
                    <span style={{ color: item.isInternal ? "#4ade80" : "#c4b5fd", fontSize: 12, fontWeight: 700, marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{fmt(c.venta)}</span>
                  </div>
                </div>
              )
            }

            return (
              <div key={item.tempId} style={{ ...itemRowStyle, gap: 6, background: item.isInternal ? "rgba(5,46,22,0.18)" : "transparent", borderRadius: 6, paddingLeft: item.isInternal ? 4 : 0 }}>
                <input value={item.description} onChange={(e) => onUpdateExtra(item.tempId, { description: e.target.value })} placeholder="Nombre del concepto" style={{ ...extraDescInputStyle, flex: 1, minWidth: 80 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  <input type="number" value={item.qty} onChange={(e) => onUpdateExtra(item.tempId, { qty: e.target.value })} min="0" style={numInputStyle} title="Cantidad" />
                  <span style={sepStyle}>×</span>
                  <input type="number" value={item.days} onChange={(e) => onUpdateExtra(item.tempId, { days: e.target.value })} min="0" style={numInputStyle} title="Días" />
                  <span style={sepStyle}>×</span>
                  <input type="number" value={item.cost} onChange={(e) => onUpdateExtra(item.tempId, { cost: e.target.value })} min="0" style={costInputStyle} placeholder="0" title="Costo real" />
                  <input type="number" value={item.markup} onChange={(e) => onUpdateExtra(item.tempId, { markup: e.target.value })} min="0" style={{ ...numInputStyle, width: 34, opacity: item.isInternal ? 0.25 : 1 }} title="Markup %" disabled={item.isInternal} />
                  <span style={{ ...sepStyle, opacity: item.isInternal ? 0.25 : 1 }}>%</span>
                  <button onClick={() => onUpdateExtra(item.tempId, { isInternal: !item.isInternal })} style={internalToggleStyle(item.isInternal)}>INT</button>
                  <span style={{ ...gastoStyle, opacity: item.isInternal ? 0.3 : 1 }}>{fmt(c.gasto)}</span>
                  <span style={{ ...ventaStyle, color: item.isInternal ? "#4ade80" : "#c4b5fd" }}>{fmt(c.venta)}</span>
                  <button onClick={() => onRemoveExtra(item.tempId)} style={removeExtraStyle} title="Quitar">✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

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

// ─── Styles ─────────────────────────────────────────────────────────────────

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
  flexWrap: "wrap",
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
  gap: 6,
  padding: "5px 0",
}

const itemLabelStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  flex: 1,
  minWidth: 60,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const gastoStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 11,
  minWidth: 70,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
}

const ventaStyle: React.CSSProperties = {
  color: "#c4b5fd",
  fontSize: 12,
  fontWeight: 600,
  minWidth: 78,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
}

const numInputStyle: React.CSSProperties = {
  width: 34,
  padding: "4px 4px",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 6,
  background: "rgba(2,6,23,0.55)",
  color: "#f8fafc",
  outline: "none",
  fontSize: 12,
  textAlign: "right",
  boxSizing: "border-box",
}

const costInputStyle: React.CSSProperties = {
  ...numInputStyle,
  width: 64,
}

const sepStyle: React.CSSProperties = {
  color: "#475569",
  fontSize: 11,
  flexShrink: 0,
  whiteSpace: "nowrap",
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

function internalToggleStyle(active: boolean): React.CSSProperties {
  return {
    padding: "2px 6px",
    borderRadius: 5,
    border: active ? "1px solid rgba(22,163,74,0.55)" : "1px solid rgba(148,163,184,0.18)",
    background: active ? "rgba(5,46,22,0.7)" : "transparent",
    color: active ? "#4ade80" : "#475569",
    fontSize: 9,
    fontWeight: 800,
    cursor: "pointer",
    letterSpacing: 0.5,
    flexShrink: 0,
    lineHeight: 1,
  }
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
    marginTop: 2,
    opacity: 0.8,
  }
}

const colHdrStyle: React.CSSProperties = {
  color: "#475569",
  fontSize: 9,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  minWidth: 34,
  textAlign: "center",
  flexShrink: 0,
}

const summaryHeaderRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  paddingBottom: 8,
  borderBottom: "1px solid rgba(148,163,184,0.10)",
  marginBottom: 4,
}

const summaryColHeaderStyle: React.CSSProperties = {
  color: "#475569",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  minWidth: 90,
  textAlign: "right",
}

const summaryRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "4px 0",
}

const summaryColStyle: React.CSSProperties = {
  fontSize: 12,
  minWidth: 90,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
}

const marginBarContainerStyle: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 0 0",
  borderTop: "1px solid rgba(148,163,184,0.10)",
}

const marginBarBgStyle: React.CSSProperties = {
  height: 6,
  borderRadius: 999,
  background: "rgba(148,163,184,0.12)",
  overflow: "hidden",
}

const marginBarFillStyle: React.CSSProperties = {
  height: "100%",
  borderRadius: 999,
  transition: "width 0.3s ease",
}

const appShellStyle: React.CSSProperties = { display: "flex", minHeight: "100vh", overflow: "hidden" }
const mainStyle: React.CSSProperties = { flex: 1, minWidth: 0, overflowX: "auto" }
const pageContainerStyle: React.CSSProperties = { maxWidth: 1200, margin: "0 auto", minWidth: 0 }
const pageHeaderStyle: React.CSSProperties = { marginBottom: 18 }

const eyebrowStyle: React.CSSProperties = {
  margin: 0, color: "#a78bfa", fontSize: 11,
  textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 700,
}

const pageTitleStyle: React.CSSProperties = {
  margin: "6px 0 0", color: "#f8fafc", fontSize: 28,
  letterSpacing: -0.6, lineHeight: 1.1,
}

const pageSubtitleStyle: React.CSSProperties = {
  margin: "6px 0 0", color: "#64748b", fontSize: 13,
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
  margin: 0, color: "#f8fafc", fontSize: 14, fontWeight: 600,
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

function inlineBtnStyle(color: string): React.CSSProperties {
  return {
    height: 36,
    minWidth: 36,
    padding: "0 10px",
    borderRadius: 8,
    border: `1px solid ${color}55`,
    background: `${color}22`,
    color,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    whiteSpace: "nowrap",
  }
}

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 20px",
  background: "linear-gradient(135deg, #7c3aed, #6366f1)",
  color: "white",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 14,
  boxShadow: "0 8px 24px rgba(124,58,237,0.22)",
}

const pdfButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 20px",
  background: "transparent",
  color: "#94a3b8",
  border: "1px solid rgba(148,163,184,0.22)",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
}
