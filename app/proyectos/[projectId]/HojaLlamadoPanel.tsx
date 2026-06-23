"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "../../../lib/supabase"
import type { HojaPDFData } from "../../../lib/exportHojaPdf"

// ─── CDMX Weather helpers ─────────────────────────────────────────────────────

const CDMX_LAT = 19.4326
const CDMX_LNG = -99.1332

const WMO_LABELS: Record<number, string> = {
  0: "Despejado",
  1: "Principalmente despejado",
  2: "Parcialmente nublado",
  3: "Nublado",
  45: "Neblina",
  48: "Neblina con escarcha",
  51: "Llovizna ligera",
  53: "Llovizna moderada",
  55: "Llovizna intensa",
  61: "Lluvia ligera",
  63: "Lluvia moderada",
  65: "Lluvia intensa",
  71: "Nevada ligera",
  73: "Nevada moderada",
  75: "Nevada intensa",
  80: "Chubascos ligeros",
  81: "Chubascos moderados",
  82: "Chubascos intensos",
  95: "Tormenta",
  96: "Tormenta con granizo",
  99: "Tormenta intensa con granizo",
}

function wmoLabel(code: number): string {
  return WMO_LABELS[code] ?? "Desconocido"
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-MX", {
      timeZone: "America/Mexico_City",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  } catch {
    return ""
  }
}

async function fetchCdmxWeather(date: string): Promise<{
  amanecer: string
  atardecer: string
  clima: string
  lluvia: string
} | null> {
  if (!date) return null
  try {
    // Sunrise/sunset — works for any date, returns UTC ISO strings
    const sunUrl =
      `https://api.sunrise-sunset.org/json?lat=${CDMX_LAT}&lng=${CDMX_LNG}` +
      `&date=${date}&tzid=America/Mexico_City&formatted=0`

    // Weather forecast — works up to 16 days ahead; try archive for past dates
    const today = new Date().toISOString().slice(0, 10)
    const isPast = date < today
    const weatherUrl = isPast
      ? `https://archive-api.open-meteo.com/v1/archive?latitude=${CDMX_LAT}&longitude=${CDMX_LNG}` +
        `&start_date=${date}&end_date=${date}&daily=weathercode,precipitation_probability_max` +
        `&timezone=America%2FMexico_City`
      : `https://api.open-meteo.com/v1/forecast?latitude=${CDMX_LAT}&longitude=${CDMX_LNG}` +
        `&start_date=${date}&end_date=${date}&daily=weathercode,precipitation_probability_max` +
        `&timezone=America%2FMexico_City`

    const [sunRes, wxRes] = await Promise.all([
      fetch(sunUrl).then((r) => r.json()),
      fetch(weatherUrl).then((r) => r.json()).catch(() => null),
    ])

    const amanecer = sunRes?.results?.sunrise ? fmtTime(sunRes.results.sunrise) : ""
    const atardecer = sunRes?.results?.sunset ? fmtTime(sunRes.results.sunset) : ""

    const wCode: number | undefined = wxRes?.daily?.weathercode?.[0]
    const precip: number | undefined = wxRes?.daily?.precipitation_probability_max?.[0]

    const clima = wCode !== undefined ? wmoLabel(wCode) : ""
    const lluvia = precip !== undefined ? `${precip}%` : ""

    return { amanecer, atardecer, clima, lluvia }
  } catch {
    return null
  }
}

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

