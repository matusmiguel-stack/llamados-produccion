"use client"

import { useEffect, useMemo, useState } from "react"
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

type Project = {
  id: string
  client_id: string
  subfolder_id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export default function ProyectosPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [subfolders, setSubfolders] = useState<Subfolder[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const [newClientName, setNewClientName] = useState("")
  const [expandedClientIds, setExpandedClientIds] = useState<string[]>([])
  const [expandedSubfolderIds, setExpandedSubfolderIds] = useState<string[]>([])

  const [editingClientId, setEditingClientId] = useState("")
  const [editingClientName, setEditingClientName] = useState("")

  const [editingSubfolderId, setEditingSubfolderId] = useState("")
  const [editingSubfolderName, setEditingSubfolderName] = useState("")

  const [editingProjectId, setEditingProjectId] = useState("")
  const [editingProjectName, setEditingProjectName] = useState("")
  const [editingProjectDescription, setEditingProjectDescription] = useState("")

  const [newSubfolderNames, setNewSubfolderNames] = useState<Record<string, string>>({})
  const [newProjectNames, setNewProjectNames] = useState<Record<string, string>>({})
  const [newProjectDescriptions, setNewProjectDescriptions] = useState<
    Record<string, string>
  >({})

  const isAdmin = profile?.role === "admin"

  const subfoldersByClient = useMemo(() => {
    const grouped: Record<string, Subfolder[]> = {}

    for (const subfolder of subfolders) {
      if (!grouped[subfolder.client_id]) grouped[subfolder.client_id] = []
      grouped[subfolder.client_id].push(subfolder)
    }

    for (const clientId of Object.keys(grouped)) {
      grouped[clientId].sort((a, b) => a.name.localeCompare(b.name, "es"))
    }

    return grouped
  }, [subfolders])

  const projectsBySubfolder = useMemo(() => {
    const grouped: Record<string, Project[]> = {}

    for (const project of projects) {
      if (!grouped[project.subfolder_id]) grouped[project.subfolder_id] = []
      grouped[project.subfolder_id].push(project)
    }

    for (const subfolderId of Object.keys(grouped)) {
      grouped[subfolderId].sort((a, b) => a.name.localeCompare(b.name, "es"))
    }

    return grouped
  }, [projects])

  const totalProjects = projects.length

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

    if (myProfile.role !== "admin") {
      window.location.href = "/"
      return
    }

    setProfile(myProfile)

    const [
      { data: clientsData, error: clientsError },
      { data: subfoldersData, error: subfoldersError },
      { data: projectsData, error: projectsError },
    ] = await Promise.all([
      supabase.from("clients").select("*").order("name", { ascending: true }),
      supabase.from("client_subfolders").select("*").order("name", { ascending: true }),
      supabase.from("projects").select("*").order("name", { ascending: true }),
    ])

    if (clientsError) return alert(clientsError.message)
    if (subfoldersError) return alert(subfoldersError.message)
    if (projectsError) return alert(projectsError.message)

    setClients(clientsData || [])
    setSubfolders(subfoldersData || [])
    setProjects(projectsData || [])
  }

  useEffect(() => {
    loadPage()
  }, [])

  function toggleClient(clientId: string) {
    setExpandedClientIds((current) =>
      current.includes(clientId)
        ? current.filter((id) => id !== clientId)
        : [...current, clientId]
    )
  }

  function toggleSubfolder(subfolderId: string) {
    setExpandedSubfolderIds((current) =>
      current.includes(subfolderId)
        ? current.filter((id) => id !== subfolderId)
        : [...current, subfolderId]
    )
  }

  function countClientProjects(clientId: string) {
    const clientSubfolderIds = (subfoldersByClient[clientId] || []).map(
      (subfolder) => subfolder.id
    )

    return projects.filter((project) =>
      clientSubfolderIds.includes(project.subfolder_id)
    ).length
  }

  async function createClient() {
    const name = newClientName.trim()

    if (!name) {
      alert("Escribe el nombre del cliente")
      return
    }

    const { data, error } = await supabase
      .from("clients")
      .insert({ name })
      .select("*")
      .single()

    if (error) return alert(error.message)

    setNewClientName("")
    if (data) {
      setExpandedClientIds((current) =>
        current.includes(data.id) ? current : [...current, data.id]
      )
    }

    await loadPage()
  }

  function startEditClient(client: Client) {
    setEditingClientId(client.id)
    setEditingClientName(client.name)
  }

  function cancelEditClient() {
    setEditingClientId("")
    setEditingClientName("")
  }

  async function saveClient(clientId: string) {
    const name = editingClientName.trim()

    if (!name) {
      alert("Escribe el nombre del cliente")
      return
    }

    const { error } = await supabase
      .from("clients")
      .update({ name })
      .eq("id", clientId)

    if (error) return alert(error.message)

    cancelEditClient()
    await loadPage()
  }

  async function deleteClient(client: Client) {
    const subfolderCount = subfoldersByClient[client.id]?.length || 0
    const projectCount = countClientProjects(client.id)
    const warning =
      subfolderCount > 0 || projectCount > 0
        ? `¿Eliminar "${client.name}" con ${subfolderCount} subcarpeta${subfolderCount === 1 ? "" : "s"} y ${projectCount} proyecto${projectCount === 1 ? "" : "s"}?`
        : `¿Eliminar la carpeta "${client.name}"?`

    if (!confirm(`${warning} Esta acción no se puede deshacer.`)) return

    const { error } = await supabase.from("clients").delete().eq("id", client.id)

    if (error) return alert(error.message)

    if (editingClientId === client.id) cancelEditClient()
    setExpandedClientIds((current) => current.filter((id) => id !== client.id))
    await loadPage()
  }

  async function createSubfolder(clientId: string) {
    const name = (newSubfolderNames[clientId] || "").trim()

    if (!name) {
      alert("Escribe el nombre de la subcarpeta")
      return
    }

    const { data, error } = await supabase
      .from("client_subfolders")
      .insert({ client_id: clientId, name })
      .select("*")
      .single()

    if (error) return alert(error.message)

    setNewSubfolderNames((current) => ({ ...current, [clientId]: "" }))
    setExpandedClientIds((current) =>
      current.includes(clientId) ? current : [...current, clientId]
    )
    if (data) {
      setExpandedSubfolderIds((current) =>
        current.includes(data.id) ? current : [...current, data.id]
      )
    }

    await loadPage()
  }

  function startEditSubfolder(subfolder: Subfolder) {
    setEditingSubfolderId(subfolder.id)
    setEditingSubfolderName(subfolder.name)
  }

  function cancelEditSubfolder() {
    setEditingSubfolderId("")
    setEditingSubfolderName("")
  }

  async function saveSubfolder(subfolderId: string) {
    const name = editingSubfolderName.trim()

    if (!name) {
      alert("Escribe el nombre de la subcarpeta")
      return
    }

    const { error } = await supabase
      .from("client_subfolders")
      .update({ name })
      .eq("id", subfolderId)

    if (error) return alert(error.message)

    cancelEditSubfolder()
    await loadPage()
  }

  async function deleteSubfolder(subfolder: Subfolder) {
    const projectCount = projectsBySubfolder[subfolder.id]?.length || 0
    const warning =
      projectCount > 0
        ? `¿Eliminar la subcarpeta "${subfolder.name}" y sus ${projectCount} proyecto${projectCount === 1 ? "" : "s"}?`
        : `¿Eliminar la subcarpeta "${subfolder.name}"?`

    if (!confirm(`${warning} Esta acción no se puede deshacer.`)) return

    const { error } = await supabase
      .from("client_subfolders")
      .delete()
      .eq("id", subfolder.id)

    if (error) return alert(error.message)

    if (editingSubfolderId === subfolder.id) cancelEditSubfolder()
    setExpandedSubfolderIds((current) =>
      current.filter((id) => id !== subfolder.id)
    )
    await loadPage()
  }

  async function createProject(subfolderId: string, clientId: string) {
    const name = (newProjectNames[subfolderId] || "").trim()
    const description = (newProjectDescriptions[subfolderId] || "").trim()

    if (!name) {
      alert("Escribe el nombre del proyecto")
      return
    }

    const { error } = await supabase.from("projects").insert({
      client_id: clientId,
      subfolder_id: subfolderId,
      name,
      description: description || null,
      updated_at: new Date().toISOString(),
    })

    if (error) return alert(error.message)

    setNewProjectNames((current) => ({ ...current, [subfolderId]: "" }))
    setNewProjectDescriptions((current) => ({ ...current, [subfolderId]: "" }))
    setExpandedClientIds((current) =>
      current.includes(clientId) ? current : [...current, clientId]
    )
    setExpandedSubfolderIds((current) =>
      current.includes(subfolderId) ? current : [...current, subfolderId]
    )
    await loadPage()
  }

  function startEditProject(project: Project) {
    setEditingProjectId(project.id)
    setEditingProjectName(project.name)
    setEditingProjectDescription(project.description || "")
  }

  function cancelEditProject() {
    setEditingProjectId("")
    setEditingProjectName("")
    setEditingProjectDescription("")
  }

  async function saveProject(projectId: string) {
    const name = editingProjectName.trim()
    const description = editingProjectDescription.trim()

    if (!name) {
      alert("Escribe el nombre del proyecto")
      return
    }

    const { error } = await supabase
      .from("projects")
      .update({
        name,
        description: description || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)

    if (error) return alert(error.message)

    cancelEditProject()
    await loadPage()
  }

  async function deleteProject(project: Project) {
    if (
      !confirm(
        `¿Eliminar el proyecto "${project.name}"? Esta acción no se puede deshacer.`
      )
    ) {
      return
    }

    const { error } = await supabase.from("projects").delete().eq("id", project.id)

    if (error) return alert(error.message)

    if (editingProjectId === project.id) cancelEditProject()
    await loadPage()
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

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
                {totalProjects} proyecto{totalProjects === 1 ? "" : "s"}
              </p>
            </div>
          </header>

          <section style={panelStyle}>
            <div style={panelHeaderStyle}>
              <p style={panelTitleStyle}>Nueva carpeta de cliente</p>
              <p style={panelHintStyle}>
                Ej. Isla, Nike, Coca-Cola — luego crea subcarpetas como Tangamanga o Bernina
              </p>
            </div>

            <div
              style={{
                ...formRowStyle,
                gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
              }}
            >
              <Field label="Nombre del cliente">
                <input
                  placeholder="Ej. Isla"
                  value={newClientName}
                  onChange={(event) => setNewClientName(event.target.value)}
                  style={inputStyle}
                />
              </Field>

              <div style={formActionStyle}>
                <button onClick={createClient} style={primaryButtonStyle}>
                  Crear cliente
                </button>
              </div>
            </div>
          </section>

          <section style={{ ...panelStyle, marginTop: 14 }}>
            <div style={panelHeaderStyle}>
              <p style={panelTitleStyle}>Estructura de carpetas</p>
              <p style={panelHintStyle}>
                Cliente → subcarpeta interna → proyectos
              </p>
            </div>

            {clients.length === 0 ? (
              <div style={emptyStateStyle}>
                Aún no hay clientes. Crea el primero arriba.
              </div>
            ) : (
              <div style={folderListStyle}>
                {clients.map((client) => {
                  const clientSubfolders = subfoldersByClient[client.id] || []
                  const isExpanded = expandedClientIds.includes(client.id)
                  const isEditingClient = editingClientId === client.id
                  const clientProjectCount = countClientProjects(client.id)

                  return (
                    <article key={client.id} style={folderCardStyle}>
                      <div style={folderHeaderStyle}>
                        <button
                          type="button"
                          onClick={() => toggleClient(client.id)}
                          style={folderToggleStyle}
                          aria-expanded={isExpanded}
                        >
                          <span style={clientIconWrapStyle}>
                            <FolderIcon open={isExpanded} />
                          </span>
                          <span style={folderMetaStyle}>
                            {isEditingClient ? (
                              <input
                                value={editingClientName}
                                onChange={(event) =>
                                  setEditingClientName(event.target.value)
                                }
                                onClick={(event) => event.stopPropagation()}
                                style={{ ...inputStyle, marginTop: 2 }}
                              />
                            ) : (
                              <>
                                <span style={folderNameStyle}>{client.name}</span>
                                <span style={folderCountStyle}>
                                  {clientSubfolders.length} subcarpeta
                                  {clientSubfolders.length === 1 ? "" : "s"} ·{" "}
                                  {clientProjectCount} proyecto
                                  {clientProjectCount === 1 ? "" : "s"}
                                </span>
                              </>
                            )}
                          </span>
                          <span style={chevronStyle(isExpanded)}>›</span>
                        </button>

                        <div style={folderActionsStyle}>
                          {isEditingClient ? (
                            <>
                              <button
                                onClick={() => saveClient(client.id)}
                                style={primaryButtonStyle}
                              >
                                Guardar
                              </button>
                              <button onClick={cancelEditClient} style={secondaryButtonStyle}>
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEditClient(client)}
                                style={secondaryButtonStyle}
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => deleteClient(client)}
                                style={dangerButtonStyle}
                              >
                                Borrar
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div style={folderBodyStyle}>
                          <div style={newSubfolderPanelStyle}>
                            <p style={nestedTitleStyle}>Nueva subcarpeta</p>
                            <div
                              style={{
                                ...formRowStyle,
                                gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
                              }}
                            >
                              <Field label="Nombre de la subcarpeta">
                                <input
                                  placeholder="Ej. Tangamanga, Bernina, San Rafael"
                                  value={newSubfolderNames[client.id] || ""}
                                  onChange={(event) =>
                                    setNewSubfolderNames((current) => ({
                                      ...current,
                                      [client.id]: event.target.value,
                                    }))
                                  }
                                  style={inputStyle}
                                />
                              </Field>
                              <div style={formActionStyle}>
                                <button
                                  onClick={() => createSubfolder(client.id)}
                                  style={primaryButtonStyle}
                                >
                                  Crear subcarpeta
                                </button>
                              </div>
                            </div>
                          </div>

                          {clientSubfolders.length === 0 ? (
                            <div style={nestedEmptyStyle}>
                              Este cliente aún no tiene subcarpetas.
                            </div>
                          ) : (
                            <div style={subfolderListStyle}>
                              {clientSubfolders.map((subfolder) => {
                                const subfolderProjects =
                                  projectsBySubfolder[subfolder.id] || []
                                const isSubfolderExpanded =
                                  expandedSubfolderIds.includes(subfolder.id)
                                const isEditingSubfolder =
                                  editingSubfolderId === subfolder.id

                                return (
                                  <article key={subfolder.id} style={subfolderCardStyle}>
                                    <div style={subfolderHeaderStyle}>
                                      <button
                                        type="button"
                                        onClick={() => toggleSubfolder(subfolder.id)}
                                        style={folderToggleStyle}
                                        aria-expanded={isSubfolderExpanded}
                                      >
                                        <span style={subfolderIconWrapStyle}>
                                          <SubfolderIcon open={isSubfolderExpanded} />
                                        </span>
                                        <span style={folderMetaStyle}>
                                          {isEditingSubfolder ? (
                                            <input
                                              value={editingSubfolderName}
                                              onChange={(event) =>
                                                setEditingSubfolderName(event.target.value)
                                              }
                                              onClick={(event) =>
                                                event.stopPropagation()
                                              }
                                              style={{ ...inputStyle, marginTop: 2 }}
                                            />
                                          ) : (
                                            <>
                                              <span style={folderNameStyle}>
                                                {subfolder.name}
                                              </span>
                                              <span style={folderCountStyle}>
                                                {subfolderProjects.length} proyecto
                                                {subfolderProjects.length === 1 ? "" : "s"}
                                              </span>
                                            </>
                                          )}
                                        </span>
                                        <span style={chevronStyle(isSubfolderExpanded)}>
                                          ›
                                        </span>
                                      </button>

                                      <div style={folderActionsStyle}>
                                        {isEditingSubfolder ? (
                                          <>
                                            <button
                                              onClick={() => saveSubfolder(subfolder.id)}
                                              style={primaryButtonStyle}
                                            >
                                              Guardar
                                            </button>
                                            <button
                                              onClick={cancelEditSubfolder}
                                              style={secondaryButtonStyle}
                                            >
                                              Cancelar
                                            </button>
                                          </>
                                        ) : (
                                          <>
                                            <button
                                              onClick={() => startEditSubfolder(subfolder)}
                                              style={secondaryButtonStyle}
                                            >
                                              Editar
                                            </button>
                                            <button
                                              onClick={() => deleteSubfolder(subfolder)}
                                              style={dangerButtonStyle}
                                            >
                                              Borrar
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>

                                    {isSubfolderExpanded && (
                                      <div style={subfolderBodyStyle}>
                                        <div style={newProjectPanelStyle}>
                                          <p style={nestedTitleStyle}>Nuevo proyecto</p>
                                          <div
                                            style={{
                                              ...nestedFormGridStyle,
                                              gridTemplateColumns: isMobile
                                                ? "1fr"
                                                : "1fr 1fr",
                                            }}
                                          >
                                            <Field label="Nombre del proyecto">
                                              <input
                                                placeholder="Ej. Spot verano 2026"
                                                value={newProjectNames[subfolder.id] || ""}
                                                onChange={(event) =>
                                                  setNewProjectNames((current) => ({
                                                    ...current,
                                                    [subfolder.id]: event.target.value,
                                                  }))
                                                }
                                                style={inputStyle}
                                              />
                                            </Field>

                                            <Field label="Descripción breve (opcional)">
                                              <input
                                                placeholder="Notas iniciales del proyecto"
                                                value={
                                                  newProjectDescriptions[subfolder.id] || ""
                                                }
                                                onChange={(event) =>
                                                  setNewProjectDescriptions((current) => ({
                                                    ...current,
                                                    [subfolder.id]: event.target.value,
                                                  }))
                                                }
                                                style={inputStyle}
                                              />
                                            </Field>
                                          </div>

                                          <div style={formActionStyle}>
                                            <button
                                              onClick={() =>
                                                createProject(subfolder.id, client.id)
                                              }
                                              style={primaryButtonStyle}
                                            >
                                              Agregar proyecto
                                            </button>
                                          </div>
                                        </div>

                                        {subfolderProjects.length === 0 ? (
                                          <div style={nestedEmptyStyle}>
                                            Esta subcarpeta aún no tiene proyectos.
                                          </div>
                                        ) : (
                                          <div style={projectListStyle}>
                                            {subfolderProjects.map((project) => {
                                              const isEditingProject =
                                                editingProjectId === project.id

                                              if (isEditingProject) {
                                                return (
                                                  <div
                                                    key={project.id}
                                                    style={projectEditPanelStyle}
                                                  >
                                                    <div
                                                      style={{
                                                        ...nestedFormGridStyle,
                                                        gridTemplateColumns: isMobile
                                                          ? "1fr"
                                                          : "1fr 1fr",
                                                      }}
                                                    >
                                                      <Field label="Nombre del proyecto">
                                                        <input
                                                          value={editingProjectName}
                                                          onChange={(event) =>
                                                            setEditingProjectName(
                                                              event.target.value
                                                            )
                                                          }
                                                          style={inputStyle}
                                                        />
                                                      </Field>

                                                      <Field label="Descripción breve">
                                                        <input
                                                          value={editingProjectDescription}
                                                          onChange={(event) =>
                                                            setEditingProjectDescription(
                                                              event.target.value
                                                            )
                                                          }
                                                          style={inputStyle}
                                                        />
                                                      </Field>
                                                    </div>

                                                    <div style={rowActionsStyle}>
                                                      <button
                                                        onClick={() =>
                                                          saveProject(project.id)
                                                        }
                                                        style={primaryButtonStyle}
                                                      >
                                                        Guardar
                                                      </button>
                                                      <button
                                                        onClick={cancelEditProject}
                                                        style={secondaryButtonStyle}
                                                      >
                                                        Cancelar
                                                      </button>
                                                    </div>
                                                  </div>
                                                )
                                              }

                                              return (
                                                <div key={project.id} style={projectRowStyle}>
                                                  <div style={projectMainStyle}>
                                                    <span style={projectIconWrapStyle}>
                                                      <ProjectIcon />
                                                    </span>
                                                    <div style={{ minWidth: 0 }}>
                                                      <p style={projectNameStyle}>
                                                        {project.name}
                                                      </p>
                                                      <p style={projectMetaStyle}>
                                                        {project.description?.trim() ||
                                                          "Listo para cargar información del proyecto"}
                                                      </p>
                                                    </div>
                                                  </div>

                                                  <div style={rowActionsStyle}>
                                                    <button
                                                      onClick={() => startEditProject(project)}
                                                      style={secondaryButtonStyle}
                                                    >
                                                      Editar
                                                    </button>
                                                    <button
                                                      onClick={() => deleteProject(project)}
                                                      style={dangerButtonStyle}
                                                    >
                                                      Borrar
                                                    </button>
                                                  </div>
                                                </div>
                                              )
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </article>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </article>
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

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V7.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill={open ? "rgba(245,158,11,0.18)" : "transparent"}
      />
    </svg>
  )
}

function SubfolderIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 8.5A1.5 1.5 0 0 1 5.5 7H10l1.5 1.5H18.5A1.5 1.5 0 0 1 20 10v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17V8.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill={open ? "rgba(20,184,166,0.18)" : "transparent"}
      />
    </svg>
  )
}

function ProjectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
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
  maxWidth: 980,
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
  margin: 0,
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 600,
}

const panelHintStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#64748b",
  fontSize: 12,
}

const formRowStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  alignItems: "end",
}

const nestedFormGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
}

const formActionStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
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
  padding: "28px 16px",
  textAlign: "center",
  color: "#64748b",
  fontSize: 13,
}

const folderListStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
}

const folderCardStyle: React.CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.12)",
  background: "rgba(255,255,255,0.02)",
  overflow: "hidden",
}

const folderHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 12px",
}

const folderToggleStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flex: 1,
  minWidth: 0,
  padding: 0,
  border: "none",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  textAlign: "left",
}

const clientIconWrapStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  borderRadius: 10,
  flexShrink: 0,
  color: "#fbbf24",
  background: "rgba(245,158,11,0.12)",
  border: "1px solid rgba(251,191,36,0.18)",
}

const subfolderIconWrapStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 9,
  flexShrink: 0,
  color: "#5eead4",
  background: "rgba(20,184,166,0.12)",
  border: "1px solid rgba(45,212,191,0.18)",
}

const folderMetaStyle: React.CSSProperties = {
  display: "grid",
  gap: 2,
  minWidth: 0,
  flex: 1,
}

const folderNameStyle: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 600,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const folderCountStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 11,
}

const chevronStyle = (open: boolean): React.CSSProperties => ({
  color: "#64748b",
  fontSize: 22,
  lineHeight: 1,
  transform: open ? "rotate(90deg)" : "rotate(0deg)",
  transition: "transform 0.15s ease",
  flexShrink: 0,
})

const folderActionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexShrink: 0,
  flexWrap: "wrap",
  justifyContent: "flex-end",
}

const folderBodyStyle: React.CSSProperties = {
  borderTop: "1px solid rgba(148,163,184,0.10)",
  padding: "12px",
  background: "rgba(2,6,23,0.28)",
}

const newSubfolderPanelStyle: React.CSSProperties = {
  padding: "12px",
  borderRadius: 12,
  border: "1px dashed rgba(251,191,36,0.22)",
  background: "rgba(245,158,11,0.04)",
  marginBottom: 12,
}

const subfolderListStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
}

const subfolderCardStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(45,212,191,0.12)",
  background: "rgba(255,255,255,0.02)",
  overflow: "hidden",
}

const subfolderHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 10px",
}

const subfolderBodyStyle: React.CSSProperties = {
  borderTop: "1px solid rgba(45,212,191,0.10)",
  padding: "10px",
  background: "rgba(2,6,23,0.22)",
}

const newProjectPanelStyle: React.CSSProperties = {
  padding: "12px",
  borderRadius: 12,
  border: "1px dashed rgba(148,163,184,0.18)",
  background: "rgba(255,255,255,0.02)",
  marginBottom: 12,
}

const nestedTitleStyle: React.CSSProperties = {
  margin: "0 0 10px",
  color: "#cbd5e1",
  fontSize: 12,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.8,
}

const nestedEmptyStyle: React.CSSProperties = {
  padding: "16px 12px",
  color: "#64748b",
  fontSize: 12,
  textAlign: "center",
}

const projectListStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
}

const projectRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.10)",
  background: "rgba(255,255,255,0.03)",
  flexWrap: "wrap",
}

const projectEditPanelStyle: React.CSSProperties = {
  padding: "12px",
  borderRadius: 12,
  border: "1px solid rgba(167,139,250,0.18)",
  background: "rgba(124,58,237,0.08)",
  display: "grid",
  gap: 12,
}

const projectMainStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  minWidth: 0,
  flex: 1,
}

const projectIconWrapStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 9,
  flexShrink: 0,
  color: "#93c5fd",
  background: "rgba(59,130,246,0.12)",
  border: "1px solid rgba(96,165,250,0.18)",
}

const projectNameStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 600,
}

const projectMetaStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.45,
}

const rowActionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
}
