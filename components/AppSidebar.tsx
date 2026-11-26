"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { GlobalSearch } from "./GlobalSearch"
import { supabase } from "../lib/supabase"
import { esAprobadorVacaciones } from "../lib/vacaciones"

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

type NavIconType = "calendar" | "dashboard" | "inventory" | "quotes" | "projects" | "suppliers" | "ingresos" | "finanzas" | "flujo" | "employees" | "users" | "postpro" | "diseno" | "tasks" | "workspace" | "referencias" | "history" | "vacaciones"

const ROLE_LABELS: Record<string, string> = {
  admin:     "Admin",
  editor:    "Editor",
  productor: "Editor Post",
  viewer:    "Viewer",
}
const roleLabel = (r: string) => ROLE_LABELS[r] ?? r

// roles: null/undefined = visible para todos; array = visible solo para esos roles
// aprobadorVacaciones: se muestra solo a quienes resuelven solicitudes (por correo)
// group: sección del menú lateral (sin grupo = arriba, antes de las secciones)
export const navItems: { href: string; label: string; icon: NavIconType; roles?: string[]; aprobadorVacaciones?: boolean; group?: string }[] = [
  { href: "/",            label: "Calendario",   icon: "calendar"   },
  { href: "/workspace",   label: "Escritorio",   icon: "workspace"  },
  { href: "/tasks",       label: "Mis tareas",   icon: "tasks" },
  { href: "/proyectos",   label: "Proyectos",    icon: "projects",   group: "Producción", roles: ["admin", "editor", "editor_premium", "productor", "finanzas"] },
  { href: "/postproduccion", label: "Post producción", icon: "postpro", group: "Producción", roles: ["admin", "editor", "editor_premium", "productor", "viewer"] },
  { href: "/diseno",      label: "Diseño",       icon: "diseno",     group: "Producción", roles: ["admin", "editor", "editor_premium", "productor", "viewer"] },
  { href: "/resources",   label: "Inventario",   icon: "inventory",  group: "Producción", roles: ["admin", "editor", "editor_premium", "viewer"] },
  { href: "/referencias", label: "Referencias",  icon: "referencias", group: "Producción" },
  { href: "/cotizaciones",label: "Cotizaciones", icon: "quotes",     group: "Comercial", roles: ["admin", "editor", "editor_premium"] },
  { href: "/proveedores", label: "Proveedores",  icon: "suppliers",  group: "Comercial", roles: ["admin", "editor", "editor_premium", "finanzas"] },
  { href: "/ingresos",    label: "Ingresos",     icon: "ingresos",   group: "Finanzas", roles: ["admin", "finanzas"] },
  { href: "/finanzas",    label: "Finanzas",     icon: "finanzas",   group: "Finanzas", roles: ["admin", "finanzas"] },
  { href: "/flujo",       label: "Flujo de caja", icon: "flujo",     group: "Finanzas", roles: ["admin", "finanzas"] },
  { href: "/dashboard",   label: "Dashboard crew", icon: "dashboard", group: "Equipo", roles: ["admin", "editor", "editor_premium", "productor", "viewer", "finanzas"] },
  { href: "/empleados",   label: "Empleados",    icon: "employees",  group: "Equipo", roles: ["admin", "editor_premium"] },
  { href: "/solicitudes-vacaciones", label: "Vacaciones", icon: "vacaciones", group: "Equipo", aprobadorVacaciones: true },
  { href: "/users",       label: "Usuarios",     icon: "users",      group: "Equipo", roles: ["admin", "editor_premium"] },
  { href: "/actividad",   label: "Historial",    icon: "history",    group: "Equipo", roles: ["admin"] },
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

  // Solicitudes de vacaciones sin resolver → alarma junto al módulo.
  // Solo los aprobadores reciben filas por RLS, así que el conteo sale 0 al resto.
  const [pendingVacaciones, setPendingVacaciones] = useState(0)
  useEffect(() => {
    let cancel = false
    ;(async () => {
      if (!esAprobadorVacaciones(profile?.email || user?.email)) return
      const { count } = await supabase
        .from("vacation_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pendiente")
      if (!cancel) setPendingVacaciones(count || 0)
    })()
    return () => { cancel = true }
  }, [pathname, profile?.email, user?.email])

  const email = profile?.email || user?.email || "..."
  const displayName = profile?.full_name || email.split("@")[0] || "Usuario"
  const role = profile?.role || "viewer"
  const initial = displayName.charAt(0).toUpperCase()
  const mustChangePassword = !!profile?.must_change_password
  const puedeAprobarVacaciones = esAprobadorVacaciones(email)
  const visibleNavItems = mustChangePassword
    ? []
    : navItems.filter((item) => {
        if (item.aprobadorVacaciones) return puedeAprobarVacaciones
        return !item.roles || item.roles.includes(role)
      })

  const navGroups: { group?: string; items: typeof visibleNavItems }[] = []
  for (const item of visibleNavItems) {
    const last = navGroups[navGroups.length - 1]
    if (last && last.group === item.group) last.items.push(item)
    else navGroups.push({ group: item.group, items: [item] })
  }

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
                width={96}
                height={35}
                style={{ objectFit: "contain", height: "auto" }}
                priority
              />
            </Link>
          </div>

          {!mustChangePassword && (
            <div style={searchWrapStyle}>
              <GlobalSearch tone="dark" onNavigate={() => isMobile && onMenuClose()} />
            </div>
          )}

          <nav style={navStyle}>
            {navGroups.map(({ group, items }) => (
              <div key={group || "_top"} style={navGroupStyle}>
                {group && <p style={navGroupHeadStyle}>{group}</p>}
                {items.map((item) => {
                  const active = isActive(item.href)
                  const count =
                    item.href === "/tasks" ? overdueTasks :
                    item.href === "/solicitudes-vacaciones" ? pendingVacaciones : 0
                  const countTitle =
                    item.href === "/tasks"
                      ? `${count} tarea${count !== 1 ? "s" : ""} vencida${count !== 1 ? "s" : ""}`
                      : `${count} solicitud${count !== 1 ? "es" : ""} de vacaciones sin responder`
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => isMobile && onMenuClose()}
                      aria-current={active ? "page" : undefined}
                      style={{
                        ...navItemStyle,
                        ...(active ? activeNavItemStyle : {}),
                      }}
                    >
                      <span style={navIconWrapStyle(active)}>
                        <NavIcon type={item.icon} />
                      </span>
                      <span style={navLabelStyle}>{item.label}</span>
                      {count > 0 && (
                        <span style={countBadgeStyle} title={countTitle} aria-label={countTitle}>
                          {count}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            ))}
          </nav>
        </div>

        <div style={sidebarFooterStyle}>
          <Link
            href="/perfil"
            onClick={() => isMobile && onMenuClose()}
            aria-label="Mi perfil"
            style={{
              ...profileLinkStyle,
              ...(pathname === "/perfil" ? profileLinkActiveStyle : {}),
            }}
          >
            <span style={avatarStyle}>{initial}</span>
            <span style={profileMetaStyle}>
              <span style={profileNameStyle}>{displayName}</span>
              <span style={profileRoleStyle}>{roleLabel(role)}</span>
            </span>
          </Link>
          <button onClick={onLogout} style={logoutButtonStyle} aria-label="Salir" title="Salir">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M14 4.5h4.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H14M10 16l4-4-4-4M14 12H4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
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

  if (type === "finanzas") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M5 20V11M10 20V5M15 20v-7M20 20V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )
  }

  if (type === "flujo") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M3 15c3 0 3-6 6-6s3 6 6 6 3-6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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

  // Herramienta de pluma (curva bézier con sus nodos): lee como diseño y no se
  // confunde con la tira de película de postproducción.
  if (type === "diseno") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 17c5.5 0 10.5-10 16-10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <rect x="2" y="15" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.6" />
        <rect x="18" y="5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.6" />
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

  if (type === "vacaciones") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M3 11a9 9 0 0 1 18 0Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12 2v9M12 11l2 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 20c1.5-1.2 3-1.2 4.5 0S10.5 21.2 12 20s3-1.2 4.5 0 3 1.2 4.5 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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

// ── Barra grafito ─────────────────────────────────────────────────────────
// Fondo grafito, opción activa en blanco, contadores en píldora roja y el
// avatar en lima (el único acento de color de la barra).

const sidebarStyle: React.CSSProperties = {
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  padding: "20px 12px 12px",
  background: "#18181A",
  color: "#D6D6D6",
}

const sidebarTopStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
}

const brandZoneStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  padding: "2px 10px 4px",
}

const searchWrapStyle: React.CSSProperties = {
  padding: 0,
}

const navStyle: React.CSSProperties = {
  display: "grid",
  gap: 12,
}

const navGroupStyle: React.CSSProperties = {
  display: "grid",
  gap: 1,
}

const navGroupHeadStyle: React.CSSProperties = {
  margin: 0,
  padding: "0 10px 4px",
  fontSize: 12,
  fontWeight: 500,
  color: "#7C7C80",
}

const navItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  height: 32,
  padding: "0 10px",
  borderRadius: 7,
  color: "#D6D6D6",
  textDecoration: "none",
  fontSize: 13.5,
  fontWeight: 450,
  transition: "background 0.15s ease, color 0.15s ease",
}

