"use client"

import { useMemo, useState } from "react"
import {
  agruparDiasEnRangos,
  contarDiasHabiles,
  describirRango,
  isWeekend,
} from "../lib/vacaciones"

const DOW = ["L", "M", "M", "J", "V", "S", "D"]
const MESES_LARGOS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function todayISO() {
  return toISO(new Date())
}

/** Celdas del mes empezando en lunes (null = relleno antes del día 1). */
function celdasDelMes(year: number, month: number): (string | null)[] {
  const primero = new Date(year, month, 1)
  const offset = (primero.getDay() + 6) % 7 // lunes = 0
  const diasEnMes = new Date(year, month + 1, 0).getDate()

  const celdas: (string | null)[] = Array(offset).fill(null)
  for (let d = 1; d <= diasEnMes; d++) celdas.push(toISO(new Date(year, month, d)))
  while (celdas.length % 7 !== 0) celdas.push(null)
  return celdas
}

/** Todos los días hábiles entre dos fechas (inclusive), sin importar el orden. */
function habilesEntre(a: string, b: string): string[] {
  const [desde, hasta] = a <= b ? [a, b] : [b, a]
  const out: string[] = []
  const d = new Date(`${desde}T12:00:00`)
  const fin = new Date(`${hasta}T12:00:00`)
  while (d <= fin) {
    const iso = toISO(d)
    if (!isWeekend(iso)) out.push(iso)
    d.setDate(d.getDate() + 1)
  }
  return out
}

type Props = {
  /** Días ya bloqueados o en espera: no se pueden volver a pedir */
  ocupados: Record<string, "aprobada" | "pendiente">
  disponibles: number
  saving: boolean
  onCancel: () => void
  onSubmit: (dias: string[], nota: string) => void
}