type DirRow = {
  id: string
  nombre: string
  url: string
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
  /** @deprecated usa direcciones */
  locacion_nombre: string
  /** @deprecated usa direcciones */
  locacion_url: string
  direcciones: DirRow[]
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

// ─── Crew sort ────────────────────────────────────────────────────────────────

const CREW_PRIORITY: RegExp[] = [
  /director/i,
  /\bAD\b/,
  /productor/i,
  /asistente.{0,15}produc|\bAP\b/i,
  /\bDP\b|director\s+de\s+foto/i,
  /fot[oó]grafo/i,
]

function crewPriorityIndex(puesto: string): number {
  for (let i = 0; i < CREW_PRIORITY.length; i++) {
    if (CREW_PRIORITY[i].test(puesto)) return i
  }
  return CREW_PRIORITY.length
}

function sortCrew(crew: CrewRow[]): CrewRow[] {
  return [...crew].sort((a, b) => {
    const pa = crewPriorityIndex(a.puesto)
    const pb = crewPriorityIndex(b.puesto)
    if (pa !== pb) return pa - pb
    // Both are "other" → alphabetical by puesto
    if (pa === CREW_PRIORITY.length) return a.puesto.localeCompare(b.puesto, "es", { sensitivity: "base" })
    return 0
  })
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

function emptyDir(): DirRow {
  return { id: newId(), nombre: "", url: "" }
}

function defaultHoja(projectId: string): Omit<HojaData, "id"> {
  return {
    project_id: projectId,
    fecha_rodaje: "", titulo: "", dia_num: 1, dia_total: 1,
    avanzada: "", client_on_loc: "", director: "", productor: "",
    ready_to_shoot: "", locacion_nombre: "", locacion_url: "",
    direcciones: [emptyDir()],
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
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const dragSrcIdx = useRef<number | null>(null)

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
          ? supabase.from("employees").select("id, nombre, apellido_paterno, apellido_materno, nickname").in("id", employeeIds)
          : Promise.resolve({ data: [] }),
      ])

      const empMap = new Map((empRes.data || []).map((e: any) => [
        e.id, (e.nickname?.trim() || e.nombre) as string,
      ]))

      // Build a lookup: "nombre apellido" → resolved display name (for cross-referencing
      // employees that also appear as proveedores, e.g. "Ricardo Romero" → "Rich")
      const empByFullName = new Map<string, string>()
      for (const e of (empRes.data || []) as any[]) {
        const full = `${e.nombre} ${e.apellido_paterno || ""}`.trim().toLowerCase()
        empByFullName.set(full, e.nickname?.trim() || e.nombre)
      }

      const provMap = new Map((provRes.data || []).map((p: any) => {
        const full = `${p.nombre} ${p.apellido}`.trim()
        // If this supplier is also an internal employee, use their nickname
        const asEmployee = empByFullName.get(full.toLowerCase())
        return [p.id, asEmployee ?? full]
      }))

      // 4. Build/merge crew rows — deduplicate by resolved puesto+nombre
      const seenCrew = new Set<string>()
      const newCrew: CrewRow[] = []
      for (const item of allItems) {
        const nombre = item.actual_supplier_id
          ? (provMap.get(item.actual_supplier_id) ?? "")
          : (empMap.get(item.actual_employee_id!) ?? "")
        const key = `${item.description}||${nombre}`
        if (seenCrew.has(key)) continue
        seenCrew.add(key)
        const existing = currentCrew.find(
          (c) => c.puesto === item.description && c.nombre === nombre,
        )
        newCrew.push({
          id: existing?.id ?? newId(),
          puesto: item.description,
          nombre,
          retro:    existing?.retro    ?? "",
          locacion: existing?.locacion ?? "",
          pickup:   existing?.pickup   ?? "",
          notas:    existing?.notas    ?? "",
        })
      }

      // Append manually-added rows not from liberación
      const libKeys = new Set(newCrew.map((r) => `${r.puesto}||${r.nombre}`))
      const manualExtra = currentCrew.filter(
        (r) => r.nombre && !libKeys.has(`${r.puesto}||${r.nombre}`),
      )
      const merged = sortCrew([...newCrew, ...manualExtra])

      // Auto-fill director and productor from liberación items
      function resolvePersonName(item: RawItem): string {
        if (item.actual_supplier_id) return provMap.get(item.actual_supplier_id) ?? ""
        if (item.actual_employee_id) return empMap.get(item.actual_employee_id) ?? ""
        return ""
      }
      const directorItem = allItems.find((i) => /director/i.test(i.description))
      const productorItem = allItems.find((i) => /productor/i.test(i.description))

      setHoja((prev) => {
        if (!prev) return prev
        const updates: Partial<HojaData> = {
          crew: merged.length > 0 ? merged : [emptyCrewRow()],
        }
        if (directorItem) {
          const name = resolvePersonName(directorItem)
          if (name) updates.director = name
        }
        if (productorItem) {
          const name = resolvePersonName(productorItem)
          if (name) updates.productor = name
        }
        return { ...prev, ...updates }
      })
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
        // Migrar legado → nuevo campo; si ya existe direcciones usar eso
        direcciones: Array.isArray(data.direcciones) && data.direcciones.length > 0
          ? (data.direcciones as DirRow[])
          : (data.locacion_nombre
              ? [{ id: newId(), nombre: data.locacion_nombre, url: data.locacion_url ?? "" }]
              : [emptyDir()]),
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

  // ── Auto-fill clima when fecha_rodaje changes ─────────────────────────────
  const [fetchingWeather, setFetchingWeather] = useState(false)
  useEffect(() => {
    const date = hoja?.fecha_rodaje
    if (!date || date.length < 10) return
    let cancelled = false
    setFetchingWeather(true)
    fetchCdmxWeather(date).then((wx) => {
      if (cancelled || !wx) return
      setHoja((prev) => prev ? {
        ...prev,
        amanecer: wx.amanecer  || prev.amanecer,
        atardecer: wx.atardecer || prev.atardecer,
        clima: wx.clima        || prev.clima,
        lluvia: wx.lluvia      || prev.lluvia,
      } : prev)
    }).finally(() => {
      if (!cancelled) setFetchingWeather(false)
    })
    return () => { cancelled = true }
  }, [hoja?.fecha_rodaje])

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
        locacion_nombre: hoja.direcciones[0]?.nombre || hoja.locacion_nombre || null,
        locacion_url: hoja.direcciones[0]?.url || hoja.locacion_url || null,
        direcciones: hoja.direcciones,
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
      const s = (v: unknown) => (v == null ? "" : String(v))   // sanitize null → ""
      const pdfData: HojaPDFData = {
        fecha_rodaje:     s(hoja.fecha_rodaje),
        titulo:           s(hoja.titulo),
        dia_num:          hoja.dia_num,
        dia_total:        hoja.dia_total,
        avanzada:         s(hoja.avanzada),
        client_on_loc:    s(hoja.client_on_loc),
        director:         s(hoja.director),
        productor:        s(hoja.productor),
        ready_to_shoot:   s(hoja.ready_to_shoot),
        direcciones:      hoja.direcciones.map(d => ({ nombre: s(d.nombre), url: s(d.url) })),
        amanecer:         s(hoja.amanecer),
        atardecer:        s(hoja.atardecer),
        clima:            s(hoja.clima),
        lluvia:           s(hoja.lluvia),
        locaciones:       hoja.locaciones,
        cast_list:        hoja.cast_list,
        crew:             hoja.crew,
        arte_needs:       s(hoja.arte_needs),
        makeup_needs:     s(hoja.makeup_needs),
        vestuario_needs:  s(hoja.vestuario_needs),
        efectos_needs:    s(hoja.efectos_needs),
        vehiculos:        s(hoja.vehiculos),
        equipo_especial:  s(hoja.equipo_especial),
        notas_produccion: s(hoja.notas_produccion),
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

  function handleCrewDrop(targetIdx: number) {
    const src = dragSrcIdx.current
    if (src === null || src === targetIdx) { setDragOverIdx(null); return }
    setHoja((prev) => {
      if (!prev) return prev
      const next = [...prev.crew]
      const [moved] = next.splice(src, 1)
      next.splice(targetIdx, 0, moved)
      return { ...prev, crew: next }
    })
    dragSrcIdx.current = null
    setDragOverIdx(null)
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
            <span style={{ color: "#475569", fontSize: 10 }}>
              El clima y amanecer/atardecer se cargan automáticamente para CDMX
            </span>
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

        {/* Row 4: Direcciones (múltiples) */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>
              Direcciones / Locaciones
            </span>
            <button
              type="button"
              onClick={() => setHoja(prev => prev ? { ...prev, direcciones: [...prev.direcciones, emptyDir()] } : prev)}
              style={addDirBtnStyle}
            >
              + Agregar dirección
            </button>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {hoja.direcciones.map((dir, idx) => (
              <div key={dir.id} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr auto", gap: 8, alignItems: "end" }}>
                <Field label={`Locación ${hoja.direcciones.length > 1 ? idx + 1 : ""}`}>
                  <input
                    value={dir.nombre}
                    onChange={e => setHoja(prev => prev ? {
                      ...prev,
                      direcciones: prev.direcciones.map((d, i) => i === idx ? { ...d, nombre: e.target.value } : d)
                    } : prev)}
                    placeholder="Nombre de la locación"
                    style={inputStyle}
                  />
                </Field>
                <Field label="URL / Maps">
                  <input
                    value={dir.url}
                    onChange={e => setHoja(prev => prev ? {
                      ...prev,
                      direcciones: prev.direcciones.map((d, i) => i === idx ? { ...d, url: e.target.value } : d)
                    } : prev)}
                    placeholder="https://maps.google.com/..."
                    style={inputStyle}
                  />
                </Field>
                {hoja.direcciones.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setHoja(prev => prev ? {
                      ...prev,
                      direcciones: prev.direcciones.filter((_, i) => i !== idx)
                    } : prev)}
                    style={removeDirBtnStyle}
                    title="Eliminar dirección"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Row 5: Clima — se auto-llena al poner la fecha de rodaje */}
        <div style={isMobile ? grid2Style : grid4Style}>
          <Field label={fetchingWeather ? "Amanecer · actualizando..." : "Amanecer (CDMX)"}>
            <input
              type="time"
              value={hoja.amanecer}
              onChange={(e) => setField("amanecer", e.target.value)}
              style={inputStyle}
              placeholder="--:--"
            />
          </Field>
          <Field label={fetchingWeather ? "Atardecer · actualizando..." : "Atardecer (CDMX)"}>
            <input
              type="time"
              value={hoja.atardecer}
              onChange={(e) => setField("atardecer", e.target.value)}
              style={inputStyle}
              placeholder="--:--"
            />
          </Field>
          <Field label={fetchingWeather ? "Clima · actualizando..." : "Clima (CDMX)"}>
            <input
              value={hoja.clima}
              onChange={(e) => setField("clima", e.target.value)}
              placeholder={fetchingWeather ? "Cargando..." : "Ej. Soleado, Nublado..."}
              style={inputStyle}
            />
          </Field>
          <Field label={fetchingWeather ? "Lluvia · actualizando..." : "Prob. lluvia (CDMX)"}>
            <input
              value={hoja.lluvia}
              onChange={(e) => setField("lluvia", e.target.value)}
              placeholder={fetchingWeather ? "Cargando..." : "Ej. 10%"}
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
                <th style={{ ...thStyle, width: 28 }}></th>
                <th style={{ ...thStyle, width: 32 }}>#</th>
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
                <tr
                  key={row.id}
                  draggable
                  onDragStart={() => { dragSrcIdx.current = idx }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx) }}
                  onDragLeave={() => setDragOverIdx(null)}
                  onDrop={() => handleCrewDrop(idx)}
                  onDragEnd={() => { dragSrcIdx.current = null; setDragOverIdx(null) }}
                  style={dragOverIdx === idx ? { ...crewDragOverStyle } : undefined}
                >
                  <td style={{ ...tdStyle, width: 28, textAlign: "center", cursor: "grab", color: "#475569", fontSize: 14, userSelect: "none" }}>
                    ⠿
                  </td>
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

const addDirBtnStyle: React.CSSProperties = {
  padding: "4px 12px",
  borderRadius: 7,
  border: "1px solid rgba(167,139,250,0.30)",
  background: "rgba(167,139,250,0.08)",
  color: "#a78bfa",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
}

const removeDirBtnStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 7,
  border: "1px solid rgba(248,113,113,0.25)",
  background: "transparent",
  color: "#f87171",
  cursor: "pointer",
  fontSize: 13,
  lineHeight: 1,
  alignSelf: "flex-end",
  marginBottom: 0,
}

const crewDragOverStyle: React.CSSProperties = {
  outline: "2px solid rgba(167,139,250,0.5)",
  background: "rgba(167,139,250,0.06)",
}
