"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "../../../lib/supabase"
import type { HojaPDFData } from "../../../lib/exportHojaPdf"

// ─── Types ────────────────────────────────────────────────────────────────────

type CrewRow = {
  id: string
  puesto: string
  nombre: string
  retro: string
  locacion: string
  pickup: string
  notas: string
}

type CastRow = {
  id: string
  num: string
  nombre: string
  on_loc: string
  makeup: string
  hairdress: string
  wardrobe: string
  on_set: string
  ensayo: string
  toma: string
  notas: string
}

type LocacionRow = {
  id: string
  locacion: string
  cap: string
  horario: string
  accion: string
  pag: string
  notas: string
}

type HojaData = {
  id: string
  project_id: string
  fecha_rodaje: string
  titulo: string
  dia_num: number
  dia_total: number
  avanzada: string
  client_on_loc: string
  director: string
  productor: string
  ready_to_shoot: string
  locacion_nombre: string
  locacion_url: string
  amanecer: string
  atardecer: string
  clima: string
  lluvia: string
  locaciones: LocacionRow[]
  cast_list: CastRow[]
  crew: CrewRow[]
  arte_needs: string
  makeup_needs: string
  vestuario_needs: string
  efectos_needs: string
  vehiculos: string
  equipo_especial: string
  notas_produccion: string
}

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function emptyLocacion(): LocacionRow {
  return { id: newId(), locacion: "", cap: "", horario: "", accion: "", pag: "", notas: "" }
}

function emptyCast(): CastRow {
  return { id: newId(), num: "", nombre: "", on_loc: "", makeup: "", hairdress: "", wardrobe: "", on_set: "", ensayo: "", toma: "", notas: "" }
}

function emptyCrewRow(): CrewRow {
  return { id: newId(), puesto: "", nombre: "", retro: "", locacion: "", pickup: "", notas: "" }
}

