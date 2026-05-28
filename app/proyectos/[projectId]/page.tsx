"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { supabase } from "../../../lib/supabase"
import { requireSessionProfile } from "../../../lib/session-profile"
import { AppSidebar } from "../../../components/AppSidebar"

type Project = {
  id: string
  client_id: string
  subfolder_id: string
  name: string
  description: string | null
}

type ProjectModule = {
  id: "general" | "presupuesto" | "matriz" | "hoja-llamado"
  label: string
  description: string
  icon: string
}

const projectModules: ProjectModule[] = [
  {
    id: "general",
    label: "Información general",
    description: "Datos base, contactos y contexto del proyecto",
    icon: "info",
  },
  {
    id: "presupuesto",
    label: "Presupuesto",
    description: "Costos, partidas y seguimiento financiero",
    icon: "budget",
  },
  {
    id: "matriz",
    label: "Matriz",
    description: "Planeación de recursos, roles y disponibilidad",
    icon: "matrix",
  },
  {
    id: "hoja-llamado",
    label: "Hoja de llamado",
    description: "Detalle operativo de cada jornada de shoot",
    icon: "callsheet",
  },
]

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = String(params.projectId || "")

  const [profile, setProfile] = useState<any>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [clientName, setClientName] = useState("")
  const [subfolderName, setSubfolderName] = useState("")
  const [activeModule, setActiveModule] = useState<ProjectModule["id"]>("general")
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const isAdmin = profile?.role === "admin"

  const activeModuleData = useMemo(
    () => projectModules.find((module) => module.id === activeModule) || projectModules[0],
    [activeModule]
  )

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

    if (auth.profile.role !== "admin") {
      window.location.href = "/"
      return
    }

    setProfile(auth.profile)

    const { data: projectData, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single()

    if (projectError || !projectData) {
      alert(projectError?.message || "Proyecto no encontrado")
      router.push("/proyectos")
      return
    }

    const [{ data: client }, { data: subfolder }] = await Promise.all([
      supabase
        .from("clients")
        .select("name")
        .eq("id", projectData.client_id)
        .single(),
      supabase
        .from("client_subfolders")
        .select("name")
        .eq("id", projectData.subfolder_id)
        .single(),
    ])

    setProject(projectData)
    setClientName(client?.name || "Cliente")
    setSubfolderName(subfolder?.name || "Subcarpeta")
  }

  useEffect(() => {
    if (projectId) loadPage()
  }, [projectId])

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const backHref = project
    ? `/proyectos?client=${project.client_id}&subfolder=${project.subfolder_id}`
    : "/proyectos"

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
              <p style={eyebrowStyle}>Proyecto</p>
              <h1 style={pageTitleStyle}>{project?.name || "Cargando..."}</h1>
              <p style={pageSubtitleStyle}>
                {clientName} · {subfolderName}
              </p>
            </div>
          </header>

          <section style={drivePanelStyle}>
            <div style={toolbarStyle}>
              <div style={navStyle}>
                <Link href={backHref} style={backButtonStyle}>
                  ← Volver
                </Link>

                <nav style={breadcrumbStyle} aria-label="Ruta del proyecto">
                  <Link href="/proyectos" style={breadcrumbLinkStyle}>
                    Proyectos
                  </Link>
                  <span style={breadcrumbDividerStyle}>/</span>
                  <span style={breadcrumbMutedStyle}>{clientName}</span>
                  <span style={breadcrumbDividerStyle}>/</span>
                  <span style={breadcrumbMutedStyle}>{subfolderName}</span>
                  <span style={breadcrumbDividerStyle}>/</span>
                  <span style={breadcrumbCurrentStyle}>{project?.name || "..."}</span>
                </nav>
              </div>
            </div>

            {project?.description?.trim() && (
              <p style={projectDescriptionStyle}>{project.description}</p>
            )}

            <div
              style={{
                ...moduleGridStyle,
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
              }}
            >
              {projectModules.map((module) => {
                const isActive = activeModule === module.id

                return (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => setActiveModule(module.id)}
                    style={{
                      ...moduleCardStyle,
                      ...(isActive ? moduleCardActiveStyle : {}),
                    }}
                  >
                    <span style={moduleIconWrapStyle(isActive)}>
                      <ModuleIcon type={module.icon} />
                    </span>
                    <span style={moduleLabelStyle}>{module.label}</span>
                    <span style={moduleDescriptionStyle}>{module.description}</span>
                    <span style={comingSoonBadgeStyle}>Próximamente</span>
                  </button>
                )
              })}
            </div>

            <section style={modulePanelStyle}>
              <div style={modulePanelHeaderStyle}>
                <p style={modulePanelTitleStyle}>{activeModuleData.label}</p>
                <p style={modulePanelHintStyle}>
                  Esta sección se implementará en una siguiente etapa
                </p>
              </div>

              <div style={placeholderBoxStyle}>
                <p style={placeholderTitleStyle}>{activeModuleData.label}</p>
                <p style={placeholderTextStyle}>
                  Aquí vivirá el módulo de {activeModuleData.label.toLowerCase()} para{" "}
                  <strong style={placeholderStrongStyle}>{project?.name || "este proyecto"}</strong>.
                </p>
              </div>
            </section>
          </section>
        </div>
      </main>
    </div>
  )
}

