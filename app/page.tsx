"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Select from "react-select"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import { supabase } from "../lib/supabase"

export default function Home() {
  const [events, setEvents] = useState<any[]>([])
  const [allShoots, setAllShoots] = useState<any[]>([])
  const [resources, setResources] = useState<any[]>([])
  const [shootResources, setShootResources] = useState<any[]>([])
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectedShoot, setSelectedShoot] = useState<any>(null)

  const [filterClient, setFilterClient] = useState("")
  const [filterProject, setFilterProject] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [filterHumanResource, setFilterHumanResource] = useState("")

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
  const [status, setStatus] = useState("tentative")
  const [color, setColor] = useState("#111827")
  const [allDay, setAllDay] = useState(false)
  const [startTime, setStartTime] = useState("09:00")
  const [endTime, setEndTime] = useState("18:00")
  const [selectedResources, setSelectedResources] = useState<string[]>([])
  const [menuOpen, setMenuOpen] = useState(false)

  const canEdit = profile?.role === "admin" || profile?.role === "editor"
  const isAdmin = profile?.role === "admin"

  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)

    return () => {
      window.removeEventListener("resize", checkMobile)
    }
  }, [])

  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUser(user)

    const { data: profiles } = await supabase.from("profiles").select("*")
    const myProfile = profiles?.find(
      (p) => p.email?.trim().toLowerCase() === user.email?.trim().toLowerCase()
    )
    setProfile(myProfile)
  }

  async function loadAll() {
    const { data: shoots } = await supabase.from("shoots").select("*").order("start_time")
    const { data: res } = await supabase.from("resources").select("*").order("type")
    const { data: assignments } = await supabase
      .from("shoot_resources")
      .select("*, shoots(*), resources(*)")

    setAllShoots(shoots || [])
    setResources(res || [])
    setShootResources(assignments || [])
  }

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = "/login"
        return
      }
      await loadAll()
      await loadUser()
    }
    init()
  }, [])

  useEffect(() => {
    const filtered = allShoots.filter((shoot) => {
  const clientOk = !filterClient || shoot.client === filterClient
  const projectOk = !filterProject || shoot.project === filterProject
  const statusOk = !filterStatus || shoot.status === filterStatus

  const humanResourceOk =
    !filterHumanResource ||
    shootResources.some(
      (assignment) =>
        assignment.shoot_id === shoot.id &&
        assignment.resource_id === filterHumanResource
    )

  return clientOk && projectOk && statusOk && humanResourceOk
})

    setEvents(
      filtered.map((shoot) => ({
        id: shoot.id,
        title: `${statusEmoji(shoot.status)} ${shoot.title}`,
        start: shoot.start_time,
        end: shoot.end_time,
        allDay: shoot.all_day,
        backgroundColor: shoot.color || "#111827",
        borderColor: shoot.color || "#111827",
        textColor: "#ffffff",
      }))
    )
  }, [allShoots, shootResources, filterClient, filterProject, filterStatus, filterHumanResource])

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
    setStatus("tentative")
    setColor("#111827")
    setAllDay(false)
    setStartTime("09:00")
    setEndTime("18:00")
    setSelectedResources([])
  }

  function handleDateClick(info: any) {
    if (!canEdit) return
    resetForm()

    const clickedDate = new Date(info.date)
    setSelectedDate(clickedDate.toISOString().slice(0, 10))
    setStartTime(clickedDate.toTimeString().slice(0, 5))

    const endDate = new Date(clickedDate)
    endDate.setHours(endDate.getHours() + 1)
    setEndTime(endDate.toTimeString().slice(0, 5))

    setModalOpen(true)
  }

  function handleEventClick(info: any) {
    const shoot = allShoots.find((s) => s.id === info.event.id)
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
    if (!selectedShoot || !canEdit) return

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
    setStatus(selectedShoot.status || "tentative")
    setColor(selectedShoot.color || "#111827")
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

  async function saveShoot() {
    if (!canEdit) return alert("No tienes permisos para editar.")
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
      status,
      color,
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
    if (!isAdmin) return alert("Solo admin puede borrar.")
    if (!selectedShoot) return
    if (!confirm("¿Seguro que quieres borrar este llamado?")) return

    const { error } = await supabase.from("shoots").delete().eq("id", selectedShoot.id)
    if (error) return alert(error.message)

    setDetailsOpen(false)
    setSelectedShoot(null)
    await loadAll()
  }

  async function updateEventDate(info: any) {
    if (!canEdit) {
      info.revert()
      return
    }

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

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const humanResources = resources.filter((r) => r.type === "human")
  const technicalResources = resources.filter((r) => r.type === "technical")

  const clients = useMemo(
    () => [...new Set(allShoots.map((s) => s.client).filter(Boolean))],
    [allShoots]
  )

  const projects = useMemo(
    () => [...new Set(allShoots.map((s) => s.project).filter(Boolean))],
    [allShoots]
  )

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        minHeight: "100vh",
        background: "#f5f5f5",
      }}
    >
      <aside
  style={{
    ...sidebarStyle,

    width: isMobile ? 260 : 230,

    minHeight: isMobile ? "100vh" : "100vh",

    flexDirection: "column",

    alignItems: "stretch",

    overflowX: "visible",

    position: isMobile ? "fixed" : "relative",

    left:
      isMobile && !menuOpen
        ? "-100%"
        : 0,

    top: 0,

    zIndex: 9999,

    transition: "0.25s",
  }}
