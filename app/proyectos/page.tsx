"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import { requireSessionProfile } from "../../lib/session-profile"
import { AppSidebar } from "../../components/AppSidebar"

type Client = {
  id: string
  name: string
  created_at: string
}

type Subfolder = {
  id: string
  client_id: string
  name: string
  created_at: string
}

type Employee = {
  id: string
  nombre: string
  apellido_paterno: string | null
  apellido_materno: string | null
  puesto: string | null
}

type Project = {
  id: string
  client_id: string
  subfolder_id: string
  name: string
  code: string | null
  description: string | null
  responsable: string | null
  created_at: string
  updated_at: string
}

function projectDisplayName(p: { code: string | null; name: string }) {
  return p.code ? `${p.code} ${p.name}` : p.name
}

type DriveView =
  | { level: "root" }
  | { level: "client"; clientId: string }
  | { level: "subfolder"; clientId: string; subfolderId: string }

type SelectedItem =
  | { type: "client"; id: string }
  | { type: "subfolder"; id: string }
  | { type: "project"; id: string }
  | null

export default function ProyectosPage() {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [subfolders, setSubfolders] = useState<Subfolder[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const [view, setView] = useState<DriveView>({ level: "root" })
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null)
  const [showCreatePanel, setShowCreatePanel] = useState(false)
  const [showRenamePanel, setShowRenamePanel] = useState(false)
  const [showMovePanel, setShowMovePanel] = useState(false)

  const [createName, setCreateName] = useState("")
  const [createDescription, setCreateDescription] = useState("")
  const [createResponsable, setCreateResponsable] = useState("")
  const [renameName, setRenameName] = useState("")
  const [renameDescription, setRenameDescription] = useState("")
  const [moveTargetSubfolderId, setMoveTargetSubfolderId] = useState("")

  const isAdmin = profile?.role === "admin" || profile?.role === "editor"

  const currentClient = useMemo(
    () =>
      view.level !== "root"
        ? clients.find((client) => client.id === view.clientId) || null
        : null,
    [clients, view]
  )

  const currentSubfolder = useMemo(
    () =>
      view.level === "subfolder"
        ? subfolders.find((subfolder) => subfolder.id === view.subfolderId) || null
        : null,
    [subfolders, view]
  )

  const visibleSubfolders = useMemo(() => {
    if (view.level === "root") return []
    return subfolders
      .filter((subfolder) => subfolder.client_id === view.clientId)
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
  }, [subfolders, view])

  const visibleProjects = useMemo(() => {
    if (view.level !== "subfolder") return []
    return projects
      .filter((project) => project.subfolder_id === view.subfolderId)
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
  }, [projects, view])

  const selectedProject = useMemo(() => {
    if (selectedItem?.type !== "project") return null
    return projects.find((project) => project.id === selectedItem.id) || null
  }, [projects, selectedItem])

  const moveDestinationSubfolders = useMemo(() => {
    if (!selectedProject) return []

    return subfolders
      .filter(
        (subfolder) =>
          subfolder.client_id === selectedProject.client_id &&
          subfolder.id !== selectedProject.subfolder_id
      )
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
  }, [subfolders, selectedProject])

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  async function loadPage() {
    const auth = await requireSessionProfile()
    if (!auth) return

    const myProfile = auth.profile

    if (!["admin", "editor", "productor"].includes(myProfile.role)) {
      window.location.href = "/"
      return
    }

    setProfile(myProfile)

    const [
      { data: clientsData, error: clientsError },
      { data: subfoldersData, error: subfoldersError },
      { data: projectsData, error: projectsError },
      { data: employeesData },
    ] = await Promise.all([
      supabase.from("clients").select("*").order("name", { ascending: true }),
      supabase.from("client_subfolders").select("*").order("name", { ascending: true }),
      supabase.from("projects").select("*").order("name", { ascending: true }),
      supabase
        .from("employees")
        .select("id,nombre,apellido_paterno,apellido_materno,puesto")
        .or("puesto.ilike.%Productor%,puesto.ilike.%Productora%")
        .order("nombre", { ascending: true }),
    ])

    if (clientsError) return alert(clientsError.message)
    if (subfoldersError) return alert(subfoldersError.message)
    if (projectsError) return alert(projectsError.message)

    setClients(clientsData || [])
    setSubfolders(subfoldersData || [])
    setProjects(projectsData || [])
    setEmployees((employeesData || []) as Employee[])
  }

  useEffect(() => {
    loadPage()
  }, [])

  useEffect(() => {
    if (clients.length === 0) return

    const params = new URLSearchParams(window.location.search)
    const clientId = params.get("client")
    const subfolderId = params.get("subfolder")

    if (
      clientId &&
      subfolderId &&
      subfolders.some((subfolder) => subfolder.id === subfolderId)
    ) {
      setView({ level: "subfolder", clientId, subfolderId })
      return
    }

    if (clientId && clients.some((client) => client.id === clientId)) {
      setView({ level: "client", clientId })
    }
  }, [clients, subfolders])

  function countSubfolders(clientId: string) {
    return subfolders.filter((subfolder) => subfolder.client_id === clientId).length
  }

  function countProjectsInClient(clientId: string) {
    const subfolderIds = subfolders
      .filter((subfolder) => subfolder.client_id === clientId)
      .map((subfolder) => subfolder.id)

    return projects.filter((project) => subfolderIds.includes(project.subfolder_id))
      .length
  }

  function countProjectsInSubfolder(subfolderId: string) {
    return projects.filter((project) => project.subfolder_id === subfolderId).length
  }

  function closePanels() {
    setShowCreatePanel(false)
    setShowRenamePanel(false)
    setShowMovePanel(false)
  }

  function goToRoot() {
    setView({ level: "root" })
    setSelectedItem(null)
    closePanels()
  }

  function goToClient(clientId: string) {
    setView({ level: "client", clientId })
    setSelectedItem(null)
    closePanels()
  }

  function goToSubfolder(clientId: string, subfolderId: string) {
    setView({ level: "subfolder", clientId, subfolderId })
    setSelectedItem(null)
    closePanels()
  }

  function goBack() {
    if (view.level === "subfolder") {
      goToClient(view.clientId)
      return
    }

    if (view.level === "client") {
      goToRoot()
    }
  }

  function openProject(projectId: string) {
    router.push(`/proyectos/${projectId}`)
  }

  function openItem(type: "client" | "subfolder", id: string) {
    if (type === "client") {
      goToClient(id)
      return
    }

    if (type === "subfolder") {
      const subfolder = subfolders.find((item) => item.id === id)
      if (subfolder) goToSubfolder(subfolder.client_id, subfolder.id)
    }
  }

  function handleItemClick(type: NonNullable<SelectedItem>["type"], id: string) {
    setSelectedItem({ type, id })
    setShowMovePanel(false)
    setShowRenamePanel(false)

    if (isMobile && (type === "client" || type === "subfolder")) {
      openItem(type, id)
      return
    }

    if (isMobile && type === "project") {
      openProject(id)
    }
  }

  function handleItemDoubleClick(type: NonNullable<SelectedItem>["type"], id: string) {
    if (type === "client" || type === "subfolder") {
      openItem(type, id)
      return
    }

    if (type === "project") {
      openProject(id)
    }
  }

  function resetCreateForm() {
    setCreateName("")
    setCreateDescription("")
    setCreateResponsable("")
  }

  function resetRenameForm() {
    setRenameName("")
    setRenameDescription("")
  }

  function openCreatePanel() {
    resetCreateForm()
    setShowRenamePanel(false)
    setShowMovePanel(false)
    setShowCreatePanel(true)
  }

  function openRenamePanel() {
    if (!selectedItem) return

    setShowCreatePanel(false)
    setShowMovePanel(false)
    setShowRenamePanel(true)

    if (selectedItem.type === "client") {
      const client = clients.find((item) => item.id === selectedItem.id)
      setRenameName(client?.name || "")
      setRenameDescription("")
      return
    }

    if (selectedItem.type === "subfolder") {
      const subfolder = subfolders.find((item) => item.id === selectedItem.id)
      setRenameName(subfolder?.name || "")
      setRenameDescription("")
      return
    }

    const project = projects.find((item) => item.id === selectedItem.id)
    setRenameName(project?.name || "")
    setRenameDescription(project?.description || "")
  }

  function openMovePanel() {
    if (!selectedProject) return

    if (moveDestinationSubfolders.length === 0) {
      alert(
        "Crea otra subcarpeta en este cliente para poder mover el proyecto."
      )
      return
    }

    setShowCreatePanel(false)
    setShowRenamePanel(false)
    setShowMovePanel(true)
    setMoveTargetSubfolderId(moveDestinationSubfolders[0].id)
  }

  async function handleMoveProject() {
    if (!selectedProject) return

    if (!moveTargetSubfolderId) {
      alert("Selecciona la subcarpeta destino")
      return
    }

    if (moveTargetSubfolderId === selectedProject.subfolder_id) {
      alert("El proyecto ya está en esa subcarpeta")
      return
    }

    const targetSubfolder = subfolders.find(
      (subfolder) => subfolder.id === moveTargetSubfolderId
    )

    if (
      !targetSubfolder ||
      targetSubfolder.client_id !== selectedProject.client_id
    ) {
      alert("Solo puedes mover proyectos entre subcarpetas del mismo cliente")
      return
    }

    const { error } = await supabase
      .from("projects")
      .update({
        subfolder_id: moveTargetSubfolderId,
        client_id: targetSubfolder.client_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedProject.id)

    if (error) return alert(error.message)

    setShowMovePanel(false)
    setMoveTargetSubfolderId("")
    setSelectedItem(null)
    await loadPage()
    goToSubfolder(targetSubfolder.client_id, targetSubfolder.id)
  }

  async function handleCreate() {
    const name = createName.trim()
    const description = createDescription.trim()

    if (!name) {
      alert("Escribe un nombre")
      return
    }

    if (view.level === "root") {
      const { data, error } = await supabase
        .from("clients")
        .insert({ name })
        .select("*")
        .single()

      if (error) return alert(error.message)

      resetCreateForm()
      setShowCreatePanel(false)
      await loadPage()
      if (data) goToClient(data.id)
      return
    }

    if (view.level === "client") {
      const { data, error } = await supabase
        .from("client_subfolders")
        .insert({ client_id: view.clientId, name })
        .select("*")
        .single()

      if (error) return alert(error.message)

      resetCreateForm()
      setShowCreatePanel(false)
      await loadPage()
      if (data) goToSubfolder(view.clientId, data.id)
      return
    }

    if (!createResponsable) {
      alert("Selecciona un responsable del proyecto")
      return
    }

    const { error } = await supabase.from("projects").insert({
      client_id: view.clientId,
      subfolder_id: view.subfolderId,
      name,
      description: description || null,
      responsable: createResponsable,
      updated_at: new Date().toISOString(),
    })

    if (error) return alert(error.message)

    resetCreateForm()
    setShowCreatePanel(false)
    await loadPage()
  }

  async function handleRename() {
    if (!selectedItem) return

    const name = renameName.trim()
    const description = renameDescription.trim()

    if (!name) {
      alert("Escribe un nombre")
      return
    }

    if (selectedItem.type === "client") {
      const { error } = await supabase
        .from("clients")
        .update({ name })
        .eq("id", selectedItem.id)

      if (error) return alert(error.message)
    } else if (selectedItem.type === "subfolder") {
      const { error } = await supabase
        .from("client_subfolders")
        .update({ name })
        .eq("id", selectedItem.id)

      if (error) return alert(error.message)
    } else {
      const { error } = await supabase
        .from("projects")
        .update({
          name,
          description: description || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedItem.id)

      if (error) return alert(error.message)
    }

    resetRenameForm()
    setShowRenamePanel(false)
    setShowMovePanel(false)
    setSelectedItem(null)
    await loadPage()
  }

  async function handleDeleteSelected() {
    if (!selectedItem) return

    if (selectedItem.type === "client") {
      const client = clients.find((item) => item.id === selectedItem.id)
      if (!client) return

      const subfolderCount = countSubfolders(client.id)
      const projectCount = countProjectsInClient(client.id)
      const warning =
        subfolderCount > 0 || projectCount > 0
          ? `¿Eliminar "${client.name}" con ${subfolderCount} subcarpeta${subfolderCount === 1 ? "" : "s"} y ${projectCount} proyecto${projectCount === 1 ? "" : "s"}?`
          : `¿Eliminar "${client.name}"?`

      if (!confirm(`${warning} Esta acción no se puede deshacer.`)) return

      const { error } = await supabase.from("clients").delete().eq("id", client.id)
      if (error) return alert(error.message)

      if (view.level !== "root" && view.clientId === client.id) goToRoot()
    } else if (selectedItem.type === "subfolder") {
      const subfolder = subfolders.find((item) => item.id === selectedItem.id)
      if (!subfolder) return

      const projectCount = countProjectsInSubfolder(subfolder.id)
      const warning =
        projectCount > 0
          ? `¿Eliminar "${subfolder.name}" y sus ${projectCount} proyecto${projectCount === 1 ? "" : "s"}?`
          : `¿Eliminar "${subfolder.name}"?`

      if (!confirm(`${warning} Esta acción no se puede deshacer.`)) return

      const { error } = await supabase
        .from("client_subfolders")
        .delete()
        .eq("id", subfolder.id)

      if (error) return alert(error.message)

      if (
        view.level === "subfolder" &&
        view.subfolderId === subfolder.id
      ) {
        goToClient(subfolder.client_id)
      }
    } else {
      const project = projects.find((item) => item.id === selectedItem.id)
      if (!project) return

      if (
        !confirm(
          `¿Eliminar el proyecto "${project.name}"? Esta acción no se puede deshacer.`
        )
      ) {
        return
      }

      const { error } = await supabase.from("projects").delete().eq("id", project.id)
      if (error) return alert(error.message)
    }

    setSelectedItem(null)
    setShowRenamePanel(false)
    setShowMovePanel(false)
    await loadPage()
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const createLabel =
    view.level === "root"
      ? "Nuevo cliente"
      : view.level === "client"
        ? "Nueva subcarpeta"
        : "Nuevo proyecto"

  const emptyMessage =
    view.level === "root"
      ? "No hay clientes todavía. Crea el primero con el botón de arriba."
      : view.level === "client"
        ? "Esta carpeta no tiene subcarpetas. Crea una para organizar proyectos."
        : "Esta subcarpeta no tiene proyectos todavía."

  const gridItems =
    view.level === "root"
      ? clients.map((client) => ({
          type: "client" as const,
          id: client.id,
          name: client.name,
          meta: `${countSubfolders(client.id)} subcarpeta${countSubfolders(client.id) === 1 ? "" : "s"} · ${countProjectsInClient(client.id)} proyecto${countProjectsInClient(client.id) === 1 ? "" : "s"}`,
          openable: true,
        }))
      : view.level === "client"
        ? visibleSubfolders.map((subfolder) => ({
            type: "subfolder" as const,
            id: subfolder.id,
            name: subfolder.name,
            meta: `${countProjectsInSubfolder(subfolder.id)} proyecto${countProjectsInSubfolder(subfolder.id) === 1 ? "" : "s"}`,
            openable: true,
          }))
        : visibleProjects.map((project) => ({
            type: "project" as const,
            id: project.id,
            name: projectDisplayName(project),
            meta:
              project.description?.trim() ||
              "Abrir módulos del proyecto",
            openable: true,
          }))

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

      <main style={{ ...mainStyle, padding: isMobile ? "76px 14px 24px" : "28px 32px" }}>
        <div style={pageContainerStyle}>
          <header style={pageHeaderStyle}>
            <div>
              <p style={eyebrowStyle}>Admin</p>
              <h1 style={pageTitleStyle}>Proyectos</h1>
              <p style={pageSubtitleStyle}>
                {clients.length} cliente{clients.length === 1 ? "" : "s"} ·{" "}
                {subfolders.length} subcarpeta{subfolders.length === 1 ? "" : "s"} ·{" "}
                {projects.length} proyecto{projects.length === 1 ? "" : "s"}
              </p>
            </div>
          </header>

          <section style={drivePanelStyle}>
            <div style={driveToolbarStyle}>
              <div style={driveNavStyle}>
                {view.level !== "root" && (
                  <button onClick={goBack} style={backButtonStyle} aria-label="Regresar">
                    ←
                  </button>
                )}

                <nav style={breadcrumbStyle} aria-label="Ruta de carpetas">
                  <button
                    type="button"
                    onClick={goToRoot}
                    style={{
                      ...breadcrumbItemStyle,
                      ...(view.level === "root" ? breadcrumbActiveStyle : {}),
                    }}
                  >
                    Proyectos
                  </button>

                  {currentClient && (
                    <>
                      <span style={breadcrumbDividerStyle}>/</span>
                      <button
                        type="button"
                        onClick={() => goToClient(currentClient.id)}
                        style={{
                          ...breadcrumbItemStyle,
                          ...(view.level === "client" ? breadcrumbActiveStyle : {}),
                        }}
                      >
                        {currentClient.name}
                      </button>
                    </>
                  )}

                  {currentSubfolder && (
                    <>
                      <span style={breadcrumbDividerStyle}>/</span>
                      <span style={breadcrumbCurrentStyle}>{currentSubfolder.name}</span>
                    </>
                  )}
                </nav>
              </div>

              <div style={driveActionsStyle}>
                {selectedItem && (
                  <>
                    <button onClick={openRenamePanel} style={secondaryButtonStyle}>
                      Renombrar
                    </button>
                    {selectedItem.type === "project" && (
                      <button onClick={openMovePanel} style={secondaryButtonStyle}>
                        Mover
                      </button>
                    )}
                    <button onClick={handleDeleteSelected} style={dangerButtonStyle}>
                      Borrar
                    </button>
                  </>
                )}

                <button onClick={openCreatePanel} style={primaryButtonStyle}>
                  + {createLabel}
                </button>
              </div>
            </div>

            <p style={driveHintStyle}>
              {isMobile
                ? "Toca una carpeta para abrirla."
                : "Doble clic en una carpeta para abrirla."}
            </p>

            {showCreatePanel && (
              <div style={inlinePanelStyle}>
                <p style={inlinePanelTitleStyle}>{createLabel}</p>
                <div
                  style={{
                    ...inlineFormGridStyle,
                    gridTemplateColumns:
                      view.level === "subfolder" && !isMobile ? "1fr 1fr 1fr auto" : "1fr auto",
                  }}
                >
                  <Field label="Nombre">
                    <input
                      autoFocus
                      value={createName}
                      onChange={(event) => setCreateName(event.target.value)}
                      placeholder={
                        view.level === "root"
                          ? "Ej. Isla"
                          : view.level === "client"
                            ? "Ej. Tangamanga, Bernina..."
                            : "Ej. Spot verano 2026"
                      }
                      style={inputStyle}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleCreate()
                      }}
                    />
                  </Field>

                  {view.level === "subfolder" && (
                    <Field label="Descripción breve (opcional)">
                      <input
                        value={createDescription}
                        onChange={(event) => setCreateDescription(event.target.value)}
                        placeholder="Notas iniciales"
                        style={inputStyle}
                      />
                    </Field>
                  )}

                  {view.level === "subfolder" && (
                    <Field label="Responsable *">
                      <select
                        value={createResponsable}
                        onChange={(event) => setCreateResponsable(event.target.value)}
                        style={selectStyle}
                      >
                        <option value="">Seleccionar...</option>
                        <optgroup label="── Dirección ──">
                          <option value="Director General">Director General</option>
                          <option value="Directora de Operaciones">Directora de Operaciones</option>
                        </optgroup>
                        {employees.length > 0 && (
                          <optgroup label="── Productores ──">
                            {employees.map((e) => {
                              const full = [e.nombre, e.apellido_paterno, e.apellido_materno].filter(Boolean).join(" ")
                              return (
                                <option key={e.id} value={full}>{full}</option>
                              )
                            })}
                          </optgroup>
                        )}
                      </select>
                    </Field>
                  )}

                  <div style={inlineFormActionsStyle}>
                    <button onClick={handleCreate} style={primaryButtonStyle}>
                      Crear
                    </button>
                    <button
                      onClick={() => {
                        setShowCreatePanel(false)
                        resetCreateForm()
                      }}
                      style={secondaryButtonStyle}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showRenamePanel && selectedItem && (
              <div style={inlinePanelStyle}>
                <p style={inlinePanelTitleStyle}>Renombrar</p>
                <div
                  style={{
                    ...inlineFormGridStyle,
                    gridTemplateColumns:
                      selectedItem.type === "project" && !isMobile
                        ? "1fr 1fr auto"
                        : "1fr auto",
                  }}
                >
                  <Field label="Nombre">
                    <input
                      autoFocus
                      value={renameName}
                      onChange={(event) => setRenameName(event.target.value)}
                      style={inputStyle}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleRename()
                      }}
                    />
                  </Field>

                  {selectedItem.type === "project" && (
                    <Field label="Descripción breve">
                      <input
                        value={renameDescription}
                        onChange={(event) => setRenameDescription(event.target.value)}
                        style={inputStyle}
                      />
                    </Field>
                  )}

                  <div style={inlineFormActionsStyle}>
                    <button onClick={handleRename} style={primaryButtonStyle}>
                      Guardar
                    </button>
                    <button
                      onClick={() => {
                        setShowRenamePanel(false)
                        resetRenameForm()
                      }}
                      style={secondaryButtonStyle}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {showMovePanel && selectedProject && (
              <div style={inlinePanelStyle}>
                <p style={inlinePanelTitleStyle}>Mover proyecto</p>
                <p style={moveHintStyle}>
                  Moviendo{" "}
                  <strong style={moveHintStrongStyle}>{projectDisplayName(selectedProject)}</strong>{" "}
                  desde{" "}
                  <strong style={moveHintStrongStyle}>
                    {subfolders.find(
                      (subfolder) => subfolder.id === selectedProject.subfolder_id
                    )?.name || "subcarpeta actual"}
                  </strong>
                </p>

                <div
                  style={{
                    ...inlineFormGridStyle,
                    gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
                  }}
                >
                  <Field label="Mover a subcarpeta">
                    <select
                      value={moveTargetSubfolderId}
                      onChange={(event) =>
                        setMoveTargetSubfolderId(event.target.value)
                      }
                      style={selectStyle}
                    >
                      {moveDestinationSubfolders.map((subfolder) => (
                        <option key={subfolder.id} value={subfolder.id}>
                          {subfolder.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <div style={inlineFormActionsStyle}>
                    <button onClick={handleMoveProject} style={primaryButtonStyle}>
                      Mover aquí
                    </button>
                    <button
                      onClick={() => {
                        setShowMovePanel(false)
                        setMoveTargetSubfolderId("")
                      }}
                      style={secondaryButtonStyle}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {gridItems.length === 0 ? (
              <div style={emptyStateStyle}>{emptyMessage}</div>
            ) : (
              <div
                style={{
                  ...driveGridStyle,
                  gridTemplateColumns: isMobile
                    ? "repeat(auto-fill, minmax(128px, 1fr))"
                    : "repeat(auto-fill, minmax(156px, 1fr))",
                }}
              >
                {gridItems.map((item) => {
                  const isSelected =
                    selectedItem?.type === item.type && selectedItem.id === item.id

                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      style={{
                        ...driveItemStyle,
                        ...(isSelected ? driveItemSelectedStyle : {}),
                      }}
                      onClick={() => handleItemClick(item.type, item.id)}
                      onDoubleClick={() => handleItemDoubleClick(item.type, item.id)}
                    >
                      <span
                        style={
                          item.type === "project"
                            ? projectIconWrapStyle
                            : item.type === "subfolder"
                              ? subfolderIconWrapStyle
                              : clientIconWrapStyle
                        }
                      >
                        {item.type === "project" ? (
                          <ProjectIcon />
                        ) : item.type === "subfolder" ? (
                          <SubfolderIcon />
                        ) : (
                          <FolderIcon />
                        )}
                      </span>
                      <span style={driveItemNameStyle}>{item.name}</span>
                      <span style={driveItemMetaStyle}>{item.meta}</span>
                      {item.openable && !isMobile && (
                        <span style={driveItemHintStyle}>Doble clic para abrir</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label style={fieldStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
    </label>
  )
}

function FolderIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V7.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="rgba(245,158,11,0.18)"
      />
    </svg>
  )
}

function SubfolderIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 8.5A1.5 1.5 0 0 1 5.5 7H10l1.5 1.5H18.5A1.5 1.5 0 0 1 20 10v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17V8.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="rgba(20,184,166,0.18)"
      />
    </svg>
  )
}

function ProjectIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 4h8l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M16 4v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

const appShellStyle: React.CSSProperties = {
  display: "flex",
  minHeight: "100vh",
}

const mainStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
}

const pageContainerStyle: React.CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
}

const pageHeaderStyle: React.CSSProperties = {
  marginBottom: 18,
}

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

const drivePanelStyle: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148,163,184,0.14)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
  backdropFilter: "blur(16px)",
  borderRadius: 16,
  padding: "16px 18px",
  minHeight: 420,
}

const driveToolbarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 10,
}

const driveNavStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
  flex: 1,
}

const backButtonStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(255,255,255,0.04)",
  color: "#e2e8f0",
  cursor: "pointer",
  fontSize: 16,
  flexShrink: 0,
}

const breadcrumbStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
  minWidth: 0,
}

const breadcrumbItemStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#94a3b8",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  padding: "4px 6px",
  borderRadius: 6,
}

const breadcrumbActiveStyle: React.CSSProperties = {
  color: "#f8fafc",
  background: "rgba(124,58,237,0.12)",
}

const breadcrumbDividerStyle: React.CSSProperties = {
  color: "#475569",
  fontSize: 12,
}

const breadcrumbCurrentStyle: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 600,
  padding: "4px 6px",
}

const driveActionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
}

