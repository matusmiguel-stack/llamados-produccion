"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Select from "react-select"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import { supabase } from "../lib/supabase"
import { AppSidebar } from "../components/AppSidebar"

export default function Home() {
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const calendarShellRef = useRef<HTMLDivElement>(null)
  const [calendarHeight, setCalendarHeight] = useState<number>()

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
  const [color, setColor] = useState("#7c3aed")
  const [useCustomColor, setUseCustomColor] = useState(false)
  const [allDay, setAllDay] = useState(false)
  const [startTime, setStartTime] = useState("09:00")
  const [endTime, setEndTime] = useState("18:00")
  const [selectedResources, setSelectedResources] = useState<string[]>([])

  const canEdit = profile?.role === "admin" || profile?.role === "editor"
  const isAdmin = profile?.role === "admin"

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => {
    if (isMobile) {
      setCalendarHeight(undefined)
      return
    }

    const shell = calendarShellRef.current
    if (!shell) return

    function updateHeight() {
      if (!calendarShellRef.current) return
      setCalendarHeight(calendarShellRef.current.clientHeight)
    }

    updateHeight()

    const observer = new ResizeObserver(updateHeight)
    observer.observe(shell)
    window.addEventListener("resize", updateHeight)

    return () => {
      observer.disconnect()
      window.removeEventListener("resize", updateHeight)
    }
  }, [isMobile])

  async function loadUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return
    setUser(user)

    const { data: profiles } = await supabase.from("profiles").select("*")
    const myProfile = profiles?.find(
      (p) => p.email?.trim().toLowerCase() === user.email?.trim().toLowerCase()
    )

    setProfile(myProfile)
  }

  async function loadAll() {
    const { data: shoots } = await supabase
      .from("shoots")
      .select("*")
      .order("start_time")

    const { data: res } = await supabase
      .from("resources")
      .select("*")
      .order("type")

    const { data: assignments } = await supabase
      .from("shoot_resources")
      .select("*, shoots(*), resources(*)")

    setAllShoots(shoots || [])
    setResources(res || [])
    setShootResources(assignments || [])
  }

  useEffect(() => {
    async function init() {
      const {
        data: { session },
      } = await supabase.auth.getSession()

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
        backgroundColor: shoot.color || "#7c3aed",
        borderColor: shoot.color || "#7c3aed",
        textColor: "#ffffff",
      }))
    )
  }, [
    allShoots,
    shootResources,
    filterClient,
    filterProject,
    filterStatus,
    filterHumanResource,
  ])

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
    setUseCustomColor(false)
    setAllDay(false)
    setStartTime("09:00")
    setEndTime("18:00")
    setSelectedResources([])
  }

  function clearFilters() {
    setFilterClient("")
    setFilterProject("")
    setFilterStatus("")
    setFilterHumanResource("")
  }

  const hasActiveFilters =
    !!filterClient ||
    !!filterProject ||
    !!filterStatus ||
    !!filterHumanResource

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

