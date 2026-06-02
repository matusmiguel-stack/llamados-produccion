"use client"

import { useEffect, useRef, useState } from "react"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import { supabase } from "../../lib/supabase"
import { requireSessionProfile } from "../../lib/session-profile"
import { AppSidebar } from "../../components/AppSidebar"
import { DatePickerField } from "../../components/DatePickerField"

const COLORS = [
  { label: "Índigo",    value: "#6366f1" },
  { label: "Cyan",      value: "#0891b2" },
  { label: "Violeta",   value: "#7c3aed" },
  { label: "Rosa",      value: "#db2777" },
  { label: "Naranja",   value: "#ea580c" },
  { label: "Verde",     value: "#16a34a" },
  { label: "Amarillo",  value: "#ca8a04" },
]

export default function PostproduccionPage() {
  const [profile, setProfile] = useState<any>(null)
  const [user, setUser]       = useState<any>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const [entregas, setEntregas] = useState<any[]>([])
  const [events, setEvents]     = useState<any[]>([])

  // form
  const [modalOpen, setModalOpen]         = useState(false)
  const [selectedEntrega, setSelectedEntrega] = useState<any>(null)
  const [detailsOpen, setDetailsOpen]     = useState(false)

  const [formTitulo,   setFormTitulo]   = useState("")
  const [formProyecto, setFormProyecto] = useState("")
  const [formCliente,  setFormCliente]  = useState("")
  const [formFecha,    setFormFecha]    = useState("")
  const [formHora,     setFormHora]     = useState("")
  const [formNotas,    setFormNotas]    = useState("")
  const [formColor,    setFormColor]    = useState("#6366f1")

  const calendarRef = useRef<any>(null)
  const canManage = profile?.role === "admin" || profile?.role === "editor" || profile?.role === "productor"

  useEffect(() => {
    function checkMobile() { setIsMobile(window.innerWidth < 768) }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  async function loadData() {
    const auth = await requireSessionProfile()
    if (!auth) return
    setUser(auth.session.user)
    setProfile(auth.profile)

    const { data } = await supabase.from("entregas").select("*").order("fecha")
    setEntregas(data || [])
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    const evs = entregas.map((e) => ({
      id: e.id,
      title: e.titulo,
      start: e.hora ? `${e.fecha}T${e.hora}` : e.fecha,
      allDay: !e.hora,
      backgroundColor: e.color || "#6366f1",
      borderColor:     e.color || "#6366f1",
      textColor: "#ffffff",
    }))
    setEvents(evs)
  }, [entregas])

  function resetForm() {
    setFormTitulo(""); setFormProyecto(""); setFormCliente("")
    setFormFecha("");  setFormHora("");     setFormNotas("")
    setFormColor("#6366f1")
    setSelectedEntrega(null)
  }

  function handleDateSelect(info: any) {
    if (!canManage) return
    resetForm()
    setFormFecha(info.startStr.split("T")[0])
    setModalOpen(true)
  }

  function handleEventClick(info: any) {
    const entrega = entregas.find((e) => e.id === info.event.id)
    if (!entrega) return
    setSelectedEntrega(entrega)
    setDetailsOpen(true)
  }

  async function saveEntrega() {
    if (!formTitulo.trim()) return alert("Ponle título a la entrega")
    if (!formFecha)         return alert("Selecciona una fecha")

    const payload = {
      titulo:    formTitulo.trim(),
      proyecto:  formProyecto.trim() || null,
      cliente:   formCliente.trim()  || null,
      fecha:     formFecha,
      hora:      formHora  || null,
      notas:     formNotas.trim() || null,
      color:     formColor,
      created_by: user?.id || null,
      updated_at: new Date().toISOString(),
    }

    if (selectedEntrega) {
      const { error } = await supabase.from("entregas").update(payload).eq("id", selectedEntrega.id)
      if (error) return alert(error.message)
    } else {
      const { error } = await supabase.from("entregas").insert(payload)
      if (error) return alert(error.message)
    }

    setModalOpen(false)
    resetForm()
    const { data } = await supabase.from("entregas").select("*").order("fecha")
    setEntregas(data || [])
  }

  async function deleteEntrega(id: string) {
    if (!confirm("¿Eliminar esta entrega?")) return
    await supabase.from("entregas").delete().eq("id", id)
    setDetailsOpen(false)
    setSelectedEntrega(null)
    const { data } = await supabase.from("entregas").select("*").order("fecha")
    setEntregas(data || [])
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"]
  function formatFecha(fecha: string) {
    const [y, m, d] = fecha.split("-")
    return `${parseInt(d)} de ${meses[parseInt(m) - 1]} de ${y}`
  }

  return (
    <div style={shellStyle}>
      <AppSidebar
        profile={profile} user={user}
        isAdmin={profile?.role === "admin"}
        isMobile={isMobile} menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen(!menuOpen)}
        onMenuClose={() => setMenuOpen(false)}
        onLogout={logout}
      />

      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", padding: isMobile ? "76px 14px 24px" : "28px 32px", gap: 20 }}>

        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: isMobile ? 22 : 28, fontWeight: 800, color: "#f8fafc" }}>
              🎞️ Post Producción
            </h1>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
              Calendario de entregas y deadlines
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => { resetForm(); setModalOpen(true) }}
              style={primaryBtnStyle}
            >
              + Nueva entrega
            </button>
          )}
        </header>

        {/* Calendario */}
        <div style={{ background: "rgba(15,23,42,0.7)", border: "1px solid rgba(148,163,184,0.12)", borderRadius: 16, padding: isMobile ? "12px 8px" : "20px 24px", flex: 1 }}>
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale="es"
            headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek" }}
            height="auto"
            events={events}
            selectable={canManage}
            selectMirror={canManage}
            select={handleDateSelect}
            eventClick={handleEventClick}
            buttonText={{ today: "Hoy", month: "Mes", week: "Semana" }}
          />
        </div>
      </main>

      {/* ── Modal crear/editar ── */}
      {modalOpen && (
        <div style={overlayStyle} onClick={() => { setModalOpen(false); resetForm() }}>
          <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
            <div style={panelHeaderStyle}>
              <h2 style={panelTitleStyle}>{selectedEntrega ? "Editar entrega" : "Nueva entrega"}</h2>
              <button onClick={() => { setModalOpen(false); resetForm() }} style={closeStyle}>×</button>
            </div>

            <div style={panelBodyStyle}>
              {/* Título */}
              <div>
                <label style={labelStyle}>Título *</label>
                <input type="text" value={formTitulo} onChange={(e) => setFormTitulo(e.target.value)}
                  style={inputStyle} placeholder="Ej. Entrega corte fino — cliente" />
              </div>

              {/* Proyecto / Cliente */}
              <div style={rowStyle}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Proyecto</label>
                  <input type="text" value={formProyecto} onChange={(e) => setFormProyecto(e.target.value)}
                    style={inputStyle} placeholder="Nombre del proyecto" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Cliente</label>
                  <input type="text" value={formCliente} onChange={(e) => setFormCliente(e.target.value)}
                    style={inputStyle} placeholder="Nombre del cliente" />
                </div>
              </div>

              {/* Fecha / Hora */}
              <div style={rowStyle}>
                <div style={{ flex: 1 }}>
                  <DatePickerField label="Fecha *" value={formFecha} labelStyle={labelStyle} onChange={setFormFecha} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Hora (opcional)</label>
                  <input type="time" value={formHora} onChange={(e) => setFormHora(e.target.value)}
                    style={inputStyle} />
                </div>
              </div>

              {/* Color */}
              <div>
                <label style={labelStyle}>Color</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                  {COLORS.map((c) => (
                    <button key={c.value} type="button" onClick={() => setFormColor(c.value)}
                      title={c.label}
                      style={{
                        width: 28, height: 28, borderRadius: "50%",
                        background: c.value, border: formColor === c.value ? "3px solid #f8fafc" : "3px solid transparent",
                        cursor: "pointer",
                      }} />
                  ))}
                </div>
              </div>

              {/* Notas */}
              <div>
                <label style={labelStyle}>Notas</label>
                <textarea value={formNotas} onChange={(e) => setFormNotas(e.target.value)}
                  rows={3} style={{ ...inputStyle, resize: "vertical" }}
                  placeholder="Detalles, instrucciones, links..." />
              </div>
            </div>

            <div style={panelFooterStyle}>
              <button onClick={() => { setModalOpen(false); resetForm() }} style={secondaryBtnStyle}>Cancelar</button>
              <button onClick={saveEntrega} style={primaryBtnStyle}>{selectedEntrega ? "Guardar" : "Crear entrega"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal detalle ── */}
      {detailsOpen && selectedEntrega && (
        <div style={overlayStyle} onClick={() => { setDetailsOpen(false); setSelectedEntrega(null) }}>
          <div style={{ ...panelStyle, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={panelHeaderStyle}>
              <div>
                <h2 style={{ ...panelTitleStyle, borderLeft: `4px solid ${selectedEntrega.color || "#6366f1"}`, paddingLeft: 10 }}>
                  {selectedEntrega.titulo}
                </h2>
                <p style={{ margin: "4px 0 0 14px", color: "#64748b", fontSize: 13 }}>
                  {formatFecha(selectedEntrega.fecha)}
                  {selectedEntrega.hora ? ` · ${selectedEntrega.hora} hrs` : ""}
                </p>
              </div>
              <button onClick={() => { setDetailsOpen(false); setSelectedEntrega(null) }} style={closeStyle}>×</button>
            </div>

            <div style={panelBodyStyle}>
              {selectedEntrega.proyecto && (
                <div style={detailRowStyle}>
                  <span style={detailLabelStyle}>Proyecto</span>
                  <span style={detailValueStyle}>{selectedEntrega.proyecto}</span>
                </div>
              )}
              {selectedEntrega.cliente && (
                <div style={detailRowStyle}>
                  <span style={detailLabelStyle}>Cliente</span>
                  <span style={detailValueStyle}>{selectedEntrega.cliente}</span>
                </div>
              )}
              {selectedEntrega.notas && (
                <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(148,163,184,0.1)" }}>
                  <p style={{ margin: 0, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 600 }}>Notas</p>
                  <p style={{ margin: "6px 0 0", color: "#cbd5e1", fontSize: 14, lineHeight: 1.6 }}>{selectedEntrega.notas}</p>
                </div>
              )}
            </div>

            <div style={panelFooterStyle}>
              <button onClick={() => { setDetailsOpen(false); setSelectedEntrega(null) }} style={secondaryBtnStyle}>Cerrar</button>
              {canManage && (
                <button onClick={() => {
                  setFormTitulo(selectedEntrega.titulo)
                  setFormProyecto(selectedEntrega.proyecto || "")
                  setFormCliente(selectedEntrega.cliente || "")
                  setFormFecha(selectedEntrega.fecha)
                  setFormHora(selectedEntrega.hora || "")
                  setFormNotas(selectedEntrega.notas || "")
                  setFormColor(selectedEntrega.color || "#6366f1")
                  setDetailsOpen(false)
                  setModalOpen(true)
                }} style={primaryBtnStyle}>Editar</button>
              )}
              {canManage && (
                <button onClick={() => deleteEntrega(selectedEntrega.id)} style={dangerBtnStyle}>Borrar</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const shellStyle: React.CSSProperties = {
  display: "flex", minHeight: "100vh", background: "transparent", color: "#f8fafc",
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 50,
  background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
}

const panelStyle: React.CSSProperties = {
  width: "100%", maxWidth: 560,
  background: "rgba(15,23,42,0.97)",
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 16,
  boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
  backdropFilter: "blur(20px)",
  display: "flex", flexDirection: "column",
  maxHeight: "90vh", overflow: "hidden",
}

const panelHeaderStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  padding: "20px 24px 16px", borderBottom: "1px solid rgba(148,163,184,0.1)",
}

const panelTitleStyle: React.CSSProperties = {
  margin: 0, fontSize: 18, fontWeight: 700, color: "#f8fafc",
}

const panelBodyStyle: React.CSSProperties = {
  padding: "20px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14,
}

const panelFooterStyle: React.CSSProperties = {
  padding: "14px 24px", borderTop: "1px solid rgba(148,163,184,0.1)",
  display: "flex", justifyContent: "flex-end", gap: 8,
}

const closeStyle: React.CSSProperties = {
  background: "none", border: "none", color: "#64748b", fontSize: 22,
  cursor: "pointer", padding: "0 4px", lineHeight: 1,
}

const labelStyle: React.CSSProperties = {
  display: "block", marginBottom: 5, fontSize: 12, fontWeight: 600,
  color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.6px",
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8, boxSizing: "border-box",
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(148,163,184,0.2)",
  color: "#f8fafc", fontSize: 14, outline: "none",
}

const rowStyle: React.CSSProperties = {
  display: "flex", gap: 12,
}

const primaryBtnStyle: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 8, border: "none",
  background: "rgba(99,102,241,0.8)", color: "#fff",
  fontSize: 13, fontWeight: 600, cursor: "pointer",
}

const secondaryBtnStyle: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.2)", background: "transparent",
  color: "#94a3b8", fontSize: 13, fontWeight: 600, cursor: "pointer",
}

const dangerBtnStyle: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 8, border: "none",
  background: "rgba(220,38,38,0.15)", color: "#f87171",
  fontSize: 13, fontWeight: 600, cursor: "pointer",
}

const detailRowStyle: React.CSSProperties = {
  display: "flex", gap: 12, alignItems: "baseline",
  padding: "8px 0", borderBottom: "1px solid rgba(148,163,184,0.08)",
}

const detailLabelStyle: React.CSSProperties = {
  minWidth: 80, color: "#64748b", fontSize: 12, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.6px",
}

const detailValueStyle: React.CSSProperties = {
  color: "#f8fafc", fontSize: 14,
}