const activeNavItemStyle: React.CSSProperties = {
  background: "#FFFFFF",
  color: "#131313",
  fontWeight: 600,
}

const navIconWrapStyle = (active: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 16,
  height: 16,
  color: active ? "#131313" : "#8E8E93",
  flexShrink: 0,
})

const navLabelStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

// Tareas vencidas o solicitudes pendientes: píldora roja con el número
const countBadgeStyle: React.CSSProperties = {
  marginLeft: "auto",
  minWidth: 20,
  height: 18,
  padding: "0 6px",
  borderRadius: 9,
  background: "#E5533D",
  color: "#FFFFFF",
  fontSize: 11.5,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontVariantNumeric: "tabular-nums",
}

const sidebarFooterStyle: React.CSSProperties = {
  marginTop: 16,
  paddingTop: 12,
  borderTop: "1px solid #2E2E31",
  display: "flex",
  alignItems: "center",
  gap: 6,
}

const profileLinkStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 8px",
  borderRadius: 8,
  textDecoration: "none",
  color: "inherit",
}

const profileLinkActiveStyle: React.CSSProperties = {
  background: "#242427",
}

const avatarStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: "50%",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  background: "#CDF46A",
  color: "#131313",
  fontSize: 13,
  fontWeight: 700,
}

const profileMetaStyle: React.CSSProperties = {
  minWidth: 0,
  flex: 1,
  display: "grid",
}

const profileNameStyle: React.CSSProperties = {
  color: "#FFFFFF",
  fontSize: 13.5,
  fontWeight: 600,
  lineHeight: 1.25,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const profileRoleStyle: React.CSSProperties = {
  color: "#8E8E93",
  fontSize: 12,
  lineHeight: 1.25,
}

const logoutButtonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 7,
  border: "none",
  background: "transparent",
  color: "#8E8E93",
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
  border: "none",
  borderRadius: 10,
  padding: 0,
  background: "#18181A",
  color: "#FFFFFF",
  cursor: "pointer",
  boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
}

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17,17,17,0.32)",
  zIndex: 9998,
  border: "none",
  cursor: "pointer",
}