function getProducer(shootId: string) {
  return getShootResources(shootId).find((resource) => {
    const category = resource.category?.trim().toLowerCase()

    return category === "productor" || category === "productora"
  })
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
    setColor(selectedShoot.color || "#7c3aed")
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
      color: useCustomColor ? color : getStatusColor(status),
      start_time: start,
      end_time: end,
      all_day: allDay,
    }

    let shootId = selectedShoot?.id

    if (selectedShoot) {
      const { error } = await supabase
        .from("shoots")
        .update(payload)
        .eq("id", selectedShoot.id)

      if (error) return alert(error.message)

      await supabase
        .from("shoot_resources")
        .delete()
        .eq("shoot_id", selectedShoot.id)
    } else {
      const { data, error } = await supabase
        .from("shoots")
        .insert(payload)
        .select()
        .single()

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

    const { error } = await supabase
      .from("shoots")
      .delete()
      .eq("id", selectedShoot.id)

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

  const selectThemeStyles = {
    control: (base: any) => ({
      ...base,
      backgroundColor: "rgba(15, 23, 42, 0.92)",
      borderColor: "rgba(148, 163, 184, 0.28)",
      borderRadius: 12,
      minHeight: 46,
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
    input: (base: any) => ({ ...base, color: "#f8fafc" }),
    placeholder: (base: any) => ({ ...base, color: "#94a3b8" }),
    singleValue: (base: any) => ({ ...base, color: "#f8fafc" }),
  }

  const compactSelectThemeStyles = {
    ...selectThemeStyles,
    control: (base: any) => ({
      ...selectThemeStyles.control(base),
      borderRadius: 10,
      minHeight: 36,
      fontSize: 13,
    }),
    valueContainer: (base: any) => ({
      ...base,
      padding: "0 8px",
    }),
    input: (base: any) => ({
      ...selectThemeStyles.input(base),
      margin: 0,
      padding: 0,
    }),
    indicatorsContainer: (base: any) => ({
      ...base,
      height: 34,
    }),
  }

  return (
    <div
      style={{
        ...appShellStyle,
        ...(isMobile ? appShellMobileStyle : {}),
      }}
    >
      <AppSidebar
        profile={profile}
        user={user}
        isAdmin={isAdmin}
        isMobile={isMobile}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen(!menuOpen)}
        onMenuClose={() => setMenuOpen(false)}
        onLogout={logout}
      />

      <main
        style={{
          ...mainStyle,
          ...(isMobile ? mainMobileStyle : {}),
          padding: isMobile ? "76px 14px 24px" : "28px 32px",
        }}
      >
        <div
          style={{
            ...pageContainerStyle,
            ...(isMobile ? pageContainerMobileStyle : {}),
          }}
        >
          <header style={pageHeaderStyle}>
            <div>
              <h1 style={pageTitleStyle}>Calendario</h1>
              <p style={pageSubtitleStyle}>
                {events.length} visibles · {allShoots.length} total · {resources.length}{" "}
                recursos
              </p>
            </div>

            <span style={roleBadgeStyle(profile?.role)}>{profile?.role || "..."}</span>
          </header>

          <section
            style={{
              ...filtersToolbarStyle,
              gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(0, 1fr)) auto",
            }}
          >
            <select
              aria-label="Cliente"
              value={filterClient}
              onChange={(e) => setFilterClient(e.target.value)}
              style={compactFilterSelectStyle}
            >
              <option value="">Cliente</option>
              {clients.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              aria-label="Proyecto"
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              style={compactFilterSelectStyle}
            >
              <option value="">Proyecto</option>
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <select
              aria-label="Estado"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={compactFilterSelectStyle}
            >
              <option value="">Estado</option>
              <option value="tentative">Tentativo</option>
              <option value="confirmed">Confirmado</option>
              <option value="cancelled">Cancelado</option>
              <option value="wrap">Wrap</option>
            </select>

            <select
              aria-label="Personal"
              value={filterHumanResource}
              onChange={(e) => setFilterHumanResource(e.target.value)}
              style={compactFilterSelectStyle}
            >
              <option value="">Personal</option>
              {humanResources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name} — {resource.category}
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                style={{
                  ...ghostButtonStyle,
                  gridColumn: isMobile ? "1 / -1" : "auto",
                }}
              >
                Limpiar
              </button>
            )}
          </section>

          <section
            style={{
              ...calendarPanelStyle,
              ...(isMobile ? calendarPanelMobileStyle : {}),
            }}
          >
            <div style={calendarPanelHeaderStyle}>
              <p style={panelHintStyle}>
                {canEdit
                  ? "Clic en un día para crear llamado"
                  : "Consulta los llamados programados"}
              </p>
            </div>

            <div
              ref={calendarShellRef}
              className={isMobile ? "calendar-shell calendar-shell-mobile" : "calendar-shell"}
              style={{
                ...calendarShellStyle,
                ...(isMobile ? calendarShellMobileStyle : {}),
              }}
            >
              <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{
                  left: "prev,next today",
                  center: "title",
                  right: "dayGridMonth,timeGridWeek,timeGridDay",
                }}
                height={isMobile ? "auto" : calendarHeight}
                dayMaxEvents={3}
                views={{
                  dayGridMonth: {
                    expandRows: !isMobile,
                    dayMaxEvents: 3,
                  },
                }}
                events={events}
                selectable={canEdit}
                editable={canEdit}
                eventResizableFromStart={canEdit}
                dateClick={handleDateClick}
                eventClick={handleEventClick}
                eventDrop={updateEventDate}
                eventResize={updateEventDate}
                eventDisplay="block"
              />
            </div>
          </section>
        </div>

        {modalOpen && (
          <div style={overlayStyle}>
            <div
              style={{
                ...formModalStyle,
                width: isMobile ? "100%" : 680,
                height: isMobile ? "100%" : "auto",
                maxHeight: isMobile ? "100%" : "88vh",
                borderRadius: isMobile ? 0 : 16,
              }}
            >
              <div style={formModalHeaderStyle}>
                <div>
                  <h2 style={formModalTitleStyle}>
                    {selectedShoot ? "Editar llamado" : "Nuevo llamado"}
                  </h2>
                  {selectedDate && (
                    <p style={formModalMetaStyle}>
                      {new Date(selectedDate + "T12:00:00").toLocaleDateString(
                        "es-CL",
                        { weekday: "short", day: "numeric", month: "short", year: "numeric" }
                      )}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => {
                    setModalOpen(false)
                    resetForm()
                  }}
                  style={formModalCloseStyle}
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>

              <div style={formModalBodyStyle}>
                <div
                  style={{
                    ...formModalColumnsStyle,
                    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                  }}
                >
                  <div style={formModalColumnStyle}>
                    <p style={formModalSectionLabelStyle}>Detalles</p>

                    <div style={formModalFieldStyle}>
                      <label style={formModalLabelStyle}>Nombre</label>
                      <input
                        placeholder="Nombre del llamado"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        style={formModalInputStyle}
                      />
                    </div>

                    <div style={formModalRowStyle}>
                      <div style={formModalFieldStyle}>
                        <label style={formModalLabelStyle}>Cliente</label>
                        <input
                          placeholder="Cliente"
                          value={client}
                          onChange={(e) => setClient(e.target.value)}
                          style={formModalInputStyle}
                        />
                      </div>
                      <div style={formModalFieldStyle}>
                        <label style={formModalLabelStyle}>Proyecto</label>
                        <input
                          placeholder="Proyecto"
                          value={project}
                          onChange={(e) => setProject(e.target.value)}
                          style={formModalInputStyle}
                        />
                      </div>
                    </div>

                    <div style={formModalRowStyle}>
                      <div style={formModalFieldStyle}>
                        <label style={formModalLabelStyle}>Locación</label>
                        <input
                          placeholder="Locación"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          style={formModalInputStyle}
                        />
                      </div>
                      <div style={formModalFieldStyle}>
                        <label style={formModalLabelStyle}>Contacto</label>
                        <input
                          placeholder="Contacto"
                          value={contact}
                          onChange={(e) => setContact(e.target.value)}
                          style={formModalInputStyle}
                        />
                      </div>
                    </div>

                    <div style={formModalFieldStyle}>
                      <label style={formModalLabelStyle}>Dirección</label>
                      <input
                        placeholder="Dirección"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        style={formModalInputStyle}
                      />
                    </div>

                    <div style={formModalInlineOptionsStyle}>
                      <label style={formModalInlineCheckStyle}>
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
                          style={formModalColorInputStyle}
                        />
                      )}
                    </div>
                  </div>

                  <div style={formModalColumnStyle}>
                    <p style={formModalSectionLabelStyle}>Producción</p>

                    <div style={formModalRowStyle}>
                      <div style={formModalFieldStyle}>
                        <label style={formModalLabelStyle}>Estado</label>
                        <select
                          value={status}
                          onChange={(e) => setStatus(e.target.value)}
                          style={formModalInputStyle}
                        >
                          <option value="tentative">Tentativo</option>
                          <option value="confirmed">Confirmado</option>
                          <option value="cancelled">Cancelado</option>
                          <option value="wrap">Wrap</option>
                        </select>
                      </div>
                      <div style={formModalFieldStyle}>
                        <label style={formModalLabelStyle}>Horario</label>
                        <label style={formModalInlineCheckStyle}>
                          <input
                            type="checkbox"
                            checked={allDay}
                            onChange={(e) => setAllDay(e.target.checked)}
                          />
                          Todo el día
                        </label>
                      </div>
                    </div>

                    {!allDay && (
                      <div style={formModalRowStyle}>
                        <div style={formModalFieldStyle}>
                          <label style={formModalLabelStyle}>Inicio</label>
                          <input
                            type="time"
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            style={formModalInputStyle}
                          />
                        </div>
                        <div style={formModalFieldStyle}>
                          <label style={formModalLabelStyle}>Fin</label>
                          <input
                            type="time"
                            value={endTime}
                            onChange={(e) => setEndTime(e.target.value)}
                            style={formModalInputStyle}
                          />
                        </div>
                      </div>
                    )}

                    <div style={formModalRowStyle}>
                      <div style={formModalFieldStyle}>
                        <label style={formModalLabelStyle}>Director</label>
                        <input
                          placeholder="Director / Realizador"
                          value={director}
                          onChange={(e) => setDirector(e.target.value)}
                          style={formModalInputStyle}
                        />
                      </div>
                      <div style={formModalFieldStyle}>
                        <label style={formModalLabelStyle}>DOP</label>
                        <input
                          placeholder="DOP / Fotógrafo"
                          value={dop}
                          onChange={(e) => setDop(e.target.value)}
                          style={formModalInputStyle}
                        />
                      </div>
                    </div>

                    <p style={{ ...formModalSectionLabelStyle, marginTop: 14 }}>
                      Recursos
                    </p>

                    <div style={formModalFieldStyle}>
                      <label style={formModalLabelStyle}>Humanos</label>
                      <Select
                        isMulti
                        styles={compactSelectThemeStyles}
                        placeholder="Seleccionar..."
                        options={humanResources.map((resource) => ({
                          value: resource.id,
                          label: `${resource.name} — ${resource.category}${
                            isResourceBusy(resource.id) ? " — OCUPADO" : ""
                          }`,
                          isDisabled: isResourceBusy(resource.id),
                        }))}
                        value={humanResources
                          .filter((r) => selectedResources.includes(r.id))
                          .map((r) => ({
                            value: r.id,
                            label: `${r.name} — ${r.category}`,
                          }))}
                        onChange={(selected) => {
                          const humanIds = selected.map((item) => item.value)
                          const technicalIds = selectedResources.filter((id) =>
                            technicalResources.some((r) => r.id === id)
                          )
                          setSelectedResources([...humanIds, ...technicalIds])
                        }}
                      />
                    </div>

                    <div style={formModalFieldStyle}>
                      <label style={formModalLabelStyle}>Técnicos</label>
                      <Select
                        isMulti
                        styles={compactSelectThemeStyles}
                        placeholder="Seleccionar..."
                        options={technicalResources.map((resource) => ({
                          value: resource.id,
                          label: `${resource.name} — ${resource.category}${
                            isResourceBusy(resource.id) ? " — OCUPADO" : ""
                          }`,
                          isDisabled: isResourceBusy(resource.id),
                        }))}
                        value={technicalResources
                          .filter((r) => selectedResources.includes(r.id))
                          .map((r) => ({
                            value: r.id,
                            label: `${r.name} — ${r.category}`,
                          }))}
                        onChange={(selected) => {
                          const technicalIds = selected.map((item) => item.value)
                          const humanIds = selectedResources.filter((id) =>
                            humanResources.some((r) => r.id === id)
                          )
                          setSelectedResources([...humanIds, ...technicalIds])
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div style={formModalNotesBlockStyle}>
                  <p style={formModalSectionLabelStyle}>Notas</p>
                  <div
                    style={{
                      ...formModalNotesGridStyle,
                      gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
                    }}
                  >
                    <div style={formModalFieldStyle}>
                      <label style={formModalLabelStyle}>Públicas</label>
                      <textarea
                        placeholder="Visibles para el equipo"
                        value={publicNotes}
                        onChange={(e) => setPublicNotes(e.target.value)}
                        style={formModalTextareaStyle}
                      />
                    </div>

                    {canEdit && (
                      <div style={formModalFieldStyle}>
                        <label style={formModalLabelStyle}>Privadas</label>
                        <textarea
                          placeholder="Solo admins"
                          value={privateNotes}
                          onChange={(e) => setPrivateNotes(e.target.value)}
                          style={formModalTextareaStyle}
                        />
                      </div>
                    )}

                    <div style={formModalFieldStyle}>
                      <label style={formModalLabelStyle}>Producción</label>
                      <textarea
                        placeholder="Logística y detalles"
                        value={productionNotes}
                        onChange={(e) => setProductionNotes(e.target.value)}
                        style={formModalTextareaStyle}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div style={formModalFooterStyle}>
                <button
                  onClick={() => {
                    setModalOpen(false)
                    resetForm()
                  }}
                  style={formModalSecondaryButtonStyle}
                >
                  Cancelar
                </button>
                <button onClick={saveShoot} style={formModalPrimaryButtonStyle}>
                  {selectedShoot ? "Guardar" : "Crear llamado"}
                </button>
              </div>
            </div>
          </div>
        )}

        {detailsOpen && selectedShoot && (
          <div style={overlayStyle}>
            <div
              style={{
                ...formModalStyle,
                width: isMobile ? "100%" : 680,
                height: isMobile ? "100%" : "auto",
                maxHeight: isMobile ? "100%" : "88vh",
                borderRadius: isMobile ? 0 : 16,
              }}
            >
              <div style={formModalHeaderStyle}>
                <div>
                  <h2 style={formModalTitleStyle}>
                    {statusEmoji(selectedShoot.status)} {selectedShoot.title}
                  </h2>
                  <p style={formModalMetaStyle}>
                    {selectedShoot.client || "Sin cliente"} ·{" "}
                    {selectedShoot.project || "Sin proyecto"}
                  </p>
                </div>

                <button
                  onClick={() => setDetailsOpen(false)}
                  style={formModalCloseStyle}
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>

              <div style={formModalBodyStyle}>
                <div
                  style={{
                    ...formModalColumnsStyle,
                    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                  }}
                >
                  <div style={formModalColumnStyle}>
                    <p style={formModalSectionLabelStyle}>Detalles</p>

                    <div style={formModalRowStyle}>
                      <FormModalPreviewField
                        label="Cliente"
                        value={selectedShoot.client}
                      />
                      <FormModalPreviewField
                        label="Proyecto"
                        value={selectedShoot.project}
                      />
                    </div>

                    <div style={formModalRowStyle}>
                      <FormModalPreviewField
                        label="Locación"
                        value={selectedShoot.location}
                      />
                      <FormModalPreviewField
                        label="Contacto"
                        value={selectedShoot.contact}
                      />
                    </div>

                    <FormModalPreviewField
                      label="Dirección"
                      value={selectedShoot.address}
                    />
                  </div>

                  <div style={formModalColumnStyle}>
                    <p style={formModalSectionLabelStyle}>Producción</p>

                    <div style={formModalRowStyle}>
                      <div style={formModalFieldStyle}>
                        <span style={formModalLabelStyle}>Estado</span>
                        <span style={formModalStatusBadgeStyle(selectedShoot.status)}>
                          {statusLabel(selectedShoot.status)}
                        </span>
                      </div>
                      <FormModalPreviewField
                        label="Productor"
                        value={getProducer(selectedShoot.id)?.name}
                      />
                    </div>

                    <div style={formModalRowStyle}>
                      <FormModalPreviewField
                        label="Inicio"
                        value={formatShootDateTime(selectedShoot.start_time)}
                      />
                      <FormModalPreviewField
                        label="Fin"
                        value={formatShootDateTime(selectedShoot.end_time)}
                      />
                    </div>

                    <div style={formModalRowStyle}>
                      <FormModalPreviewField
                        label="Director"
                        value={selectedShoot.director}
                      />
                      <FormModalPreviewField label="DOP" value={selectedShoot.dop} />
                    </div>

                    <div style={formModalFieldStyle}>
                      <span style={formModalLabelStyle}>
                        Personal Retro ({getShootResources(selectedShoot.id).length})
                      </span>
                      {getShootResources(selectedShoot.id).length > 0 ? (
                        <div style={formModalPillGridStyle}>
                          {getShootResources(selectedShoot.id).map((resource) => (
                            <span key={resource.id} style={formModalPillStyle}>
                              {resource.name}
                              <span style={formModalPillMetaStyle}>
                                {resource.category}
                              </span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div style={formModalValueStyle}>—</div>
                      )}
                    </div>
                  </div>
                </div>

                <div style={formModalNotesBlockStyle}>
                  <p style={formModalSectionLabelStyle}>Notas</p>
                  <div
                    style={{
                      ...formModalNotesGridStyle,
                      gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
                    }}
                  >
                    <FormModalPreviewField
                      label="Públicas"
                      value={selectedShoot.public_notes}
                      multiline
                    />

                    {canEdit && (
                      <FormModalPreviewField
                        label="Privadas"
                        value={selectedShoot.private_notes}
                        multiline
                      />
                    )}

                    <FormModalPreviewField
                      label="Producción"
                      value={selectedShoot.production_notes}
                      multiline
                    />
                  </div>
                </div>
              </div>

              <div style={formModalFooterStyle}>
                <button
                  onClick={() => setDetailsOpen(false)}
                  style={formModalSecondaryButtonStyle}
                >
                  Cerrar
                </button>

                {canEdit && (
                  <button onClick={openEditShoot} style={formModalPrimaryButtonStyle}>
                    Editar
                  </button>
                )}

                {isAdmin && (
                  <button onClick={deleteShoot} style={formModalDangerButtonStyle}>
                    Borrar
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}


function formatShootDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function FormModalPreviewField({
  label,
  value,
  multiline = false,
}: {
  label: string
  value?: string | null
  multiline?: boolean
}) {
  return (
    <div style={formModalFieldStyle}>
      <span style={formModalLabelStyle}>{label}</span>
      <div
        style={{
          ...formModalValueStyle,
          ...(multiline ? formModalNoteValueStyle : {}),
        }}
      >
        {value?.trim() || "—"}
      </div>
    </div>
  )
}

function statusLabel(status: string) {
  if (status === "confirmed") return "Confirmado"
  if (status === "cancelled") return "Cancelado"
  if (status === "wrap") return "Wrap"
  return "Tentativo"
}

function formModalStatusBadgeStyle(status: string): React.CSSProperties {
  const color = getStatusColor(status)
  return {
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    padding: "4px 8px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    background: `${color}22`,
    border: `1px solid ${color}44`,
    color: "#f8fafc",
  }
}

function roleBadgeStyle(role?: string): React.CSSProperties {
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    admin: {
      bg: "rgba(124,58,237,0.18)",
      border: "rgba(167,139,250,0.28)",
      text: "#ddd6fe",
    },
    editor: {
      bg: "rgba(14,165,233,0.14)",
      border: "rgba(56,189,248,0.24)",
      text: "#bae6fd",
    },
    viewer: {
      bg: "rgba(148,163,184,0.12)",
      border: "rgba(148,163,184,0.22)",
      text: "#cbd5e1",
    },
  }

  const palette = colors[role || "viewer"] || colors.viewer

  return {
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "capitalize",
    background: palette.bg,
    border: `1px solid ${palette.border}`,
    color: palette.text,
  }
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={detailCardStyle}>
      <p style={detailLabelStyle}>{label}</p>
      <p style={detailValueStyle}>{value}</p>
    </div>
  )
}

function statusEmoji(status: string) {
  if (status === "confirmed") return "✅"
  if (status === "cancelled") return "❌"
  if (status === "wrap") return "🏁"
  return "🟡"
}
function getStatusColor(status: string) {
  if (status === "confirmed") return "#16a34a"

  if (status === "cancelled") return "#dc2626"

  if (status === "wrap") return "#64748b"

  return "#eab308"
}

const appShellStyle: React.CSSProperties = {
  display: "flex",
  height: "100vh",
  overflow: "hidden",
  background: "transparent",
  color: "#f8fafc",
}

const appShellMobileStyle: React.CSSProperties = {
  height: "auto",
  minHeight: "100vh",
  overflow: "visible",
}

const mainStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
}

const mainMobileStyle: React.CSSProperties = {
  overflow: "visible",
  minHeight: "auto",
}

const pageContainerStyle: React.CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  width: "100%",
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
}

const pageContainerMobileStyle: React.CSSProperties = {
  flex: "none",
  minHeight: "auto",
  overflow: "visible",
}

const pageHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginBottom: 8,
  flexWrap: "wrap",
  flexShrink: 0,
}

const pageTitleStyle: React.CSSProperties = {
  margin: 0,
  lineHeight: 1.1,
  letterSpacing: -0.5,
  color: "#f8fafc",
  fontSize: 22,
}

const pageSubtitleStyle: React.CSSProperties = {
  margin: "3px 0 0",
  color: "#64748b",
  fontSize: 12,
}

const filtersToolbarStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  alignItems: "center",
  padding: "6px 8px",
  marginBottom: 8,
  borderRadius: 12,
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148,163,184,0.14)",
  boxShadow: "0 12px 40px rgba(0,0,0,0.16)",
  flexShrink: 0,
}

const compactFilterSelectStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 8,
  background: "rgba(2,6,23,0.55)",
  color: "#f8fafc",
  outline: "none",
  fontSize: 12,
  lineHeight: 1.2,
  minWidth: 0,
}

const calendarPanelStyle: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148,163,184,0.14)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
  backdropFilter: "blur(16px)",
  borderRadius: 16,
  padding: "10px 12px 12px",
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
}

const calendarPanelMobileStyle: React.CSSProperties = {
  flex: "none",
  minHeight: "auto",
  overflow: "visible",
}

const calendarPanelHeaderStyle: React.CSSProperties = {
  marginBottom: 8,
  flexShrink: 0,
}

const calendarShellStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
}

const calendarShellMobileStyle: React.CSSProperties = {
  flex: "none",
  minHeight: "auto",
  overflow: "visible",
}

const panelHintStyle: React.CSSProperties = {
  margin: 0,
  color: "#64748b",
  fontSize: 11,
}

const ghostButtonStyle: React.CSSProperties = {
  padding: "6px 10px",
  background: "transparent",
  color: "#94a3b8",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 500,
  fontSize: 12,
  whiteSpace: "nowrap",
  height: 32,
}

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
  maxWidth: "calc(100vw - 32px)",
  maxHeight: "92vh",
  overflowY: "auto",
  background: "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98))",
  color: "#f8fafc",
  borderRadius: 24,
  padding: 24,
  border: "1px solid rgba(148,163,184,0.18)",
  boxShadow: "0 30px 120px rgba(0,0,0,0.62)",
}

const modalHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "start",
  marginBottom: 18,
}

const modalTitleStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 28,
  letterSpacing: -0.8,
}

const iconButtonStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.08)",
  color: "white",
  fontSize: 24,
  cursor: "pointer",
}

const sectionTitleStyle: React.CSSProperties = {
  margin: "24px 0 8px",
  color: "#c4b5fd",
  fontSize: 13,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 1,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 13,
  marginTop: 8,
  border: "1px solid rgba(148,163,184,0.28)",
  borderRadius: 12,
  background: "rgba(15,23,42,0.88)",
  color: "#f8fafc",
  outline: "none",
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 92,
}

const labelStyle: React.CSSProperties = {
  display: "block",
  marginTop: 14,
  color: "#cbd5e1",
  fontSize: 13,
}

const checkRowStyle: React.CSSProperties = {
  marginTop: 18,
  padding: 12,
  borderRadius: 14,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
}

const stickyActionsStyle: React.CSSProperties = {
  position: "sticky",
  bottom: -24,
  margin: "24px -24px -24px",
  padding: 18,
  background: "linear-gradient(180deg, rgba(2,6,23,0.80), rgba(2,6,23,0.98))",
  borderTop: "1px solid rgba(148,163,184,0.16)",
}

const primaryButton: React.CSSProperties = {
  marginTop: 0,
  width: "100%",
  padding: 14,
  background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
  color: "white",
  border: "none",
  borderRadius: 14,
  cursor: "pointer",
  fontWeight: 800,
  boxShadow: "0 16px 40px rgba(124,58,237,0.28)",
}