export function VacacionesPicker({ ocupados, disponibles, saving, onCancel, onSubmit }: Props) {
  const hoy = todayISO()
  const inicio = new Date()

  const [year, setYear] = useState(inicio.getFullYear())
  const [month, setMonth] = useState(inicio.getMonth())
  const [modo, setModo] = useState<"sueltos" | "corridos">("sueltos")
  const [anclaCorridos, setAnclaCorridos] = useState<string | null>(null)
  const [seleccion, setSeleccion] = useState<string[]>([])
  const [nota, setNota] = useState("")

  const celdas = useMemo(() => celdasDelMes(year, month), [year, month])
  const seleccionados = useMemo(() => new Set(seleccion), [seleccion])
  const rangos = useMemo(() => agruparDiasEnRangos(seleccion), [seleccion])
  const totalDias = contarDiasHabiles(seleccion)
  const excedido = totalDias > disponibles

  function moverMes(delta: number) {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  function estadoDia(iso: string) {
    if (iso < hoy) return "pasado"
    if (isWeekend(iso)) return "finde"
    if (ocupados[iso]) return ocupados[iso]
    return "libre"
  }

  function clickDia(iso: string) {
    if (estadoDia(iso) !== "libre") return

    if (modo === "sueltos") {
      setSeleccion((prev) =>
        prev.includes(iso) ? prev.filter((d) => d !== iso) : [...prev, iso].sort(),
      )
      return
    }

    // Días corridos: primer clic marca el inicio, segundo cierra el bloque
    if (!anclaCorridos) {
      setAnclaCorridos(iso)
      return
    }
    const bloque = habilesEntre(anclaCorridos, iso).filter((d) => estadoDia(d) === "libre")
    setSeleccion((prev) => Array.from(new Set([...prev, ...bloque])).sort())
    setAnclaCorridos(null)
  }

  function limpiar() {
    setSeleccion([])
    setAnclaCorridos(null)
  }

  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div style={modalStyle}>
        <div style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>Vacaciones</p>
            <h2 style={titleStyle}>Solicitar vacaciones</h2>
          </div>
          <button onClick={onCancel} style={closeButtonStyle} aria-label="Cerrar">✕</button>
        </div>

        <div style={bodyStyle}>
          <div style={modoRowStyle}>
            <button
              onClick={() => { setModo("sueltos"); setAnclaCorridos(null) }}
              style={{ ...modoButtonStyle, ...(modo === "sueltos" ? modoActivoStyle : {}) }}
            >
              Días sueltos
            </button>
            <button
              onClick={() => setModo("corridos")}
              style={{ ...modoButtonStyle, ...(modo === "corridos" ? modoActivoStyle : {}) }}
            >
              Días corridos
            </button>
            <span style={modoHintStyle}>
              {modo === "sueltos"
                ? "Toca cada día que quieras"
                : anclaCorridos
                  ? "Ahora toca el último día del bloque"
                  : "Toca el primer día del bloque"}
            </span>
          </div>

          <div style={mesNavStyle}>
            <button onClick={() => moverMes(-1)} style={navButtonStyle} aria-label="Mes anterior">‹</button>
            <span style={mesLabelStyle}>{MESES_LARGOS[month]} {year}</span>
            <button onClick={() => moverMes(1)} style={navButtonStyle} aria-label="Mes siguiente">›</button>
          </div>

          <div style={gridStyle}>
            {DOW.map((d, i) => (
              <span key={`dow-${i}`} style={dowStyle}>{d}</span>
            ))}
            {celdas.map((iso, i) => {
              if (!iso) return <span key={`gap-${i}`} />
              const estado = estadoDia(iso)
              const activo = seleccionados.has(iso)
              const esAncla = anclaCorridos === iso
              return (
                <button
                  key={iso}
                  onClick={() => clickDia(iso)}
                  disabled={estado !== "libre"}
                  title={
                    estado === "aprobada" ? "Ya tienes vacaciones aprobadas este día"
                      : estado === "pendiente" ? "Ya lo pediste en otra solicitud"
                      : estado === "finde" ? "Fin de semana"
                      : undefined
                  }
                  style={{
                    ...diaStyle,
                    ...(estado === "pasado" || estado === "finde" ? diaInactivoStyle : {}),
                    ...(estado === "aprobada" ? diaAprobadoStyle : {}),
                    ...(estado === "pendiente" ? diaPendienteStyle : {}),
                    ...(activo ? diaActivoStyle : {}),
                    ...(esAncla ? diaAnclaStyle : {}),
                  }}
                >
                  {Number(iso.slice(8, 10))}
                </button>
              )
            })}
          </div>

          <div style={leyendaStyle}>
            <Leyenda color="#7c3aed" texto="Seleccionado" />
            <Leyenda color="rgba(52,211,153,0.45)" texto="Ya aprobado" />
            <Leyenda color="rgba(234,179,8,0.45)" texto="En espera" />
          </div>

          <div style={resumenStyle}>
            <div>
              <span style={resumenNumStyle}>{totalDias}</span>
              <span style={resumenLabelStyle}> día{totalDias !== 1 ? "s" : ""} seleccionado{totalDias !== 1 ? "s" : ""}</span>
            </div>
            <span style={{ ...resumenSaldoStyle, color: excedido ? "#f87171" : "#7d8ca3" }}>
              {excedido
                ? `Te pasas por ${totalDias - disponibles} día${totalDias - disponibles !== 1 ? "s" : ""}`
                : `Te quedarían ${disponibles - totalDias}`}
            </span>
            {seleccion.length > 0 && (
              <button onClick={limpiar} style={limpiarButtonStyle}>Limpiar</button>
            )}
          </div>

          {rangos.length > 0 && (
            <div style={chipsStyle}>
              {rangos.map((r) => (
                <span key={r.start_date} style={chipStyle}>
                  {describirRango(r.start_date, r.end_date)}
                </span>
              ))}
            </div>
          )}

          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Nota para quien aprueba (opcional)</span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Ej. viaje familiar, ya dejé cubiertos mis pendientes"
              style={textareaStyle}
            />
          </label>
        </div>

        <div style={footerStyle}>
          <button onClick={onCancel} style={secondaryButtonStyle}>Cancelar</button>
          <button
            onClick={() => onSubmit(seleccion, nota)}
            disabled={saving || seleccion.length === 0 || excedido}
            style={{
              ...primaryButtonStyle,
              opacity: saving || seleccion.length === 0 || excedido ? 0.5 : 1,
              cursor: saving || seleccion.length === 0 || excedido ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Enviando..." : "Solicitar vacaciones"}
          </button>
        </div>
      </div>
    </div>
  )
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <span style={leyendaItemStyle}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block" }} />
      {texto}
    </span>
  )
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2,6,23,0.72)",
  backdropFilter: "blur(4px)",
  zIndex: 10001,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  overflowY: "auto",
}

const modalStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  maxHeight: "92vh",
  display: "flex",
  flexDirection: "column",
  background: "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(8,12,24,0.98))",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 18,
  boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
  color: "#f8fafc",
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "18px 20px 14px",
  borderBottom: "1px solid rgba(148,163,184,0.10)",
}

const eyebrowStyle: React.CSSProperties = {
  margin: 0, color: "#a78bfa", fontSize: 10, textTransform: "uppercase",
  letterSpacing: 1.2, fontWeight: 700,
}

const titleStyle: React.CSSProperties = {
  margin: "5px 0 0", fontSize: 19, letterSpacing: -0.4, color: "#f8fafc",
}

const closeButtonStyle: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
  border: "1px solid rgba(148,163,184,0.14)", background: "transparent",
  color: "#94a3b8", cursor: "pointer", fontSize: 13,
}

