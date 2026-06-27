"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { supabase } from "../../lib/supabase"
import { requireSessionProfile } from "../../lib/session-profile"
import { navItems, NavIcon } from "../../components/AppSidebar"

// Una pestaña: `src` es la URL con la que se monta el iframe (NO se vuelve a
// tocar para no recargarlo); `title` se recalcula al navegar dentro del iframe.
type Tab = { id: string; src: string; title: string }

const LABELS: { test: (p: string) => boolean; label: string }[] = [
  { test: (p) => p === "/", label: "Calendario" },
  { test: (p) => p.startsWith("/cotizaciones"), label: "Cotización" },
  { test: (p) => p.startsWith("/proyectos"), label: "Proyecto" },
  { test: (p) => p.startsWith("/dashboard"), label: "Dashboard" },
  { test: (p) => p.startsWith("/ingresos"), label: "Ingresos" },
  { test: (p) => p.startsWith("/finanzas"), label: "Finanzas" },
  { test: (p) => p.startsWith("/proveedores"), label: "Proveedores" },
  { test: (p) => p.startsWith("/resources"), label: "Inventario" },
  { test: (p) => p.startsWith("/postproduccion"), label: "Post Producción" },
  { test: (p) => p.startsWith("/empleados"), label: "Empleados" },
  { test: (p) => p.startsWith("/users"), label: "Usuarios" },
  { test: (p) => p.startsWith("/tasks"), label: "Mis Tareas" },
  { test: (p) => p.startsWith("/perfil"), label: "Mi perfil" },
  { test: (p) => p.startsWith("/login"), label: "Acceso" },
]

function labelFor(url: string): string {
  let path = url
  try { path = new URL(url, window.location.origin).pathname } catch {}
  return LABELS.find((l) => l.test(path))?.label ?? "Vista"
}

const uid = () => Math.random().toString(36).slice(2, 9)
const homeTab = (): Tab => ({ id: uid(), src: "/", title: "Calendario" })

