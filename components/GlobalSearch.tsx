"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../lib/supabase"

type ClientResult = {
  kind: "client"
  id: string
  name: string
  projectCount: number
}

type ProjectResult = {
  kind: "project"
  id: string
  name: string
  clientName: string
  subfolderName: string
  responsable: string | null
}

type SearchResult = ClientResult | ProjectResult

export function GlobalSearch({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(0)

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Cmd/Ctrl+K shortcut ───────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
        setOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  // ── Search ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const q = query.trim()
    if (!q) {
      setResults([])
      setFocused(0)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const pattern = `%${q}%`

        const [
          { data: clients },
          { data: projects },
          { data: allProjects },
        ] = await Promise.all([
          supabase
            .from("clients")
            .select("id, name")
            .ilike("name", pattern)
            .limit(5),
          supabase
            .from("projects")
            .select("id, name, responsable, client_id, subfolder_id, clients(name), client_subfolders(name)")
            .ilike("name", pattern)
            .limit(8),
          // For client project counts we need the full list — only when clients match
          supabase
            .from("projects")
            .select("id, client_id")
            .in("client_id", (clients || []).map((c: any) => c.id)),
        ])

        const clientResults: ClientResult[] = (clients || []).map((c: any) => ({
          kind: "client" as const,
          id: c.id,
          name: c.name,
          projectCount: (allProjects || []).filter((p: any) => p.client_id === c.id).length,
        }))

        const projectResults: ProjectResult[] = (projects || []).map((p: any) => ({
          kind: "project" as const,
          id: p.id,
          name: p.name,
          clientName: (p.clients as any)?.name || "—",
          subfolderName: (p.client_subfolders as any)?.name || "—",
          responsable: p.responsable || null,
        }))

        setResults([...clientResults, ...projectResults])
        setFocused(0)
      } finally {
        setLoading(false)
      }
    }, 280)
  }, [query])

  // ── Keyboard navigation ───────────────────────────────────────────────────
  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setFocused((f) => (f + 1) % results.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setFocused((f) => (f - 1 + results.length) % results.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      navigate(results[focused])
    } else if (e.key === "Escape") {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  function navigate(result: SearchResult) {
    if (result.kind === "client") {
      router.push(`/proyectos?client=${result.id}`)
    } else {
      router.push(`/proyectos/${result.id}`)
    }
    setOpen(false)
    setQuery("")
    setResults([])
    onNavigate?.()
  }

  const clients = results.filter((r): r is ClientResult => r.kind === "client")
  const projects = results.filter((r): r is ProjectResult => r.kind === "project")
  const hasResults = results.length > 0

  // Global index for keyboard nav
  function globalIndex(result: SearchResult) {
    return results.indexOf(result)
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* ── Input ──────────────────────────────────────────────────────────── */}
      <div style={inputWrapStyle}>
        <span style={searchIconStyle}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="M16.5 16.5l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
        <input
          ref={inputRef}
          type="text"
          placeholder="Buscar… ⌘K"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          style={inputStyle}
          aria-label="Buscar clientes y proyectos"
          autoComplete="off"
        />
        {loading && <span style={spinnerStyle}>⟳</span>}
        {query && !loading && (
          <button
            style={clearBtnStyle}
            onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus() }}
            aria-label="Limpiar"
          >
            ×
          </button>
        )}
      </div>

      {/* ── Dropdown ───────────────────────────────────────────────────────── */}
      {open && query.trim() && (
        <div style={dropdownStyle}>
          {!hasResults && !loading && (
            <p style={emptyStyle}>Sin resultados para "{query}"</p>
          )}

          {clients.length > 0 && (
            <div>
              <p style={groupLabelStyle}>Clientes</p>
              {clients.map((r) => {
                const idx = globalIndex(r)
                return (
                  <button
                    key={r.id}
                    style={{ ...resultRowStyle, ...(focused === idx ? resultRowFocusStyle : {}) }}
                    onMouseEnter={() => setFocused(idx)}
                    onClick={() => navigate(r)}
                  >
                    <span style={resultIconStyle("client")}>
                      <ClientIcon />
                    </span>
                    <div style={resultBodyStyle}>
                      <span style={resultNameStyle}>{r.name}</span>
                      <span style={resultMetaStyle}>
                        {r.projectCount} proyecto{r.projectCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span style={resultArrowStyle}>→</span>
                  </button>
                )
              })}
            </div>
          )}

          {projects.length > 0 && (
            <div style={clients.length > 0 ? { marginTop: 4 } : {}}>
              <p style={groupLabelStyle}>Proyectos</p>
              {projects.map((r) => {
                const idx = globalIndex(r)
                return (
                  <button
                    key={r.id}
                    style={{ ...resultRowStyle, ...(focused === idx ? resultRowFocusStyle : {}) }}
                    onMouseEnter={() => setFocused(idx)}
                    onClick={() => navigate(r)}
                  >
                    <span style={resultIconStyle("project")}>
                      <ProjectIcon />
                    </span>
                    <div style={resultBodyStyle}>
                      <span style={resultNameStyle}>{r.name}</span>
                      <span style={resultMetaStyle}>
                        {r.clientName}
                        {r.subfolderName !== "—" ? ` · ${r.subfolderName}` : ""}
                        {r.responsable ? ` · ${r.responsable}` : ""}
                      </span>
                    </div>
                    <span style={resultArrowStyle}>→</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ClientIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V7.5Z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
        fill="rgba(245,158,11,0.18)"
      />
    </svg>
  )
}

function ProjectIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 4h8l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3Z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
      />
      <path d="M16 4v4h4M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputWrapStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
}

const searchIconStyle: React.CSSProperties = {
  position: "absolute",
  left: 9,
  color: "#475569",
  display: "inline-flex",
  pointerEvents: "none",
  flexShrink: 0,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 28px 7px 28px",
  borderRadius: 9,
  border: "1px solid rgba(148,163,184,0.14)",
  background: "rgba(255,255,255,0.04)",
  color: "#f8fafc",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
}

const spinnerStyle: React.CSSProperties = {
  position: "absolute",
  right: 9,
  color: "#475569",
  fontSize: 13,
  animation: "spin 1s linear infinite",
  pointerEvents: "none",
}

const clearBtnStyle: React.CSSProperties = {
  position: "absolute",
  right: 7,
  background: "none",
  border: "none",
  color: "#475569",
  fontSize: 16,
  cursor: "pointer",
  lineHeight: 1,
  padding: "0 2px",
}

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  right: 0,
  // Bleed to the right so it's wide enough when sidebar is narrow
  minWidth: 280,
  background: "linear-gradient(160deg, rgba(13,20,38,0.99), rgba(8,12,24,0.99))",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 12,
  boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
  backdropFilter: "blur(20px)",
  zIndex: 99999,
  overflow: "hidden",
  padding: "8px 0",
}

const groupLabelStyle: React.CSSProperties = {
  margin: 0,
  padding: "4px 12px 4px",
  color: "#475569",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.7,
}

const resultRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "8px 12px",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  color: "inherit",
  transition: "background 0.1s ease",
}

const resultRowFocusStyle: React.CSSProperties = {
  background: "rgba(124,58,237,0.18)",
}

function resultIconStyle(kind: "client" | "project"): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 7,
    flexShrink: 0,
    color: kind === "client" ? "#fbbf24" : "#93c5fd",
    background: kind === "client" ? "rgba(245,158,11,0.12)" : "rgba(59,130,246,0.12)",
    border: `1px solid ${kind === "client" ? "rgba(251,191,36,0.18)" : "rgba(96,165,250,0.18)"}`,
  }
}

const resultBodyStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "grid",
  gap: 1,
}

const resultNameStyle: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 600,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const resultMetaStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 11,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const resultArrowStyle: React.CSSProperties = {
  color: "#334155",
  fontSize: 13,
  flexShrink: 0,
}

const emptyStyle: React.CSSProperties = {
  margin: 0,
  padding: "14px 12px",
  color: "#475569",
  fontSize: 12,
  textAlign: "center",
}
