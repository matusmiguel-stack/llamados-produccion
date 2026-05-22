"use client"

import { useEffect, useState } from "react"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import { supabase } from "../lib/supabase"
import Link from "next/link"
import Select from "react-select"

export default function Home() {
  const [events, setEvents] = useState<any[]>([])
  const [resources, setResources] = useState<any[]>([])
  const [shootResources, setShootResources] = useState<any[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectedShoot, setSelectedShoot] = useState<any>(null)

  const [selectedDate, setSelectedDate] = useState("")
  const [title, setTitle] = useState("")
  const [client, setClient] = useState("")
  const [project, setProject] = useState("")
  const [location, setLocation] = useState("")
  const [address, setAddress] = useState("")
  const [contact, setContact] = useState("")
  const [director, setDirector] = useState("")
  const [dop, setDop] = useState("")
  const [publicNotes, setPublicNotes] = useState("")
  const [privateNotes, setPrivateNotes] = useState("")
  const [productionNotes, setProductionNotes] = useState("")
  const [allDay, setAllDay] = useState(false)
  const [startTime, setStartTime] = useState("09:00")
  const [endTime, setEndTime] = useState("18:00")
  const [selectedResources, setSelectedResources] = useState<string[]>([])

  async function loadAll() {
    const { data: shoots } = await supabase.from("shoots").select("*").order("start_time")
    const { data: res } = await supabase.from("resources").select("*").order("type")
    const { data: assignments } = await supabase
      .from("shoot_resources")
      .select("*, shoots(*), resources(*)")

    setResources(res || [])
    setShootResources(assignments || [])

    setEvents(
      (shoots || []).map((shoot) => ({
        id: shoot.id,
        title: shoot.title,
        start: shoot.start_time,
        end: shoot.end_time,
        allDay: shoot.all_day,
        backgroundColor: "#111827",
        borderColor: "#111827",
        textColor: "#ffffff",
      }))
    )
  }

  useEffect(() => {
    loadAll()
  }, [])

  function resetForm() {
    setSelectedShoot(null)
    setTitle("")
    setClient("")
    setProject("")
    setLocation("")
    setAddress("")
    setContact("")
    setDirector("")
    setDop("")
    setPublicNotes("")
    setPrivateNotes("")
    setProductionNotes("")
    setAllDay(false)
    setStartTime("09:00")
    setEndTime("18:00")
    setSelectedResources([])
  }

  function handleDateClick(info: any) {
    resetForm()
    setSelectedDate(info.dateStr)
    setModalOpen(true)
  }

  function handleEventClick(info: any) {
    const shoot = shootResources.find((a) => a.shoot_id === info.event.id)?.shoots
    setSelectedShoot(shoot || null)
    setDetailsOpen(true)
  }

  function getShootResources(shootId: string) {
    return shootResources
      .filter((a) => a.shoot_id === shootId)
      .map((a) => a.resources)
      .filter(Boolean)
  }

  function openEditShoot() {
    if (!selectedShoot) return

    const start = new Date(selectedShoot.start_time)
    const end = new Date(selectedShoot.end_time)

    setTitle(selectedShoot.title || "")
    setClient(selectedShoot.client || "")
    setProject(selectedShoot.project || "")
    setLocation(selectedShoot.location || "")
    setAddress(selectedShoot.address || "")
    setContact(selectedShoot.contact || "")
    setDirector(selectedShoot.director || "")
    setDop(selectedShoot.dop || "")
    setPublicNotes(selectedShoot.public_notes || "")
    setPrivateNotes(selectedShoot.private_notes || "")
    setProductionNotes(selectedShoot.production_notes || "")
    setAllDay(selectedShoot.all_day || false)
    setSelectedDate(start.toISOString().slice(0, 10))
    setStartTime(start.toTimeString().slice(0, 5))
    setEndTime(end.toTimeString().slice(0, 5))
    setSelectedResources(getShootResources(selectedShoot.id).map((r) => r.id))

    setDetailsOpen(false)
    setModalOpen(true)
  }

  function isResourceBusy(resourceId: string) {
    if (!selectedDate) return false

    let newStart = `${selectedDate}T${startTime}:00`
    let newEnd = `${selectedDate}T${endTime}:00`

    if (allDay) {
      newStart = `${selectedDate}T00:00:00`
      newEnd = `${selectedDate}T23:59:59`
    }

    return shootResources.some((assignment) => {
      if (assignment.resource_id !== resourceId) return false
      if (!assignment.shoots) return false
      if (selectedShoot && assignment.shoot_id === selectedShoot.id) return false

      const existingStart = new Date(assignment.shoots.start_time)
      const existingEnd = new Date(assignment.shoots.end_time)
      const proposedStart = new Date(newStart)
      const proposedEnd = new Date(newEnd)

      return proposedStart < existingEnd && proposedEnd > existingStart
    })
  }

  function toggleResource(resourceId: string) {
    if (isResourceBusy(resourceId)) return

    if (selectedResources.includes(resourceId)) {
      setSelectedResources(selectedResources.filter((id) => id !== resourceId))
    } else {
      setSelectedResources([...selectedResources, resourceId])
    }
  }

  async function saveShoot() {
    if (!title) return alert("Ponle nombre al llamado")
    if (selectedResources.length === 0) return alert("Selecciona al menos un recurso")

    let start = `${selectedDate}T${startTime}:00`
    let end = `${selectedDate}T${endTime}:00`

    if (allDay) {
      start = `${selectedDate}T00:00:00`
      end = `${selectedDate}T23:59:59`
    }

    const payload = {
      title,
      client,
      project,
      location,
      address,
      contact,
      director,
      dop,
      public_notes: publicNotes,
      private_notes: privateNotes,
      production_notes: productionNotes,
      start_time: start,
      end_time: end,
      all_day: allDay,
    }

    let shootId = selectedShoot?.id

    if (selectedShoot) {
      const { error } = await supabase.from("shoots").update(payload).eq("id", selectedShoot.id)
      if (error) return alert(error.message)
      await supabase.from("shoot_resources").delete().eq("shoot_id", selectedShoot.id)
    } else {
      const { data, error } = await supabase.from("shoots").insert(payload).select().single()
      if (error) return alert(error.message)
      shootId = data.id
    }

    await supabase.from("shoot_resources").insert(
      selectedResources.map((resourceId) => ({
        shoot_id: shootId,
        resource_id: resourceId,
      }))
    )

    setModalOpen(false)
    resetForm()
    await loadAll()
  }

  async function deleteShoot() {
    if (!selectedShoot) return
    if (!confirm("¿Seguro que quieres borrar este llamado?")) return

    const { error } = await supabase.from("shoots").delete().eq("id", selectedShoot.id)
    if (error) return alert(error.message)

    setDetailsOpen(false)
    setSelectedShoot(null)
    await loadAll()
  }

  async function updateEventDate(info: any) {
    const { error } = await supabase
      .from("shoots")
      .update({
        start_time: info.event.start?.toISOString(),
        end_time: info.event.end?.toISOString() || info.event.start?.toISOString(),
        all_day: info.event.allDay,
      })
      .eq("id", info.event.id)

    if (error) {
      alert(error.message)
      info.revert()
      return
    }

    await loadAll()
  }

  const humanResources = resources.filter((r) => r.type === "human")
  const technicalResources = resources.filter((r) => r.type === "technical")

  return (
    <main style={{ padding: 20 }}>
      <h1>🎬 Sistema de Llamados</h1>
<nav style={{ marginBottom: 20 }}>
  <Link href="/resources">📦 Inventario de recursos</Link>
</nav>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        height="80vh"
        events={events}
        selectable
        editable
        eventResizableFromStart
        dateClick={handleDateClick}
        eventClick={handleEventClick}
        eventDrop={updateEventDate}
        eventResize={updateEventDate}
        eventDisplay="block"
      />

      {modalOpen && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h2>{selectedShoot ? "Editar llamado" : "Nuevo llamado"}</h2>

            <input placeholder="Nombre del llamado" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
            <input placeholder="Cliente" value={client} onChange={(e) => setClient(e.target.value)} style={inputStyle} />
            <input placeholder="Proyecto" value={project} onChange={(e) => setProject(e.target.value)} style={inputStyle} />
            <input placeholder="Locación" value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} />
            <input placeholder="Dirección" value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} />
            <input placeholder="Contacto" value={contact} onChange={(e) => setContact(e.target.value)} style={inputStyle} />

            <h3>Producción</h3>
            <input placeholder="Director / Realizador" value={director} onChange={(e) => setDirector(e.target.value)} style={inputStyle} />
            <input placeholder="DOP / Fotógrafo" value={dop} onChange={(e) => setDop(e.target.value)} style={inputStyle} />

            <div style={{ marginTop: 20 }}>
              <label>
                <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Todo el día
              </label>
            </div>

            {!allDay && (
              <>
                <label style={labelStyle}>Hora inicio</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputStyle} />
                <label style={labelStyle}>Hora fin</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={inputStyle} />
              </>
            )}

            <h3>Notas</h3>
            <textarea placeholder="Notas públicas" value={publicNotes} onChange={(e) => setPublicNotes(e.target.value)} style={textareaStyle} />
            <textarea placeholder="Notas privadas" value={privateNotes} onChange={(e) => setPrivateNotes(e.target.value)} style={textareaStyle} />
            <textarea placeholder="Notas de producción" value={productionNotes} onChange={(e) => setProductionNotes(e.target.value)} style={textareaStyle} />

           <h3>Recursos humanos</h3>

