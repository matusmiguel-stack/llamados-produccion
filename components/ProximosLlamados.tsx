"use client"

import type { CSSProperties } from "react"

// Columna "Próximos llamados" junto al calendario (solo escritorio).
// Cada llamado es una tira: hora de llamado grande en Archivo angosta, cliente,
// título, locación y cuánta gente va. La orilla izquierda dice el estatus:
// negra sólida = confirmado, punteada = tentativo, gris = wrap.

type Shoot = {
  id: string
  title?: string | null
  client?: string | null
  location?: string | null
  address?: string | null
  status?: string | null
  start_time: string
  end_time?: string | null
  all_day?: boolean | null
}

type ShootEmployee = {
  shoot_id: string
  employees?: { nombre?: string | null; apellido_paterno?: string | null } | null
}

const DIAS_VENTANA = 21
const MAX_LLAMADOS = 6

function hoyLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function sumarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T00:00:00`)
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function etiquetaDia(fecha: string, hoy: string): { titulo: string; detalle?: string } {
  const d = new Date(`${fecha}T00:00:00`)
  const diaSemana = d.toLocaleDateString("es-MX", { weekday: "long" })
  const detalle = `${diaSemana} ${d.getDate()}`
  if (fecha === hoy) return { titulo: "Hoy", detalle }
  if (fecha === sumarDias(hoy, 1)) return { titulo: "Mañana", detalle }
  return { titulo: detalle.charAt(0).toUpperCase() + detalle.slice(1) }
}

function iniciales(e: ShootEmployee["employees"]) {
  if (!e) return ""
  return `${(e.nombre || "").charAt(0)}${(e.apellido_paterno || "").charAt(0)}`.toUpperCase()
}

const ESTATUS: Record<string, { texto: string; color: string; fondo: string }> = {
  confirmed: { texto: "Confirmado", color: "#2E7448", fondo: "#E3F1E8" },
  tentative: { texto: "Tentativo", color: "#8A5B00", fondo: "#FBEFD6" },
  wrap: { texto: "Wrap", color: "#595959", fondo: "#EDEDED" },
}

const AVATAR_FONDOS = ["#E3E8F0", "#F3E3C7", "#D8ECE1", "#F6DCE6"]

export function ProximosLlamados({
  shoots,
  shootEmployees,
  onOpen,
}: {
  shoots: Shoot[]
  shootEmployees: ShootEmployee[]
  onOpen: (shootId: string) => void
}) {
  const hoy = hoyLocal()
  const limite = sumarDias(hoy, DIAS_VENTANA)

  const proximos = shoots
    .filter((s) => s.status !== "cancelled")
    .filter((s) => {
      const fecha = String(s.start_time).slice(0, 10)
      return fecha >= hoy && fecha <= limite
    })
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
    .slice(0, MAX_LLAMADOS)

  const porDia: { fecha: string; items: Shoot[] }[] = []
  for (const s of proximos) {
    const fecha = String(s.start_time).slice(0, 10)
    const ultimo = porDia[porDia.length - 1]
    if (ultimo && ultimo.fecha === fecha) ultimo.items.push(s)
    else porDia.push({ fecha, items: [s] })
  }

  return (
    <aside style={columnaStyle} aria-label="Próximos llamados">
      <h2 style={tituloStyle}>Próximos llamados</h2>

      {porDia.length === 0 && (
        <p style={vacioStyle}>No hay llamados en las próximas tres semanas.</p>
      )}

      {porDia.map(({ fecha, items }) => {
        const { titulo, detalle } = etiquetaDia(fecha, hoy)
        return (
          <section key={fecha}>
            <p style={diaStyle}>
              <b style={{ fontWeight: 650 }}>{titulo}</b>
              {detalle && <span style={{ color: "#8A8A8A" }}>{detalle}</span>}
            </p>

            {items.map((s) => {
              const equipo = shootEmployees.filter((se) => se.shoot_id === s.id)
              const estatus = ESTATUS[s.status || "tentative"] || ESTATUS.tentative
              const tentativo = (s.status || "tentative") === "tentative"
              const wrap = s.status === "wrap"
              const inicio = s.all_day ? "" : String(s.start_time).slice(11, 16)
              const fin = s.all_day || !s.end_time ? "" : String(s.end_time).slice(11, 16)
              const lugar = s.location || s.address

              return (
                <button key={s.id} type="button" onClick={() => onOpen(s.id)} style={tiraStyle}>
                  <span
                    aria-hidden
                    style={{
                      ...orillaStyle,
                      background: wrap
                        ? "#BDBDBD"
                        : tentativo
                          ? "repeating-linear-gradient(180deg, #131313 0 5px, transparent 5px 8px)"
                          : "#131313",
                    }}
                  />
                  <span style={horaColStyle}>
                    <span style={horaStyle}>{inicio || "Día"}</span>
                    <span style={finStyle}>{inicio ? (fin ? `a ${fin}` : "") : "completo"}</span>
                  </span>
                  <span style={cuerpoStyle}>
                    <span style={clienteFilaStyle}>
                      <span style={clienteStyle}>{s.client || "Sin cliente"}</span>
                      <span style={{ ...pildoraStyle, color: estatus.color, background: estatus.fondo }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
                        {estatus.texto}
                      </span>
                    </span>
                    <span style={tituloLlamadoStyle}>{s.title || "Llamado"}</span>
                    {lugar && (
                      <span style={lugarStyle}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0, color: "#8A8A8A" }}>
                          <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z" stroke="currentColor" strokeWidth="1.6" />
                          <circle cx="12" cy="10" r="2.3" stroke="currentColor" strokeWidth="1.6" />
                        </svg>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{lugar}</span>
                      </span>
                    )}
                    {equipo.length > 0 && (
                      <span style={equipoStyle}>
                        <span style={{ display: "flex" }}>
                          {equipo.slice(0, 3).map((se, i) => (
                            <span
                              key={i}
                              style={{ ...avatarStyle, background: AVATAR_FONDOS[i % AVATAR_FONDOS.length], marginLeft: i === 0 ? 0 : -5 }}
                            >
                              {iniciales(se.employees)}
                            </span>
                          ))}
                        </span>
                        {equipo.length} {equipo.length === 1 ? "persona" : "personas"}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </section>
        )
      })}
    </aside>
  )
}

const columnaStyle: CSSProperties = {
  width: 316,
  flexShrink: 0,
  position: "sticky",
  top: 24,
}

const tituloStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 15,
  fontWeight: 650,
  color: "#141414",
}

const vacioStyle: CSSProperties = {
  margin: "14px 0 0",
  fontSize: 13,
  color: "#8A8A8A",
}

const diaStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 8,
  margin: "20px 0 8px",
  fontSize: 13.5,
  color: "#141414",
}

const tiraStyle: CSSProperties = {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "54px minmax(0, 1fr)",
  gap: "0 12px",
  width: "100%",
  textAlign: "left",
  padding: "13px 14px 12px 16px",
  marginBottom: 8,
  borderRadius: 8,
  border: "1px solid #E2E2E2",
  background: "#FFFFFF",
  color: "#141414",
  overflow: "hidden",
  cursor: "pointer",
  font: "inherit",
}

const orillaStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  bottom: 0,
  width: 4,
}

const horaColStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
}

const horaStyle: CSSProperties = {
  fontSize: 25,
  lineHeight: 1,
  fontStretch: "68%",
  fontWeight: 720,
  fontVariantNumeric: "tabular-nums",
}

const finStyle: CSSProperties = {
  marginTop: 5,
  fontSize: 12,
  color: "#8A8A8A",
  fontVariantNumeric: "tabular-nums",
}

const cuerpoStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
}

const clienteFilaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 20,
}

const clienteStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 500,
  color: "#595959",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const pildoraStyle: CSSProperties = {
  marginLeft: "auto",
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  height: 20,
  padding: "0 8px",
  borderRadius: 10,
  fontSize: 11.5,
  fontWeight: 600,
  flexShrink: 0,
}

const tituloLlamadoStyle: CSSProperties = {
  marginTop: 1,
  fontSize: 14.5,
  fontWeight: 640,
  lineHeight: 1.25,
}

const lugarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  marginTop: 6,
  fontSize: 12.5,
  color: "#595959",
  whiteSpace: "nowrap",
  overflow: "hidden",
}

const equipoStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 10,
  fontSize: 12.5,
  color: "#595959",
}

const avatarStyle: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  border: "2px solid #FFFFFF",
  display: "inline-grid",
  placeItems: "center",
  fontSize: 9,
  fontWeight: 650,
  color: "#131313",
}
