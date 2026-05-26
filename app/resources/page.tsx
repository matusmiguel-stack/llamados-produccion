"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { supabase } from "../../lib/supabase"

export default function ResourcesPage() {
  const [resources, setResources] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)

  const [name, setName] = useState("")
  const [type, setType] = useState("human")
  const [category, setCategory] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const isAdmin = profile?.role === "admin"

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  async function loadPage() {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      window.location.href = "/login"
      return
    }

    const { data: profiles } = await supabase.from("profiles").select("*")

    const myProfile = profiles?.find(
      (p) =>
        p.email?.trim().toLowerCase() ===
        session.user.email?.trim().toLowerCase()
    )

    if (!myProfile || myProfile.role !== "admin") {
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

  return (
    <div style={appShellStyle}>
      {isMobile && (
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          style={hamburgerButton}
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
          width: isMobile ? 280 : 250,
          zIndex: 9999,
          transition: "left 0.25s ease",
        }}
      >
        <div style={{ marginBottom: 20, textAlign: "center" }}>
          <Image
            src="/logo-retro.png"
            alt="Retro"
            width={160}
            height={60}
            style={{ objectFit: "contain" }}
          />
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
            style={activeNavLink}
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

        <div style={profileCardStyle}>
          <p style={profileLabelStyle}>Sesión</p>
          <p style={profileEmailStyle}>{profile?.email || "..."}</p>
          <span style={roleBadgeStyle(profile?.role)}>{profile?.role || "admin"}</span>
          <button onClick={logout} style={logoutButton}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main style={{ ...mainStyle, padding: isMobile ? "76px 14px 24px" : "28px 32px" }}>
        <div style={pageContainerStyle}>
          <header style={pageHeaderStyle}>
            <div>
              <p style={eyebrowStyle}>Admin</p>
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
      background: "rgba(124,58,237,0.16)",
      border: "1px solid rgba(167,139,250,0.24)",
      color: "#ddd6fe",
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
    color: "#bae6fd",
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
        ? "rgba(124,58,237,0.18)"
        : "rgba(14,165,233,0.14)",
    border:
      type === "human"
        ? "1px solid rgba(167,139,250,0.22)"
        : "1px solid rgba(56,189,248,0.22)",
    fontSize: 14,
  }
}

const appShellStyle: React.CSSProperties = {
  display: "flex",
  minHeight: "100vh",
}

const sidebarStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "rgba(15, 23, 42, 0.9)",
  borderRight: "1px solid rgba(148,163,184,0.16)",
  padding: 22,
  color: "white",
  backdropFilter: "blur(18px)",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
}

const navStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
}

const navLink: React.CSSProperties = {
  display: "block",
  color: "#cbd5e1",
  textDecoration: "none",
  padding: "11px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.06)",
}

const activeNavLink: React.CSSProperties = {
  ...navLink,
  color: "white",
  background: "linear-gradient(135deg, rgba(124,58,237,0.85), rgba(14,165,233,0.55))",
  border: "1px solid rgba(167,139,250,0.24)",
}

const profileCardStyle: React.CSSProperties = {
  marginTop: 24,
  borderRadius: 16,
  padding: 14,
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
}

const profileLabelStyle: React.CSSProperties = {
  margin: 0,
  color: "#94a3b8",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.8,
}

const profileEmailStyle: React.CSSProperties = {
  margin: "8px 0",
  fontSize: 13,
  color: "#e5e7eb",
  wordBreak: "break-word",
}

const logoutButton: React.CSSProperties = {
  marginTop: 12,
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  cursor: "pointer",
  color: "white",
  background: "rgba(255,255,255,0.08)",
}

const hamburgerButton: React.CSSProperties = {
  position: "fixed",
  top: 14,
  left: 14,
  zIndex: 10000,
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  padding: "10px 14px",
  background: "rgba(15,23,42,0.92)",
  color: "white",
  fontSize: 20,
  cursor: "pointer",
}

const mobileBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9998,
  border: "none",
  background: "rgba(0,0,0,0.45)",
  cursor: "pointer",
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

const panelsGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
  marginTop: 14,
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

const panelTitleRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
}

const panelTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
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
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 600,
}

const panelHintStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#64748b",
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

const tableHeaderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(160px, 1.2fr) 140px 100px",
  gap: 12,
  padding: "0 4px 10px",
  color: "#64748b",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.6,
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
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
}

const resourceCellStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
}

const resourceNameStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
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
  color: "#64748b",
  fontSize: 13,
  background: "rgba(255,255,255,0.02)",
  border: "1px dashed rgba(148,163,184,0.14)",
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
  whiteSpace: "nowrap",
}

const dangerButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "transparent",
  color: "#f87171",
  border: "1px solid rgba(248,113,113,0.24)",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 500,
  fontSize: 13,
  whiteSpace: "nowrap",
}