>
      
        <h2
          style={{
            margin: isMobile ? "0 8px 0 0" : "0 0 10px 0",
            whiteSpace: "nowrap",
            fontSize: isMobile ? 18 : 24,
          }}
        >
          🎬 Llamados
        </h2>

        <Link
  href="/"
  style={navLink}
  onClick={() => isMobile && setMenuOpen(false)}
>Calendario</Link>
        <Link
  href="/"
  style={navLink}
  onClick={() => isMobile && setMenuOpen(false)}
>Inventario</Link>
        {isAdmin && <Link
  href="/"
  style={navLink}
  onClick={() => isMobile && setMenuOpen(false)}
>Usuarios</Link>}

        <div style={{ marginTop: isMobile ? 0 : 24, fontSize: 13, color: "#ddd", display: isMobile ? "none" : "block" }}>
          <p>{profile?.email}</p>
          <p>Rol: {profile?.role || "..."}</p>
        </div>

        <button
          onClick={logout}
          style={{
            ...logoutButton,
            marginTop: isMobile ? 0 : 24,
            width: isMobile ? "auto" : "100%",
            whiteSpace: "nowrap",
          }}
        >
          Cerrar sesión
        </button>
      </aside>
{isMobile && (
  <button
    onClick={() => setMenuOpen(!menuOpen)}
    style={{
      position: "fixed",
      top: 14,
      left: 14,
      zIndex: 10000,
      border: "none",
      borderRadius: 10,
      padding: "10px 14px",
      background: "#111827",
      color: "white",
      fontSize: 20,
      cursor: "pointer",
    }}
  >
    ☰
  </button>
)}
     <main
  style={{
    flex: 1,
    padding: isMobile ? "70px 12px 12px" : 24,
  }}