const driveHintStyle: React.CSSProperties = {
  margin: "0 0 14px",
  color: "#64748b",
  fontSize: 12,
}

const inlinePanelStyle: React.CSSProperties = {
  marginBottom: 14,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.14)",
  background: "rgba(2,6,23,0.35)",
}

const inlinePanelTitleStyle: React.CSSProperties = {
  margin: "0 0 10px",
  color: "#e2e8f0",
  fontSize: 13,
  fontWeight: 600,
}

const inlineFormGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  alignItems: "end",
}

const inlineFormActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
}

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 5,
  minWidth: 0,
}

const fieldLabelStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 500,
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

const moveHintStyle: React.CSSProperties = {
  margin: "0 0 10px",
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.5,
}

const moveHintStrongStyle: React.CSSProperties = {
  color: "#e2e8f0",
  fontWeight: 600,
}

const primaryButtonStyle: React.CSSProperties = {
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

const secondaryButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "rgba(255,255,255,0.04)",
  color: "#cbd5e1",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 500,
  fontSize: 13,
}

const dangerButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  color: "#fca5a5",
  border: "1px solid rgba(248,113,113,0.24)",
}

const emptyStateStyle: React.CSSProperties = {
  padding: "56px 16px",
  textAlign: "center",
  color: "#64748b",
  fontSize: 13,
}

const driveGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
}

const driveItemStyle: React.CSSProperties = {
  display: "grid",
  justifyItems: "center",
  gap: 8,
  padding: "16px 12px",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.10)",
  background: "rgba(255,255,255,0.02)",
  cursor: "pointer",
  textAlign: "center",
  transition: "background 0.15s ease, border-color 0.15s ease, transform 0.15s ease",
}

const driveItemSelectedStyle: React.CSSProperties = {
  background: "rgba(124,58,237,0.10)",
  border: "1px solid rgba(167,139,250,0.28)",
  boxShadow: "0 10px 30px rgba(124,58,237,0.12)",
}

const clientIconWrapStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 56,
  height: 56,
  borderRadius: 14,
  color: "#fbbf24",
  background: "rgba(245,158,11,0.10)",
  border: "1px solid rgba(251,191,36,0.16)",
}

const subfolderIconWrapStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 52,
  height: 52,
  borderRadius: 13,
  color: "#5eead4",
  background: "rgba(20,184,166,0.10)",
  border: "1px solid rgba(45,212,191,0.16)",
}

const projectIconWrapStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 48,
  height: 48,
  borderRadius: 12,
  color: "#93c5fd",
  background: "rgba(59,130,246,0.10)",
  border: "1px solid rgba(96,165,250,0.16)",
}

const driveItemNameStyle: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.35,
  wordBreak: "break-word",
}

const driveItemMetaStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 11,
  lineHeight: 1.4,
  wordBreak: "break-word",
}

const driveItemHintStyle: React.CSSProperties = {
  color: "#475569",
  fontSize: 10,
}
