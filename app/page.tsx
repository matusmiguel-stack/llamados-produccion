"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Select from "react-select"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import { supabase } from "../lib/supabase"
import Image from "next/image"

export default function Home() {
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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

  return (
    <div style={appShellStyle}>
      {isMobile && (
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={hamburgerButtonStyle}
          aria-label="Abrir menú"
        >
          ☰
        </button>
      )}

      {isMobile && menuOpen && (
        <button
          onClick={() => setMenuOpen(false)}
          style={mobileBackdropStyle}
          aria-label="Cerrar menú"
        />
      )}

      <aside
        style={{
          ...sidebarStyle,
          position: isMobile ? "fixed" : "sticky",
          left: isMobile && !menuOpen ? "-100%" : 0,
          top: 0,
          height: "100vh",
          zIndex: 9999,
          transition: "left 0.25s ease",
          width: isMobile ? 280 : 250,
        }}
      >
        <div>
          <div style={brandBlockStyle}>
          
            <div>
             <div
  style={{
    marginBottom: 20,
    display: "flex",
    justifyContent: "center",
  }}
>
  <Image
    src="/logo-retro.png"
    alt="Retro"
    width={160}
    height={60}
    style={{
      objectFit: "contain",
    }}
  />
</div>
              
            </div>
          </div>

          <nav style={navStyle}>
            <Link
              href="/"
              style={navLink}
              onClick={() => isMobile && setMenuOpen(false)}
            >
              📅 Calendario
            </Link>

            <Link
              href="/resources"
              style={navLink}
              onClick={() => isMobile && setMenuOpen(false)}
            >
              📦 Inventario
            </Link>

            {isAdmin && (
              <Link
                href="/users"
                style={navLink}
                onClick={() => isMobile && setMenuOpen(false)}
              >
                👥 Usuarios
              </Link>
            )}
          </nav>
        </div>

        <div style={profileCardStyle}>
          <p style={profileLabelStyle}>Sesión</p>
          <p style={profileEmailStyle}>{profile?.email || user?.email || "..."}</p>
          <span style={roleBadgeStyle}>{profile?.role || "cargando"}</span>
          <button onClick={logout} style={logoutButton}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main style={{ ...mainStyle, padding: isMobile ? "76px 12px 18px" : 28 }}>
        <section style={heroStyle}>
          <div>
            <p style={eyebrowStyle}>Sistema de producción</p>
            <h1 style={{ ...pageTitleStyle, fontSize: isMobile ? 30 : 44 }}>
              Calendario de llamados
            </h1>
            <p style={pageSubtitleStyle}>
              Planea filmaciones, bloquea recursos y coordina crew en tiempo real.
            </p>
          </div>

          <div style={statsGridStyle}>
            <StatCard label="Llamados" value={String(allShoots.length)} />
            <StatCard label="Recursos" value={String(resources.length)} />
            <StatCard label="Rol" value={profile?.role || "..."} />
          </div>
        </section>

        <section style={{ ...filtersStyle, flexDirection: isMobile ? "column" : "row" }}>
          <select
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
            style={filterInput}
          >
            <option value="">Todos los clientes</option>
            {clients.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            style={filterInput}
          >
            <option value="">Todos los proyectos</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={filterInput}
          >
            <option value="">Todos los status</option>
            <option value="tentative">Tentativo</option>
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

        <section style={calendarCardStyle}>
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            height={isMobile ? "72vh" : "78vh"}
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
        </section>

        {modalOpen && (
          <div style={overlayStyle}>
            <div
              style={{
                ...compactModalStyle,
                width: isMobile ? "100%" : 860,
                height: isMobile ? "100%" : "auto",
                borderRadius: isMobile ? 0 : 28,
              }}
            >
              <div style={compactHeaderStyle}>
                <div>
                  <p style={eyebrowStyle}>
                    {selectedShoot ? "Editar llamado" : "Nuevo llamado"}
                  </p>
                  <h2 style={compactTitleStyle}>
                    {selectedShoot ? title || "Editar llamado" : "Crear llamado"}
                  </h2>
                  <p style={compactMutedStyle}>
                    Configura datos, horario, notas y recursos asignados.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setModalOpen(false)
                    resetForm()
                  }}
                  style={compactCloseButtonStyle}
                >
                  ×
                </button>
              </div>

              <div style={compactBodyStyle}>
                <section style={compactCardStyle}>
                  <div style={compactSectionHeaderStyle}>
                    <span>01</span>
                    <strong>Información</strong>
                  </div>

                  <div
                    style={{
                      ...compactGridStyle,
                      gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1fr",
                    }}
                  >
                    <input
                      placeholder="Nombre del llamado"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      style={compactInputStyle}
                    />

                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      style={compactInputStyle}
                    >
                      <option value="tentative">Tentativo</option>
                      <option value="confirmed">Confirmado</option>
                      <option value="cancelled">Cancelado</option>
                      <option value="wrap">Wrap</option>
                    </select>
                  </div>

                  <div style={compactGridStyle}>
                    <input
                      placeholder="Cliente"
                      value={client}
                      onChange={(e) => setClient(e.target.value)}
                      style={compactInputStyle}
                    />

                    <input
                      placeholder="Proyecto"
                      value={project}
                      onChange={(e) => setProject(e.target.value)}
                      style={compactInputStyle}
                    />
                  </div>

                  <div style={compactGridStyle}>
                    <input
                      placeholder="Locación"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      style={compactInputStyle}
                    />

                    <input
                      placeholder="Contacto"
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      style={compactInputStyle}
                    />
                  </div>

                  <input
                    placeholder="Dirección"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    style={compactInputStyle}
                  />

                  <label style={compactCheckStyle}>
                    <input
                      type="checkbox"
                      checked={useCustomColor}
                      onChange={(e) => setUseCustomColor(e.target.checked)}
                    />
                    Usar color especial
                  </label>

                  {useCustomColor && (
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      style={{
                        ...compactInputStyle,
                        height: 44,
                        padding: 6,
                      }}
                    />
                  )}
                </section>

                <section style={compactCardStyle}>
                  <div style={compactSectionHeaderStyle}>
                    <span>02</span>
                    <strong>Producción y horario</strong>
                  </div>

                  <div style={compactGridStyle}>
                    <input
                      placeholder="Director / Realizador"
                      value={director}
                      onChange={(e) => setDirector(e.target.value)}
                      style={compactInputStyle}
                    />

                    <input
                      placeholder="DOP / Fotógrafo"
                      value={dop}
                      onChange={(e) => setDop(e.target.value)}
                      style={compactInputStyle}
                    />
                  </div>

                  <label style={compactCheckStyle}>
                    <input
                      type="checkbox"
                      checked={allDay}
                      onChange={(e) => setAllDay(e.target.checked)}
                    />
                    Todo el día
                  </label>

                  {!allDay && (
                    <div style={compactGridStyle}>
                      <div>
                        <p style={compactFieldLabelStyle}>Inicio</p>
                        <input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          style={compactInputStyle}
                        />
                      </div>

                      <div>
                        <p style={compactFieldLabelStyle}>Fin</p>
                        <input
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          style={compactInputStyle}
                        />
                      </div>
                    </div>
                  )}
                </section>

                <section style={compactCardStyle}>
                  <div style={compactSectionHeaderStyle}>
                    <span>03</span>
                    <strong>Recursos</strong>
                  </div>

                  <p style={compactFieldLabelStyle}>Recursos humanos</p>
                  <Select
                    isMulti
                    styles={selectThemeStyles}
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

                  <p style={compactFieldLabelStyle}>Recursos técnicos</p>
                  <Select
                    isMulti
                    styles={selectThemeStyles}
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
                </section>

                <section style={compactCardStyle}>
                  <div style={compactSectionHeaderStyle}>
                    <span>04</span>
                    <strong>Notas</strong>
                  </div>

                  <textarea
                    placeholder="Notas públicas"
                    value={publicNotes}
                    onChange={(e) => setPublicNotes(e.target.value)}
                    style={compactTextareaStyle}
                  />

                  {canEdit && (
                    <textarea
                      placeholder="Notas privadas"
                      value={privateNotes}
                      onChange={(e) => setPrivateNotes(e.target.value)}
                      style={compactTextareaStyle}
                    />
                  )}

                  <textarea
                    placeholder="Notas de producción"
                    value={productionNotes}
                    onChange={(e) => setProductionNotes(e.target.value)}
                    style={compactTextareaStyle}
                  />
                </section>
              </div>

              <div style={compactFooterStyle}>
                <button onClick={saveShoot} style={compactPrimaryButtonStyle}>
                  {selectedShoot ? "Guardar cambios" : "Crear llamado"}
                </button>

                <button
                  onClick={() => {
                    setModalOpen(false)
                    resetForm()
                  }}
                  style={compactSecondaryButtonStyle}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {detailsOpen && selectedShoot && (
          <div style={overlayStyle}>
            <div
              style={{
                ...compactModalStyle,
                width: isMobile ? "100%" : 760,
                height: isMobile ? "100%" : "auto",
                borderRadius: isMobile ? 0 : 28,
              }}
            >
              <div style={compactHeaderStyle}>
                <div>
                  <p style={eyebrowStyle}>Detalle de llamado</p>
                  <h2 style={compactTitleStyle}>
                    {statusEmoji(selectedShoot.status)} {selectedShoot.title}
                  </h2>
                  <p style={compactMutedStyle}>
                    {selectedShoot.client || "Sin cliente"} ·{" "}
                    {selectedShoot.project || "Sin proyecto"}
                  </p>
                </div>

                <button
                  onClick={() => setDetailsOpen(false)}
                  style={compactCloseButtonStyle}
                >
                  ×
                </button>
              </div>

              <div
                style={{
                  ...compactHeroGridStyle,
                  gridTemplateColumns: isMobile ? "1fr" : "1.1fr 0.9fr",
                }}
              >
                <div style={compactProducerCardStyle}>
                  <p style={compactFieldLabelStyle}>Productor</p>
                  <h3 style={compactProducerNameStyle}>
                    {getProducer(selectedShoot.id)?.name || "Sin productor"}
                  </h3>
                  <span style={compactMutedStyle}>
                    Asignado desde recursos humanos
                  </span>
                </div>

                <div style={compactStatusCardStyle(selectedShoot.status)}>
                  <p style={compactFieldLabelStyle}>Status</p>
                  <h3 style={compactStatusTextStyle}>
                    {statusLabel(selectedShoot.status)}
                  </h3>
                </div>
              </div>

              <div style={compactMiniGridStyle}>
                <CompactDetail label="Cliente" value={selectedShoot.client || "-"} />
                <CompactDetail label="Proyecto" value={selectedShoot.project || "-"} />
                <CompactDetail label="Locación" value={selectedShoot.location || "-"} />
                <CompactDetail label="Dirección" value={selectedShoot.address || "-"} />
                <CompactDetail label="Contacto" value={selectedShoot.contact || "-"} />
                <CompactDetail
                  label="Inicio"
                  value={new Date(selectedShoot.start_time).toLocaleString()}
                />
                <CompactDetail
                  label="Fin"
                  value={new Date(selectedShoot.end_time).toLocaleString()}
                />
                <CompactDetail label="Director" value={selectedShoot.director || "-"} />
                <CompactDetail label="DOP" value={selectedShoot.dop || "-"} />
              </div>

              <section style={compactCardStyle}>
                <div style={compactSectionHeaderStyle}>
                  <span>Recursos</span>
                  <strong>{getShootResources(selectedShoot.id).length}</strong>
                </div>

                <div style={compactResourceGridStyle}>
                  {getShootResources(selectedShoot.id).map((resource) => (
                    <div key={resource.id} style={compactResourceCardStyle}>
                      <strong>{resource.name}</strong>
                      <span>{resource.category}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section style={compactCardStyle}>
                <div style={compactSectionHeaderStyle}>
                  <span>Notas</span>
                  <strong>Producción</strong>
                </div>

                <div style={compactNotesGridStyle}>
                  <div style={compactNoteStyle}>
                    <span>Públicas</span>
                    <p>{selectedShoot.public_notes || "-"}</p>
                  </div>

                  {canEdit && (
                    <div style={compactNoteStyle}>
                      <span>Privadas</span>
                      <p>{selectedShoot.private_notes || "-"}</p>
                    </div>
                  )}

                  <div style={compactNoteStyle}>
                    <span>Producción</span>
                    <p>{selectedShoot.production_notes || "-"}</p>
                  </div>
                </div>
              </section>

              <div style={compactFooterStyle}>
                {canEdit && (
                  <button onClick={openEditShoot} style={compactPrimaryButtonStyle}>
                    Editar llamado
                  </button>
                )}

                {isAdmin && (
                  <button
                    onClick={deleteShoot}
                    style={{
                      ...compactPrimaryButtonStyle,
                      background: "linear-gradient(135deg, #dc2626, #991b1b)",
                    }}
                  >
                    Borrar llamado
                  </button>
                )}

                <button
                  onClick={() => setDetailsOpen(false)}
                  style={compactSecondaryButtonStyle}
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}


function statusLabel(status: string) {
  if (status === "confirmed") return "Confirmado"
  if (status === "cancelled") return "Cancelado"
  if (status === "wrap") return "Wrap"
  return "Tentativo"
}

function CompactDetail({ label, value }: { label: string; value: string }) {
  return (
    <div style={compactDetailCardStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={statCardStyle}>
      <p style={statLabelStyle}>{label}</p>
      <p style={statValueStyle}>{value}</p>
    </div>
  )
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
  minHeight: "100vh",
  background: "transparent",
  color: "#f8fafc",
}

const sidebarStyle: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98))",
  color: "white",
  padding: 20,
  borderRight: "1px solid rgba(148,163,184,0.14)",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  boxShadow: "24px 0 80px rgba(0,0,0,0.35)",
}

const mobileBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  zIndex: 9998,
  border: "none",
}

const hamburgerButtonStyle: React.CSSProperties = {
  position: "fixed",
  top: 14,
  left: 14,
  zIndex: 10000,
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 12,
  padding: "10px 14px",
  background: "rgba(15,23,42,0.92)",
  color: "white",
  fontSize: 20,
  cursor: "pointer",
  boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
}

const brandBlockStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "center",
}

const brandIconStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 14,
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(135deg, #7c3aed, #06b6d4)",
  boxShadow: "0 14px 40px rgba(124,58,237,0.35)",
}

const brandTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 21,
  letterSpacing: -0.4,
}

const brandSubtitleStyle: React.CSSProperties = {
  margin: "3px 0 0",
  color: "#94a3b8",
  fontSize: 12,
}

const navStyle: React.CSSProperties = {
  marginTop: 28,
  display: "grid",
  gap: 10,
}

const navLink: React.CSSProperties = {
  display: "block",
  color: "#e5e7eb",
  textDecoration: "none",
  padding: "12px 14px",
  borderRadius: 14,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.08)",
}

const profileCardStyle: React.CSSProperties = {
  marginTop: 24,
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
}

const profileLabelStyle: React.CSSProperties = {
  margin: 0,
  color: "#94a3b8",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 1,
}

const profileEmailStyle: React.CSSProperties = {
  margin: "8px 0",
  fontSize: 13,
  color: "#e5e7eb",
  wordBreak: "break-word",
}

const roleBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "5px 10px",
  borderRadius: 999,
  background: "rgba(124,58,237,0.28)",
  color: "#ddd6fe",
  fontSize: 12,
}

