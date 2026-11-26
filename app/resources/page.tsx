"use client"
import { PageLoader } from "../../components/PageLoader"

import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { requireSessionProfile } from "../../lib/session-profile"
import { AppSidebar } from "../../components/AppSidebar"

export default function ResourcesPage() {
  const [resources, setResources] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)

  const [name, setName] = useState("")
  const [type, setType] = useState("human")
  const [category, setCategory] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const isAdmin = profile?.role === "admin"
  const canEdit =
    profile?.role === "admin" || profile?.role === "editor" || profile?.role === "editor_premium"

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

    if (myProfile.role !== "admin" && myProfile.role !== "editor" && myProfile.role !== "editor_premium") {
      window.location.href = "/"
      return
    }

    setProfile(myProfile)

    const { data, error } = await supabase
      .from("resources")
      .select("*")
      .order("type", { ascending: true })
      .order("category", { ascending: true })

    if (error) return alert(error.message)

    setResources(data || [])
  }

  useEffect(() => {
    loadPage()
  }, [])

  async function createResource() {
    if (!canEdit) return alert("No tienes permisos para editar el inventario.")
    if (!name) return alert("Escribe el nombre del recurso")
    if (!category) return alert("Escribe la categoría")

    const { error } = await supabase.from("resources").insert({
      name,
      type,
      category,
    })

    if (error) return alert(error.message)

    setName("")
    setCategory("")
    await loadPage()
  }

  async function deleteResource(id: string) {
    if (!canEdit) return alert("No tienes permisos para editar el inventario.")
    if (!confirm("¿Seguro que quieres borrar este recurso?")) return

    const { error } = await supabase.from("resources").delete().eq("id", id)

    if (error) return alert(error.message)

    await loadPage()
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const humans = resources.filter((r) => r.type === "human")
  const technical = resources.filter((r) => r.type === "technical")

  if (!profile) return <PageLoader />
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
              <p style={eyebrowStyle}>Catálogo</p>
              <h1 style={pageTitleStyle}>Inventario</h1>
              <p style={pageSubtitleStyle}>
                {resources.length} recurso{resources.length === 1 ? "" : "s"} ·{" "}
                {humans.length} humanos · {technical.length} técnicos
              </p>
            </div>
          </header>

          <section style={panelStyle}>
            <div style={panelHeaderStyle}>
              <p style={panelTitleStyle}>Nuevo recurso</p>
              <p style={panelHintStyle}>
                Agrega personas o equipamiento al catálogo de producción
              </p>
            </div>

            <div
              style={{
                ...formGridStyle,
                gridTemplateColumns: isMobile ? "1fr" : "1.4fr 160px 1fr auto",
              }}
            >
              <Field label="Nombre">
                <input
                  placeholder="Ej. Juan Pérez, Alexa Mini"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={inputStyle}
                />
              </Field>

              <Field label="Tipo">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  style={inputStyle}
                >
                  <option value="human">Humano</option>
                  <option value="technical">Técnico</option>
                </select>
              </Field>

              <Field label="Categoría">
                <input
                  placeholder="Productor, Cámara, Luces..."
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={inputStyle}
                />
              </Field>

              <div style={formActionStyle}>
                <button onClick={createResource} style={primaryButtonStyle}>
                  Agregar
                </button>
              </div>
            </div>
          </section>

          <div
            style={{
              ...panelsGridStyle,
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            }}
          >
            <ResourcePanel
              title="Recursos humanos"
              hint="Productores, directores, crew"
              count={humans.length}
              resources={humans}
              isMobile={isMobile}
              onDelete={deleteResource}
            />

            <ResourcePanel
              title="Recursos técnicos"
              hint="Cámaras, luces, audio, equipos"
              count={technical.length}
              resources={technical}
              isMobile={isMobile}
              onDelete={deleteResource}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

function ResourcePanel({
  title,
  hint,
  count,
  resources,
  isMobile,
  onDelete,
}: {
  title: string
  hint: string
  count: number
  resources: any[]
  isMobile: boolean
  onDelete: (id: string) => void
}) {
  return (
    <section style={panelStyle}>
      <div style={panelHeaderStyle}>
        <div style={panelTitleRowStyle}>
          <p style={panelTitleStyle}>{title}</p>
          <span style={countBadgeStyle}>{count}</span>
        </div>
        <p style={panelHintStyle}>{hint}</p>
      </div>

      {!isMobile && resources.length > 0 && (
        <div style={tableHeaderStyle}>
          <span>Recurso</span>
          <span>Categoría</span>
          <span>Acciones</span>
        </div>
      )}

      <div style={tableBodyStyle}>
        {resources.length === 0 ? (
          <div style={emptyStateStyle}>Sin recursos registrados</div>
        ) : (
          resources.map((resource) => (
            <div
              key={resource.id}
              style={{
                ...rowStyle,
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "minmax(160px, 1.2fr) 140px 100px",
              }}
            >
              <div style={resourceCellStyle}>
                <span style={resourceIconStyle(resource.type)}>
                  {resource.type === "human" ? "👤" : "📦"}
                </span>
                <p style={resourceNameStyle}>{resource.name}</p>
              </div>

              <div style={categoryCellStyle}>
                <span style={categoryBadgeStyle(resource.type)}>
                  {resource.category}
                </span>
              </div>

              <div style={rowActionsStyle}>
                <button
                  onClick={() => onDelete(resource.id)}
                  style={dangerButtonStyle}
                >
                  Borrar
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
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

function categoryBadgeStyle(type: string): React.CSSProperties {
  if (type === "human") {
    return {
      display: "inline-flex",
      alignItems: "center",
      width: "fit-content",
      padding: "4px 10px",
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 600,
      background: "rgba(0,0,0,0.05)",
      border: "1px solid rgba(0,0,0,0.12)",
      color: "#262626",
    }
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    background: "rgba(14,165,233,0.14)",
    border: "1px solid rgba(56,189,248,0.24)",
    color: "#1D5FA8",
  }
}

function resourceIconStyle(type: string): React.CSSProperties {
  return {
    width: 32,
    height: 32,
    borderRadius: 10,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    background:
      type === "human"
        ? "rgba(0,0,0,0.05)"
        : "rgba(14,165,233,0.14)",
    border:
      type === "human"
        ? "1px solid rgba(0,0,0,0.12)"
        : "1px solid rgba(56,189,248,0.22)",
    fontSize: 14,
  }
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
  color: "#131313",
  fontSize: 11,
  fontWeight: 700,
}

const pageTitleStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#141414",
  fontSize: 28,
  letterSpacing: -0.6,
  lineHeight: 1.1,
}

const pageSubtitleStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#737373",
  fontSize: 13,
}

const panelsGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
  marginTop: 14,
}

const panelStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid rgba(0,0,0,0.1)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.05)",
  backdropFilter: "blur(16px)",
  borderRadius: 16,
  padding: "16px 18px",
}

const panelHeaderStyle: React.CSSProperties = {
  marginBottom: 14,
  paddingBottom: 12,
  borderBottom: "1px solid rgba(0,0,0,0.08)",
}

const panelTitleRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
}

const panelTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#141414",
  fontSize: 14,
  fontWeight: 600,
}

const countBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 22,
  height: 22,
  padding: "0 6px",
  borderRadius: 999,
  background: "#F5F5F5",
  border: "1px solid rgba(0,0,0,0.14)",
  color: "#6B6B6B",
  fontSize: 11,
  fontWeight: 600,
}

const panelHintStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#737373",
  fontSize: 12,
}

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  alignItems: "end",
}

const formActionStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  height: "100%",
}

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 5,
  minWidth: 0,
}

const fieldLabelStyle: React.CSSProperties = {
  color: "#6B6B6B",
  fontSize: 11,
  fontWeight: 500,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 8,
  background: "#FFFFFF",
  color: "#141414",
  outline: "none",
  fontSize: 13,
  lineHeight: 1.35,
}

const tableHeaderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(160px, 1.2fr) 140px 100px",
  gap: 12,
  padding: "0 4px 10px",
  color: "#737373",
  fontSize: 11,
  fontWeight: 600,
}

const tableBodyStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
}

const rowStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  alignItems: "center",
  padding: "10px 12px",
  borderRadius: 12,
  background: "#FFFFFF",
  border: "1px solid rgba(0,0,0,0.13)",
}

const resourceCellStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
}

const resourceNameStyle: React.CSSProperties = {
  margin: 0,
  color: "#141414",
  fontSize: 14,
  fontWeight: 600,
  wordBreak: "break-word",
}

const categoryCellStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
}

const rowActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
}

const emptyStateStyle: React.CSSProperties = {
  padding: "18px 12px",
  borderRadius: 12,
  textAlign: "center",
  color: "#737373",
  fontSize: 13,
  background: "#FFFFFF",
  border: "1px dashed rgba(0,0,0,0.1)",
}

const primaryButtonStyle: React.CSSProperties = {
  padding: "8px 14px",
  background: "#131313",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
  boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
  whiteSpace: "nowrap",
}

const dangerButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "transparent",
  color: "#C2362B",
  border: "1px solid rgba(248,113,113,0.24)",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 500,
  fontSize: 13,
  whiteSpace: "nowrap",
}