>
        <h1 style={{ fontSize: isMobile ? 24 : 34, marginTop: 0 }}>
          Calendario de producción
        </h1>

        <section
          style={{
            ...filtersStyle,
            flexDirection: isMobile ? "column" : "row",
          }}
        >
          <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)} style={filterInput}>
            <option value="">Todos los clientes</option>
            {clients.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} style={filterInput}>
            <option value="">Todos los proyectos</option>
            {projects.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={filterInput}>
            <option value="">Todos los status</option>
            <option value="tentative">Tentative</option>
            <option value="confirmed">Confirmado</option>
            <option value="cancelled">Cancelado</option>
            <option value="wrap">Wrap</option>
          </select>
          <select
  value={filterHumanResource}
  onChange={(e) => setFilterHumanResource(e.target.value)}
  style={filterInput}
>
  <option value="">Todos los recursos humanos</option>
  {humanResources.map((resource) => (
    <option key={resource.id} value={resource.id}>
      {resource.name} — {resource.category}
    </option>
  ))}
</select>
        </section>

        <div
          style={{
            background: "white",
            borderRadius: 18,
            padding: isMobile ? 6 : 16,
            overflow: "hidden",
          }}
        >
          <FullCalendar
            key={isMobile ? "mobile-calendar" : "desktop-calendar"}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={isMobile ? "timeGridDay" : "timeGridWeek"}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            height={isMobile ? "72vh" : "80vh"}
          events={events}
          selectable={canEdit}
          editable={canEdit}
          eventResizableFromStart={canEdit}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          eventDrop={updateEventDate}
          eventResize={updateEventDate}
          eventDisplay="block"
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          nowIndicator
        />
        </div>

        {modalOpen && (
          <div style={overlayStyle}>
            <div
              style={{
                ...modalStyle,
                maxWidth: isMobile ? "100%" : 620,
                height: isMobile ? "100%" : "auto",
                maxHeight: isMobile ? "100dvh" : "90vh",
                borderRadius: isMobile ? 0 : 18,
                padding: isMobile ? 16 : 24,
              }}
            >
              <h2>{selectedShoot ? "Editar llamado" : "Nuevo llamado"}</h2>

              <input placeholder="Nombre del llamado" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
              <input placeholder="Cliente" value={client} onChange={(e) => setClient(e.target.value)} style={inputStyle} />
              <input placeholder="Proyecto" value={project} onChange={(e) => setProject(e.target.value)} style={inputStyle} />
              <input placeholder="Locación" value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} />
              <input placeholder="Dirección" value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} />
              <input placeholder="Contacto" value={contact} onChange={(e) => setContact(e.target.value)} style={inputStyle} />

              <h3>Status y color</h3>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
                <option value="tentative">Tentative</option>
                <option value="confirmed">Confirmado</option>
                <option value="cancelled">Cancelado</option>
                <option value="wrap">Wrap</option>
              </select>

              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ ...inputStyle, height: 48 }} />

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
              {canEdit && (
                <textarea placeholder="Notas privadas" value={privateNotes} onChange={(e) => setPrivateNotes(e.target.value)} style={textareaStyle} />
              )}
              <textarea placeholder="Notas de producción" value={productionNotes} onChange={(e) => setProductionNotes(e.target.value)} style={textareaStyle} />

              <h3>Recursos humanos</h3>
              <Select
                isMulti
                menuPortalTarget={typeof document !== "undefined" ? document.body : undefined}
                styles={selectStyles}
                options={humanResources.map((resource) => ({
                  value: resource.id,
                  label: `${resource.name} — ${resource.category}${isResourceBusy(resource.id) ? " — OCUPADO" : ""}`,
                  isDisabled: isResourceBusy(resource.id),
                }))}
                value={humanResources
                  .filter((r) => selectedResources.includes(r.id))
                  .map((r) => ({ value: r.id, label: `${r.name} — ${r.category}` }))}
                onChange={(selected) => {
                  const humanIds = selected.map((item) => item.value)
                  const technicalIds = selectedResources.filter((id) =>
                    technicalResources.some((r) => r.id === id)
                  )
                  setSelectedResources([...humanIds, ...technicalIds])
                }}
              />

              <h3>Recursos técnicos</h3>
              <Select
                isMulti
                menuPortalTarget={typeof document !== "undefined" ? document.body : undefined}
                styles={selectStyles}
                options={technicalResources.map((resource) => ({
                  value: resource.id,
                  label: `${resource.name} — ${resource.category}${isResourceBusy(resource.id) ? " — OCUPADO" : ""}`,
                  isDisabled: isResourceBusy(resource.id),
                }))}
                value={technicalResources
                  .filter((r) => selectedResources.includes(r.id))
                  .map((r) => ({ value: r.id, label: `${r.name} — ${r.category}` }))}
                onChange={(selected) => {
                  const technicalIds = selected.map((item) => item.value)
                  const humanIds = selectedResources.filter((id) =>
                    humanResources.some((r) => r.id === id)
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
            <div
              style={{
                ...modalStyle,
                maxWidth: isMobile ? "100%" : 620,
                height: isMobile ? "100%" : "auto",
                maxHeight: isMobile ? "100dvh" : "90vh",
                borderRadius: isMobile ? 0 : 18,
                padding: isMobile ? 16 : 24,
              }}
            >
              <h2>{statusEmoji(selectedShoot.status)} {selectedShoot.title}</h2>
              <p><strong>Status:</strong> {selectedShoot.status || "tentative"}</p>
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
              {canEdit && <p><strong>Privadas:</strong> {selectedShoot.private_notes || "-"}</p>}
              <p><strong>Producción:</strong> {selectedShoot.production_notes || "-"}</p>

              <h3>Recursos asignados</h3>
              <ul>
                {getShootResources(selectedShoot.id).map((resource) => (
                  <li key={resource.id}>{resource.name} — {resource.category}</li>
                ))}
              </ul>

              {canEdit && <button onClick={openEditShoot} style={primaryButton}>Editar llamado</button>}
              {isAdmin && <button onClick={deleteShoot} style={{ ...primaryButton, background: "#b91c1c" }}>Borrar llamado</button>}
              <button onClick={() => setDetailsOpen(false)} style={secondaryButton}>Cerrar</button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function statusEmoji(status: string) {
  if (status === "confirmed") return "✅"
  if (status === "cancelled") return "❌"
  if (status === "wrap") return "🏁"
  return "🟡"
}

const sidebarStyle: React.CSSProperties = {
  background: "#111827",
  color: "white",
  padding: 20,
  display: "flex",
  gap: 12,
}

const navLink: React.CSSProperties = {
  display: "block",
  color: "white",
  textDecoration: "none",
  padding: "10px 12px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.08)",
  whiteSpace: "nowrap",
}

const logoutButton: React.CSSProperties = {
  padding: 12,
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
}

const filtersStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  background: "white",
  padding: 16,
  borderRadius: 16,
  marginBottom: 16,
}

const filterInput: React.CSSProperties = {
  padding: 12,
  borderRadius: 10,
  border: "1px solid #ccc",
  width: "100%",
  fontSize: 16,
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  zIndex: 999999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
}

const modalStyle: React.CSSProperties = {
  width: "100%",
  overflowY: "auto",
  background: "#ffffff",
  color: "#111111",
  boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 14,
  marginTop: 10,
  border: "1px solid #ccc",
  borderRadius: 10,
  fontSize: 16,
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 80,
}

const labelStyle: React.CSSProperties = {
  display: "block",
  marginTop: 20,
}

const primaryButton: React.CSSProperties = {
  marginTop: 24,
  width: "100%",
  padding: 14,
  background: "black",
  color: "white",
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
  fontSize: 16,
}

const secondaryButton: React.CSSProperties = {
  marginTop: 12,
  width: "100%",
  padding: 12,
  background: "#eeeeee",
  color: "black",
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
  fontSize: 16,
}

const selectStyles = {
  menuPortal: (base: any) => ({
    ...base,
    zIndex: 1000000,
  }),
  control: (base: any) => ({
    ...base,
    minHeight: 46,
    marginTop: 8,
    fontSize: 16,
  }),
}