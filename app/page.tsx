"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Select from "react-select"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import { supabase } from "../lib/supabase"
import { requireSessionProfile } from "../lib/session-profile"
import { AppSidebar } from "../components/AppSidebar"
import { PushNotificationManager } from "../components/PushNotificationManager"
import { DatePickerField } from "../components/DatePickerField"
import {
  DraggableModalPanel,
  draggableModalHeaderStyle,
} from "../components/DraggableModalPanel"
import {
  ANNIVERSARY_EVENT_PREFIX,
  BIRTHDAY_EVENT_PREFIX,
  buildAnniversaryCalendarEvents,
  buildBirthdayCalendarEvents,
  employeeDisplayName,
} from "../lib/employee-dates"

const VACATION_COLOR = "#9333ea"
const VACATION_EVENT_PREFIX = "vacation:"
const BIRTHDAY_COLOR = "#f59e0b"
const ANNIVERSARY_COLOR = "#14b8a6"
const JUNTA_EVENT_PREFIX = "junta:"
const JUNTA_COLOR = "#0891b2"

const RESPONSABLES_PRODUCCION = [
  "Miguel Matus",
  "Adriana Barrera",
  "Maricela Peña",
  "Carlos Muños",
  "Diana Cobian",
]

type CatalogClient = {
  id: string
  name: string
}

type CatalogSubfolder = {
  id: string
  client_id: string
  name: string
}

type CatalogProject = {
  id: string
  client_id: string
  subfolder_id: string
  name: string
}

function shootMatchesClientFilter(
  shoot: any,
  filterClientId: string,
  clients: CatalogClient[]
) {
  if (!filterClientId) return true

  if (shoot.client_id === filterClientId) return true

  const clientName = clients.find((client) => client.id === filterClientId)?.name
  return !shoot.client_id && !!clientName && shoot.client === clientName
}

function shootMatchesProjectFilter(
  shoot: any,
  filterProjectId: string,
  projects: CatalogProject[]
) {
  if (!filterProjectId) return true

  if (shoot.project_id === filterProjectId) return true

  const projectName = projects.find((project) => project.id === filterProjectId)?.name
  return !shoot.project_id && !!projectName && shoot.project === projectName
}

function resolveShootClientId(shoot: any, clients: CatalogClient[]) {
  if (shoot.client_id) return shoot.client_id

  return (
    clients.find((client) => client.name === shoot.client)?.id || ""
  )
}

function resolveShootSubfolderId(
  shoot: any,
  clientId: string,
  subfolderIdFromProject: string,
  subfolders: CatalogSubfolder[]
) {
  if (subfolderIdFromProject) return subfolderIdFromProject

  const scopedSubfolders = clientId
    ? subfolders.filter((subfolder) => subfolder.client_id === clientId)
    : subfolders

  if (scopedSubfolders.length === 1) return scopedSubfolders[0].id

  return ""
}

function resolveShootProjectId(
  shoot: any,
  subfolderId: string,
  projects: CatalogProject[]
) {
  if (shoot.project_id) return shoot.project_id

  const scopedProjects = subfolderId
    ? projects.filter((project) => project.subfolder_id === subfolderId)
    : projects

  return (
    scopedProjects.find((project) => project.name === shoot.project)?.id || ""
  )
}

