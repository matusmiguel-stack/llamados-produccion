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

const TIPOS_ENTREGA = [
  { label: "CDT Interna",       color: "#6366f1" },
  { label: "CDT Cliente",       color: "#0891b2" },
  { label: "Entrega final",     color: "#16a34a" },
  { label: "Ronda Ajustes",     color: "#ea580c" },
  { label: "Edición y Post",    color: "#7c3aed" },
  { label: "Online CC y Audio", color: "#db2777" },
] as const

type TipoEntrega = typeof TIPOS_ENTREGA[number]["label"]

function colorForTipo(tipo: string): string {
  return TIPOS_ENTREGA.find((t) => t.label === tipo)?.color || "#6366f1"
}

export default function PostproduccionPage() {
  const [profile, setProfile] = useState<any>(null)
  const [user, setUser]       = useState<any>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const [entregas, setEntregas] = useState<any[]>([])
  const [events, setEvents]     = useState<any[]>([])

  // catálogo
  const [allClients,       setAllClients]       = useState<any[]>([])
  const [allProjects,      setAllProjects]       = useState<any[]>([])
  const [postproductores,  setPostproductores]   = useState<any[]>([])

  // form
  const [modalOpen, setModalOpen]             = useState(false)
  const [selectedEntrega, setSelectedEntrega] = useState<any>(null)
  const [detailsOpen, setDetailsOpen]         = useState(false)
  const [modoLibre, setModoLibre]             = useState(false)

  const [formTitulo,     setFormTitulo]     = useState("")
  const [formTipo,       setFormTipo]       = useState<TipoEntrega>("CDT Interna")
  const [formEditorId,   setFormEditorId]   = useState("")
  const [formClienteId,  setFormClienteId]  = useState("")
  const [formProyectoId, setFormProyectoId] = useState("")
  const [formProyecto,   setFormProyecto]   = useState("") // libre
  const [formCliente,    setFormCliente]    = useState("") // libre
  const [formFecha,      setFormFecha]      = useState("")
  const [formHora,       setFormHora]       = useState("")
  const [formNotas,      setFormNotas]      = useState("")

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

    const [{ data: entregasData }, { data: clients }, { data: projects }, { data: emps }] = await Promise.all([
      supabase.from("entregas").select("*").order("fecha"),
      supabase.from("clients").select("id, name").order("name"),
      supabase.from("projects").select("id, name, client_id, code").order("name"),
      supabase.from("employees").select("id, nombre, apellido_paterno, puesto").order("nombre"),
    ])
    setEntregas(entregasData || [])
    setAllClients(clients || [])
    setAllProjects(projects || [])
    setPostproductores((emps || []).filter((e: any) =>
      e.puesto?.toLowerCase().includes("postproduc") || e.puesto?.toLowerCase().includes("post produc")
    ))
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    const evs = entregas.map((e) => {
      const color = colorForTipo(e.tipo) || e.color || "#6366f1"
      return {
        id: e.id,
        title: e.titulo,
        start: e.hora ? `${e.fecha}T${e.hora}` : e.fecha,
        allDay: !e.hora,
        backgroundColor: color,
        borderColor:     color,
        textColor: "#ffffff",
      }
    })
    setEvents(evs)
  }, [entregas])

  function resetForm() {
    setFormTitulo(""); setFormProyecto(""); setFormCliente("")
    setFormClienteId(""); setFormProyectoId(""); setFormEditorId("")
    setFormTipo("CDT Interna")
    setFormFecha("");  setFormHora("");     setFormNotas("")
    setModoLibre(false)
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

    // Resolver cliente y proyecto según modo
    let clienteLabel = ""
    let proyectoLabel = ""
    if (modoLibre) {
      clienteLabel  = formCliente.trim()
      proyectoLabel = formProyecto.trim()
    } else {
      const cli = allClients.find((c) => c.id === formClienteId)
      const prj = allProjects.find((p) => p.id === formProyectoId)
      clienteLabel  = cli?.name || ""
      proyectoLabel = prj ? (prj.code ? `${prj.code} ${prj.name}` : prj.name) : ""
    }

    const editor = postproductores.find((e) => e.id === formEditorId)
    const editorName = editor ? `${editor.nombre} ${editor.apellido_paterno}` : null

    const payload = {
      titulo:    formTitulo.trim(),
      tipo:      formTipo,
      editor:    editorName,
      proyecto:  proyectoLabel || null,
      cliente:   clienteLabel  || null,
      fecha:     formFecha,
      hora:      formHora  || null,
      notas:     formNotas.trim() || null,
      color:     colorForTipo(formTipo),
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
        <section style={calendarPanelStyle}>
          <div style={{ marginBottom: 8 }}>
            <p style={{ margin: 0, color: "#64748b", fontSize: 11 }}>
              {canManage ? "Clic en la celda para crear una entrega; clic en un evento para ver detalle" : "Clic en un evento para ver detalle"}
            </p>
          </div>
          <div className={isMobile ? "calendar-shell calendar-shell-mobile" : "calendar-shell"}
            style={{ display: "flex", flexDirection: "column", overflow: "visible", minHeight: "auto" }}>
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
        </section>
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

              {/* Toggle modo */}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setModoLibre(false)}
                  style={{ flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: !modoLibre ? "1px solid #6366f1" : "1px solid rgba(148,163,184,0.2)",
                    background: !modoLibre ? "rgba(99,102,241,0.15)" : "transparent",
                    color: !modoLibre ? "#a5b4fc" : "#64748b" }}>
                  📂 Desde catálogo
                </button>
                <button type="button" onClick={() => setModoLibre(true)}
                  style={{ flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: modoLibre ? "1px solid #6366f1" : "1px solid rgba(148,163,184,0.2)",
                    background: modoLibre ? "rgba(99,102,241,0.15)" : "transparent",
                    color: modoLibre ? "#a5b4fc" : "#64748b" }}>
                  ✏️ Escribir manualmente
                </button>
              </div>

              {/* Proyecto / Cliente */}
              {!modoLibre ? (
                <div style={rowStyle}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Cliente</label>
                    <select value={formClienteId}
                      onChange={(e) => { setFormClienteId(e.target.value); setFormProyectoId("") }}
                      style={inputStyle}>
                      <option value="">— Selecciona cliente —</option>
                      {allClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Proyecto</label>
                    <select value={formProyectoId} onChange={(e) => setFormProyectoId(e.target.value)}
                      style={inputStyle}>
                      <option value="">— Selecciona proyecto —</option>
                      {allProjects
                        .filter((p) => !formClienteId || p.client_id === formClienteId)
                        .map((p) => <option key={p.id} value={p.id}>{p.code ? `${p.code} ${p.name}` : p.name}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
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
              )}

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

              {/* Tipo de entrega */}
              <div>
                <label style={labelStyle}>Tipo de entrega *</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {TIPOS_ENTREGA.map((t) => (
                    <button key={t.label} type="button" onClick={() => setFormTipo(t.label)}
                      style={{
                        padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer",
                        border: formTipo === t.label ? `1px solid ${t.color}` : "1px solid rgba(148,163,184,0.2)",
                        background: formTipo === t.label ? `${t.color}22` : "transparent",
                        color: formTipo === t.label ? t.color : "#64748b",
                      }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Editor */}
              <div>
                <label style={labelStyle}>Editor / Postproductor</label>
                <select value={formEditorId} onChange={(e) => setFormEditorId(e.target.value)} style={inputStyle}>
                  <option value="">— Sin asignar —</option>
                  {postproductores.map((e) => (
                    <option key={e.id} value={e.id}>{e.nombre} {e.apellido_paterno}</option>
                  ))}
                </select>
                {postproductores.length === 0 && (
                  <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 11 }}>
                    No hay empleados con puesto "Postproductor" registrados.
                  </p>
                )}
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
                <h2 style={{ ...panelTitleStyle, borderLeft: `4px solid ${colorForTipo(selectedEntrega.tipo) || "#6366f1"}`, paddingLeft: 10 }}>
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
              {selectedEntrega.tipo && (() => {
                const color = colorForTipo(selectedEntrega.tipo)
                return (
                  <div style={{ display: "inline-block" }}>
                    <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                      background: `${color}22`, border: `1px solid ${color}55`, color }}>
                      {selectedEntrega.tipo}
                    </span>
                  </div>
                )
              })()}
              {selectedEntrega.editor && (
                <div style={detailRowStyle}>
                  <span style={detailLabelStyle}>Editor</span>
                  <span style={detailValueStyle}>{selectedEntrega.editor}</span>
                </div>
              )}
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
                  setFormTipo((selectedEntrega.tipo as TipoEntrega) || "CDT Interna")
                  setFormProyecto(selectedEntrega.proyecto || "")
                  setFormCliente(selectedEntrega.cliente || "")
                  setFormClienteId(""); setFormProyectoId("")
                  const edEmp = postproductores.find((e) => `${e.nombre} ${e.apellido_paterno}` === selectedEntrega.editor)
                  setFormEditorId(edEmp?.id || "")
                  setModoLibre(true)
                  setFormFecha(selectedEntrega.fecha)
                  setFormHora(selectedEntrega.hora || "")
                  setFormNotas(selectedEntrega.notas || "")
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

const calendarPanelStyle: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148,163,184,0.14)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
  backdropFilter: "blur(16px)",
  borderRadius: 16,
  padding: "10px 12px 12px",
  display: "flex",
  flexDirection: "column",
  overflow: "visible",
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