function defaultHoja(projectId: string): Omit<HojaData, "id"> {
  return {
    project_id: projectId,
    fecha_rodaje: "", titulo: "", dia_num: 1, dia_total: 1,
    avanzada: "", client_on_loc: "", director: "", productor: "",
    ready_to_shoot: "", locacion_nombre: "", locacion_url: "",
    amanecer: "", atardecer: "", clima: "", lluvia: "",
    locaciones: [emptyLocacion()],
    cast_list: [emptyCast()],
    crew: [emptyCrewRow()],
    arte_needs: "", makeup_needs: "", vestuario_needs: "", efectos_needs: "",
    vehiculos: "", equipo_especial: "", notas_produccion: "",
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HojaLlamadoPanel({
  projectId,
  isMobile,
}: {
  projectId: string
  isMobile: boolean
}) {
  const [hoja, setHoja] = useState<HojaData | null>(null)
  const [hojaId, setHojaId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)
  const [loadingCrew, setLoadingCrew] = useState(false)

  // ── Sync crew from liberación (defined first; called inside loadHoja) ────────
  const syncCrewFromLiberacion = useCallback(async (
    currentCrew: CrewRow[],
    silent = false,
  ) => {
    setLoadingCrew(true)
    try {
      // 1. Released quote
      const { data: quotes } = await supabase
        .from("quotes")
        .select("id")
        .eq("project_id", projectId)
        .eq("released", true)
        .limit(1)

      if (!quotes || quotes.length === 0) {
        if (!silent) alert("No hay ninguna cotización liberada.\nLibera una cotización primero desde Cotizaciones → ▶ Liberar.")
        return
      }

      const releasedQuoteId = quotes[0].id

      // 2. Items con proveedor O empleado asignado
      const { data: sections } = await supabase
        .from("quote_sections")
        .select("id, order_index")
        .eq("quote_id", releasedQuoteId)
        .order("order_index")

      if (!sections || sections.length === 0) return

      type RawItem = {
        description: string
        order_index: number
        actual_supplier_id: string | null
        actual_employee_id: string | null
      }
      const allItems: RawItem[] = []
      for (const sec of sections) {
        const { data: items } = await supabase
          .from("quote_items")
          .select("description, order_index, actual_supplier_id, actual_employee_id")
          .eq("section_id", sec.id)
          .order("order_index")

        for (const item of (items || []) as RawItem[]) {
          if (item.actual_supplier_id || item.actual_employee_id) {
            allItems.push(item)
          }
        }
      }

      if (allItems.length === 0) {
        if (!silent) alert("No se encontraron proveedores/empleados asignados.\nAsígnalos desde ▶ Liberar.")
        return
      }

      // 3. Fetch proveedores y empleados en paralelo
      const supplierIds = [...new Set(allItems.map((i) => i.actual_supplier_id).filter(Boolean))] as string[]
      const employeeIds = [...new Set(allItems.map((i) => i.actual_employee_id).filter(Boolean))] as string[]

      const [provRes, empRes] = await Promise.all([
        supplierIds.length > 0
          ? supabase.from("proveedores").select("id, nombre, apellido").in("id", supplierIds)
          : Promise.resolve({ data: [] }),
        employeeIds.length > 0
          ? supabase.from("employees").select("id, nombre, apellido_paterno, apellido_materno").in("id", employeeIds)
          : Promise.resolve({ data: [] }),
      ])

      const provMap = new Map((provRes.data || []).map((p: any) => [p.id, `${p.nombre} ${p.apellido}`.trim()]))
      const empMap  = new Map((empRes.data  || []).map((e: any) => {
        const ap = e.apellido_materno ? `${e.apellido_paterno} ${e.apellido_materno}` : e.apellido_paterno
        return [e.id, `${e.nombre} ${ap}`.trim()]
      }))

      // 4. Build/merge crew rows preserving existing times
      const newCrew: CrewRow[] = allItems.map((item) => {
        const nombre = item.actual_supplier_id
          ? (provMap.get(item.actual_supplier_id) ?? "")
          : (empMap.get(item.actual_employee_id!) ?? "")
        const existing = currentCrew.find(
          (c) => c.puesto === item.description && c.nombre === nombre,
        )
        return {
          id: existing?.id ?? newId(),
          puesto: item.description,
          nombre,
          retro:    existing?.retro    ?? "",
          locacion: existing?.locacion ?? "",
          pickup:   existing?.pickup   ?? "",
          notas:    existing?.notas    ?? "",
        }
      })

      // Append manually-added rows not from liberación
      const libKeys = new Set(newCrew.map((r) => `${r.puesto}||${r.nombre}`))
      const manualExtra = currentCrew.filter(
        (r) => r.nombre && !libKeys.has(`${r.puesto}||${r.nombre}`),
      )
      const merged = [...newCrew, ...manualExtra]

      setHoja((prev) =>
        prev ? { ...prev, crew: merged.length > 0 ? merged : [emptyCrewRow()] } : prev,
      )
    } catch (err: any) {
      if (!silent) alert("Error al cargar crew: " + err.message)
    } finally {
      setLoadingCrew(false)
    }
  }, [projectId])

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadHoja = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("hoja_llamado")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle()

    if (error) {
      console.error("Error loading hoja:", error)
    }

    let currentCrew: CrewRow[] = [emptyCrewRow()]

    if (data) {
      setHojaId(data.id)
      currentCrew = (data.crew as CrewRow[]) || [emptyCrewRow()]
      setHoja({
        id: data.id,
        project_id: data.project_id,
        fecha_rodaje: data.fecha_rodaje ?? "",
        titulo: data.titulo ?? "",
        dia_num: data.dia_num ?? 1,
        dia_total: data.dia_total ?? 1,
        avanzada: data.avanzada ?? "",
        client_on_loc: data.client_on_loc ?? "",
        director: data.director ?? "",
        productor: data.productor ?? "",
        ready_to_shoot: data.ready_to_shoot ?? "",
        locacion_nombre: data.locacion_nombre ?? "",
        locacion_url: data.locacion_url ?? "",
        amanecer: data.amanecer ?? "",
        atardecer: data.atardecer ?? "",
        clima: data.clima ?? "",
        lluvia: data.lluvia ?? "",
        locaciones: (data.locaciones as LocacionRow[]) || [emptyLocacion()],
        cast_list: (data.cast_list as CastRow[]) || [emptyCast()],
        crew: currentCrew,
        arte_needs: data.arte_needs ?? "",
        makeup_needs: data.makeup_needs ?? "",
        vestuario_needs: data.vestuario_needs ?? "",
        efectos_needs: data.efectos_needs ?? "",
        vehiculos: data.vehiculos ?? "",
        equipo_especial: data.equipo_especial ?? "",
        notas_produccion: data.notas_produccion ?? "",
      })
    } else {
      setHojaId(null)
      setHoja({ id: "", ...defaultHoja(projectId) })
    }
    setLoading(false)
    // Auto-sync crew silently on mount
    syncCrewFromLiberacion(currentCrew, true)
  }, [projectId, syncCrewFromLiberacion])

  useEffect(() => {
    loadHoja()
  }, [loadHoja])

  // ── Save ──────────────────────────────────────────────────────────────────
  async function saveHoja() {
    if (!hoja) return
    setSaving(true)
    try {
      const payload = {
        project_id: projectId,
        fecha_rodaje: hoja.fecha_rodaje || null,
        titulo: hoja.titulo || null,
        dia_num: hoja.dia_num,
        dia_total: hoja.dia_total,
        avanzada: hoja.avanzada || null,
        client_on_loc: hoja.client_on_loc || null,
        director: hoja.director || null,
        productor: hoja.productor || null,
        ready_to_shoot: hoja.ready_to_shoot || null,
        locacion_nombre: hoja.locacion_nombre || null,
        locacion_url: hoja.locacion_url || null,
        amanecer: hoja.amanecer || null,
        atardecer: hoja.atardecer || null,
        clima: hoja.clima || null,
        lluvia: hoja.lluvia || null,
        locaciones: hoja.locaciones,
        cast_list: hoja.cast_list,
        crew: hoja.crew,
        arte_needs: hoja.arte_needs || null,
        makeup_needs: hoja.makeup_needs || null,
        vestuario_needs: hoja.vestuario_needs || null,
        efectos_needs: hoja.efectos_needs || null,
        vehiculos: hoja.vehiculos || null,
        equipo_especial: hoja.equipo_especial || null,
        notas_produccion: hoja.notas_produccion || null,
        updated_at: new Date().toISOString(),
      }

      if (hojaId) {
        const { error } = await supabase
          .from("hoja_llamado")
          .update(payload)
          .eq("id", hojaId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from("hoja_llamado")
          .insert(payload)
          .select("id")
          .single()
        if (error) throw error
        setHojaId(data.id)
        setHoja((prev) => prev ? { ...prev, id: data.id } : prev)
      }

      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 3000)
    } catch (err: any) {
      alert("Error al guardar: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── PDF export ────────────────────────────────────────────────────────────
  async function handleExportPdf() {
    if (!hoja) return
    try {
      const { exportHojaPdf } = await import("../../../lib/exportHojaPdf")
      const pdfData: HojaPDFData = {
        fecha_rodaje: hoja.fecha_rodaje,
        titulo: hoja.titulo,
        dia_num: hoja.dia_num,
        dia_total: hoja.dia_total,
        avanzada: hoja.avanzada,
        client_on_loc: hoja.client_on_loc,
        director: hoja.director,
        productor: hoja.productor,
        ready_to_shoot: hoja.ready_to_shoot,
        locacion_nombre: hoja.locacion_nombre,
        locacion_url: hoja.locacion_url,
        amanecer: hoja.amanecer,
        atardecer: hoja.atardecer,
        clima: hoja.clima,
        lluvia: hoja.lluvia,
        locaciones: hoja.locaciones,
        cast_list: hoja.cast_list,
        crew: hoja.crew,
        arte_needs: hoja.arte_needs,
        makeup_needs: hoja.makeup_needs,
        vestuario_needs: hoja.vestuario_needs,
        efectos_needs: hoja.efectos_needs,
        vehiculos: hoja.vehiculos,
        equipo_especial: hoja.equipo_especial,
        notas_produccion: hoja.notas_produccion,
      }
      await exportHojaPdf(pdfData, hoja.titulo || undefined)
    } catch (err: any) {
      alert("Error al generar PDF: " + err.message)
    }
  }

  // ── Field helpers ─────────────────────────────────────────────────────────
  function setField<K extends keyof HojaData>(key: K, value: HojaData[K]) {
    setHoja((prev) => prev ? { ...prev, [key]: value } : prev)
  }

  // ── Locaciones helpers ────────────────────────────────────────────────────
  function updateLocacion<K extends keyof LocacionRow>(idx: number, key: K, val: LocacionRow[K]) {
    setHoja((prev) => {
      if (!prev) return prev
      const next = [...prev.locaciones]
      next[idx] = { ...next[idx], [key]: val }
      return { ...prev, locaciones: next }
    })
  }
  function addLocacion() {
    setHoja((prev) => prev ? { ...prev, locaciones: [...prev.locaciones, emptyLocacion()] } : prev)
  }
  function removeLocacion(idx: number) {
    setHoja((prev) => {
      if (!prev || prev.locaciones.length <= 1) return prev
      return { ...prev, locaciones: prev.locaciones.filter((_, i) => i !== idx) }
    })
  }

  // ── Cast helpers ──────────────────────────────────────────────────────────
  function updateCast<K extends keyof CastRow>(idx: number, key: K, val: CastRow[K]) {
    setHoja((prev) => {
      if (!prev) return prev
      const next = [...prev.cast_list]
      next[idx] = { ...next[idx], [key]: val }
      return { ...prev, cast_list: next }
    })
  }
  function addCast() {
    setHoja((prev) => prev ? { ...prev, cast_list: [...prev.cast_list, emptyCast()] } : prev)
  }
  function removeCast(idx: number) {
    setHoja((prev) => {
      if (!prev || prev.cast_list.length <= 1) return prev
      return { ...prev, cast_list: prev.cast_list.filter((_, i) => i !== idx) }
    })
  }

  // ── Crew helpers ──────────────────────────────────────────────────────────
  function updateCrew<K extends keyof CrewRow>(idx: number, key: K, val: CrewRow[K]) {
    setHoja((prev) => {
      if (!prev) return prev
      const next = [...prev.crew]
      next[idx] = { ...next[idx], [key]: val }
      return { ...prev, crew: next }
    })
  }
  function addCrewRow() {
    setHoja((prev) => prev ? { ...prev, crew: [...prev.crew, emptyCrewRow()] } : prev)
  }
  function removeCrew(idx: number) {
    setHoja((prev) => {
      if (!prev || prev.crew.length <= 1) return prev
      return { ...prev, crew: prev.crew.filter((_, i) => i !== idx) }
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return <div style={emptyStyle}>Cargando hoja de llamado...</div>
  }

  if (!hoja) return null

  return (
    <div style={{ display: "grid", gap: 20 }}>

      {/* ── Panel header ─────────────────────────────────────────────────── */}
      <div style={panelHeaderStyle}>
        <div>
          <p style={panelTitleStyle}>Hoja de Llamado</p>
          <p style={panelHintStyle}>
            Detalle operativo de la jornada de rodaje. El crew se autocompleta desde la cotización liberada.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => hoja && syncCrewFromLiberacion(hoja.crew, false)}
            disabled={loadingCrew}
            style={loadCrewBtnStyle}
            title="Actualiza el crew con los últimos proveedores/empleados asignados en la liberación"
          >
            {loadingCrew ? "Actualizando..." : "⟳ Actualizar crew"}
          </button>
          <button
            onClick={handleExportPdf}
            style={pdfBtnStyle}
            title="Exportar hoja de llamado en PDF tamaño carta"
          >
            ↓ PDF
          </button>
          <button
            onClick={saveHoja}
            disabled={saving}
            style={saveOk ? { ...saveBtnStyle, background: "#059669" } : saveBtnStyle}
          >
            {saving ? "Guardando..." : saveOk ? "✓ Guardado" : "Guardar hoja"}
          </button>
        </div>
      </div>

      {/* ══ SECCIÓN 1: ENCABEZADO ══════════════════════════════════════════ */}
      <Section title="Encabezado">

        {/* Row 1: Fecha, Título, Día X de Y */}
        <div style={isMobile ? grid1Style : grid3Style}>
          <Field label="Fecha de rodaje">
            <input
              type="date"
              value={hoja.fecha_rodaje}
              onChange={(e) => setField("fecha_rodaje", e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Título / Campaña">
            <input
              value={hoja.titulo}
              onChange={(e) => setField("titulo", e.target.value)}
              placeholder="Nombre del proyecto"
              style={inputStyle}
            />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="Día #">
              <input
                type="number"
                value={hoja.dia_num}
                onChange={(e) => setField("dia_num", parseInt(e.target.value) || 1)}
                min={1}
                style={inputStyle}
              />
            </Field>
            <Field label="De total">
              <input
                type="number"
                value={hoja.dia_total}
                onChange={(e) => setField("dia_total", parseInt(e.target.value) || 1)}
                min={1}
                style={inputStyle}
              />
            </Field>
          </div>
        </div>

        {/* Row 2: Avanzada, Client on loc, Ready to shoot */}
        <div style={isMobile ? grid1Style : grid3Style}>
          <Field label="Avanzada (hora)">
            <input
              type="time"
              value={hoja.avanzada}
              onChange={(e) => setField("avanzada", e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Client on loc (hora)">
            <input
              type="time"
              value={hoja.client_on_loc}
              onChange={(e) => setField("client_on_loc", e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Ready to shoot (hora)">
            <input
              type="time"
              value={hoja.ready_to_shoot}
              onChange={(e) => setField("ready_to_shoot", e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>

        {/* Row 3: Director, Productor */}
        <div style={isMobile ? grid1Style : grid2Style}>
          <Field label="Director">
            <input
              value={hoja.director}
              onChange={(e) => setField("director", e.target.value)}
              placeholder="Nombre del director"
              style={inputStyle}
            />
          </Field>
          <Field label="Productor">
            <input
              value={hoja.productor}
              onChange={(e) => setField("productor", e.target.value)}
              placeholder="Nombre del productor"
              style={inputStyle}
            />
          </Field>
        </div>

        {/* Row 4: Locación nombre, URL */}
        <div style={isMobile ? grid1Style : grid2Style}>
          <Field label="Locación">
            <input
              value={hoja.locacion_nombre}
              onChange={(e) => setField("locacion_nombre", e.target.value)}
              placeholder="Nombre de la locación"
              style={inputStyle}
            />
          </Field>
          <Field label="URL / Maps">
            <input
              value={hoja.locacion_url}
              onChange={(e) => setField("locacion_url", e.target.value)}
              placeholder="https://maps.google.com/..."
              style={inputStyle}
            />
          </Field>
        </div>

        {/* Row 5: Clima */}
        <div style={isMobile ? grid2Style : grid4Style}>
          <Field label="Amanecer">
            <input
              type="time"
              value={hoja.amanecer}
              onChange={(e) => setField("amanecer", e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Atardecer">
            <input
              type="time"
              value={hoja.atardecer}
              onChange={(e) => setField("atardecer", e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Clima">
            <input
              value={hoja.clima}
              onChange={(e) => setField("clima", e.target.value)}
              placeholder="Ej. Soleado, Nublado..."
              style={inputStyle}
            />
          </Field>
          <Field label="Prob. lluvia">
            <input
              value={hoja.lluvia}
              onChange={(e) => setField("lluvia", e.target.value)}
              placeholder="Ej. 10%"
              style={inputStyle}
            />
          </Field>
        </div>
      </Section>

      {/* ══ SECCIÓN 2: LOCACIONES ══════════════════════════════════════════ */}
      <Section title="Locaciones">
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                {["Locación", "Cap.", "Horario", "Acción / Escena", "Pág.", "Notas", ""].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hoja.locaciones.map((row, idx) => (
                <tr key={row.id}>
                  <td style={tdStyle}>
                    <input value={row.locacion} onChange={(e) => updateLocacion(idx, "locacion", e.target.value)} style={cellInputStyle} placeholder="Nombre locación" />
                  </td>
                  <td style={{ ...tdStyle, width: 60 }}>
                    <input value={row.cap} onChange={(e) => updateLocacion(idx, "cap", e.target.value)} style={cellInputStyle} placeholder="—" />
                  </td>
                  <td style={{ ...tdStyle, width: 110 }}>
                    <input value={row.horario} onChange={(e) => updateLocacion(idx, "horario", e.target.value)} style={cellInputStyle} placeholder="08:00 – 18:00" />
                  </td>
                  <td style={tdStyle}>
                    <input value={row.accion} onChange={(e) => updateLocacion(idx, "accion", e.target.value)} style={cellInputStyle} placeholder="Descripción" />
                  </td>
                  <td style={{ ...tdStyle, width: 60 }}>
                    <input value={row.pag} onChange={(e) => updateLocacion(idx, "pag", e.target.value)} style={cellInputStyle} placeholder="—" />
                  </td>
                  <td style={tdStyle}>
                    <input value={row.notas} onChange={(e) => updateLocacion(idx, "notas", e.target.value)} style={cellInputStyle} placeholder="—" />
                  </td>
                  <td style={{ ...tdStyle, width: 32 }}>
                    <button onClick={() => removeLocacion(idx)} style={removeRowBtnStyle} title="Eliminar fila">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addLocacion} style={addRowBtnStyle}>+ Agregar locación</button>
      </Section>

      {/* ══ SECCIÓN 3: CAST ═══════════════════════════════════════════════ */}
      <Section title="Cast">
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                {["#", "Nombre", "On loc.", "Makeup", "Hairdress", "Wardrobe", "On set", "Ensayo", "Toma", "Notas", ""].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hoja.cast_list.map((row, idx) => (
                <tr key={row.id}>
                  <td style={{ ...tdStyle, width: 36 }}>
                    <input value={row.num} onChange={(e) => updateCast(idx, "num", e.target.value)} style={cellInputStyle} placeholder={String(idx + 1)} />
                  </td>
                  <td style={{ ...tdStyle, minWidth: 140 }}>
                    <input value={row.nombre} onChange={(e) => updateCast(idx, "nombre", e.target.value)} style={cellInputStyle} placeholder="Nombre del actor" />
                  </td>
                  {(["on_loc", "makeup", "hairdress", "wardrobe", "on_set", "ensayo", "toma"] as const).map((col) => (
                    <td key={col} style={{ ...tdStyle, width: 80 }}>
                      <input
                        value={row[col]}
                        onChange={(e) => updateCast(idx, col, e.target.value)}
                        style={cellInputStyle}
                        placeholder="--:--"
                      />
                    </td>
                  ))}
                  <td style={tdStyle}>
                    <input value={row.notas} onChange={(e) => updateCast(idx, "notas", e.target.value)} style={cellInputStyle} placeholder="—" />
                  </td>
                  <td style={{ ...tdStyle, width: 32 }}>
                    <button onClick={() => removeCast(idx)} style={removeRowBtnStyle} title="Eliminar fila">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addCast} style={addRowBtnStyle}>+ Agregar actor</button>
      </Section>

      {/* ══ SECCIÓN 4: CREW LIST ══════════════════════════════════════════ */}
      <Section title="Crew List">
        <p style={{ margin: "0 0 10px", color: "#64748b", fontSize: 12 }}>
          El crew se autocompleta desde los proveedores asignados en la liberación. Solo rellena los horarios.
        </p>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Puesto</th>
                <th style={thStyle}>Nombre</th>
                <th style={{ ...thStyle, background: "rgba(124,58,237,0.14)", color: "#c4b5fd" }}>RETRO</th>
                <th style={{ ...thStyle, background: "rgba(14,165,233,0.10)", color: "#7dd3fc" }}>LOCACIÓN</th>
                <th style={{ ...thStyle, background: "rgba(34,197,94,0.10)", color: "#86efac" }}>PICKUP</th>
                <th style={thStyle}>Notas</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {hoja.crew.map((row, idx) => (
                <tr key={row.id}>
                  <td style={{ ...tdStyle, width: 32, color: "#475569", fontSize: 12, textAlign: "center" }}>
                    {idx + 1}
                  </td>
                  <td style={{ ...tdStyle, minWidth: 140 }}>
                    <input
                      value={row.puesto}
                      onChange={(e) => updateCrew(idx, "puesto", e.target.value)}
                      style={cellInputStyle}
                      placeholder="Rol / Puesto"
                    />
                  </td>
                  <td style={{ ...tdStyle, minWidth: 150 }}>
                    <input
                      value={row.nombre}
                      onChange={(e) => updateCrew(idx, "nombre", e.target.value)}
                      style={cellInputStyle}
                      placeholder="Nombre completo"
                    />
                  </td>
                  <td style={{ ...tdStyle, width: 90, background: "rgba(124,58,237,0.05)" }}>
                    <input
                      value={row.retro}
                      onChange={(e) => updateCrew(idx, "retro", e.target.value)}
                      style={{ ...cellInputStyle, textAlign: "center" }}
                      placeholder="--:--"
                    />
                  </td>
                  <td style={{ ...tdStyle, width: 90, background: "rgba(14,165,233,0.05)" }}>
                    <input
                      value={row.locacion}
                      onChange={(e) => updateCrew(idx, "locacion", e.target.value)}
                      style={{ ...cellInputStyle, textAlign: "center" }}
                      placeholder="--:--"
                    />
                  </td>
                  <td style={{ ...tdStyle, width: 90, background: "rgba(34,197,94,0.05)" }}>
                    <input
                      value={row.pickup}
                      onChange={(e) => updateCrew(idx, "pickup", e.target.value)}
                      style={{ ...cellInputStyle, textAlign: "center" }}
                      placeholder="--:--"
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      value={row.notas}
                      onChange={(e) => updateCrew(idx, "notas", e.target.value)}
                      style={cellInputStyle}
                      placeholder="—"
                    />
                  </td>
                  <td style={{ ...tdStyle, width: 32 }}>
                    <button onClick={() => removeCrew(idx)} style={removeRowBtnStyle} title="Eliminar fila">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addCrewRow} style={addRowBtnStyle}>+ Agregar fila</button>
      </Section>

      {/* ══ SECCIÓN 5: NECESIDADES ════════════════════════════════════════ */}
      <Section title="Necesidades">
        <div style={isMobile ? grid1Style : grid4Style}>
          <Field label="Arte / Set dressing">
            <textarea
              value={hoja.arte_needs}
              onChange={(e) => setField("arte_needs", e.target.value)}
              placeholder="Necesidades de arte..."
              rows={4}
              style={textareaStyle}
            />
          </Field>
          <Field label="Maquillaje / Peinado">
            <textarea
              value={hoja.makeup_needs}
              onChange={(e) => setField("makeup_needs", e.target.value)}
              placeholder="Necesidades de maquillaje y peinado..."
              rows={4}
              style={textareaStyle}
            />
          </Field>
          <Field label="Vestuario">
            <textarea
              value={hoja.vestuario_needs}
              onChange={(e) => setField("vestuario_needs", e.target.value)}
              placeholder="Necesidades de vestuario..."
              rows={4}
              style={textareaStyle}
            />
          </Field>
          <Field label="Efectos especiales">
            <textarea
              value={hoja.efectos_needs}
              onChange={(e) => setField("efectos_needs", e.target.value)}
              placeholder="Efectos especiales requeridos..."
              rows={4}
              style={textareaStyle}
            />
          </Field>
        </div>
      </Section>

      {/* ══ SECCIÓN 6: LOGÍSTICA Y NOTAS ════════════════════════════════ */}
      <Section title="Logística y notas de producción">
        <div style={isMobile ? grid1Style : grid3Style}>
          <Field label="Vehículos">
            <textarea
              value={hoja.vehiculos}
              onChange={(e) => setField("vehiculos", e.target.value)}
              placeholder="Vehículos requeridos..."
              rows={3}
              style={textareaStyle}
            />
          </Field>
          <Field label="Equipo especial">
            <textarea
              value={hoja.equipo_especial}
              onChange={(e) => setField("equipo_especial", e.target.value)}
              placeholder="Equipo especial necesario..."
              rows={3}
              style={textareaStyle}
            />
          </Field>
          <Field label="Notas de producción">
            <textarea
              value={hoja.notas_produccion}
              onChange={(e) => setField("notas_produccion", e.target.value)}
              placeholder="Notas generales de producción..."
              rows={3}
              style={textareaStyle}
            />
          </Field>
        </div>
      </Section>

      {/* ── Bottom save ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "flex-end", paddingBottom: 8 }}>
        <button
          onClick={saveHoja}
          disabled={saving}
          style={saveOk ? { ...saveBtnStyle, background: "#059669" } : saveBtnStyle}
        >
          {saving ? "Guardando..." : saveOk ? "✓ Guardado" : "Guardar hoja"}
        </button>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={sectionStyle}>
      <p style={sectionTitleStyle}>{title}</p>
      <div style={{ display: "grid", gap: 12 }}>{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const emptyStyle: React.CSSProperties = {
  padding: "28px 16px",
  textAlign: "center",
  color: "#64748b",
  fontSize: 13,
}

const panelHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  paddingBottom: 14,
  borderBottom: "1px solid rgba(148,163,184,0.10)",
  flexWrap: "wrap",
}

const panelTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 15,
  fontWeight: 600,
}

const panelHintStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#64748b",
  fontSize: 12,
}

const saveBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 18px",
  borderRadius: 8,
  border: "none",
  background: "linear-gradient(135deg, #7c3aed, #6366f1)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: "nowrap",
  transition: "background 0.2s ease",
}

const loadCrewBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid rgba(14,165,233,0.30)",
  background: "rgba(14,165,233,0.08)",
  color: "#7dd3fc",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
}

const pdfBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(255,255,255,0.04)",
  color: "#94a3b8",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
}

const sectionStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.10)",
  background: "rgba(2,6,23,0.20)",
}

const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 12px",
  color: "#a78bfa",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.8,
}

const labelStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.5,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(2,6,23,0.55)",
  color: "#f8fafc",
  outline: "none",
  fontSize: 13,
  boxSizing: "border-box",
}

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(2,6,23,0.55)",
  color: "#f8fafc",
  outline: "none",
  fontSize: 13,
  resize: "vertical",
  fontFamily: "inherit",
  boxSizing: "border-box",
}

const tableWrapStyle: React.CSSProperties = {
  overflowX: "auto",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.12)",
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
}

const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "rgba(15,23,42,0.7)",
  color: "#64748b",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  textAlign: "left",
  whiteSpace: "nowrap",
  borderBottom: "1px solid rgba(148,163,184,0.12)",
}

const tdStyle: React.CSSProperties = {
  padding: "4px 6px",
  borderBottom: "1px solid rgba(148,163,184,0.07)",
  verticalAlign: "middle",
}

const cellInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "5px 8px",
  borderRadius: 6,
  border: "1px solid transparent",
  background: "transparent",
  color: "#e2e8f0",
  outline: "none",
  fontSize: 12,
  transition: "border-color 0.15s, background 0.15s",
  boxSizing: "border-box",
}

const removeRowBtnStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 6,
  border: "1px solid rgba(248,113,113,0.20)",
  background: "transparent",
  color: "#f87171",
  cursor: "pointer",
  fontSize: 11,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
}

const addRowBtnStyle: React.CSSProperties = {
  marginTop: 8,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1px dashed rgba(148,163,184,0.20)",
  background: "transparent",
  color: "#64748b",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 500,
}

const grid1Style: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 12,
}

const grid2Style: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
}

const grid3Style: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 12,
}

const grid4Style: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 12,
}