const bodyStyle: React.CSSProperties = {
  padding: "14px 20px", display: "grid", gap: 12, overflowY: "auto",
}

const modoRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
}

const modoButtonStyle: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
  border: "1px solid rgba(148,163,184,0.16)", background: "transparent",
  color: "#94a3b8", cursor: "pointer",
}

const modoActivoStyle: React.CSSProperties = {
  background: "rgba(124,58,237,0.18)", border: "1px solid rgba(167,139,250,0.32)", color: "#ddd6fe",
}

const modoHintStyle: React.CSSProperties = {
  color: "#64748b", fontSize: 11, flex: 1, minWidth: 120,
}

const mesNavStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
}

const navButtonStyle: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.14)", background: "rgba(255,255,255,0.03)",
  color: "#cbd5e1", cursor: "pointer", fontSize: 16, lineHeight: 1,
}

const mesLabelStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, color: "#f8fafc",
}

const gridStyle: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4,
}

const dowStyle: React.CSSProperties = {
  textAlign: "center", fontSize: 10, fontWeight: 700, color: "#64748b",
  textTransform: "uppercase", paddingBottom: 2,
}

const diaStyle: React.CSSProperties = {
  aspectRatio: "1", borderRadius: 9, border: "1px solid rgba(148,163,184,0.10)",
  background: "rgba(255,255,255,0.03)", color: "#e2e8f0",
  fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0,
  fontVariantNumeric: "tabular-nums",
}

const diaInactivoStyle: React.CSSProperties = {
  background: "transparent", color: "#3f4a5f", cursor: "not-allowed",
  border: "1px solid transparent",
}

const diaAprobadoStyle: React.CSSProperties = {
  background: "rgba(52,211,153,0.16)", color: "#6ee7b7", cursor: "not-allowed",
  border: "1px solid rgba(52,211,153,0.28)",
}

const diaPendienteStyle: React.CSSProperties = {
  background: "rgba(234,179,8,0.14)", color: "#fcd34d", cursor: "not-allowed",
  border: "1px solid rgba(234,179,8,0.26)",
}

const diaActivoStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #7c3aed, #6366f1)", color: "#ffffff",
  border: "1px solid rgba(167,139,250,0.5)",
  boxShadow: "0 4px 14px rgba(124,58,237,0.35)",
}

const diaAnclaStyle: React.CSSProperties = {
  border: "1px solid #a78bfa", boxShadow: "0 0 0 2px rgba(167,139,250,0.35)",
}

const leyendaStyle: React.CSSProperties = {
  display: "flex", gap: 12, flexWrap: "wrap",
}

const leyendaItemStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  fontSize: 10, color: "#7d8ca3",
}

const resumenStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
  padding: "10px 12px", borderRadius: 12,
  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
}

const resumenNumStyle: React.CSSProperties = {
  fontSize: 20, fontWeight: 700, color: "#f8fafc", fontVariantNumeric: "tabular-nums",
}

const resumenLabelStyle: React.CSSProperties = {
  fontSize: 12, color: "#94a3b8",
}

const resumenSaldoStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, marginLeft: "auto",
}

const limpiarButtonStyle: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600,
  border: "1px solid rgba(148,163,184,0.14)", background: "transparent",
  color: "#94a3b8", cursor: "pointer",
}

const chipsStyle: React.CSSProperties = {
  display: "flex", gap: 6, flexWrap: "wrap",
}

const chipStyle: React.CSSProperties = {
  padding: "5px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600,
  background: "rgba(124,58,237,0.14)", border: "1px solid rgba(167,139,250,0.20)",
  color: "#ddd6fe",
}

const fieldStyle: React.CSSProperties = { display: "grid", gap: 5 }

const fieldLabelStyle: React.CSSProperties = {
  color: "#94a3b8", fontSize: 11, fontWeight: 500,
}

const textareaStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 8, resize: "vertical",
  border: "1px solid rgba(148,163,184,0.16)", background: "rgba(2,6,23,0.55)",
  color: "#f8fafc", outline: "none", fontSize: 13, lineHeight: 1.4,
  fontFamily: "inherit",
}

const footerStyle: React.CSSProperties = {
  display: "flex", justifyContent: "flex-end", gap: 8,
  padding: "14px 20px", borderTop: "1px solid rgba(148,163,184,0.10)",
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
  border: "1px solid rgba(148,163,184,0.16)", background: "transparent",
  color: "#94a3b8", cursor: "pointer",
}

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px", border: "none", borderRadius: 8,
  background: "linear-gradient(135deg, #7c3aed, #6366f1)", color: "white",
  fontWeight: 600, fontSize: 13, boxShadow: "0 8px 24px rgba(124,58,237,0.22)",
}
