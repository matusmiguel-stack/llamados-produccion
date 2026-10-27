import type React from "react"

// Etiqueta de proveedor / empleado para tablas. Los nombres "Empresa — Persona"
// se parten en dos renglones (empresa arriba, persona abajo) y cada renglón se
// recorta con "…" en vez de romper palabras; el nombre completo va en el title.
export function ContactChip({
  label,
  icon,
  color,
  style,
}: {
  label: string
  icon: string
  color: string        // hex, p. ej. "#a78bfa"
  style?: React.CSSProperties
}) {
  const [principal, secundario] = splitLabel(label)
  const linea: React.CSSProperties = { display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
  return (
    <span
      title={label}
      style={{
        display: "inline-flex", alignItems: secundario ? "flex-start" : "center", gap: 6,
        padding: secundario ? "5px 10px" : "3px 10px",
        borderRadius: secundario ? 10 : 999,
        maxWidth: "100%", minWidth: 0, boxSizing: "border-box", verticalAlign: "middle",
        color, background: `${color}1a`, border: `1px solid ${color}38`,
        ...style,
      }}
    >
      <span style={{ fontSize: 11, lineHeight: secundario ? "16px" : undefined, flexShrink: 0 }}>{icon}</span>
      <span style={{ display: "grid", minWidth: 0, lineHeight: 1.3 }}>
        <span style={{ ...linea, fontSize: 12, fontWeight: 700 }}>{principal}</span>
        {secundario && <span style={{ ...linea, fontSize: 11, fontWeight: 500, opacity: 0.75 }}>{secundario}</span>}
      </span>
    </span>
  )
}

function splitLabel(label: string): [string, string | null] {
  const i = label.indexOf(" — ")
  if (i < 0) return [label, null]
  return [label.slice(0, i), label.slice(i + 3) || null]
}
