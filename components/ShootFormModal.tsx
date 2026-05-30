"use client"

import { useEffect, useMemo, useState } from "react"
import Select from "react-select"
import { supabase } from "../lib/supabase"
import { DatePickerField } from "./DatePickerField"
import { employeeDisplayName } from "../lib/employee-dates"

// ─── Types ───────────────────────────────────────────────────────────────────

type Employee = {
  id: string
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  puesto: string | null
}

type Resource = {
  id: string
  name: string
  category: string
  type: string
}

type Client = { id: string; name: string }
type Subfolder = { id: string; client_id: string; name: string }
type Project = { id: string; client_id: string; subfolder_id: string; name: string }

type ShootAssignment = {
  shoot_id: string
  employee_id: string
  shoots: { start_time: string; end_time: string } | null
}

type ResourceAssignment = {
  shoot_id: string
  resource_id: string
  shoots: { start_time: string; end_time: string } | null
}

type VacationAssignment = {
  vacation_id: string
  employee_id: string
  vacations: { start_date: string; end_date: string } | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateInputValue(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function addDaysToDateString(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + days)
  return toDateInputValue(d)
}

function datesOverlapInclusive(sA: string, eA: string, sB: string, eB: string) {
  return sA <= eB && eA >= sB
}

function getStatusColor(status: string) {
  if (status === "confirmed") return "#16a34a"
  if (status === "cancelled") return "#dc2626"
  if (status === "wrap") return "#64748b"
  return "#eab308"
}

function empLabel(e: Employee) {
  return `${employeeDisplayName(e)} — ${e.puesto}`
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ShootFormModal({
  initialProjectId,
  isMobile,
  onClose,
  onSaved,
}: {
  initialProjectId?: string
  isMobile: boolean
  onClose: () => void
  onSaved: () => void
}) {
  // ── Catalogue data ───────────────────────────────────────────────────────
  const [employees, setEmployees] = useState<Employee[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [shootEmployees, setShootEmployees] = useState<ShootAssignment[]>([])
  const [shootResources, setShootResources] = useState<ResourceAssignment[]>([])
  const [vacationEmployees, setVacationEmployees] = useState<VacationAssignment[]>([])
  const [allClients, setAllClients] = useState<Client[]>([])
  const [allSubfolders, setAllSubfolders] = useState<Subfolder[]>([])
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // ── Inline create client ─────────────────────────────────────────────────
  const [showAddClient, setShowAddClient] = useState(false)
  const [newClientName, setNewClientName] = useState("")
  const [savingClient, setSavingClient] = useState(false)

  // ── Form state ───────────────────────────────────────────────────────────
  const [title, setTitle] = useState("")
  const [clientId, setClientId] = useState("")
  const [subfolderId, setSubfolderId] = useState("")
  const [projectId, setProjectId] = useState("")
  const [location, setLocation] = useState("")
  const [address, setAddress] = useState("")
  const [contact, setContact] = useState("")
  const [director, setDirector] = useState("")
  const [dop, setDop] = useState("")
  const [publicNotes, setPublicNotes] = useState("")
  const [privateNotes, setPrivateNotes] = useState("")
  const [productionNotes, setProductionNotes] = useState("")
  const [status, setStatus] = useState("tentative")
  const [color, setColor] = useState("#7c3aed")
  const [useCustomColor, setUseCustomColor] = useState(false)
  const [allDay, setAllDay] = useState(false)
  const [selectedDate, setSelectedDate] = useState("")
  const [selectedEndDate, setSelectedEndDate] = useState("")
  const [startTime, setStartTime] = useState("09:00")
  const [endTime, setEndTime] = useState("18:00")
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([])
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([])

  // ── Load data ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const [
        { data: emps },
        { data: res },
        { data: se },
        { data: sr },
        { data: ve },
        { data: clients },
        { data: subfolders },
        { data: projects },
      ] = await Promise.all([
        supabase.from("employees").select("id,nombre,apellido_paterno,apellido_materno,puesto").order("nombre"),
        supabase.from("resources").select("id,name,category,type").eq("type", "technical").order("name"),
        supabase.from("shoot_employees").select("shoot_id,employee_id,shoots(start_time,end_time)"),
        supabase.from("shoot_resources").select("shoot_id,resource_id,shoots(start_time,end_time)"),
        supabase.from("vacation_employees").select("vacation_id,employee_id,vacations(start_date,end_date)"),
        supabase.from("clients").select("id,name").order("name"),
        supabase.from("client_subfolders").select("id,client_id,name").order("name"),
        supabase.from("projects").select("id,client_id,subfolder_id,name").order("name"),
      ])

      setEmployees((emps || []) as Employee[])
      setResources((res || []) as Resource[])
      setShootEmployees((se || []) as unknown as ShootAssignment[])
      setShootResources((sr || []) as unknown as ResourceAssignment[])
      setVacationEmployees((ve || []) as unknown as VacationAssignment[])
      setAllClients((clients || []) as Client[])
      setAllSubfolders((subfolders || []) as Subfolder[])

      const loadedProjects = (projects || []) as Project[]
      setAllProjects(loadedProjects)

      // Pre-fill project / client / subfolder from initialProjectId
      if (initialProjectId) {
        const proj = loadedProjects.find((p) => p.id === initialProjectId)
        if (proj) {
          setProjectId(proj.id)
          setClientId(proj.client_id)
          setSubfolderId(proj.subfolder_id)
        }
      }

      setLoading(false)
    }
    loadData()
  }, [initialProjectId])

  // ── Close on Escape ──────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !showAddClient) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, showAddClient])

  // ── Derived options ──────────────────────────────────────────────────────
  const subfolderOptions = useMemo(
    () => (!clientId ? [] : allSubfolders.filter((sf) => sf.client_id === clientId)),
    [allSubfolders, clientId]
  )

  const projectOptions = useMemo(
    () => (!subfolderId ? [] : allProjects.filter((p) => p.subfolder_id === subfolderId)),
    [allProjects, subfolderId]
  )

  // ── Date / time helpers ──────────────────────────────────────────────────
  function getEffectiveEndDate() {
    return selectedEndDate || selectedDate
  }

  function isMultiDay() {
    return !!selectedDate && getEffectiveEndDate() > selectedDate
  }

  function getDateTimeRange() {
    if (!selectedDate) return null
    const endDate = getEffectiveEndDate()
    if (endDate > selectedDate) {
      return {
        start: `${selectedDate}T00:00:00`,
        end: `${addDaysToDateString(endDate, 1)}T00:00:00`,
        allDay: true,
      }
    }
    if (allDay) {
      return {
        start: `${selectedDate}T00:00:00`,
        end: `${addDaysToDateString(selectedDate, 1)}T00:00:00`,
        allDay: true,
      }
    }
    return {
      start: `${selectedDate}T${startTime}:00`,
      end: `${selectedDate}T${endTime}:00`,
      allDay: false,
    }
  }

  // ── Availability checks ──────────────────────────────────────────────────
  function isEmployeeBusy(employeeId: string) {
    const range = getDateTimeRange()
    if (!range) return false
    const shootStart = selectedDate
    const shootEnd = getEffectiveEndDate()
    const onVacation = vacationEmployees.some((a) => {
      if (a.employee_id !== employeeId || !a.vacations) return false
      return datesOverlapInclusive(shootStart, shootEnd, a.vacations.start_date, a.vacations.end_date)
    })
    if (onVacation) return true
    const ps = new Date(range.start)
    const pe = new Date(range.end)
    return shootEmployees.some((a) => {
      if (a.employee_id !== employeeId || !a.shoots) return false
      return ps < new Date(a.shoots.end_time) && pe > new Date(a.shoots.start_time)
    })
  }

  function isResourceBusy(resourceId: string) {
    const range = getDateTimeRange()
    if (!range) return false
    const ps = new Date(range.start)
    const pe = new Date(range.end)
    return shootResources.some((a) => {
      if (a.resource_id !== resourceId || !a.shoots) return false
      return ps < new Date(a.shoots.end_time) && pe > new Date(a.shoots.start_time)
    })
  }

  // ── Create client ────────────────────────────────────────────────────────
  async function handleSaveNewClient() {
    if (!newClientName.trim()) return
    setSavingClient(true)
    try {
      const { data, error } = await supabase
        .from("clients")
        .insert({ name: newClientName.trim() })
        .select("id,name")
        .single()
      if (error) throw error
      setAllClients((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setClientId(data.id)
      setSubfolderId("")
      setProjectId("")
      setShowAddClient(false)
      setNewClientName("")
    } catch (err: any) {
      alert("Error al crear cliente: " + err.message)
    } finally {
      setSavingClient(false)
    }
  }

  // ── Save shoot ───────────────────────────────────────────────────────────
  async function handleSave() {
    if (!title.trim()) return alert("Ponle nombre al llamado")
    if (!selectedDate) return alert("Selecciona la fecha del llamado")
    if (selectedEmployeeIds.length === 0 && selectedResourceIds.length === 0) {
      return alert("Selecciona al menos un empleado o recurso técnico")
    }
    const range = getDateTimeRange()
    if (!range) return alert("Selecciona la fecha del llamado")

    const busyId = selectedEmployeeIds.find((id) => isEmployeeBusy(id))
    if (busyId) {
      const emp = employees.find((e) => e.id === busyId)
      return alert(`${emp ? empLabel(emp) : "Un empleado"} no está disponible en esas fechas`)
    }

    const selectedClient = allClients.find((c) => c.id === clientId)
    const selectedProject = allProjects.find((p) => p.id === projectId)

    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        client_id: clientId || null,
        project_id: projectId || null,
        client: selectedClient?.name || null,
        project: selectedProject?.name || null,
        location: location.trim() || null,
        address: address.trim() || null,
        contact: contact.trim() || null,
        director: director.trim() || null,
        dop: dop.trim() || null,
        public_notes: publicNotes.trim() || null,
        private_notes: privateNotes.trim() || null,
        production_notes: productionNotes.trim() || null,
        status,
        color: useCustomColor ? color : getStatusColor(status),
        start_time: range.start,
        end_time: range.end,
        all_day: range.allDay,
      }

      const { data: newShoot, error } = await supabase
        .from("shoots")
        .insert(payload)
        .select()
        .single()
      if (error) throw error

      if (selectedEmployeeIds.length > 0) {
        await supabase.from("shoot_employees").insert(
          selectedEmployeeIds.map((eid) => ({ shoot_id: newShoot.id, employee_id: eid }))
        )
      }
      if (selectedResourceIds.length > 0) {
        await supabase.from("shoot_resources").insert(
          selectedResourceIds.map((rid) => ({ shoot_id: newShoot.id, resource_id: rid }))
        )
      }

      onSaved()
      onClose()
    } catch (err: any) {
      alert("Error al guardar: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── react-select styles ──────────────────────────────────────────────────
  const selectStyles = {
    control: (base: any) => ({
      ...base,
      backgroundColor: "rgba(15, 23, 42, 0.92)",
      borderColor: "rgba(148, 163, 184, 0.28)",
      borderRadius: 12,
      minHeight: 40,
      boxShadow: "none",
    }),
    menu: (base: any) => ({
      ...base,
      backgroundColor: "#0f172a",
      border: "1px solid rgba(148, 163, 184, 0.22)",
      overflow: "hidden",
      zIndex: 1000000,
    }),
    option: (base: any, state: any) => ({
      ...base,
      backgroundColor: state.isFocused ? "rgba(124, 58, 237, 0.35)" : "#0f172a",
      color: state.isDisabled ? "#64748b" : "#f8fafc",
      cursor: state.isDisabled ? "not-allowed" : "pointer",
    }),
    multiValue: (base: any) => ({
      ...base,
      backgroundColor: "rgba(124, 58, 237, 0.28)",
      borderRadius: 999,
    }),
    multiValueLabel: (base: any) => ({ ...base, color: "#f8fafc" }),
    multiValueRemove: (base: any) => ({ ...base, color: "#f8fafc" }),
    input: (base: any) => ({ ...base, color: "#f8fafc", margin: 0, padding: 0 }),
    placeholder: (base: any) => ({ ...base, color: "#94a3b8" }),
    singleValue: (base: any) => ({ ...base, color: "#f8fafc" }),
    valueContainer: (base: any) => ({ ...base, padding: "0 8px" }),
    indicatorsContainer: (base: any) => ({ ...base, height: 38 }),
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        style={{
          ...modalStyle,
          width: isMobile ? "100%" : 680,
          height: isMobile ? "100%" : "auto",
          maxHeight: isMobile ? "100%" : "88vh",
          borderRadius: isMobile ? 0 : 16,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={headerStyle}>
          <h2 style={titleStyle}>Nuevo llamado</h2>
          <button onClick={onClose} style={closeStyle} aria-label="Cerrar">×</button>
        </div>

        {loading ? (
          <div style={{ padding: "40px 16px", textAlign: "center", color: "#64748b", fontSize: 13 }}>
            Cargando datos...
          </div>
        ) : (
          <>
            {/* ── Body ───────────────────────────────────────────────────── */}
            <div style={bodyStyle}>
              <div style={{ ...columnsStyle, gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr" }}>

                {/* ─ Left: Detalles ─ */}
                <div style={colStyle}>
                  <p style={sectionLabelStyle}>Detalles</p>

                  <div style={fieldStyle}>
                    <label style={labelStyle}>Nombre</label>
                    <input
                      autoFocus
                      placeholder="Nombre del llamado"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  <div style={rowStyle}>
                    <div style={fieldStyle}>
                      <label style={labelStyle}>Cliente</label>
                      <select
                        value={clientId}
                        onChange={(e) => {
                          const val = e.target.value
                          if (val === "__NEW_CLIENT__") {
                            setNewClientName("")
                            setShowAddClient(true)
                          } else {
                            setClientId(val)
                            setSubfolderId("")
                            setProjectId("")
                          }
                        }}
                        style={selectStyle}
                      >
                        <option value="">Selecciona cliente</option>
                        {allClients.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                        <option value="__NEW_CLIENT__">＋ Crear cliente nuevo...</option>
                      </select>
                    </div>
                    <div style={fieldStyle}>
                      <label style={labelStyle}>Subcarpeta</label>
                      <select
                        value={subfolderId}
                        onChange={(e) => { setSubfolderId(e.target.value); setProjectId("") }}
                        disabled={!clientId}
                        style={{ ...selectStyle, opacity: clientId ? 1 : 0.65 }}
                      >
                        <option value="">{clientId ? "Selecciona subcarpeta" : "Primero elige cliente"}</option>
                        {subfolderOptions.map((sf) => (
                          <option key={sf.id} value={sf.id}>{sf.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={fieldStyle}>
                    <label style={labelStyle}>Proyecto</label>
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      disabled={!subfolderId}
                      style={{ ...selectStyle, opacity: subfolderId ? 1 : 0.65 }}
                    >
                      <option value="">{subfolderId ? "Selecciona proyecto" : "Primero elige subcarpeta"}</option>
                      {projectOptions.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div style={rowStyle}>
                    <div style={fieldStyle}>
                      <label style={labelStyle}>Locación</label>
                      <input
                        placeholder="Locación"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                    <div style={fieldStyle}>
                      <label style={labelStyle}>Contacto</label>
                      <input
                        placeholder="Contacto"
                        value={contact}
                        onChange={(e) => setContact(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <div style={fieldStyle}>
                    <label style={labelStyle}>Dirección</label>
                    <input
                      placeholder="Dirección"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  <div style={inlineOptionsStyle}>
                    <label style={inlineCheckStyle}>
                      <input
                        type="checkbox"
                        checked={useCustomColor}
                        onChange={(e) => setUseCustomColor(e.target.checked)}
                      />
                      Color especial
                    </label>
                    {useCustomColor && (
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        style={colorInputStyle}
                      />
                    )}
                  </div>
                </div>

                {/* ─ Right: Producción ─ */}
                <div style={colStyle}>
                  <p style={sectionLabelStyle}>Producción</p>

                  <div style={rowStyle}>
                    <DatePickerField
                      label="Desde"
                      value={selectedDate}
                      labelStyle={labelStyle}
                      onChange={(v) => {
                        setSelectedDate(v)
                        if (selectedEndDate && v > selectedEndDate) setSelectedEndDate(v)
                      }}
                    />
                    <DatePickerField
                      label="Hasta"
                      value={getEffectiveEndDate()}
                      minDate={selectedDate || undefined}
                      labelStyle={labelStyle}
                      onChange={(v) => {
                        setSelectedEndDate(v)
                        if (selectedDate && v > selectedDate) setAllDay(true)
                      }}
                    />
                  </div>

                  <div style={rowStyle}>
                    <div style={fieldStyle}>
                      <label style={labelStyle}>Estado</label>
                      <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
                        <option value="tentative">Tentativo</option>
                        <option value="confirmed">Confirmado</option>
                        <option value="cancelled">Cancelado</option>
                        <option value="wrap">Wrap</option>
                      </select>
                    </div>
                    <div style={fieldStyle}>
                      <label style={labelStyle}>Horario</label>
                      <label style={inlineCheckStyle}>
                        <input
                          type="checkbox"
                          checked={allDay || isMultiDay()}
                          disabled={isMultiDay()}
                          onChange={(e) => setAllDay(e.target.checked)}
                        />
                        Todo el día
                      </label>
                    </div>
                  </div>

                  {!allDay && !isMultiDay() && (
                    <div style={rowStyle}>
                      <div style={fieldStyle}>
                        <label style={labelStyle}>Inicio</label>
                        <input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          style={inputStyle}
                        />
                      </div>
                      <div style={fieldStyle}>
                        <label style={labelStyle}>Fin</label>
                        <input
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  )}

                  <div style={rowStyle}>
                    <div style={fieldStyle}>
                      <label style={labelStyle}>Director</label>
                      <input
                        placeholder="Director / Realizador"
                        value={director}
                        onChange={(e) => setDirector(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                    <div style={fieldStyle}>
                      <label style={labelStyle}>DOP</label>
                      <input
                        placeholder="DOP / Fotógrafo"
                        value={dop}
                        onChange={(e) => setDop(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  <p style={{ ...sectionLabelStyle, marginTop: 12 }}>Recursos</p>

                  <div style={fieldStyle}>
                    <label style={labelStyle}>Personal Retro</label>
                    <Select
                      isMulti
                      styles={selectStyles}
                      placeholder="Seleccionar..."
                      options={employees.map((emp) => ({
                        value: emp.id,
                        label: `${empLabel(emp)}${isEmployeeBusy(emp.id) ? " — OCUPADO" : ""}`,
                        isDisabled: isEmployeeBusy(emp.id),
                      }))}
                      value={employees
                        .filter((e) => selectedEmployeeIds.includes(e.id))
                        .map((e) => ({ value: e.id, label: empLabel(e) }))}
                      onChange={(sel) => setSelectedEmployeeIds(sel.map((s) => s.value))}
                    />
                  </div>

                  <div style={fieldStyle}>
                    <label style={labelStyle}>Técnicos</label>
                    <Select
                      isMulti
                      styles={selectStyles}
                      placeholder="Seleccionar..."
                      options={resources.map((r) => ({
                        value: r.id,
                        label: `${r.name} — ${r.category}${isResourceBusy(r.id) ? " — OCUPADO" : ""}`,
                        isDisabled: isResourceBusy(r.id),
                      }))}
                      value={resources
                        .filter((r) => selectedResourceIds.includes(r.id))
                        .map((r) => ({ value: r.id, label: `${r.name} — ${r.category}` }))}
                      onChange={(sel) => setSelectedResourceIds(sel.map((s) => s.value))}
                    />
                  </div>
                </div>
              </div>

              {/* ─ Notes ─ */}
              <div style={notesBlockStyle}>
                <p style={sectionLabelStyle}>Notas</p>
                <div style={{ ...notesGridStyle, gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)" }}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Públicas</label>
                    <textarea
                      placeholder="Visibles para el equipo"
                      value={publicNotes}
                      onChange={(e) => setPublicNotes(e.target.value)}
                      style={textareaStyle}
                    />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Privadas</label>
                    <textarea
                      placeholder="Solo admins"
                      value={privateNotes}
                      onChange={(e) => setPrivateNotes(e.target.value)}
                      style={textareaStyle}
                    />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Producción</label>
                    <textarea
                      placeholder="Logística y detalles"
                      value={productionNotes}
                      onChange={(e) => setProductionNotes(e.target.value)}
                      style={textareaStyle}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Footer ─────────────────────────────────────────────────── */}
            <div style={footerStyle}>
              <button onClick={onClose} style={secondaryBtnStyle}>Cancelar</button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ ...primaryBtnStyle, opacity: saving ? 0.7 : 1 }}
              >
                {saving ? "Guardando..." : "Crear llamado"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Mini-modal: crear cliente ─────────────────────────────────────── */}
      {showAddClient && (
        <div
          style={addClientOverlayStyle}
          onClick={() => setShowAddClient(false)}
        >
          <div
            style={addClientPanelStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={addClientHeaderStyle}>
              <div>
                <p style={{ color: "#a78bfa", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, margin: 0 }}>
                  Nuevo cliente
                </p>
                <p style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600, margin: "3px 0 0" }}>
                  Agregar al catálogo
                </p>
              </div>
              <button
                onClick={() => setShowAddClient(false)}
                style={{ background: "none", border: "none", color: "#64748b", fontSize: 20, cursor: "pointer" }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: "20px 18px 16px" }}>
              <p style={{ color: "#64748b", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                Nombre del cliente
              </p>
              <input
                type="text"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newClientName.trim()) handleSaveNewClient() }}
                placeholder="Ej. Coca-Cola, Nike..."
                autoFocus
                style={{
                  width: "100%", padding: "10px 12px",
                  background: "rgba(15,23,42,0.6)", border: "1px solid rgba(148,163,184,0.20)",
                  borderRadius: 10, color: "#e2e8f0", fontSize: 14, boxSizing: "border-box" as const, outline: "none",
                }}
              />
            </div>
            <div style={{ padding: "12px 18px", borderTop: "1px solid rgba(148,163,184,0.10)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowAddClient(false)} style={secondaryBtnStyle}>Cancelar</button>
              <button
                onClick={handleSaveNewClient}
                disabled={!newClientName.trim() || savingClient}
                style={{ ...primaryBtnStyle, opacity: !newClientName.trim() || savingClient ? 0.5 : 1 }}
              >
                {savingClient ? "Guardando..." : "✓ Crear cliente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.72)",
  zIndex: 999999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 18,
}

const modalStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  maxWidth: "calc(100vw - 28px)",
  overflow: "hidden",
  background: "rgba(15, 23, 42, 0.96)",
  color: "#f8fafc",
  border: "1px solid rgba(148,163,184,0.14)",
  boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
  backdropFilter: "blur(20px)",
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  padding: "14px 16px 12px",
  borderBottom: "1px solid rgba(148,163,184,0.10)",
  flexShrink: 0,
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  letterSpacing: -0.3,
  lineHeight: 1.2,
}

const closeStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
  color: "#94a3b8",
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
  flexShrink: 0,
}

const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "14px 16px",
  display: "grid",
  gap: 14,
}

const columnsStyle: React.CSSProperties = {
  display: "grid",
  gap: 16,
}

const colStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  alignContent: "start",
}

const sectionLabelStyle: React.CSSProperties = {
  margin: "0 0 2px",
  color: "#64748b",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.6,
}

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
}

const labelStyle: React.CSSProperties = {
  margin: 0,
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 500,
}

const rowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 8,
  background: "rgba(2,6,23,0.55)",
  color: "#f8fafc",
  outline: "none",
  fontSize: 13,
  lineHeight: 1.35,
  boxSizing: "border-box",
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none",
  WebkitAppearance: "none",
  backgroundImage:
    "linear-gradient(45deg, transparent 50%, #94a3b8 50%), linear-gradient(135deg, #94a3b8 50%, transparent 50%)",
  backgroundPosition: "calc(100% - 16px) calc(50% - 2px), calc(100% - 11px) calc(50% - 2px)",
  backgroundSize: "5px 5px, 5px 5px",
  backgroundRepeat: "no-repeat",
  paddingRight: 28,
}

const inlineOptionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 2,
}

const inlineCheckStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: "#cbd5e1",
  fontSize: 12,
  cursor: "pointer",
  minHeight: 32,
}

const colorInputStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  padding: 2,
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.14)",
  background: "rgba(2,6,23,0.55)",
  cursor: "pointer",
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 56,
  resize: "vertical",
  fontFamily: "inherit",
}

const notesBlockStyle: React.CSSProperties = {
  paddingTop: 12,
  borderTop: "1px solid rgba(148,163,184,0.08)",
}

const notesGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
}

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 8,
  padding: "12px 16px",
  borderTop: "1px solid rgba(148,163,184,0.10)",
  background: "rgba(2,6,23,0.72)",
  flexShrink: 0,
}

const primaryBtnStyle: React.CSSProperties = {
  padding: "8px 14px",
  background: "linear-gradient(135deg, #7c3aed, #6366f1)",
  color: "white",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
  boxShadow: "0 8px 24px rgba(124,58,237,0.22)",
}

const secondaryBtnStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "transparent",
  color: "#94a3b8",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 500,
  fontSize: 13,
}

const addClientOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000001,
  background: "rgba(2,6,23,0.80)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}

const addClientPanelStyle: React.CSSProperties = {
  background: "linear-gradient(160deg,#0d1b2e,#0f172a)",
  border: "1px solid rgba(148,163,184,0.15)",
  borderRadius: 16,
  boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
  width: 340,
  overflow: "hidden",
}

const addClientHeaderStyle: React.CSSProperties = {
  padding: "16px 18px 12px",
  borderBottom: "1px solid rgba(148,163,184,0.10)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
}