const logoutButton: React.CSSProperties = {
  marginTop: 12,
  width: "100%",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.08)",
  color: "white",
  cursor: "pointer",
}

const mainStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
}

const heroStyle: React.CSSProperties = {
  display: "grid",
  gap: 18,
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  alignItems: "end",
  marginBottom: 18,
}

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: "#a78bfa",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 1.4,
  fontWeight: 700,
}

const pageTitleStyle: React.CSSProperties = {
  margin: "6px 0 0",
  lineHeight: 1.02,
  letterSpacing: -1.6,
  color: "#f8fafc",
}

const pageSubtitleStyle: React.CSSProperties = {
  margin: "10px 0 0",
  color: "#94a3b8",
  maxWidth: 680,
}

const statsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
}

const statCardStyle: React.CSSProperties = {
  borderRadius: 18,
  padding: 14,
  background: "rgba(15,23,42,0.72)",
  border: "1px solid rgba(148,163,184,0.16)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.20)",
}

const statLabelStyle: React.CSSProperties = {
  margin: 0,
  color: "#94a3b8",
  fontSize: 12,
}

const statValueStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#f8fafc",
  fontSize: 22,
  fontWeight: 800,
}

const filtersStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  background: "rgba(15,23,42,0.72)",
  padding: 16,
  borderRadius: 20,
  marginBottom: 16,
  border: "1px solid rgba(148,163,184,0.16)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.20)",
}

const filterInput: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.26)",
  background: "rgba(2,6,23,0.72)",
  color: "#f8fafc",
  width: "100%",
}

const calendarCardStyle: React.CSSProperties = {
  background: "rgba(15,23,42,0.54)",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 24,
  padding: 12,
  boxShadow: "0 28px 90px rgba(0,0,0,0.32)",
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