const secondaryButton: React.CSSProperties = {
  marginTop: 10,
  width: "100%",
  padding: 13,
  background: "rgba(255,255,255,0.08)",
  color: "#f8fafc",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 14,
  cursor: "pointer",
}

const detailGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
}

const detailCardStyle: React.CSSProperties = {
  borderRadius: 16,
  padding: 12,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
}

const detailLabelStyle: React.CSSProperties = {
  margin: 0,
  color: "#94a3b8",
  fontSize: 12,
}

const detailValueStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#f8fafc",
  fontWeight: 700,
}

const noteBoxStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#cbd5e1",
}

const resourceListStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  padding: 0,
  listStyle: "none",
}

const resourcePillStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 999,
  background: "rgba(124,58,237,0.24)",
  border: "1px solid rgba(167,139,250,0.24)",
  color: "#ddd6fe",
}

const formModalStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  maxWidth: "calc(100vw - 28px)",
  overflow: "hidden",
  background: "rgba(15, 23, 42, 0.96)",
  color: "#f8fafc",
  border: "1px solid rgba(148,163,184,0.14)",
  boxShadow: "0 24px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset",
  backdropFilter: "blur(20px)",
}

const formModalHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  padding: "14px 16px 12px",
  borderBottom: "1px solid rgba(148,163,184,0.10)",
}

const formModalTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  letterSpacing: -0.3,
  lineHeight: 1.2,
}

const formModalMetaStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#64748b",
  fontSize: 12,
}

const formModalCloseStyle: React.CSSProperties = {
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

const formModalBodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "14px 16px",
  display: "grid",
  gap: 14,
}

const formModalColumnsStyle: React.CSSProperties = {
  display: "grid",
  gap: 16,
}

const formModalColumnStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  alignContent: "start",
}

const formModalSectionLabelStyle: React.CSSProperties = {
  margin: "0 0 2px",
  color: "#64748b",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.6,
}

const formModalFieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
}

const formModalLabelStyle: React.CSSProperties = {
  margin: 0,
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 500,
}

const formModalRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
}

const formModalInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 8,
  background: "rgba(2,6,23,0.55)",
  color: "#f8fafc",
  outline: "none",
  fontSize: 13,
  lineHeight: 1.35,
}

const formModalTextareaStyle: React.CSSProperties = {
  ...formModalInputStyle,
  minHeight: 56,
  resize: "vertical",
  fontFamily: "inherit",
}

const formModalInlineOptionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 2,
}

const formModalInlineCheckStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: "#cbd5e1",
  fontSize: 12,
  cursor: "pointer",
  minHeight: 32,
}

const formModalColorInputStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  padding: 2,
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.14)",
  background: "rgba(2,6,23,0.55)",
  cursor: "pointer",
}

const formModalNotesBlockStyle: React.CSSProperties = {
  paddingTop: 12,
  borderTop: "1px solid rgba(148,163,184,0.08)",
}

const formModalNotesGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
}

const formModalFooterStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 8,
  padding: "12px 16px",
  borderTop: "1px solid rgba(148,163,184,0.10)",
  background: "rgba(2,6,23,0.72)",
}

const formModalPrimaryButtonStyle: React.CSSProperties = {
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

const formModalSecondaryButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "transparent",
  color: "#94a3b8",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 500,
  fontSize: 13,
}

const formModalValueStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid rgba(148,163,184,0.10)",
  borderRadius: 8,
  background: "rgba(2,6,23,0.35)",
  color: "#e2e8f0",
  fontSize: 13,
  lineHeight: 1.35,
  minHeight: 32,
  display: "flex",
  alignItems: "center",
  wordBreak: "break-word",
}

const formModalNoteValueStyle: React.CSSProperties = {
  minHeight: 56,
  alignItems: "flex-start",
  whiteSpace: "pre-wrap",
}

const formModalPillGridStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
}

const formModalPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 8px",
  borderRadius: 6,
  background: "rgba(124,58,237,0.16)",
  border: "1px solid rgba(167,139,250,0.22)",
  color: "#f8fafc",
  fontSize: 12,
  fontWeight: 600,
}