export default function WorkspacePage() {
  const [profile, setProfile] = useState<any>(null)
  const [ready, setReady] = useState(false)
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<string>("")
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({})
  const locRef = useRef<Record<string, string>>({}) // ubicación actual real de cada iframe (para persistir)

  // ── Auth + restaurar pestañas ──────────────────────────────────────────────
  useEffect(() => {
    let mounted = true
    requireSessionProfile().then((auth) => {
      if (!mounted) return
      if (!auth) { window.location.href = "/login"; return }
      setProfile(auth.profile)

      let restored: Tab[] = []
      let restoredActive = ""
      try {
        const raw = localStorage.getItem("workspace_tabs")
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed.tabs) && parsed.tabs.length) {
            restored = parsed.tabs
              .filter((t: any) => t && typeof t.src === "string")
              .map((t: any) => ({ id: uid(), src: t.src, title: labelFor(t.src) }))
            restoredActive = restored[0]?.id || ""
          }
        }
      } catch { /* ignore */ }

      if (!restored.length) { const t = homeTab(); restored = [t]; restoredActive = t.id }
      setTabs(restored)
      setActiveId(restoredActive)
      setReady(true)
    })
    return () => { mounted = false }
  }, [])

  // ── Persistir (guarda la ubicación REAL de cada iframe, no la inicial) ──────
  useEffect(() => {
    if (!ready) return
    try {
      const toSave = tabs.map((t) => ({ src: locRef.current[t.id] || t.src }))
      localStorage.setItem("workspace_tabs", JSON.stringify({ tabs: toSave }))
    } catch { /* ignore */ }
  }, [tabs, activeId, ready])

  function openTab(src: string) {
    const t: Tab = { id: uid(), src, title: labelFor(src) }
    setTabs((prev) => [...prev, t])
    setActiveId(t.id)
  }

  function closeTab(id: string) {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id)
      const next = prev.filter((t) => t.id !== id)
      if (next.length === 0) {
        const t = homeTab()
        setActiveId(t.id)
        return [t]
      }
      if (id === activeId) setActiveId(next[Math.max(0, idx - 1)].id)
      return next
    })
    delete iframeRefs.current[id]
    delete locRef.current[id]
  }

  function onIframeLoad(id: string) {
    const iframe = iframeRefs.current[id]
    if (!iframe) return
    try {
      const win = iframe.contentWindow
      if (!win) return
      const path = win.location.pathname
      locRef.current[id] = path + win.location.search
      const title = labelFor(path)
      setTabs((prev) => prev.map((t) => (t.id === id && t.title !== title ? { ...t, title } : t)))
    } catch { /* cross-origin no debería pasar (mismo origen) */ }
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  if (!ready) return <div style={{ minHeight: "100vh", background: "#05070d" }} />

  const role = profile?.role || "viewer"
  const wsNav = navItems.filter((it) => it.href !== "/workspace" && (!it.roles || it.roles.includes(role)))

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#05070d" }}>
      {/* ── Sidebar (compartido) ── */}
      <aside style={sidebarStyle}>
        <div style={{ padding: "4px 8px 14px" }}>
          <Image src="/logo-retro.png" alt="Retro" width={116} height={42} style={{ objectFit: "contain", height: "auto" }} priority />
        </div>

        <nav style={{ display: "grid", gap: 2, overflowY: "auto", flex: 1, alignContent: "start" }}>
          {wsNav.map((it) => (
            <button key={it.href} onClick={() => openTab(it.href)} style={navBtnStyle} title={`Abrir ${it.label} en una pestaña`}>
              <span style={{ display: "inline-flex", color: "#94a3b8" }}><NavIcon type={it.icon} /></span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
            </button>
          ))}
        </nav>

        <div style={{ borderTop: "1px solid rgba(148,163,184,0.10)", paddingTop: 10, marginTop: 8, display: "grid", gap: 4 }}>
          <button onClick={() => openTab("/perfil")} style={navBtnStyle}>
            <span style={{ display: "inline-flex", color: "#94a3b8" }}><NavIcon type="tasks" /></span>
            <span>Mi perfil</span>
          </button>
          <button onClick={logout} style={{ ...navBtnStyle, color: "#f87171" }}>Salir</button>
          <Link href="/" style={{ padding: "7px 10px", borderRadius: 8, color: "#64748b", fontSize: 11, textDecoration: "none" }}>
            ← Vista normal (sin pestañas)
          </Link>
        </div>
      </aside>

      {/* ── Main: barra de pestañas + iframes ── */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={tabBarStyle}>
          {tabs.map((t) => {
            const active = t.id === activeId
            return (
              <div
                key={t.id}
                onClick={() => setActiveId(t.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 10px 8px 13px",
                  borderRadius: "9px 9px 0 0", cursor: "pointer", whiteSpace: "nowrap",
                  maxWidth: 220, flexShrink: 0,
                  background: active ? "#05070d" : "transparent",
                  borderTop: active ? "2px solid #7c3aed" : "2px solid transparent",
                  borderLeft: active ? "1px solid rgba(148,163,184,0.12)" : "1px solid transparent",
                  borderRight: active ? "1px solid rgba(148,163,184,0.12)" : "1px solid transparent",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", color: active ? "#f1f5f9" : "#94a3b8", fontSize: 13, fontWeight: active ? 600 : 400 }}>
                  {t.title}
                </span>
                <span
                  onClick={(e) => { e.stopPropagation(); closeTab(t.id) }}
                  title="Cerrar pestaña"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 5, color: "#64748b", fontSize: 14, lineHeight: 1 }}
                >×</span>
              </div>
            )
          })}
          <button onClick={() => openTab("/")} title="Nueva pestaña" style={newTabBtnStyle}>+</button>
        </div>

        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          {tabs.map((t) => (
            <iframe
              key={t.id}
              ref={(el) => { iframeRefs.current[t.id] = el }}
              src={t.src}
              onLoad={() => onIframeLoad(t.id)}
              title={t.title}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", background: "#05070d", display: t.id === activeId ? "block" : "none" }}
            />
          ))}
        </div>
      </main>
    </div>
  )
}

const sidebarStyle: React.CSSProperties = {
  width: 208, flexShrink: 0, background: "#080a16",
  borderRight: "1px solid rgba(148,163,184,0.10)",
  display: "flex", flexDirection: "column", padding: "14px 10px",
}

const navBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
  borderRadius: 8, border: "none", background: "transparent",
  color: "#cbd5e1", fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left", width: "100%",
}

const tabBarStyle: React.CSSProperties = {
  display: "flex", alignItems: "stretch", gap: 4, padding: "7px 8px 0",
  background: "#0b0e1c", borderBottom: "1px solid rgba(148,163,184,0.12)",
  overflowX: "auto", flexShrink: 0,
}

const newTabBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 30, flexShrink: 0, margin: "2px 2px 4px", borderRadius: 7,
  border: "none", background: "transparent", color: "#94a3b8", fontSize: 18, cursor: "pointer",
}
