"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { GlobalSearch } from "./GlobalSearch"
import { supabase } from "../lib/supabase"

function getLocalToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

type AppSidebarProps = {
  profile: any
  user: any
  isAdmin: boolean
  isMobile: boolean
  menuOpen: boolean
  onMenuToggle: () => void
  onMenuClose: () => void
  onLogout: () => void
}

type NavIconType = "calendar" | "dashboard" | "inventory" | "quotes" | "projects" | "suppliers" | "ingresos" | "employees" | "users" | "postpro" | "tasks" | "workspace" | "referencias" | "history"

const ROLE_LABELS: Record<string, string> = {
  admin:     "Admin",
  editor:    "Editor",
  productor: "Editor Post",
  viewer:    "Viewer",
}
const roleLabel = (r: string) => ROLE_LABELS[r] ?? r

// roles: null/undefined = visible para todos; array = visible solo para esos roles
export const navItems: { href: string; label: string; icon: NavIconType; roles?: string[] }[] = [
  { href: "/",            label: "Calendario",   icon: "calendar"   },
  { href: "/workspace",   label: "Escritorio",   icon: "workspace"  },
  { href: "/dashboard",   label: "Dashboard",    icon: "dashboard",  roles: ["admin", "editor", "editor_premium", "productor", "viewer", "finanzas"] },
  { href: "/resources",   label: "Inventario",   icon: "inventory",  roles: ["admin", "editor", "editor_premium", "viewer"] },
  { href: "/cotizaciones",label: "Cotizaciones", icon: "quotes",     roles: ["admin", "editor", "editor_premium"] },
  { href: "/proyectos",   label: "Proyectos",    icon: "projects",   roles: ["admin", "editor", "editor_premium", "productor"] },
  { href: "/postproduccion", label: "Post Producción", icon: "postpro", roles: ["admin", "editor", "editor_premium", "productor", "viewer"] },
  { href: "/proveedores", label: "Proveedores",  icon: "suppliers",  roles: ["admin", "editor", "editor_premium", "finanzas"] },
  { href: "/ingresos",    label: "Ingresos",     icon: "ingresos",   roles: ["admin", "finanzas"] },
  { href: "/finanzas",    label: "Finanzas",     icon: "ingresos",   roles: ["admin", "finanzas"] },
  { href: "/flujo",       label: "Flujo de Caja", icon: "ingresos",  roles: ["admin", "finanzas"] },
  { href: "/empleados",   label: "Empleados",    icon: "employees",  roles: ["admin", "editor_premium"] },
  { href: "/users",       label: "Usuarios",     icon: "users",      roles: ["admin", "editor_premium"] },
  { href: "/actividad",   label: "Historial",    icon: "history",    roles: ["admin"] },
  { href: "/referencias", label: "Referencias",  icon: "referencias" },
  { href: "/tasks",       label: "Mis Tareas",   icon: "tasks" },
]