export default function Home() {
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const calendarShellRef = useRef<HTMLDivElement>(null)
  const calendarRef = useRef<FullCalendar>(null)
  const dayNumberNavRef = useRef(false)
  const icsInputRef = useRef<HTMLInputElement>(null)

  const [events, setEvents] = useState<any[]>([])
  const [allShoots, setAllShoots] = useState<any[]>([])
  const [resources, setResources] = useState<any[]>([])
  const [shootResources, setShootResources] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [shootEmployees, setShootEmployees] = useState<any[]>([])
  const [allClients, setAllClients] = useState<CatalogClient[]>([])
  const [allSubfolders, setAllSubfolders] = useState<CatalogSubfolder[]>([])
  const [allProjects, setAllProjects] = useState<CatalogProject[]>([])
  const [allVacations, setAllVacations] = useState<any[]>([])
  const [vacationEmployees, setVacationEmployees] = useState<any[]>([])
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [vacationDetailsOpen, setVacationDetailsOpen] = useState(false)
  const [selectedShoot, setSelectedShoot] = useState<any>(null)
  const [selectedVacation, setSelectedVacation] = useState<any>(null)
  const [showDupePicker, setShowDupePicker] = useState(false)
  const [dupeDate, setDupeDate] = useState("")
  const [duplicating, setDuplicating] = useState(false)
  const [liveConnected, setLiveConnected] = useState(false)

  const [entryMode, setEntryMode] = useState<"shoot" | "vacation" | "junta">("shoot")
  const [vacationStartDate, setVacationStartDate] = useState("")
  const [vacationEndDate, setVacationEndDate] = useState("")

  const [filterClient, setFilterClient] = useState("")
  const [filterSubfolder, setFilterSubfolder] = useState("")
  const [filterProject, setFilterProject] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [filterHumanResource, setFilterHumanResource] = useState("")

  const [selectedDate, setSelectedDate] = useState("")
  const [selectedEndDate, setSelectedEndDate] = useState("")
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
  const [startTime, setStartTime] = useState("09:00")
  const [endTime, setEndTime] = useState("18:00")
  const [selectedResources, setSelectedResources] = useState<string[]>([])
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([])
  const [shootResponsable, setShootResponsable] = useState("")

  // ── Juntas ─────────────────────────────────────────────────────────────────
  const [allJuntas, setAllJuntas] = useState<any[]>([])
  const [juntaAttendeeMap, setJuntaAttendeeMap] = useState<Record<string, string[]>>({})
  const [selectedJunta, setSelectedJunta] = useState<any>(null)
  const [juntaDetailsOpen, setJuntaDetailsOpen] = useState(false)
  // junta form state
  const [juntaTipo, setJuntaTipo] = useState<"Brief" | "PPM" | "Junta Cliente">("Brief")
  const [juntaDate, setJuntaDate] = useState("")
  const [juntaStartTime, setJuntaStartTime] = useState("09:00")
  const [juntaEndTime, setJuntaEndTime] = useState("")
  const [juntaTitulo, setJuntaTitulo] = useState("")
  const [juntaNotas, setJuntaNotas] = useState("")
  const [juntaLink, setJuntaLink] = useState("")
  const [juntaAttendees, setJuntaAttendees] = useState<string[]>([])
  const [juntaExternalEmails, setJuntaExternalEmails] = useState<string[]>([])
  const [juntaEmailInput, setJuntaEmailInput] = useState("")

  // ── Crear cliente inline ──────────────────────────────────────────────────
  const [showAddClient, setShowAddClient] = useState(false)
  const [newClientName, setNewClientName] = useState("")
  const [savingClient, setSavingClient] = useState(false)

  // ── Recordatorio de juntas (client-side, cada minuto) ─────────────────────
  const REMINDER_MINUTES = 1 // cambiar a 30 para producción
  const firedJuntaReminders = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!user) return

    console.log("[junta-reminder] useEffect fired — user:", user?.id, "juntas:", allJuntas.length)

    function checkJuntaReminders() {
      if (Notification.permission !== "granted") return

      const now = new Date()
      const todayStr = now.toLocaleDateString("sv") // YYYY-MM-DD en timezone local

      for (const junta of allJuntas) {
        if (!junta.hora_inicio || junta.fecha !== todayStr) continue

        const [h, m] = junta.hora_inicio.split(":").map(Number)
        const juntaTime = new Date(now)
        juntaTime.setHours(h, m, 0, 0)

        const diffMin = (juntaTime.getTime() - now.getTime()) / 60000
        console.log(`[junta-reminder] ${junta.hora_inicio} diffMin=${diffMin.toFixed(2)}`)

        if (diffMin <= REMINDER_MINUTES && diffMin > -2) {
          const key = `${junta.id}-${REMINDER_MINUTES}`
          if (firedJuntaReminders.current.has(key)) continue
          firedJuntaReminders.current.add(key)

          const label = junta.titulo || junta.tipo
          new Notification(`📋 Junta en ${Math.ceil(Math.max(diffMin, 0))} min`, {
            body: `${label} · ${junta.hora_inicio} hrs`,
            icon: "/logo-retro.png",
          })
        }
      }
    }

    checkJuntaReminders() // revisar inmediatamente al montar
    const interval = setInterval(checkJuntaReminders, 10_000) // cada 10 segundos
    return () => clearInterval(interval)
  }, [user, allJuntas, juntaAttendeeMap, employees])

  const canEdit = profile?.role === "admin" || profile?.role === "editor"
  const isAdmin = profile?.role === "admin"
  const isProductorRole = profile?.role === "productor"
  const canJunta = canEdit || isProductorRole
  const canManageVacations = isAdmin

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => {
    const shell = calendarShellRef.current
    if (!shell) return

    function isDayNumberTarget(target: EventTarget | null) {
      return Boolean((target as HTMLElement | null)?.closest(".fc-daygrid-day-number"))
    }

    function handleDayNumberPointerDown(event: PointerEvent) {
      if (!isDayNumberTarget(event.target)) return

      const calendarApi = calendarRef.current?.getApi()
      if (!calendarApi || calendarApi.view.type !== "dayGridMonth") return

      dayNumberNavRef.current = true
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }

    function handleDayNumberClick(event: MouseEvent) {
      if (!isDayNumberTarget(event.target)) return

      const calendarApi = calendarRef.current?.getApi()
      if (!calendarApi || calendarApi.view.type !== "dayGridMonth") return

      const dayCell = (event.target as HTMLElement).closest(".fc-daygrid-day")
      const dateStr = dayCell?.getAttribute("data-date")
      if (!dateStr) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()

      calendarApi.unselect()
      calendarApi.changeView("timeGridDay", dateStr)

      window.setTimeout(() => {
        dayNumberNavRef.current = false
      }, 0)
    }

    shell.addEventListener("pointerdown", handleDayNumberPointerDown, true)
    shell.addEventListener("click", handleDayNumberClick, true)
    return () => {
      shell.removeEventListener("pointerdown", handleDayNumberPointerDown, true)
      shell.removeEventListener("click", handleDayNumberClick, true)
    }
  }, [])

  async function loadAll() {
    const [
      { data: shoots },
      { data: res },
      { data: assignments },
      { data: emps },
      { data: employeeAssignments },
      { data: vacations },
      { data: vacationAssignments },
      { data: clients },
      { data: subfolders },
      { data: projects },
    ] = await Promise.all([
      supabase.from("shoots").select("*").order("start_time"),
      supabase.from("resources").select("*").order("type"),
      supabase.from("shoot_resources").select("*, shoots(*), resources(*)"),
      supabase
        .from("employees")
        .select("*")
        .order("nombre")
        .order("apellido_paterno"),
      supabase.from("shoot_employees").select("*, shoots(*), employees(*)"),
      supabase.from("vacations").select("*").order("start_date"),
      supabase.from("vacation_employees").select("*, vacations(*), employees(*)"),
      supabase.from("clients").select("id, name").order("name"),
      supabase
        .from("client_subfolders")
        .select("id, client_id, name")
        .order("name"),
      supabase
        .from("projects")
        .select("id, client_id, subfolder_id, name")
        .order("name"),
    ])

    setAllShoots(shoots || [])
    setResources(res || [])
    setShootResources(assignments || [])
    setEmployees(emps || [])
    setShootEmployees(employeeAssignments || [])
    setAllVacations(vacations || [])
    setVacationEmployees(vacationAssignments || [])
    setAllClients(clients || [])
    setAllSubfolders(subfolders || [])
    setAllProjects(projects || [])

    const { data: juntasData } = await supabase
      .from("juntas")
      .select("*")
      .order("fecha", { ascending: true })

    const { data: juntaAttendeesData } = await supabase
      .from("junta_attendees")
      .select("junta_id, employee_id")

    const attMap: Record<string, string[]> = {}
    for (const ja of juntaAttendeesData || []) {
      if (!attMap[ja.junta_id]) attMap[ja.junta_id] = []
      attMap[ja.junta_id].push(ja.employee_id)
    }
    setAllJuntas(juntasData || [])
    setJuntaAttendeeMap(attMap)
  }

  useEffect(() => {
    async function init() {
      const auth = await requireSessionProfile()
      if (!auth) return

      setUser(auth.session.user)
      setProfile(auth.profile)
      await loadAll()
    }

    init()
  }, [])

  // ── Realtime: sincronización en vivo con todos los usuarios ────────────────
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    function scheduleReload() {
      if (timer) clearTimeout(timer)
      // Debounce 400ms: agrupa múltiples eventos del mismo guardado
      timer = setTimeout(() => { loadAll() }, 400)
    }

    const channel = supabase
      .channel("calendar-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "shoots" },           scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "shoot_employees" },  scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "shoot_resources" },  scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "vacations" },        scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "vacation_employees" }, scheduleReload)
      .subscribe((status) => {
        setLiveConnected(status === "SUBSCRIBED")
      })

    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const filtered = allShoots.filter((shoot) => {
      const clientOk = shootMatchesClientFilter(shoot, filterClient, allClients)
      const projectOk = shootMatchesProjectFilter(
        shoot,
        filterProject,
        allProjects
      )
      const statusOk = !filterStatus || shoot.status === filterStatus

      const humanResourceOk =
        !filterHumanResource ||
        shootEmployees.some(
          (assignment) =>
            assignment.shoot_id === shoot.id &&
            assignment.employee_id === filterHumanResource
        )

      return clientOk && projectOk && statusOk && humanResourceOk
    })

    const filteredVacations = allVacations.filter((vacation) => {
      if (!filterHumanResource) return true

      return vacationEmployees.some(
        (assignment) =>
          assignment.vacation_id === vacation.id &&
          assignment.employee_id === filterHumanResource
      )
    })

    const shootEvents = filtered.map((shoot) => {
      const { start, end } = shootToCalendarEventTimes(shoot)

      return {
        id: shoot.id,
        title: `${statusEmoji(shoot.status)} ${shoot.title}`,
        start,
        end,
        allDay: shoot.all_day,
        backgroundColor: shoot.color || "#7c3aed",
        borderColor: shoot.color || "#7c3aed",
        textColor: "#ffffff",
      }
    })

    const vacationEvents = filteredVacations.map((vacation) => ({
      id: `${VACATION_EVENT_PREFIX}${vacation.id}`,
      title: `🏖️ ${formatVacationTitle(vacation, vacationEmployees)}`,
      start: vacation.start_date,
      end: addDaysToDateString(vacation.end_date, 1),
      allDay: true,
      backgroundColor: VACATION_COLOR,
      borderColor: VACATION_COLOR,
      textColor: "#ffffff",
      editable: false,
    }))

    const birthdayEvents = buildBirthdayCalendarEvents(employees, {
      filterEmployeeId: filterHumanResource || undefined,
      color: BIRTHDAY_COLOR,
    })

    const anniversaryEvents = buildAnniversaryCalendarEvents(employees, {
      filterEmployeeId: filterHumanResource || undefined,
      color: ANNIVERSARY_COLOR,
    })

    const juntaEvents = allJuntas.map((j) => {
      const emoji = j.tipo === "Brief" ? "📋" : j.tipo === "PPM" ? "🎬" : "🤝"
      return {
        id: `${JUNTA_EVENT_PREFIX}${j.id}`,
        title: j.titulo ? `${emoji} ${j.titulo}` : `${emoji} ${j.tipo}`,
        start: j.hora_inicio ? `${j.fecha}T${j.hora_inicio}` : j.fecha,
        end:   j.hora_fin    ? `${j.fecha}T${j.hora_fin}`    : undefined,
        allDay: !j.hora_inicio,
        backgroundColor: JUNTA_COLOR,
        borderColor:     JUNTA_COLOR,
        textColor: "#ffffff",
        editable: false,
      }
    })

    setEvents([...shootEvents, ...vacationEvents, ...birthdayEvents, ...anniversaryEvents, ...juntaEvents])
  }, [
    allShoots,
    allVacations,
    allJuntas,
    juntaAttendeeMap,
    employees,
    shootResources,
    shootEmployees,
    vacationEmployees,
    filterClient,
    filterSubfolder,
    filterProject,
    filterStatus,
    filterHumanResource,
    allClients,
    allSubfolders,
    allProjects,
  ])

  async function handleSaveNewClient() {
    if (!newClientName.trim()) return
    setSavingClient(true)
    try {
      const { data, error } = await supabase
        .from("clients")
        .insert({ name: newClientName.trim() })
        .select("id, name")
        .single()
      if (error) throw error
      // Add to local list sorted alphabetically
      setAllClients((prev) =>
        [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
      )
      // Auto-select the new client
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

  // ── Importar invite .ics ───────────────────────────────────────────────────
  function parseICS(text: string): {
    fecha: string; horaInicio: string; horaFin: string; titulo: string; link: string
  } | null {
    // RFC 5545: unfold continuation lines (lines starting with space/tab)
    const unfolded = text.replace(/\r?\n[ \t]/g, "")
    const allLines = unfolded.split(/\r?\n/)

    // ── Extract only lines inside BEGIN:VEVENT ... END:VEVENT ──────────────
    // The ICS file also has DTSTART inside BEGIN:VTIMEZONE (DST definition),
    // which has nothing to do with the event time. We must ignore it.
    const veventStart = allLines.findIndex(l => l.trim().toUpperCase() === "BEGIN:VEVENT")
    const veventEnd   = allLines.findIndex((l, i) => i > veventStart && l.trim().toUpperCase() === "END:VEVENT")
    const lines = veventStart >= 0
      ? allLines.slice(veventStart, veventEnd >= 0 ? veventEnd + 1 : undefined)
      : allLines  // fallback: search entire file if no VEVENT found

    // ── Robust datetime extraction ─────────────────────────────────────────
    // Matches the datetime value at the end of the line using a regex, which is
    // immune to TZID values that contain colons (e.g. "(UTC-06:00) Central Time").
    const DT_PATTERN = /(\d{8}(?:T\d{6}Z?)?|\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}Z?)?)\s*$/

    function getDT(name: string): string | null {
      for (const line of lines) {
        if (!line.toUpperCase().startsWith(name.toUpperCase())) continue
        const m = line.match(DT_PATTERN)
        return m ? m[1] : null
      }
      return null
    }

    // For text props (SUMMARY, DESCRIPTION, etc.) the first-colon approach is fine
    // because those values don't have a TZID parameter with colons.
    function getProp(name: string): string | null {
      for (const line of lines) {
        const col = line.indexOf(":")
        if (col < 0) continue
        const key = line.slice(0, col).split(";")[0].toUpperCase()
        if (key === name.toUpperCase()) return line.slice(col + 1).trim()
      }
      return null
    }

    // Parse a datetime string → { fecha: "YYYY-MM-DD", hora: "HH:MM" }
    // Handles compact (20260601T140000[Z]) and extended (2026-06-01T14:00:00[Z]).
    // Does NOT convert timezone — shows the time as the organiser wrote it.
    function parseDateTime(dt: string | null): { fecha: string; hora: string } | null {
      if (!dt) return null
      const raw = dt.replace(/Z$/i, "").trim()

      if (raw.includes("-")) {
        // Extended: 2026-06-01[T14:00:00]
        return {
          fecha: raw.slice(0, 10),
          hora:  raw.length > 10 ? raw.slice(11, 16) : "",
        }
      }

      // Compact: 20260601[T140000]
      if (raw.length < 8) return null
      return {
        fecha: `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`,
        hora:  raw.length >= 13 ? `${raw.slice(9,11)}:${raw.slice(11,13)}` : "",
      }
    }

    // Extract first Zoom / Meet / Teams / Webex URL from any field
    function extractMeetingLink(): string {
      const MEETING_RE = /https?:\/\/\S*(?:zoom\.us\/j\/|meet\.google\.com\/|teams\.microsoft\.com\/l\/|webex\.com\/|whereby\.com\/|meet\.jit\.si\/)\S*/i
      const searchIn = [
        getProp("X-GOOGLE-CONFERENCE"),
        getProp("LOCATION"),
        getProp("URL"),
        getProp("DESCRIPTION"),
      ]
      for (const src of searchIn) {
        if (!src) continue
        const clean = src.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\/g, "")
        const m = clean.match(MEETING_RE)
        if (m) return m[0].replace(/[>"\s].*$/, "")
      }
      return ""
    }

    const start = parseDateTime(getDT("DTSTART"))
    if (!start) return null
    const end = parseDateTime(getDT("DTEND"))

    const cleanText = (s: string) =>
      s.replace(/\\,/g, ",").replace(/\\n/gi, " ").replace(/\\/g, "").trim()

    return {
      fecha:       start.fecha,
      horaInicio:  start.hora || "09:00",
      horaFin:     end?.hora  || "",
      titulo:      cleanText(getProp("SUMMARY") || ""),
      link:        extractMeetingLink(),
    }
  }

  function handleICSImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const parsed = parseICS(text)
      if (!parsed) {
        alert("No se pudo leer el archivo .ics. Asegúrate de que es un invite de calendario válido.")
        return
      }
      resetForm()
      setEntryMode("junta")
      setJuntaDate(parsed.fecha)
      setJuntaStartTime(parsed.horaInicio)
      setJuntaEndTime(parsed.horaFin)
      setJuntaNotas(parsed.titulo)
      setJuntaLink(parsed.link)
      setModalOpen(true)
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  function resetForm() {
    setSelectedShoot(null)
    setSelectedVacation(null)
    setEntryMode("shoot")
    setVacationStartDate("")
    setVacationEndDate("")
    setSelectedDate("")
    setSelectedEndDate("")
    setTitle("")
    setClientId("")
    setSubfolderId("")
    setProjectId("")
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
    setSelectedEmployees([])
    setShootResponsable("")
    setJuntaTipo("Brief")
    setJuntaDate("")
    setJuntaStartTime("09:00")
    setJuntaEndTime("")
    setJuntaTitulo("")
    setJuntaNotas("")
    setJuntaLink("")
    setJuntaAttendees([])
    setJuntaExternalEmails([])
    setJuntaEmailInput("")
    setSelectedJunta(null)
    setJuntaDetailsOpen(false)
  }

  function clearFilters() {
    setFilterClient("")
    setFilterSubfolder("")
    setFilterProject("")
    setFilterStatus("")
    setFilterHumanResource("")
  }

  const hasActiveFilters =
    !!filterClient ||
    !!filterSubfolder ||
    !!filterProject ||
    !!filterStatus ||
    !!filterHumanResource

  function handleCalendarSelect(info: any) {
    if (dayNumberNavRef.current) {
      info.view.calendar.unselect()
      return
    }

    if (info.jsEvent?.target?.closest?.(".fc-daygrid-day-number")) {
      info.view.calendar.unselect()
      return
    }

    if (!canJunta) return
    resetForm()
    if (isProductorRole) setEntryMode("junta")

    const { startDate, endDate } = selectionToDateRange(info)

    setSelectedDate(startDate)
    setSelectedEndDate(endDate)
    setVacationStartDate(startDate)
    setVacationEndDate(endDate)
    setJuntaDate(startDate)

    const isMultiDay = endDate > startDate

    if (isMultiDay || info.allDay) {
      setAllDay(true)
    } else {
      const st = info.start.toTimeString().slice(0, 5)
      setStartTime(st)
      setEndTime(info.end.toTimeString().slice(0, 5))
      setJuntaStartTime(st)
    }

    setModalOpen(true)
    info.view.calendar.unselect()
  }

  function handleEventClick(info: any) {
    if (dayNumberNavRef.current) return

    if (info.jsEvent?.target?.closest?.(".fc-daygrid-day-number")) {
      return
    }

    const eventId = String(info.event.id)

    if (eventId.startsWith(JUNTA_EVENT_PREFIX)) {
      const juntaId = eventId.slice(JUNTA_EVENT_PREFIX.length)
      const junta = allJuntas.find((j) => j.id === juntaId)
      if (junta) {
        setSelectedJunta(junta)
        setJuntaDetailsOpen(true)
      }
      return
    }

    if (
      eventId.startsWith(VACATION_EVENT_PREFIX) ||
      eventId.startsWith(BIRTHDAY_EVENT_PREFIX) ||
      eventId.startsWith(ANNIVERSARY_EVENT_PREFIX)
    ) {
      if (eventId.startsWith(VACATION_EVENT_PREFIX)) {
        const vacationId = eventId.slice(VACATION_EVENT_PREFIX.length)
        const vacation = allVacations.find((item) => item.id === vacationId)
        setSelectedVacation(vacation || null)
        setVacationDetailsOpen(true)
      }
      return
    }

    const shoot = allShoots.find((s) => s.id === eventId)
    setSelectedShoot(shoot || null)
    setDetailsOpen(true)
  }

function getVacationEmployees(vacationId: string) {
  return vacationEmployees
    .filter((assignment) => assignment.vacation_id === vacationId)
    .map((assignment) => assignment.employees)
    .filter(Boolean)
}

function getShootEmployees(shootId: string) {
  return shootEmployees
    .filter((a) => a.shoot_id === shootId)
    .map((a) => a.employees)
    .filter(Boolean)
}

function getShootTechnicalResources(shootId: string) {
  return shootResources
    .filter((a) => a.shoot_id === shootId && a.resources?.type === "technical")
    .map((a) => a.resources)
    .filter(Boolean)
}

function employeeSelectLabel(employee: any) {
  return `${employeeDisplayName(employee)} — ${employee.puesto}`
}

function getProducer(shootId: string) {
  return getShootEmployees(shootId).find((employee) => {
    const puesto = employee.puesto?.trim().toLowerCase()

    return puesto === "productor" || puesto === "productora"
  })
}

function openEditShoot() {
    if (!selectedShoot || !canEdit) return

    const { startDate, endDate } = shootToDateRange(selectedShoot)
    const singleDay = endDate === startDate

    setTitle(selectedShoot.title || "")
    const nextClientId = resolveShootClientId(selectedShoot, allClients)
    const nextProjectId = resolveShootProjectId(
      selectedShoot,
      "",
      allProjects
    )
    const nextSubfolderId = resolveShootSubfolderId(
      selectedShoot,
      nextClientId,
      allProjects.find((project) => project.id === nextProjectId)?.subfolder_id ||
        "",
      allSubfolders
    )

    setClientId(nextClientId)
    setSubfolderId(nextSubfolderId)
    setProjectId(
      nextProjectId ||
        resolveShootProjectId(selectedShoot, nextSubfolderId, allProjects)
    )
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
    setSelectedDate(startDate)
    setSelectedEndDate(endDate)
    setStartTime(timePartFromTimestamp(selectedShoot.start_time))
    setEndTime(timePartFromTimestamp(selectedShoot.end_time))
    setAllDay(singleDay ? !!selectedShoot.all_day : true)
    setSelectedEmployees(getShootEmployees(selectedShoot.id).map((employee) => employee.id))
    setSelectedResources(
      getShootTechnicalResources(selectedShoot.id).map((resource) => resource.id)
    )
    setShootResponsable(selectedShoot.responsable || "")
    setEntryMode("shoot")

    setDetailsOpen(false)
    setModalOpen(true)
  }

function openEditVacation() {
    if (!selectedVacation || !canManageVacations) return

    setVacationStartDate(selectedVacation.start_date)
    setVacationEndDate(selectedVacation.end_date)
    setSelectedEmployees(
      getVacationEmployees(selectedVacation.id).map((employee) => employee.id)
    )
    setEntryMode("vacation")
    setVacationDetailsOpen(false)
    setModalOpen(true)
  }

  function isEmployeeUnavailableForVacation(employeeId: string) {
    if (!vacationStartDate || !vacationEndDate) return false

    const shootConflict = shootEmployees.some((assignment) => {
      if (assignment.employee_id !== employeeId) return false
      if (!assignment.shoots) return false

      const { startDate: shootStart, endDate: shootEnd } = shootToDateRange(
        assignment.shoots
      )

      return datesOverlapInclusive(
        vacationStartDate,
        vacationEndDate,
        shootStart,
        shootEnd
      )
    })

    const vacationConflict = vacationEmployees.some((assignment) => {
      if (assignment.employee_id !== employeeId) return false
      if (!assignment.vacations) return false
      if (selectedVacation && assignment.vacation_id === selectedVacation.id) {
        return false
      }

      return datesOverlapInclusive(
        vacationStartDate,
        vacationEndDate,
        assignment.vacations.start_date,
        assignment.vacations.end_date
      )
    })

    return shootConflict || vacationConflict
  }

  function getEffectiveShootEndDate() {
    return selectedEndDate || selectedDate
  }

  function isMultiDayShoot() {
    if (!selectedDate) return false
    return getEffectiveShootEndDate() > selectedDate
  }

  function getShootDateTimeRange() {
    if (!selectedDate) return null

    const endDate = getEffectiveShootEndDate()
    const multiDay = endDate > selectedDate

    if (multiDay) {
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

  function isEmployeeBusy(employeeId: string) {
    const range = getShootDateTimeRange()
    if (!range) return false

    const shootStartDate = selectedDate
    const shootEndDate = getEffectiveShootEndDate()

    const onVacation = vacationEmployees.some((assignment) => {
      if (assignment.employee_id !== employeeId) return false
      if (!assignment.vacations) return false

      return datesOverlapInclusive(
        shootStartDate,
        shootEndDate,
        assignment.vacations.start_date,
        assignment.vacations.end_date
      )
    })

    if (onVacation) return true

    const proposedStart = new Date(range.start)
    const proposedEnd = new Date(range.end)

    return shootEmployees.some((assignment) => {
      if (assignment.employee_id !== employeeId) return false
      if (!assignment.shoots) return false
      if (selectedShoot && assignment.shoot_id === selectedShoot.id) return false

      const existingStart = new Date(assignment.shoots.start_time)
      const existingEnd = new Date(assignment.shoots.end_time)

      return proposedStart < existingEnd && proposedEnd > existingStart
    })
  }

  function isResourceBusy(resourceId: string) {
    const range = getShootDateTimeRange()
    if (!range) return false

    const proposedStart = new Date(range.start)
    const proposedEnd = new Date(range.end)

    return shootResources.some((assignment) => {
      if (assignment.resource_id !== resourceId) return false
      if (!assignment.shoots) return false
      if (selectedShoot && assignment.shoot_id === selectedShoot.id) return false

      const existingStart = new Date(assignment.shoots.start_time)
      const existingEnd = new Date(assignment.shoots.end_time)

      return proposedStart < existingEnd && proposedEnd > existingStart
    })
  }

  async function saveShoot() {
    if (!canEdit) return alert("No tienes permisos para editar.")
    if (!title) return alert("Ponle nombre al llamado")
    if (!selectedDate) return alert("Selecciona las fechas del llamado")
    if (selectedEmployees.length === 0 && selectedResources.length === 0) {
      return alert("Selecciona al menos un empleado o recurso técnico")
    }

    const range = getShootDateTimeRange()
    if (!range) return alert("Selecciona las fechas del llamado")

    // Sólo validar disponibilidad al CREAR un nuevo llamado, no al editar uno existente
    if (!selectedShoot) {
      const busyEmployee = selectedEmployees.find((employeeId) =>
        isEmployeeBusy(employeeId)
      )
      if (busyEmployee) {
        const employee = employees.find((item) => item.id === busyEmployee)
        return alert(
          `${employee ? employeeSelectLabel(employee) : "Un empleado"} no está disponible en esas fechas`
        )
      }
    }

    const selectedClient = allClients.find((item) => item.id === clientId)
    const selectedSubfolder = allSubfolders.find((item) => item.id === subfolderId)
    const selectedProject = allProjects.find((item) => item.id === projectId)

    if (
      subfolderId &&
      selectedSubfolder &&
      selectedSubfolder.client_id !== clientId
    ) {
      return alert("La subcarpeta seleccionada no pertenece al cliente elegido")
    }

    if (
      projectId &&
      selectedProject &&
      selectedProject.subfolder_id !== subfolderId
    ) {
      return alert("El proyecto seleccionado no pertenece a la subcarpeta elegida")
    }

    const payload = {
      title,
      client_id: clientId || null,
      project_id: projectId || null,
      client: selectedClient?.name || null,
      project: selectedProject?.name || null,
      location,
      address,
      contact,
      director,
      dop,
      responsable: shootResponsable || null,
      public_notes: publicNotes,
      private_notes: privateNotes,
      production_notes: productionNotes,
      status,
      color: useCustomColor ? color : getStatusColor(status),
      start_time: range.start,
      end_time: range.end,
      all_day: range.allDay,
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

      await supabase
        .from("shoot_employees")
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

    if (selectedEmployees.length > 0) {
      await supabase.from("shoot_employees").insert(
        selectedEmployees.map((employeeId) => ({
          shoot_id: shootId,
          employee_id: employeeId,
        }))
      )
      // Notificar a los empleados asignados
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        fetch("/api/push/shoot-assigned", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shootId,
            shootTitle: title,
            shootDate: selectedDate,
            employeeIds: selectedEmployees,
          }),
        }).catch(() => {}) // fire-and-forget
      }
    }

    if (selectedResources.length > 0) {
      await supabase.from("shoot_resources").insert(
        selectedResources.map((resourceId) => ({
          shoot_id: shootId,
          resource_id: resourceId,
        }))
      )
    }

    setModalOpen(false)
    resetForm()
    await loadAll()
  }

  async function saveVacation() {
    if (!canManageVacations) {
      return alert("Solo admin puede gestionar vacaciones.")
    }
    if (!vacationStartDate || !vacationEndDate) {
      return alert("Selecciona las fechas de vacaciones")
    }
    if (vacationEndDate < vacationStartDate) {
      return alert("La fecha final debe ser igual o posterior a la inicial")
    }
    if (selectedEmployees.length === 0) {
      return alert("Selecciona al menos un empleado")
    }

    const payload = {
      start_date: vacationStartDate,
      end_date: vacationEndDate,
    }

    let vacationId = selectedVacation?.id

    if (selectedVacation) {
      const { error } = await supabase
        .from("vacations")
        .update(payload)
        .eq("id", selectedVacation.id)

      if (error) return alert(error.message)

      await supabase
        .from("vacation_employees")
        .delete()
        .eq("vacation_id", selectedVacation.id)
    } else {
      const { data, error } = await supabase
        .from("vacations")
        .insert(payload)
        .select()
        .single()

      if (error) return alert(error.message)
      vacationId = data.id
    }

    await supabase.from("vacation_employees").insert(
      selectedEmployees.map((employeeId) => ({
        vacation_id: vacationId,
        employee_id: employeeId,
      }))
    )

    setModalOpen(false)
    resetForm()
    await loadAll()
  }

  async function saveJunta() {
    if (!juntaDate) { alert("Selecciona una fecha para la junta"); return }

    // Auto-agregar email si quedó escrito en el input sin presionar Enter
    const pendingEmail = juntaEmailInput.trim()
    const finalExternalEmails = pendingEmail.includes("@") && !juntaExternalEmails.includes(pendingEmail)
      ? [...juntaExternalEmails, pendingEmail]
      : juntaExternalEmails

    const payload = {
      tipo:        juntaTipo,
      titulo:      juntaTitulo.trim() || null,
      fecha:       juntaDate,
      hora_inicio: juntaStartTime || "09:00",
      hora_fin:    juntaEndTime   || null,
      notas:       juntaNotas.trim() || null,
      link:        juntaLink.trim()  || null,
      external_emails: finalExternalEmails.length > 0 ? finalExternalEmails : null,
      created_by:  user?.id || null,
      updated_at:  new Date().toISOString(),
    }

    let juntaId: string

    if (selectedJunta) {
      const { error } = await supabase.from("juntas").update(payload).eq("id", selectedJunta.id)
      if (error) { alert(error.message); return }
      juntaId = selectedJunta.id
      await supabase.from("junta_attendees").delete().eq("junta_id", juntaId)
    } else {
      const { data, error } = await supabase.from("juntas").insert(payload).select("id").single()
      if (error) { alert(error.message); return }
      juntaId = data.id
    }

    if (juntaAttendees.length > 0) {
      await supabase.from("junta_attendees").insert(
        juntaAttendees.map((emp_id) => ({ junta_id: juntaId, employee_id: emp_id }))
      )
    }

    // Enviar emails con ICS adjunto
    if (juntaAttendees.length > 0 || finalExternalEmails.length > 0) {
      try {
        const res = await fetch("/api/juntas/send-invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            junta: { ...payload, id: juntaId },
            attendeeEmployeeIds: juntaAttendees,
          }),
        })
        const data = await res.json()
        if (!res.ok || data.error) {
          alert(`Error al enviar invitaciones: ${data.error || res.statusText}`)
        } else {
          alert(`Invitaciones enviadas: ${data.sent} correo(s)${data.debug ? `\nDebug: ${data.debug}` : ""}`)
        }
      } catch (e: any) {
        alert(`Error al enviar invitaciones: ${e.message}`)
      }
    }

    setModalOpen(false)
    setJuntaDetailsOpen(false)
    resetForm()

    const { data: juntasData } = await supabase.from("juntas").select("*").order("fecha")
    const { data: juntaAttendeesData } = await supabase.from("junta_attendees").select("junta_id, employee_id")
    const attMap: Record<string, string[]> = {}
    for (const ja of juntaAttendeesData || []) {
      if (!attMap[ja.junta_id]) attMap[ja.junta_id] = []
      attMap[ja.junta_id].push(ja.employee_id)
    }
    setAllJuntas(juntasData || [])
    setJuntaAttendeeMap(attMap)
  }

  async function deleteJunta(id: string) {
    if (!confirm("¿Eliminar esta junta?")) return
    await supabase.from("juntas").delete().eq("id", id)
    setJuntaDetailsOpen(false)
    setSelectedJunta(null)
    const { data } = await supabase.from("juntas").select("*").order("fecha")
    setAllJuntas(data || [])
  }

  async function saveEntry() {
    if (entryMode === "junta") {
      await saveJunta()
      return
    }

    if (entryMode === "vacation" || selectedVacation) {
      if (!canManageVacations) {
        return alert("Solo admin puede gestionar vacaciones.")
      }
      await saveVacation()
      return
    }

    await saveShoot()
  }

  async function deleteShoot() {
    if (!canEdit) return alert("No tienes permisos para borrar.")
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

  async function duplicateShoot() {
    if (!selectedShoot || !dupeDate) return
    setDuplicating(true)
    try {
      // Shift all timestamps by the day difference
      const origDateStr = selectedShoot.start_time.slice(0, 10)
      const origMs = new Date(origDateStr + "T12:00:00Z").getTime()
      const newMs  = new Date(dupeDate    + "T12:00:00Z").getTime()
      const dayDiffMs = newMs - origMs

      function shiftTs(iso: string): string {
        const [datePart, timePart] = iso.split("T")
        const shifted = new Date(new Date(datePart + "T12:00:00Z").getTime() + dayDiffMs)
        const newDate = shifted.toISOString().slice(0, 10)
        return `${newDate}T${timePart || "00:00:00"}`
      }

      const { data: newShootData, error } = await supabase
        .from("shoots")
        .insert({
          title:            selectedShoot.title,
          client_id:        selectedShoot.client_id        || null,
          project_id:       selectedShoot.project_id       || null,
          client:           selectedShoot.client           || null,
          project:          selectedShoot.project          || null,
          location:         selectedShoot.location         || null,
          address:          selectedShoot.address          || null,
          contact:          selectedShoot.contact          || null,
          director:         selectedShoot.director         || null,
          dop:              selectedShoot.dop              || null,
          public_notes:     selectedShoot.public_notes     || null,
          private_notes:    selectedShoot.private_notes    || null,
          production_notes: selectedShoot.production_notes || null,
          status:           selectedShoot.status,
          color:            selectedShoot.color,
          start_time:       shiftTs(selectedShoot.start_time),
          end_time:         shiftTs(selectedShoot.end_time),
          all_day:          selectedShoot.all_day,
        })
        .select()
        .single()

      if (error) throw error

      // Copy employees
      const empRows = shootEmployees
        .filter((a) => a.shoot_id === selectedShoot.id)
        .map((a) => ({ shoot_id: newShootData.id, employee_id: a.employee_id }))
      if (empRows.length > 0) await supabase.from("shoot_employees").insert(empRows)

      // Copy resources
      const resRows = shootResources
        .filter((a) => a.shoot_id === selectedShoot.id)
        .map((a) => ({ shoot_id: newShootData.id, resource_id: a.resource_id }))
      if (resRows.length > 0) await supabase.from("shoot_resources").insert(resRows)

      setShowDupePicker(false)
      setDupeDate("")
      await loadAll()
    } catch (err: any) {
      alert("Error al duplicar: " + err.message)
    } finally {
      setDuplicating(false)
    }
  }

  function shareSelectedShoot() {
    if (!selectedShoot) return

    const message = buildShootWhatsAppMessage(
      selectedShoot,
      getShootEmployees(selectedShoot.id)
    )
    shareShootOnWhatsApp(message)
  }

  async function deleteVacation() {
    if (!isAdmin) return alert("Solo admin puede borrar.")
    if (!selectedVacation) return
    if (!confirm("¿Seguro que quieres borrar estas vacaciones?")) return

    const { error } = await supabase
      .from("vacations")
      .delete()
      .eq("id", selectedVacation.id)

    if (error) return alert(error.message)

    setVacationDetailsOpen(false)
    setSelectedVacation(null)
    await loadAll()
  }

  async function updateEventDate(info: any) {
    const eventId = String(info.event.id)

    if (
      eventId.startsWith(VACATION_EVENT_PREFIX) ||
      eventId.startsWith(BIRTHDAY_EVENT_PREFIX) ||
      eventId.startsWith(ANNIVERSARY_EVENT_PREFIX)
    ) {
      info.revert()
      return
    }

    if (!canEdit) {
      info.revert()
      return
    }

    let payload: {
      start_time: string
      end_time: string
      all_day: boolean
    }

    if (info.event.allDay) {
      const startDate =
        info.event.startStr || toDateInputValue(info.event.start as Date)
      const endExclusive =
        info.event.endStr ||
        toDateInputValue(info.event.end as Date) ||
        addDaysToDateString(startDate, 1)
      let endDate = addDaysToDateString(endExclusive, -1)

      if (endDate < startDate) {
        endDate = startDate
      }

      payload = {
        start_time: `${startDate}T00:00:00`,
        end_time: `${addDaysToDateString(endDate, 1)}T00:00:00`,
        all_day: true,
      }
    } else {
      const start = info.event.start as Date
      const end = (info.event.end as Date) || start

      payload = {
        start_time: formatLocalDateTime(start),
        end_time: formatLocalDateTime(end),
        all_day: false,
      }
    }

    const { error } = await supabase
      .from("shoots")
      .update(payload)
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

  const isVacationForm =
    canManageVacations && entryMode !== "junta" && (entryMode === "vacation" || !!selectedVacation)

  const technicalResources = resources.filter((r) => r.type === "technical")

  const filterSubfolderOptions = useMemo(() => {
    if (!filterClient) return allSubfolders
    return allSubfolders.filter((subfolder) => subfolder.client_id === filterClient)
  }, [allSubfolders, filterClient])

  const filterProjectOptions = useMemo(() => {
    if (filterSubfolder) {
      return allProjects.filter(
        (project) => project.subfolder_id === filterSubfolder
      )
    }

    if (filterClient) {
      return allProjects.filter((project) => project.client_id === filterClient)
    }

    return allProjects
  }, [allProjects, filterClient, filterSubfolder])

  const formSubfolderOptions = useMemo(() => {
    if (!clientId) return []
    return allSubfolders.filter((subfolder) => subfolder.client_id === clientId)
  }, [allSubfolders, clientId])

  const formProjectOptions = useMemo(() => {
    if (!subfolderId) return []
    return allProjects.filter((project) => project.subfolder_id === subfolderId)
  }, [allProjects, subfolderId])

  useEffect(() => {
    if (!filterSubfolder) return

    const subfolder = allSubfolders.find((item) => item.id === filterSubfolder)
    if (!subfolder) {
      setFilterSubfolder("")
      return
    }

    if (filterClient && subfolder.client_id !== filterClient) {
      setFilterSubfolder("")
    }
  }, [filterClient, filterSubfolder, allSubfolders])

  useEffect(() => {
    if (!filterProject) return

    const project = allProjects.find((item) => item.id === filterProject)
    if (!project) {
      setFilterProject("")
      return
    }

    if (filterSubfolder && project.subfolder_id !== filterSubfolder) {
      setFilterProject("")
      return
    }

    if (filterClient && project.client_id !== filterClient) {
      setFilterProject("")
    }
  }, [filterClient, filterSubfolder, filterProject, allProjects])

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
          {user && <PushNotificationManager userId={user.id} />}

          <header style={pageHeaderStyle}>
            <div>
              <h1 style={pageTitleStyle}>Calendario</h1>
              <p style={pageSubtitleStyle}>
                {events.length} visibles · {allShoots.length} total · {resources.length}{" "}
                recursos
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Input oculto para importar .ics */}
              <input
                ref={icsInputRef}
                type="file"
                accept=".ics,text/calendar"
                style={{ display: "none" }}
                onChange={handleICSImport}
              />
              {/* Botón importar invite */}
              {canJunta && (
                <button
                  onClick={() => icsInputRef.current?.click()}
                  title="Importar invite de cliente (.ics)"
                  style={importIcsBtnStyle}
                >
                  📅 Importar invite
                </button>
              )}
              {/* Indicador de sincronización en vivo */}
              <div
                title={liveConnected ? "Sincronización en vivo activa" : "Conectando..."}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "4px 9px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.3,
                  background: liveConnected ? "rgba(52,211,153,0.10)" : "rgba(148,163,184,0.08)",
                  border: `1px solid ${liveConnected ? "rgba(52,211,153,0.25)" : "rgba(148,163,184,0.15)"}`,
                  color: liveConnected ? "#34d399" : "#64748b",
                  transition: "all 0.4s ease",
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: liveConnected ? "#34d399" : "#475569",
                  boxShadow: liveConnected ? "0 0 6px #34d399" : "none",
                  animation: liveConnected ? "pulse-live 2s infinite" : "none",
                  flexShrink: 0,
                }} />
                {liveConnected ? "EN VIVO" : "Conectando"}
              </div>
              <span style={roleBadgeStyle(profile?.role)}>{profile?.role || "..."}</span>
            </div>
          </header>

          <section
            style={{
              ...filtersToolbarStyle,
              gridTemplateColumns: isMobile
                ? "1fr 1fr"
                : "repeat(5, minmax(0, 1fr)) auto",
            }}
          >
            <select
              aria-label="Cliente"
              value={filterClient}
              onChange={(e) => {
                setFilterClient(e.target.value)
              }}
              style={compactFilterSelectStyle}
            >
              <option value="">Cliente</option>
              {allClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Subcarpeta"
              value={filterSubfolder}
              onChange={(e) => setFilterSubfolder(e.target.value)}
              style={compactFilterSelectStyle}
            >
              <option value="">Subcarpeta</option>
              {filterSubfolderOptions.map((subfolder) => (
                <option key={subfolder.id} value={subfolder.id}>
                  {subfolder.name}
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
              {filterProjectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
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
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employeeSelectLabel(employee)}
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
                  ? "Clic en el número del día para verlo; arrastra o haz clic en la celda para crear"
                  : "Clic en el número del día para verlo en detalle"}
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
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{
                  left: "prev,next today",
                  center: "title",
                  right: "dayGridMonth,timeGridWeek,timeGridDay",
                }}
                height="auto"
                views={{
                  dayGridMonth: {
                    dayMaxEvents: false,
                    fixedWeekCount: false,
                  },
                }}
                events={events}
                selectable={canJunta}
                selectMirror={canJunta}
                unselectAuto
                editable={canEdit}
                eventResizableFromStart={canEdit}
                select={handleCalendarSelect}
                eventClick={handleEventClick}
                eventDrop={updateEventDate}
                eventResize={updateEventDate}
                eventDisplay="block"
              />
            </div>
          </section>
        </div>

        {modalOpen && (
          <div style={peekOverlayStyle} className="modal-overlay">
            <DraggableModalPanel
              enabled={!isMobile}
              resetKey={modalOpen ? "form-modal" : "form-modal-closed"}
              className={
                isMobile
                  ? "modal-panel modal-panel-mobile"
                  : "modal-panel modal-panel-draggable"
              }
              style={{
                ...formModalStyle,
                width: isMobile ? "100%" : 680,
                height: isMobile ? "100%" : "auto",
                maxHeight: isMobile ? "100%" : "88vh",
                borderRadius: isMobile ? 0 : 16,
              }}
            >
              <div
                data-drag-handle
                style={{
                  ...formModalHeaderStyle,
                  ...(!isMobile ? draggableModalHeaderStyle : {}),
                }}
              >
                <div>
                  <h2 style={formModalTitleStyle}>
                    {selectedJunta
                      ? "Editar junta"
                      : selectedVacation
                        ? "Editar vacaciones"
                        : selectedShoot
                          ? "Editar llamado"
                          : entryMode === "junta"
                            ? "Nueva junta"
                            : isVacationForm
                              ? "Nuevas vacaciones"
                              : "Nuevo llamado"}
                  </h2>
                  {!isVacationForm && selectedDate && (
                    <p style={formModalMetaStyle}>
                      {formatVacationRange(
                        selectedDate,
                        getEffectiveShootEndDate()
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
                {!selectedShoot && !selectedVacation && !selectedJunta && (canManageVacations || isProductorRole) && (
                  <div style={{
                    ...entryModeSwitchWrapStyle,
                    gridTemplateColumns: canManageVacations ? "1fr 1fr 1fr" : "1fr",
                  }}>
                    {canManageVacations && (
                      <button
                        type="button"
                        onClick={() => {
                          if (vacationStartDate) {
                            setSelectedDate(vacationStartDate)
                            setSelectedEndDate(vacationEndDate || vacationStartDate)
                          }
                          setEntryMode("shoot")
                        }}
                        style={{
                          ...entryModeSwitchButtonStyle,
                          ...(entryMode === "shoot" ? entryModeSwitchActiveStyle : {}),
                        }}
                      >
                        Llamado
                      </button>
                    )}
                    {canManageVacations && (
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedDate) {
                            setVacationStartDate(selectedDate)
                            setVacationEndDate(getEffectiveShootEndDate())
                          }
                          setEntryMode("vacation")
                        }}
                        style={{
                          ...entryModeSwitchButtonStyle,
                          ...(entryMode === "vacation" ? entryModeSwitchActiveStyle : {}),
                        }}
                      >
                        Vacaciones
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedDate) setJuntaDate(selectedDate)
                        setEntryMode("junta")
                      }}
                      style={{
                        ...entryModeSwitchButtonStyle,
                        ...(entryMode === "junta" ? entryModeSwitchActiveStyle : {}),
                      }}
                    >
                      Junta
                    </button>
                  </div>
                )}

                {entryMode === "junta" && !selectedShoot && !selectedVacation ? (
                  <div style={formModalColumnStyle}>
                    <p style={formModalSectionLabelStyle}>Nueva Junta</p>

                    {/* Tipo */}
                    <div>
                      <label style={formModalLabelStyle}>Tipo de Junta</label>
                      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                        {(["Brief", "PPM", "Junta Cliente"] as const).map((tipo) => (
                          <button
                            key={tipo}
                            type="button"
                            onClick={() => setJuntaTipo(tipo)}
                            style={{
                              padding: "6px 14px",
                              borderRadius: 8,
                              border: juntaTipo === tipo ? "1px solid #0891b2" : "1px solid rgba(148,163,184,0.2)",
                              background: juntaTipo === tipo ? "rgba(8,145,178,0.15)" : "transparent",
                              color: juntaTipo === tipo ? "#67e8f9" : "#94a3b8",
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            {tipo}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Título */}
                    <div>
                      <label style={formModalLabelStyle}>Título</label>
                      <input
                        type="text"
                        value={juntaTitulo}
                        onChange={(e) => setJuntaTitulo(e.target.value)}
                        style={formModalInputStyle}
                        placeholder="Ej. Kick-off campaña verano"
                      />
                    </div>

                    {/* Fecha y horas */}
                    <div style={formModalRowStyle}>
                      <DatePickerField
                        label="Fecha"
                        value={juntaDate}
                        labelStyle={formModalLabelStyle}
                        onChange={setJuntaDate}
                      />
                    </div>
                    <div style={formModalRowStyle}>
                      <div style={{ flex: 1 }}>
                        <label style={formModalLabelStyle}>
                          Hora inicio
                          <span style={{ marginLeft: 6, fontSize: 10, color: "#64748b", fontWeight: 400 }}>
                            (hora del invite — ajusta si es necesario)
                          </span>
                        </label>
                        <input
                          type="time"
                          value={juntaStartTime}
                          onChange={(e) => setJuntaStartTime(e.target.value)}
                          style={{ ...formModalInputStyle, colorScheme: "dark" }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={formModalLabelStyle}>Hora fin (opcional)</label>
                        <input
                          type="time"
                          value={juntaEndTime}
                          onChange={(e) => setJuntaEndTime(e.target.value)}
                          style={{ ...formModalInputStyle, colorScheme: "dark" }}
                        />
                      </div>
                    </div>

                    {/* Liga de reunión */}
                    <div>
                      <label style={formModalLabelStyle}>
                        Liga de reunión
                        {juntaLink && (
                          <span style={{ marginLeft: 8, fontSize: 10, color: "#34d399", fontWeight: 700 }}>
                            ✓ Detectada automáticamente
                          </span>
                        )}
                      </label>
                      <input
                        type="url"
                        value={juntaLink}
                        onChange={(e) => setJuntaLink(e.target.value)}
                        style={formModalInputStyle}
                        placeholder="https://meet.google.com/... o https://zoom.us/j/..."
                      />
                    </div>

                    {/* Notas */}
                    <div>
                      <label style={formModalLabelStyle}>Notas (opcional)</label>
                      <textarea
                        value={juntaNotas}
                        onChange={(e) => setJuntaNotas(e.target.value)}
                        rows={3}
                        style={{ ...formModalInputStyle, resize: "vertical", minHeight: 72 }}
                        placeholder="Tema, agenda, etc."
                      />
                    </div>

                    {/* Personal asistente */}
                    <div>
                      <label style={formModalLabelStyle}>Personal asistente</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                        {employees.map((emp: any) => {
                          const selected = juntaAttendees.includes(emp.id)
                          return (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => setJuntaAttendees(prev =>
                                selected ? prev.filter(id => id !== emp.id) : [...prev, emp.id]
                              )}
                              style={{
                                padding: "4px 12px",
                                borderRadius: 999,
                                border: selected ? "1px solid #0891b2" : "1px solid rgba(148,163,184,0.2)",
                                background: selected ? "rgba(8,145,178,0.15)" : "transparent",
                                color: selected ? "#67e8f9" : "#94a3b8",
                                fontSize: 12,
                                cursor: "pointer",
                              }}
                            >
                              {emp.nombre} {emp.apellido_paterno}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Invitar personas externas */}
                    <div>
                      <label style={formModalLabelStyle}>
                        Invitar personas externas
                        <span style={{ marginLeft: 6, fontSize: 10, color: "#64748b", fontWeight: 400 }}>
                          (recibirán email con .ics)
                        </span>
                      </label>
                      {/* Chips de emails externos */}
                      {juntaExternalEmails.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8, marginTop: 6 }}>
                          {juntaExternalEmails.map((email) => (
                            <span key={email} style={{
                              display: "inline-flex", alignItems: "center", gap: 5,
                              padding: "3px 10px", borderRadius: 999,
                              background: "rgba(14,165,233,0.12)",
                              border: "1px solid rgba(56,189,248,0.25)",
                              color: "#7dd3fc", fontSize: 12,
                            }}>
                              {email}
                              <button
                                type="button"
                                onClick={() => setJuntaExternalEmails(prev => prev.filter(e => e !== email))}
                                style={{ background: "none", border: "none", color: "#7dd3fc", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1 }}
                              >×</button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="email"
                          value={juntaEmailInput}
                          onChange={(e) => setJuntaEmailInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === ",") {
                              e.preventDefault()
                              const email = juntaEmailInput.trim().replace(/,$/, "")
                              if (email.includes("@") && !juntaExternalEmails.includes(email)) {
                                setJuntaExternalEmails(prev => [...prev, email])
                              }
                              setJuntaEmailInput("")
                            }
                          }}
                          style={formModalInputStyle}
                          placeholder="nombre@empresa.com — Enter para agregar"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const email = juntaEmailInput.trim()
                            if (email.includes("@") && !juntaExternalEmails.includes(email)) {
                              setJuntaExternalEmails(prev => [...prev, email])
                            }
                            setJuntaEmailInput("")
                          }}
                          style={{
                            padding: "0 14px", borderRadius: 8, border: "1px solid rgba(56,189,248,0.25)",
                            background: "rgba(14,165,233,0.10)", color: "#7dd3fc",
                            fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                          }}
                        >
                          + Agregar
                        </button>
                      </div>
                    </div>
                  </div>
                ) : isVacationForm ? (
                  <div style={formModalColumnStyle}>
                    <p style={formModalSectionLabelStyle}>Vacaciones</p>

                    <div style={formModalRowStyle}>
                      <DatePickerField
                        label="Desde"
                        value={vacationStartDate}
                        labelStyle={formModalLabelStyle}
                        onChange={(nextValue) => {
                          setVacationStartDate(nextValue)
                          if (vacationEndDate && nextValue > vacationEndDate) {
                            setVacationEndDate(nextValue)
                          }
                        }}
                      />
                      <DatePickerField
                        label="Hasta"
                        value={vacationEndDate}
                        minDate={vacationStartDate || undefined}
                        labelStyle={formModalLabelStyle}
                        onChange={setVacationEndDate}
                      />
                    </div>

                    <div style={formModalFieldStyle}>
                      <label style={formModalLabelStyle}>Empleados</label>
                      <Select
                        isMulti
                        styles={compactSelectThemeStyles}
                        placeholder="Seleccionar..."
                        options={employees.map((employee) => ({
                          value: employee.id,
                          label: `${employeeSelectLabel(employee)}${
                            isEmployeeUnavailableForVacation(employee.id)
                              ? " — NO DISPONIBLE"
                              : ""
                          }`,
                          isDisabled: isEmployeeUnavailableForVacation(employee.id),
                        }))}
                        value={employees
                          .filter((employee) => selectedEmployees.includes(employee.id))
                          .map((employee) => ({
                            value: employee.id,
                            label: employeeSelectLabel(employee),
                          }))}
                        onChange={(selected) => {
                          setSelectedEmployees(selected.map((item) => item.value))
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <>
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
                        <select
                          value={clientId}
                          onChange={(event) => {
                            const val = event.target.value
                            if (val === "__NEW_CLIENT__") {
                              setNewClientName("")
                              setShowAddClient(true)
                            } else {
                              setClientId(val)
                              setSubfolderId("")
                              setProjectId("")
                            }
                          }}
                          style={formModalSelectStyle}
                        >
                          <option value="">Selecciona cliente</option>
                          {allClients.map((client) => (
                            <option key={client.id} value={client.id}>
                              {client.name}
                            </option>
                          ))}
                          <option value="__NEW_CLIENT__">＋ Crear cliente nuevo...</option>
                        </select>
                      </div>
                      <div style={formModalFieldStyle}>
                        <label style={formModalLabelStyle}>Subcarpeta</label>
                        <select
                          value={subfolderId}
                          onChange={(event) => {
                            setSubfolderId(event.target.value)
                            setProjectId("")
                          }}
                          disabled={!clientId}
                          style={{
                            ...formModalSelectStyle,
                            opacity: clientId ? 1 : 0.65,
                          }}
                        >
                          <option value="">
                            {clientId
                              ? "Selecciona subcarpeta"
                              : "Primero elige cliente"}
                          </option>
                          {formSubfolderOptions.map((subfolder) => (
                            <option key={subfolder.id} value={subfolder.id}>
                              {subfolder.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div style={formModalFieldStyle}>
                      <label style={formModalLabelStyle}>Proyecto</label>
                      <select
                        value={projectId}
                        onChange={(event) => setProjectId(event.target.value)}
                        disabled={!subfolderId}
                        style={{
                          ...formModalSelectStyle,
                          opacity: subfolderId ? 1 : 0.65,
                        }}
                      >
                        <option value="">
                          {subfolderId
                            ? "Selecciona proyecto"
                            : "Primero elige subcarpeta"}
                        </option>
                        {formProjectOptions.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {allClients.length === 0 && isAdmin && (
                      <p style={formModalHintStyle}>
                        Crea carpetas de cliente en{" "}
                        <a href="/proyectos" style={formModalLinkStyle}>
                          Proyectos
                        </a>
                        .
                      </p>
                    )}

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
                      <DatePickerField
                        label="Desde"
                        value={selectedDate}
                        labelStyle={formModalLabelStyle}
                        onChange={(nextValue) => {
                          setSelectedDate(nextValue)
                          setVacationStartDate(nextValue)
                          if (selectedEndDate && nextValue > selectedEndDate) {
                            setSelectedEndDate(nextValue)
                            setVacationEndDate(nextValue)
                          }
                        }}
                      />
                      <DatePickerField
                        label="Hasta"
                        value={getEffectiveShootEndDate()}
                        minDate={selectedDate || undefined}
                        labelStyle={formModalLabelStyle}
                        onChange={(nextValue) => {
                          setSelectedEndDate(nextValue)
                          setVacationEndDate(nextValue)
                          if (selectedDate && nextValue > selectedDate) {
                            setAllDay(true)
                          }
                        }}
                      />
                    </div>

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

                    <div style={formModalFieldStyle}>
                      <label style={formModalLabelStyle}>Responsable</label>
                      <select
                        value={shootResponsable}
                        onChange={(e) => setShootResponsable(e.target.value)}
                        style={formModalSelectStyle}
                      >
                        <option value="">— Sin asignar —</option>
                        {RESPONSABLES_PRODUCCION.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>

                    <p style={{ ...formModalSectionLabelStyle, marginTop: 14 }}>
                      Recursos
                    </p>

                    <div style={formModalFieldStyle}>
                      <label style={formModalLabelStyle}>Personal Retro</label>
                      <Select
                        isMulti
                        styles={compactSelectThemeStyles}
                        placeholder="Seleccionar..."
                        options={employees.map((employee) => ({
                          value: employee.id,
                          label: `${employeeSelectLabel(employee)}${
                            isEmployeeBusy(employee.id) ? " — OCUPADO" : ""
                          }`,
                          isDisabled: isEmployeeBusy(employee.id),
                        }))}
                        value={employees
                          .filter((employee) => selectedEmployees.includes(employee.id))
                          .map((employee) => ({
                            value: employee.id,
                            label: employeeSelectLabel(employee),
                          }))}
                        onChange={(selected) => {
                          setSelectedEmployees(selected.map((item) => item.value))
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
                          setSelectedResources(selected.map((item) => item.value))
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
                  </>
                )}
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
                <button onClick={saveEntry} style={formModalPrimaryButtonStyle}>
                  {entryMode === "junta"
                    ? selectedJunta
                      ? "Guardar junta"
                      : "Crear junta"
                    : isVacationForm
                      ? selectedVacation
                        ? "Guardar"
                        : "Crear vacaciones"
                      : selectedShoot
                        ? "Guardar"
                        : "Crear llamado"}
                </button>
              </div>
            </DraggableModalPanel>
          </div>
        )}

        {vacationDetailsOpen && selectedVacation && (
          <div style={overlayStyle} className="modal-overlay">
            <div
              className={isMobile ? "modal-panel modal-panel-mobile" : "modal-panel"}
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
                    🏖️ {formatVacationTitle(selectedVacation, vacationEmployees)}
                  </h2>
                  <p style={formModalMetaStyle}>
                    {formatVacationRange(selectedVacation.start_date, selectedVacation.end_date)}
                  </p>
                </div>

                <button
                  onClick={() => setVacationDetailsOpen(false)}
                  style={formModalCloseStyle}
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>

              <div style={formModalBodyStyle}>
                <div style={formModalColumnStyle}>
                  <div style={formModalRowStyle}>
                    <FormModalPreviewField
                      label="Desde"
                      value={formatVacationDate(selectedVacation.start_date)}
                    />
                    <FormModalPreviewField
                      label="Hasta"
                      value={formatVacationDate(selectedVacation.end_date)}
                    />
                  </div>

                  <div style={formModalFieldStyle}>
                    <span style={formModalLabelStyle}>
                      Empleados ({getVacationEmployees(selectedVacation.id).length})
                    </span>
                    {getVacationEmployees(selectedVacation.id).length > 0 ? (
                      <div style={formModalPillGridStyle}>
                        {getVacationEmployees(selectedVacation.id).map((employee) => (
                          <span key={employee.id} style={formModalVacationPillStyle}>
                            {employeeDisplayName(employee)}
                            <span style={formModalPillMetaStyle}>{employee.puesto}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div style={formModalValueStyle}>—</div>
                    )}
                  </div>
                </div>
              </div>

              <div style={formModalFooterStyle}>
                <button
                  onClick={() => setVacationDetailsOpen(false)}
                  style={formModalSecondaryButtonStyle}
                >
                  Cerrar
                </button>

                {isAdmin && (
                  <button onClick={openEditVacation} style={formModalPrimaryButtonStyle}>
                    Editar
                  </button>
                )}

                {isAdmin && (
                  <button onClick={deleteVacation} style={formModalDangerButtonStyle}>
                    Borrar
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {juntaDetailsOpen && selectedJunta && (
          <div style={overlayStyle} className="modal-overlay">
            <div
              className={isMobile ? "modal-panel modal-panel-mobile" : "modal-panel"}
              style={{
                ...formModalStyle,
                width: isMobile ? "100%" : 520,
                height: isMobile ? "100%" : "auto",
                maxHeight: isMobile ? "100%" : "88vh",
                borderRadius: isMobile ? 0 : 16,
              }}
            >
              <div style={formModalHeaderStyle}>
                <div>
                  <h2 style={formModalTitleStyle}>
                    {selectedJunta.tipo === "Brief" ? "📋" : selectedJunta.tipo === "PPM" ? "🎬" : "🤝"}{" "}
                    {selectedJunta.titulo || selectedJunta.tipo}
                  </h2>
                  <p style={formModalMetaStyle}>
                    {formatVacationDate(selectedJunta.fecha)}
                    {selectedJunta.hora_inicio ? ` · ${selectedJunta.hora_inicio}` : ""}
                    {selectedJunta.hora_fin ? ` – ${selectedJunta.hora_fin}` : ""}
                  </p>
                </div>

                <button
                  onClick={() => { setJuntaDetailsOpen(false); setSelectedJunta(null) }}
                  style={formModalCloseStyle}
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>

              <div style={formModalBodyStyle}>
                <div style={formModalColumnStyle}>
                  {selectedJunta.titulo && (
                    <FormModalPreviewField label="Título" value={selectedJunta.titulo} />
                  )}
                  <div style={formModalRowStyle}>
                    <FormModalPreviewField label="Tipo" value={selectedJunta.tipo} />
                    <FormModalPreviewField label="Fecha" value={formatVacationDate(selectedJunta.fecha)} />
                  </div>

                  <div style={formModalRowStyle}>
                    <FormModalPreviewField label="Hora inicio" value={selectedJunta.hora_inicio || "—"} />
                    <FormModalPreviewField label="Hora fin" value={selectedJunta.hora_fin || "—"} />
                  </div>

                  {selectedJunta.link && (
                    <div>
                      <p style={formModalLabelStyle}>Liga de reunión</p>
                      <a
                        href={selectedJunta.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "7px 14px",
                          borderRadius: 8,
                          background: "rgba(8,145,178,0.12)",
                          border: "1px solid rgba(8,145,178,0.30)",
                          color: "#67e8f9",
                          fontSize: 13,
                          fontWeight: 600,
                          textDecoration: "none",
                          marginTop: 4,
                          wordBreak: "break-all",
                        }}
                      >
                        🔗 Unirse a la reunión
                      </a>
                    </div>
                  )}

                  {selectedJunta.notas && (
                    <FormModalPreviewField label="Notas" value={selectedJunta.notas} multiline />
                  )}

                  <div>
                    <span style={formModalLabelStyle}>
                      Asistentes ({(juntaAttendeeMap[selectedJunta.id] || []).length})
                    </span>
                    {(juntaAttendeeMap[selectedJunta.id] || []).length > 0 ? (
                      <div style={{ ...formModalPillGridStyle, marginTop: 6 }}>
                        {(juntaAttendeeMap[selectedJunta.id] || []).map((empId) => {
                          const emp = employees.find((e: any) => e.id === empId)
                          if (!emp) return null
                          return (
                            <span
                              key={empId}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "4px 8px",
                                borderRadius: 6,
                                background: "rgba(8,145,178,0.14)",
                                border: "1px solid rgba(8,145,178,0.28)",
                                color: "#f8fafc",
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              {emp.nombre} {emp.apellido_paterno}
                              <span style={{ color: "#67e8f9", fontWeight: 500 }}>{emp.puesto}</span>
                            </span>
                          )
                        })}
                      </div>
                    ) : (
                      <div style={formModalValueStyle}>—</div>
                    )}
                  </div>
                </div>
              </div>

              <div style={formModalFooterStyle}>
                <button
                  onClick={() => { setJuntaDetailsOpen(false); setSelectedJunta(null) }}
                  style={formModalSecondaryButtonStyle}
                >
                  Cerrar
                </button>

                {canEdit && (
                  <button
                    onClick={() => {
                      // Pre-fill form for editing
                      setJuntaTipo(selectedJunta.tipo as "Brief" | "PPM" | "Junta Cliente")
                      setJuntaTitulo(selectedJunta.titulo || "")
                      setJuntaDate(selectedJunta.fecha)
                      setJuntaStartTime(selectedJunta.hora_inicio || "09:00")
                      setJuntaEndTime(selectedJunta.hora_fin || "")
                      setJuntaNotas(selectedJunta.notas || "")
                      setJuntaAttendees(juntaAttendeeMap[selectedJunta.id] || [])
                      setEntryMode("junta")
                      setJuntaDetailsOpen(false)
                      setModalOpen(true)
                    }}
                    style={formModalPrimaryButtonStyle}
                  >
                    Editar
                  </button>
                )}

                {canEdit && (
                  <button
                    onClick={() => deleteJunta(selectedJunta.id)}
                    style={formModalDangerButtonStyle}
                  >
                    Borrar
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {detailsOpen && selectedShoot && (
          <div style={peekOverlayStyle} className="modal-overlay">
            <DraggableModalPanel
              enabled={!isMobile}
              resetKey={selectedShoot.id}
              className={
                isMobile
                  ? "modal-panel modal-panel-mobile"
                  : "modal-panel modal-panel-draggable"
              }
              style={{
                ...formModalStyle,
                width: isMobile ? "100%" : 680,
                height: isMobile ? "100%" : "auto",
                maxHeight: isMobile ? "100%" : "88vh",
                borderRadius: isMobile ? 0 : 16,
              }}
            >
              <div
                data-drag-handle
                style={{
                  ...formModalHeaderStyle,
                  ...(!isMobile ? draggableModalHeaderStyle : {}),
                }}
              >
                <div>
                  <h2 style={formModalTitleStyle}>
                    {statusEmoji(selectedShoot.status)} {selectedShoot.title}
                  </h2>
                  <p style={formModalMetaStyle}>
                    {selectedShoot.client || "Sin cliente"} ·{" "}
                    {allProjects.find((item) => item.id === selectedShoot.project_id)
                      ? allSubfolders.find(
                          (subfolder) =>
                            subfolder.id ===
                            allProjects.find(
                              (project) => project.id === selectedShoot.project_id
                            )?.subfolder_id
                        )?.name || "Sin subcarpeta"
                      : "Sin subcarpeta"}{" "}
                    · {selectedShoot.project || "Sin proyecto"}
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
                        label="Responsable"
                        value={selectedShoot.responsable || undefined}
                      />
                    </div>

                    <FormModalPreviewField
                      label="Fechas"
                      value={formatShootSchedule(selectedShoot)}
                    />

                    <div style={formModalRowStyle}>
                      <FormModalPreviewField
                        label="Director"
                        value={selectedShoot.director}
                      />
                      <FormModalPreviewField label="DOP" value={selectedShoot.dop} />
                    </div>

                    <div style={formModalFieldStyle}>
                      <span style={formModalLabelStyle}>
                        Personal Retro ({getShootEmployees(selectedShoot.id).length})
                      </span>
                      {getShootEmployees(selectedShoot.id).length > 0 ? (
                        <div style={formModalPillGridStyle}>
                          {getShootEmployees(selectedShoot.id).map((employee) => (
                            <span key={employee.id} style={formModalPillStyle}>
                              {employeeDisplayName(employee)}
                              <span style={formModalPillMetaStyle}>{employee.puesto}</span>
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

                <button
                  onClick={shareSelectedShoot}
                  style={formModalWhatsAppButtonStyle}
                >
                  Compartir por WhatsApp
                </button>

                {canEdit && (
                  <button
                    onClick={() => {
                      setDupeDate(selectedShoot.start_time.slice(0, 10))
                      setShowDupePicker(true)
                    }}
                    style={formModalDuplicateButtonStyle}
                  >
                    Duplicar
                  </button>
                )}

                {canEdit && (
                  <button onClick={openEditShoot} style={formModalPrimaryButtonStyle}>
                    Editar
                  </button>
                )}

                {canEdit && (
                  <button onClick={deleteShoot} style={formModalDangerButtonStyle}>
                    Borrar
                  </button>
                )}
              </div>
            </DraggableModalPanel>
          </div>
        )}
      {/* Mini-modal: selecciona fecha para duplicar */}
      {showDupePicker && selectedShoot && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000001,
            background: "rgba(2,6,23,0.72)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => { setShowDupePicker(false); setDupeDate("") }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "linear-gradient(160deg,#0d1b2e,#0f172a)",
              border: "1px solid rgba(148,163,184,0.15)",
              borderRadius: 16,
              boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              width: 320,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{
              padding: "16px 18px 12px",
              borderBottom: "1px solid rgba(148,163,184,0.10)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <p style={{ color: "#64748b", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 3 }}>
                  Duplicar llamado
                </p>
                <p style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>
                  {selectedShoot.title}
                </p>
              </div>
              <button
                onClick={() => { setShowDupePicker(false); setDupeDate("") }}
                style={{ background: "none", border: "none", color: "#64748b", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "0 2px" }}
              >×</button>
            </div>

            {/* Body */}
            <div style={{ padding: "20px 18px 16px" }}>
              <p style={{ color: "#94a3b8", fontSize: 12, marginBottom: 10 }}>
                ¿En qué fecha quieres colocar el duplicado?
              </p>
              <input
                type="date"
                value={dupeDate}
                onChange={(e) => setDupeDate(e.target.value)}
                autoFocus
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: "rgba(15,23,42,0.6)",
                  border: "1px solid rgba(148,163,184,0.20)",
                  borderRadius: 10,
                  color: "#e2e8f0",
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: "pointer",
                  boxSizing: "border-box",
                  colorScheme: "dark",
                }}
                onKeyDown={(e) => { if (e.key === "Enter" && dupeDate) duplicateShoot() }}
              />
              <p style={{ color: "#475569", fontSize: 11, marginTop: 8 }}>
                Se copiará el llamado completo: equipo, recursos y todas las notas.
              </p>
            </div>

            {/* Footer */}
            <div style={{
              padding: "12px 18px",
              borderTop: "1px solid rgba(148,163,184,0.10)",
              display: "flex", gap: 8, justifyContent: "flex-end",
            }}>
              <button
                onClick={() => { setShowDupePicker(false); setDupeDate("") }}
                style={formModalSecondaryButtonStyle}
              >
                Cancelar
              </button>
              <button
                onClick={duplicateShoot}
                disabled={!dupeDate || duplicating}
                style={{
                  ...formModalPrimaryButtonStyle,
                  opacity: !dupeDate || duplicating ? 0.5 : 1,
                  cursor: !dupeDate || duplicating ? "not-allowed" : "pointer",
                }}
              >
                {duplicating ? "Duplicando..." : "✓ Duplicar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mini-modal: crear cliente nuevo */}
      {showAddClient && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000002,
            background: "rgba(2,6,23,0.80)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setShowAddClient(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "linear-gradient(160deg,#0d1b2e,#0f172a)",
              border: "1px solid rgba(148,163,184,0.15)",
              borderRadius: 16,
              boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              width: 340,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div style={{
              padding: "16px 18px 12px",
              borderBottom: "1px solid rgba(148,163,184,0.10)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
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
                style={{ background: "none", border: "none", color: "#64748b", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "0 2px" }}
              >×</button>
            </div>

            {/* Body */}
            <div style={{ padding: "20px 18px 16px" }}>
              <p style={{ color: "#64748b", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                Nombre del cliente
              </p>
              <input
                type="text"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newClientName.trim()) handleSaveNewClient() }}
                placeholder="Ej. Coca-Cola, Nike, Volkswagen..."
                autoFocus
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: "rgba(15,23,42,0.6)",
                  border: "1px solid rgba(148,163,184,0.20)",
                  borderRadius: 10,
                  color: "#e2e8f0",
                  fontSize: 14,
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </div>

            {/* Footer */}
            <div style={{
              padding: "12px 18px",
              borderTop: "1px solid rgba(148,163,184,0.10)",
              display: "flex", gap: 8, justifyContent: "flex-end",
            }}>
              <button
                onClick={() => setShowAddClient(false)}
                style={formModalSecondaryButtonStyle}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveNewClient}
                disabled={!newClientName.trim() || savingClient}
                style={{
                  ...formModalPrimaryButtonStyle,
                  opacity: !newClientName.trim() || savingClient ? 0.5 : 1,
                  cursor: !newClientName.trim() || savingClient ? "not-allowed" : "pointer",
                }}
              >
                {savingClient ? "Guardando..." : "✓ Crear cliente"}
              </button>
            </div>
          </div>
        </div>
      )}

      </main>
    </div>
  )
}


function toDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function datePartFromTimestamp(iso: string) {
  return toDateInputValue(new Date(iso))
}

function storedDatePart(iso: string) {
  return iso.slice(0, 10)
}

function storedTimePart(iso: string) {
  const match = iso.match(/T(\d{2}:\d{2}:\d{2})/)
  return match?.[1] ?? "00:00:00"
}

function timePartFromDate(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

function timePartFromTimestamp(iso: string) {
  return timePartFromDate(new Date(iso))
}

function formatLocalDateTime(date: Date) {
  return `${toDateInputValue(date)}T${timePartFromDate(date)}:00`
}

function isEndOfDayTimestamp(iso: string) {
  return storedTimePart(iso).startsWith("23:59")
}

function shootToDateRange(shoot: {
  start_time: string
  end_time: string
  all_day: boolean
}) {
  if (!shoot.all_day) {
    const startDate = datePartFromTimestamp(shoot.start_time)
    const endDate = datePartFromTimestamp(shoot.end_time)

    return {
      startDate,
      endDate: endDate < startDate ? startDate : endDate,
    }
  }

  const startDate = storedDatePart(shoot.start_time)
  let endDate = storedDatePart(shoot.end_time)

  // Fin exclusivo (medianoche del día siguiente), también si Supabase lo devuelve desplazado en UTC.
  if (endDate > startDate && !isEndOfDayTimestamp(shoot.end_time)) {
    endDate = addDaysToDateString(endDate, -1)
  }

  if (endDate < startDate) {
    endDate = startDate
  }

  return { startDate, endDate }
}

function shootToCalendarEventTimes(shoot: {
  start_time: string
  end_time: string
  all_day: boolean
}) {
  if (!shoot.all_day) {
    return { start: shoot.start_time, end: shoot.end_time }
  }

  const { startDate, endDate } = shootToDateRange(shoot)

  return {
    start: startDate,
    end: addDaysToDateString(endDate, 1),
  }
}

function formatShootSchedule(shoot: {
  start_time: string
  end_time: string
  all_day: boolean
}) {
  if (shoot.all_day) {
    const { startDate, endDate } = shootToDateRange(shoot)
    return formatVacationRange(startDate, endDate)
  }

  const startDate = datePartFromTimestamp(shoot.start_time)
  const endDate = datePartFromTimestamp(shoot.end_time)
  const startTime = timePartFromTimestamp(shoot.start_time)
  const endTime = timePartFromTimestamp(shoot.end_time)

  if (startDate === endDate) {
    return `${formatVacationDate(startDate)} · ${startTime} – ${endTime}`
  }

  return `${formatVacationDate(startDate)} ${startTime} – ${formatVacationDate(endDate)} ${endTime}`
}

function selectionToDateRange(info: {
  start: Date
  end: Date
  allDay: boolean
}) {
  const startDate = toDateInputValue(info.start)
  let endDate = startDate

  if (info.allDay) {
    const end = new Date(info.end)
    end.setDate(end.getDate() - 1)
    endDate = toDateInputValue(end)
  } else {
    endDate = toDateInputValue(info.end)
  }

  return { startDate, endDate }
}

function addDaysToDateString(dateStr: string, days: number) {
  const date = new Date(`${dateStr}T12:00:00`)
  date.setDate(date.getDate() + days)
  return toDateInputValue(date)
}

function datesOverlapInclusive(
  startA: string,
  endA: string,
  startB: string,
  endB: string
) {
  return startA <= endB && endA >= startB
}

function formatVacationTitle(vacation: any, assignments: any[]) {
  const people = assignments
    .filter((assignment) => assignment.vacation_id === vacation.id)
    .map((assignment) => assignment.employees)
    .filter(Boolean)
    .map((employee) => employeeDisplayName(employee))

  if (people.length === 0) return "Vacaciones"
  return people.join(", ")
}

function formatVacationDate(dateStr: string) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("es-CL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function formatVacationRange(startDate: string, endDate: string) {
  if (startDate === endDate) return formatVacationDate(startDate)
  return `${formatVacationDate(startDate)} – ${formatVacationDate(endDate)}`
}

function buildShootWhatsAppMessage(
  shoot: any,
  employees: any[]
) {
  const lines: string[] = [
    "🎬 LLAMADO",
    `*${shoot.title || "Sin título"}*`,
    `📅 ${formatShootSchedule(shoot)}`,
  ]

  const clientProject = [shoot.client, shoot.project].filter(Boolean).join(" · ")
  if (clientProject) lines.push(`🏢 ${clientProject}`)

  if (shoot.location?.trim()) {
    lines.push(`📍 ${shoot.location.trim()}`)
  }

  if (shoot.address?.trim() && shoot.address.trim() !== shoot.location?.trim()) {
    lines.push(`📌 ${shoot.address.trim()}`)
  }

  lines.push(`Estado: ${statusLabel(shoot.status)}`)

  if (shoot.contact?.trim()) {
    lines.push(`Contacto: ${shoot.contact.trim()}`)
  }

  if (shoot.director?.trim() || shoot.dop?.trim()) {
    const productionRoles = [
      shoot.director?.trim() ? `Director: ${shoot.director.trim()}` : "",
      shoot.dop?.trim() ? `DOP: ${shoot.dop.trim()}` : "",
    ].filter(Boolean)

    lines.push(productionRoles.join(" | "))
  }

  if (employees.length > 0) {
    lines.push("")
    lines.push("👥 CREW")
    for (const employee of employees) {
      lines.push(`• ${employeeDisplayName(employee)} — ${employee.puesto}`)
    }
  }

  if (shoot.public_notes?.trim()) {
    lines.push("")
    lines.push("📝 NOTAS")
    lines.push(shoot.public_notes.trim())
  }

  return lines.join("\n")
}

function shareShootOnWhatsApp(message: string) {
  const encoded = encodeURIComponent(message)
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  const url = isMobile
    ? `https://api.whatsapp.com/send?text=${encoded}`
    : `whatsapp://send?text=${encoded}`

  const link = document.createElement("a")
  link.href = url
  if (isMobile) {
    link.target = "_blank"
    link.rel = "noopener noreferrer"
  }
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
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
  minHeight: "100vh",
  height: "auto",
  overflow: "visible",
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
  display: "flex",
  flexDirection: "column",
  overflow: "visible",
}

const mainMobileStyle: React.CSSProperties = {
  overflow: "visible",
  minHeight: "auto",
}

const pageContainerStyle: React.CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  width: "100%",
  display: "flex",
  flexDirection: "column",
  overflow: "visible",
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
  display: "flex",
  flexDirection: "column",
  overflow: "visible",
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
  display: "flex",
  flexDirection: "column",
  overflow: "visible",
  minHeight: "auto",
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

const peekOverlayStyle: React.CSSProperties = {
  ...overlayStyle,
  background: "rgba(0,0,0,0.16)",
  pointerEvents: "none",
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

const formModalSelectStyle: React.CSSProperties = {
  ...formModalInputStyle,
  appearance: "none",
  WebkitAppearance: "none",
  backgroundImage:
    "linear-gradient(45deg, transparent 50%, #94a3b8 50%), linear-gradient(135deg, #94a3b8 50%, transparent 50%)",
  backgroundPosition: "calc(100% - 16px) calc(50% - 2px), calc(100% - 11px) calc(50% - 2px)",
  backgroundSize: "5px 5px, 5px 5px",
  backgroundRepeat: "no-repeat",
  paddingRight: 28,
}

const formModalHintStyle: React.CSSProperties = {
  margin: "0 0 4px",
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.45,
}

const formModalLinkStyle: React.CSSProperties = {
  color: "#a78bfa",
  textDecoration: "none",
  fontWeight: 600,
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

const formModalWhatsAppButtonStyle: React.CSSProperties = {
  padding: "8px 14px",
  background: "rgba(37, 211, 102, 0.14)",
  color: "#bbf7d0",
  border: "1px solid rgba(37, 211, 102, 0.28)",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
}

const formModalDuplicateButtonStyle: React.CSSProperties = {
  padding: "8px 14px",
  background: "rgba(56,189,248,0.10)",
  color: "#7dd3fc",
  border: "1px solid rgba(56,189,248,0.25)",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
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

const formModalVacationPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 8px",
  borderRadius: 6,
  background: "rgba(147,51,234,0.18)",
  border: "1px solid rgba(167,139,250,0.28)",
  color: "#f8fafc",
  fontSize: 12,
  fontWeight: 600,
}

const entryModeSwitchWrapStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  padding: 4,
  borderRadius: 10,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(148,163,184,0.12)",
  marginBottom: 14,
}

const entryModeSwitchButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid transparent",
  background: "transparent",
  color: "#94a3b8",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
}

const entryModeSwitchActiveStyle: React.CSSProperties = {
  background: "rgba(124,58,237,0.18)",
  border: "1px solid rgba(167,139,250,0.24)",
  color: "#f8fafc",
  boxShadow: "inset 0 0 0 1px rgba(167,139,250,0.08)",
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

const importIcsBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 13px",
  borderRadius: 9,
  border: "1px solid rgba(8,145,178,0.35)",
  background: "rgba(8,145,178,0.10)",
  color: "#67e8f9",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
}