<Select
  isMulti
  options={humanResources.map((resource) => ({
    value: resource.id,
    label: `${resource.name} — ${resource.category}${
      isResourceBusy(resource.id) ? " — OCUPADO" : ""
    }`,
    isDisabled: isResourceBusy(resource.id),
  }))}
  value={humanResources
    .filter((resource) => selectedResources.includes(resource.id))
    .map((resource) => ({
      value: resource.id,
      label: `${resource.name} — ${resource.category}`,
    }))}
  onChange={(selected) => {
    const humanIds = selected.map((item) => item.value)
    const technicalIds = selectedResources.filter((id) =>
      technicalResources.some((resource) => resource.id === id)
    )

    setSelectedResources([...humanIds, ...technicalIds])
  }}
/>

<h3>Recursos técnicos</h3>

<Select
  isMulti
  options={technicalResources.map((resource) => ({
    value: resource.id,
    label: `${resource.name} — ${resource.category}${
      isResourceBusy(resource.id) ? " — OCUPADO" : ""
    }`,
    isDisabled: isResourceBusy(resource.id),
  }))}
  value={technicalResources
    .filter((resource) => selectedResources.includes(resource.id))
    .map((resource) => ({
      value: resource.id,
      label: `${resource.name} — ${resource.category}`,
    }))}
  onChange={(selected) => {
    const technicalIds = selected.map((item) => item.value)
    const humanIds = selectedResources.filter((id) =>
      humanResources.some((resource) => resource.id === id)
    )

    setSelectedResources([...humanIds, ...technicalIds])
  }}
