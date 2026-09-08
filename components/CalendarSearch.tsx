"use client"

import { useMemo, useState } from "react"

export type CalendarSearchItem = {
  id: string
  title: string
  subtitle?: string
  date: string // YYYY-MM-DD
}

const normalizar = (s: string) =>
  (s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")

function formatearFecha(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
}

// Buscador genérico para los calendarios (producción, postproducción, diseño):
// recibe la lista completa de eventos ya aplanados y, al elegir uno, avisa la
// fecha para que la página lo lleve ahí. No filtra por lo que esté visible en
// pantalla — busca en todo, sea cual sea el mes o los filtros activos.
export function CalendarSearch({
  items,
  onSelect,
  placeholder = "Buscar…",
}: {
  items: CalendarSearchItem[]
  onSelect: (item: CalendarSearchItem) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)

  const results = useMemo(() => {
    const q = normalizar(query)
    if (!q) return []
    return items
      .filter((it) => normalizar(it.title).includes(q) || normalizar(it.subtitle || "").includes(q))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 30)
  }, [items, query])

  return (
    <div style={{ position: "relative", flex: "1 1 220px", minWidth: 160 }}>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        aria-label="Buscar en el calendario"
        style={{
          width: "100%",
          padding: "6px 10px",
          borderRadius: 8,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(148,163,184,0.2)",
          color: "#f8fafc",
          fontSize: 12,
        }}
      />
      {open && query.trim() && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 40,
            maxHeight: 320,
            overflowY: "auto",
            background: "#0b1220",
            border: "1px solid rgba(148,163,184,0.2)",
            borderRadius: 10,
            boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
          }}
        >
          {results.length === 0 ? (
            <div style={{ padding: "10px 12px", color: "#64748b", fontSize: 12 }}>Sin resultados</div>
          ) : (
            results.map((it) => (
              <button
                key={it.id}
                // onMouseDown antes que el blur del input, si no el dropdown se
                // cierra antes de que el click llegue a registrarse
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onSelect(it); setQuery(""); setOpen(false) }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid rgba(148,163,184,0.08)",
                  cursor: "pointer",
                }}
              >
                <div style={{ color: "#f8fafc", fontSize: 13, fontWeight: 600 }}>{it.title}</div>
                <div style={{ color: "#7d8ca3", fontSize: 11, marginTop: 2 }}>
                  {formatearFecha(it.date)}
                  {it.subtitle ? ` · ${it.subtitle}` : ""}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