export function AppSidebar({
  profile,
  user,
  isAdmin,
  isMobile,
  menuOpen,
  onMenuToggle,
  onMenuClose,
  onLogout,
}: AppSidebarProps) {
  const pathname = usePathname()
  // Dentro del Escritorio (pestañas) cada vista se carga en un iframe; ahí el
  // sidebar se oculta para que el contenido ocupe todo el ancho (el Escritorio
  // ya provee su propia navegación).
  const [embedded, setEmbedded] = useState(false)
  useEffect(() => {
    try { setEmbedded(window.self !== window.top) } catch { setEmbedded(true) }
  }, [])

  // Tareas vencidas del usuario (propias + compartidas, vía RLS) → alarma roja
  // junto a "Mis Tareas". Se recalcula al montar y al cambiar de ruta.
  const [overdueTasks, setOverdueTasks] = useState(0)
  useEffect(() => {
    let cancel = false
    ;(async () => {
      const today = getLocalToday()
      const { data } = await supabase
        .from("user_tasks")
        .select("due_date, due_time, completed")
        .eq("completed", false)
        .lte("due_date", today)
      if (cancel) return
      const now = new Date()
      const count = (data || []).filter((t: any) => {
        if (t.due_date < today) return true
        if (t.due_date === today && t.due_time) {
          const [h, m] = String(t.due_time).split(":").map(Number)
          return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)
        }
        return false
      }).length
      setOverdueTasks(count)
    })()
    return () => { cancel = true }
  }, [pathname])

  const email = profile?.email || user?.email || "..."
  const displayName = profile?.full_name || email.split("@")[0] || "Usuario"
  const role = profile?.role || "viewer"
  const initial = displayName.charAt(0).toUpperCase()
  const mustChangePassword = !!profile?.must_change_password
  const visibleNavItems = mustChangePassword
    ? []
    : navItems.filter((item) => !item.roles || item.roles.includes(role))

  function isActive(href: string) {
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href)
  }

  if (embedded) return null

  return (
    <>
      {isMobile && (
        <button
          onClick={onMenuToggle}
          style={hamburgerStyle}
          aria-label="Abrir menú"
        >
          <MenuIcon />
        </button>
      )}

      {isMobile && menuOpen && (
        <button
          onClick={onMenuClose}
          style={backdropStyle}
          aria-label="Cerrar menú"
        />
      )}

      <aside
        className="app-sidebar"
        style={{
          ...sidebarStyle,
          position: isMobile ? "fixed" : "sticky",
          left: isMobile && !menuOpen ? "-100%" : 0,
          top: 0,
          height: "100vh",
          width: isMobile ? 272 : 232,
          zIndex: 9999,
          transition: "left 0.22s ease",
          // Permite hacer scroll dentro del menú cuando no cabe (p. ej. en móvil
          // no se alcanzaba el último ítem "Mis Tareas").
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div style={sidebarTopStyle}>
          <div style={brandZoneStyle}>
            <Link
              href="/"
              onClick={() => isMobile && onMenuClose()}
              aria-label="Ir al calendario general"
              style={{ display: "inline-flex" }}
            >
              <Image
                src="/logo-retro.png"
                alt="Retro"
                width={132}
                height={48}
                style={{ objectFit: "contain", height: "auto" }}
                priority
              />
            </Link>
          </div>

          {!mustChangePassword && (
            <div style={searchWrapStyle}>
              <GlobalSearch onNavigate={() => isMobile && onMenuClose()} />
            </div>
          )}

          <nav style={navStyle}>
            {visibleNavItems.map((item) => {
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => isMobile && onMenuClose()}
                    style={{
                      ...navItemStyle,
                      ...(active ? activeNavItemStyle : {}),
                    }}
                  >
                    <span style={navIconWrapStyle(active)}>
                      <NavIcon type={item.icon} />
                      {item.href === "/tasks" && overdueTasks > 0 && (
                        <span
                          style={taskAlertDotStyle}
                          title={`${overdueTasks} tarea${overdueTasks !== 1 ? "s" : ""} vencida${overdueTasks !== 1 ? "s" : ""}`}
                          aria-label={`${overdueTasks} tareas vencidas`}
                        />
                      )}
                    </span>
                    <span style={navLabelStyle}>{item.label}</span>
                    {active && <span style={activeIndicatorStyle} />}
                  </Link>
                )
              })}
          </nav>
        </div>

        <div style={sidebarFooterStyle}>
          <Link
            href="/perfil"
            onClick={() => isMobile && onMenuClose()}
            style={{
              ...profileCardStyle,
              ...(pathname === "/perfil" ? profileCardActiveStyle : {}),
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={profileRowStyle}>
              <span style={avatarStyle}>{initial}</span>
              <div style={profileMetaStyle}>
                <p style={profileNameStyle}>{displayName}</p>
              </div>
            </div>
            <div style={profileFooterRowStyle}>
              <span style={roleBadgeStyle(role)}>{roleLabel(role)}</span>
              <span style={profileLinkHintStyle}>Mi perfil</span>
            </div>
          </Link>
          <button onClick={onLogout} style={logoutButtonStyle}>
            Salir
          </button>
        </div>
      </aside>
    </>
  )
}

export function NavIcon({
  type,
}: {
  type: NavIconType
}) {
  if (type === "workspace") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M9 5v14M15 5v14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }

  if (type === "calendar") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }

  if (type === "dashboard") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <rect x="13" y="3" width="8" height="5" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <rect x="13" y="10" width="8" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    )
  }

  if (type === "inventory") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M4 12l8 4.5 8-4.5M4 16.5 12 21l8-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    )
  }

  if (type === "quotes") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.6" />
        <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }

  if (type === "projects") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V7.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }

  if (type === "employees") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 7V5.5A2 2 0 0 1 10 3.5h4a2 2 0 0 1 2 2V7" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 12v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }

  if (type === "suppliers") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M3 9.5 12 4l9 5.5V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M9 20v-7h6v7" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    )
  }

  if (type === "ingresos") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (type === "postpro") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M2 11h20" stroke="currentColor" strokeWidth="1.6" />
        <path d="M7 7V3M17 7V3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M7 3l2 4M12 3l2 4M17 3l2 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    )
  }

  if (type === "referencias") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (type === "tasks") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (type === "history") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 4v4h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 19c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="17" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14.5 19c.4-1.8 1.8-3 3.5-3s3.1 1.2 3.5 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function roleBadgeStyle(role: string): React.CSSProperties {
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    admin: {
      bg: "rgba(124,58,237,0.16)",
      border: "rgba(167,139,250,0.24)",
      text: "#ddd6fe",
    },
    editor: {
      bg: "rgba(14,165,233,0.12)",
      border: "rgba(56,189,248,0.22)",
      text: "#bae6fd",
    },
    productor: {
      bg: "rgba(52,211,153,0.12)",
      border: "rgba(52,211,153,0.22)",
      text: "#6ee7b7",
    },
    viewer: {
      bg: "rgba(148,163,184,0.10)",
      border: "rgba(148,163,184,0.18)",
      text: "#cbd5e1",
    },
  }

  const palette = colors[role] || colors.viewer

  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 8px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 600,
    textTransform: "none",
    background: palette.bg,
    border: `1px solid ${palette.border}`,
    color: palette.text,
  }
}