/>

            <button onClick={saveShoot} style={primaryButton}>
              {selectedShoot ? "Guardar cambios" : "Guardar llamado"}
            </button>

            <button onClick={() => { setModalOpen(false); resetForm() }} style={secondaryButton}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {detailsOpen && selectedShoot && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h2>{selectedShoot.title}</h2>
            <p><strong>Cliente:</strong> {selectedShoot.client || "-"}</p>
            <p><strong>Proyecto:</strong> {selectedShoot.project || "-"}</p>
            <p><strong>Locación:</strong> {selectedShoot.location || "-"}</p>
            <p><strong>Dirección:</strong> {selectedShoot.address || "-"}</p>
            <p><strong>Contacto:</strong> {selectedShoot.contact || "-"}</p>
            <p><strong>Inicio:</strong> {new Date(selectedShoot.start_time).toLocaleString()}</p>
            <p><strong>Fin:</strong> {new Date(selectedShoot.end_time).toLocaleString()}</p>

            <h3>Producción</h3>
            <p><strong>Director:</strong> {selectedShoot.director || "-"}</p>
            <p><strong>DOP:</strong> {selectedShoot.dop || "-"}</p>

            <h3>Notas</h3>
            <p><strong>Públicas:</strong> {selectedShoot.public_notes || "-"}</p>
            <p><strong>Privadas:</strong> {selectedShoot.private_notes || "-"}</p>
            <p><strong>Producción:</strong> {selectedShoot.production_notes || "-"}</p>

            <h3>Recursos asignados</h3>
            <ul>
              {getShootResources(selectedShoot.id).map((resource) => (
                <li key={resource.id}>{resource.name} — {resource.category}</li>
              ))}
            </ul>

            <button onClick={openEditShoot} style={primaryButton}>Editar llamado</button>
            <button onClick={deleteShoot} style={{ ...primaryButton, background: "#b91c1c" }}>Borrar llamado</button>
            <button onClick={() => setDetailsOpen(false)} style={secondaryButton}>Cerrar</button>
          </div>
        </div>
      )}
    </main>
  )
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  zIndex: 999999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
}

const modalStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "620px",
  maxHeight: "90vh",
  overflowY: "auto",
  background: "#ffffff",
  color: "#111111",
  borderRadius: "18px",
  padding: "24px",
  boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  marginTop: "8px",
  border: "1px solid #ccc",
  borderRadius: "8px",
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: "80px",
}

const labelStyle: React.CSSProperties = {
  display: "block",
  marginTop: "20px",
}

const primaryButton: React.CSSProperties = {
  marginTop: "24px",
  width: "100%",
  padding: "14px",
  background: "black",
  color: "white",
  border: "none",
  borderRadius: "10px",
  cursor: "pointer",
}

const secondaryButton: React.CSSProperties = {
  marginTop: "12px",
  width: "100%",
  padding: "12px",
  background: "#eeeeee",
  color: "black",
  border: "none",
  borderRadius: "10px",
  cursor: "pointer",
}