const formModalPillMetaStyle: React.CSSProperties = {
  color: "#a78bfa",
  fontWeight: 500,
}

const formModalDangerButtonStyle: React.CSSProperties = {
  padding: "8px 14px",
  background: "linear-gradient(135deg, #dc2626, #991b1b)",
  color: "white",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
  boxShadow: "0 8px 24px rgba(220,38,38,0.22)",
}

const compactModalStyle: React.CSSProperties = {
  maxWidth: "calc(100vw - 28px)",
  maxHeight: "92vh",
  overflowY: "auto",
  background:
    "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98))",
  color: "#f8fafc",
  border: "1px solid rgba(148,163,184,0.18)",
  boxShadow: "0 40px 140px rgba(0,0,0,0.7)",
  backdropFilter: "blur(24px)",
  padding: 18,
}

const compactHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  paddingBottom: 14,
  marginBottom: 14,
  borderBottom: "1px solid rgba(148,163,184,0.14)",
}

const compactTitleStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 24,
  letterSpacing: -0.8,
  lineHeight: 1.1,
}

const compactMutedStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#94a3b8",
  fontSize: 13,
}

const compactCloseButtonStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.07)",
  color: "white",
  fontSize: 22,
  cursor: "pointer",
}

const compactBodyStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
}

const compactGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 10,
}

const compactCardStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.045)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 18,
  padding: 14,
  boxShadow: "0 18px 50px rgba(0,0,0,0.18)",
}

const compactSectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  color: "#c4b5fd",
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 1.2,
  marginBottom: 10,
}

const compactInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  marginTop: 0,
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 14,
  background: "rgba(2,6,23,0.62)",
  color: "#f8fafc",
  outline: "none",
  fontSize: 14,
}

const compactTextareaStyle: React.CSSProperties = {
  ...compactInputStyle,
  minHeight: 74,
  resize: "vertical",
  marginTop: 8,
}

const compactCheckStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  marginTop: 10,
  padding: "10px 12px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.045)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#cbd5e1",
  fontSize: 13,
}

const compactFieldLabelStyle: React.CSSProperties = {
  margin: "10px 0 6px",
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.8,
}

const compactFooterStyle: React.CSSProperties = {
  position: "sticky",
  bottom: -18,
  margin: "16px -18px -18px",
  padding: 16,
  display: "grid",
  gap: 10,
  background:
    "linear-gradient(180deg, rgba(2,6,23,0.72), rgba(2,6,23,0.98))",
  borderTop: "1px solid rgba(148,163,184,0.14)",
  backdropFilter: "blur(18px)",
}

const compactPrimaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: 13,
  background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
  color: "white",
  border: "none",
  borderRadius: 16,
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 14,
  boxShadow: "0 16px 40px rgba(124,58,237,0.28)",
}

const compactSecondaryButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: 12,
  background: "rgba(255,255,255,0.08)",
  color: "#f8fafc",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 16,
  cursor: "pointer",
  fontWeight: 700,
}

const compactHeroGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  marginBottom: 12,
}

const compactProducerCardStyle: React.CSSProperties = {
  borderRadius: 20,
  padding: 16,
  background:
    "linear-gradient(135deg, rgba(124,58,237,0.22), rgba(14,165,233,0.12))",
  border: "1px solid rgba(167,139,250,0.24)",
}

const compactProducerNameStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 24,
  letterSpacing: -0.6,
}

function compactStatusCardStyle(status: string): React.CSSProperties {
  const color = getStatusColor(status)
  return {
    borderRadius: 20,
    padding: 16,
    background: `${color}22`,
    border: `1px solid ${color}55`,
  }
}

const compactStatusTextStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 22,
  fontWeight: 900,
}

const compactMiniGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
  marginBottom: 12,
}

const compactDetailCardStyle: React.CSSProperties = {
  borderRadius: 16,
  padding: 12,
  background: "rgba(255,255,255,0.045)",
  border: "1px solid rgba(255,255,255,0.08)",
  display: "grid",
  gap: 5,
}

const compactResourceGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
}

const compactResourceCardStyle: React.CSSProperties = {
  borderRadius: 16,
  padding: 12,
  background: "rgba(124,58,237,0.16)",
  border: "1px solid rgba(167,139,250,0.22)",
  display: "grid",
  gap: 4,
}

const compactNotesGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
}

const compactNoteStyle: React.CSSProperties = {
  borderRadius: 16,
  padding: 12,
  background: "rgba(255,255,255,0.045)",
  border: "1px solid rgba(255,255,255,0.08)",
}