const sidebarStyle: React.CSSProperties = {
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  padding: "16px 12px",
  background:
    "linear-gradient(180deg, rgba(10,14,26,0.98) 0%, rgba(6,9,18,0.98) 100%)",
  borderRight: "1px solid rgba(148,163,184,0.08)",
  boxShadow: "inset -1px 0 0 rgba(255,255,255,0.03)",
  backdropFilter: "blur(20px)",
  color: "#f8fafc",
}

const sidebarTopStyle: React.CSSProperties = {
  display: "grid",
  gap: 16,
}

const brandZoneStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  padding: "8px 6px 12px",
  borderBottom: "1px solid rgba(148,163,184,0.08)",
}

const searchWrapStyle: React.CSSProperties = {
  padding: "0 2px",
}

const navStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
}

const navItemStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 10px",
  borderRadius: 10,
  color: "#94a3b8",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: 500,
  transition: "background 0.15s ease, color 0.15s ease",
}

const activeNavItemStyle: React.CSSProperties = {
  background: "rgba(124,58,237,0.12)",
  color: "#f8fafc",
  boxShadow: "inset 0 0 0 1px rgba(167,139,250,0.12)",
}

const navIconWrapStyle = (active: boolean): React.CSSProperties => ({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: 8,
  color: active ? "#ddd6fe" : "#64748b",
  background: active ? "rgba(124,58,237,0.18)" : "rgba(255,255,255,0.03)",
  flexShrink: 0,
})

// Alarma roja de tareas vencidas — pequeño círculo en la esquina superior
// izquierda del ícono de "Mis Tareas".
const taskAlertDotStyle: React.CSSProperties = {
  position: "absolute",
  top: -2,
  left: -2,
  width: 9,
  height: 9,
  borderRadius: 999,
  background: "#ef4444",
  border: "1.5px solid #0a0e1a",
  boxShadow: "0 0 6px rgba(239,68,68,0.9)",
  animation: "pulse-alert 1.6s ease-in-out infinite",
}

const navLabelStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
}

const activeIndicatorStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: 999,
  background: "#a78bfa",
  boxShadow: "0 0 10px rgba(167,139,250,0.8)",
  flexShrink: 0,
}

const sidebarFooterStyle: React.CSSProperties = {
  paddingTop: 12,
  borderTop: "1px solid rgba(148,163,184,0.08)",
  display: "grid",
  gap: 8,
}

const profileCardStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 12,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(148,163,184,0.10)",
  display: "block",
  transition: "background 0.15s ease, border-color 0.15s ease",
}

const profileCardActiveStyle: React.CSSProperties = {
  background: "rgba(124,58,237,0.10)",
  border: "1px solid rgba(167,139,250,0.18)",
}

const profileRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
}

const avatarStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 10,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  background: "linear-gradient(135deg, rgba(124,58,237,0.35), rgba(14,165,233,0.22))",
  border: "1px solid rgba(167,139,250,0.20)",
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 700,
}

const profileMetaStyle: React.CSSProperties = {
  minWidth: 0,
  flex: 1,
}

const profileNameStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 600,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const profileFooterRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginTop: 10,
}

const profileLinkHintStyle: React.CSSProperties = {
  color: "#a78bfa",
  fontSize: 11,
  fontWeight: 600,
}

const logoutButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.14)",
  background: "transparent",
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
}

const hamburgerStyle: React.CSSProperties = {
  position: "fixed",
  top: 14,
  left: 14,
  zIndex: 10000,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 40,
  height: 40,
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 10,
  padding: 0,
  background: "rgba(10,14,26,0.92)",
  color: "#e2e8f0",
  cursor: "pointer",
  boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
  backdropFilter: "blur(12px)",
}

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.50)",
  backdropFilter: "blur(2px)",
  zIndex: 9998,
  border: "none",
  cursor: "pointer",
}