function ModuleIcon({ type }: { type: ProjectModule["icon"] }) {
  if (type === "budget") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 3v18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path
          d="M7 8h8.5a2.5 2.5 0 0 1 0 5H9a2.5 2.5 0 0 0 0 5h9"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (type === "matrix") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    )
  }

  if (type === "callsheet") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M8 4h8l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M16 4v4h4M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 10v6M12 8h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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

const drivePanelStyle: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148,163,184,0.14)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
  backdropFilter: "blur(16px)",
  borderRadius: 16,
  padding: "16px 18px",
}

const toolbarStyle: React.CSSProperties = {
  marginBottom: 14,
}

const navStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
}

const backButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(255,255,255,0.04)",
  color: "#cbd5e1",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 500,
}

const breadcrumbStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
}

const breadcrumbLinkStyle: React.CSSProperties = {
  color: "#a78bfa",
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 600,
}

const breadcrumbDividerStyle: React.CSSProperties = {
  color: "#475569",
  fontSize: 12,
}

const breadcrumbMutedStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
}

const breadcrumbCurrentStyle: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 12,
  fontWeight: 600,
}

const projectDescriptionStyle: React.CSSProperties = {
  margin: "0 0 14px",
  color: "#94a3b8",
  fontSize: 13,
  lineHeight: 1.5,
}

const moduleGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
  marginBottom: 14,
}

const moduleCardStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  justifyItems: "start",
  textAlign: "left",
  padding: "16px",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.12)",
  background: "rgba(255,255,255,0.02)",
  cursor: "pointer",
  color: "inherit",
}

const moduleCardActiveStyle: React.CSSProperties = {
  background: "rgba(124,58,237,0.10)",
  border: "1px solid rgba(167,139,250,0.24)",
  boxShadow: "0 10px 30px rgba(124,58,237,0.12)",
}

const moduleIconWrapStyle = (active: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 44,
  height: 44,
  borderRadius: 12,
  color: active ? "#ddd6fe" : "#93c5fd",
  background: active ? "rgba(124,58,237,0.18)" : "rgba(59,130,246,0.12)",
  border: active
    ? "1px solid rgba(167,139,250,0.24)"
    : "1px solid rgba(96,165,250,0.18)",
})

const moduleLabelStyle: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 15,
  fontWeight: 600,
}

const moduleDescriptionStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.45,
}

const comingSoonBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 8px",
  borderRadius: 999,
  background: "rgba(148,163,184,0.10)",
  border: "1px solid rgba(148,163,184,0.16)",
  color: "#94a3b8",
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.6,
}

const modulePanelStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.10)",
  background: "rgba(2,6,23,0.28)",
}

const modulePanelHeaderStyle: React.CSSProperties = {
  marginBottom: 12,
  paddingBottom: 12,
  borderBottom: "1px solid rgba(148,163,184,0.10)",
}

const modulePanelTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 16,
  fontWeight: 600,
}

const modulePanelHintStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#64748b",
  fontSize: 12,
}

const placeholderBoxStyle: React.CSSProperties = {
  padding: "28px 20px",
  borderRadius: 12,
  border: "1px dashed rgba(148,163,184,0.18)",
  background: "rgba(255,255,255,0.02)",
  textAlign: "center",
}

const placeholderTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#e2e8f0",
  fontSize: 14,
  fontWeight: 600,
}

const placeholderTextStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.5,
}

const placeholderStrongStyle: React.CSSProperties = {
  color: "#cbd5e1",
  fontWeight: 600,
}
