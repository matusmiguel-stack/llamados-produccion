"use client"

import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { requireSessionProfile } from "../../lib/session-profile"
import { AppSidebar } from "../../components/AppSidebar"

type Client = { id: string; name: string }
type Project = { id: string; name: string; client_id: string }

type LocalItem = {
  tempId: string
  description: string
  qty: string
  days: string
  unit_price: string
  released_expense: string
  real_expense: string
  supplier: string
}

type LocalSection = {
  tempId: string
  name: string
  items: LocalItem[]
}

function makeItem(): LocalItem {
  return {
    tempId: crypto.randomUUID(),
    description: "",
    qty: "1",
    days: "1",
    unit_price: "0",
    released_expense: "0",
    real_expense: "0",
    supplier: "",
  }
}

function makeSection(): LocalSection {
  return { tempId: crypto.randomUUID(), name: "", items: [makeItem()] }
}

function calcItemTotal(item: LocalItem): number {
  return (
    (parseFloat(item.qty) || 0) *
    (parseFloat(item.days) || 0) *
    (parseFloat(item.unit_price) || 0)
  )
}

function calcSectionSubtotal(section: LocalSection): number {
  return section.items.reduce((sum, item) => sum + calcItemTotal(item), 0)
}

function calcSubtotal(sections: LocalSection[]): number {
  return sections.reduce((sum, sec) => sum + calcSectionSubtotal(sec), 0)
}

function fmt(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
}

export default function CotizacionesPage() {
  const [profile, setProfile] = useState<any>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [saving, setSaving] = useState(false)

  const [clientId, setClientId] = useState("")
  const [projectId, setProjectId] = useState("")
  const [quoteName, setQuoteName] = useState("")
  const [markup, setMarkup] = useState("0")
  const [status, setStatus] = useState<"draft" | "sent" | "approved">("draft")
  const [sections, setSections] = useState<LocalSection[]>([makeSection()])

  const isAdmin = profile?.role === "admin"
  const filteredProjects = projects.filter((p) => p.client_id === clientId)
  const subtotal = calcSubtotal(sections)
  const markupAmt = subtotal * ((parseFloat(markup) || 0) / 100)
  const total = subtotal + markupAmt

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => {
    async function load() {
      const auth = await requireSessionProfile()
      if (!auth) return
      if (auth.profile.role !== "admin") {
        window.location.href = "/"
        return
      }
      setProfile(auth.profile)
      const [{ data: clientsData }, { data: projectsData }] = await Promise.all([
        supabase.from("clients").select("id, name").order("name"),
        supabase.from("projects").select("id, name, client_id").order("name"),
      ])
      setClients(clientsData || [])
      setProjects(projectsData || [])
    }
    load()
  }, [])

  useEffect(() => {
    setProjectId("")
  }, [clientId])

  function updateSection(tempId: string, patch: Partial<Omit<LocalSection, "items">>) {
    setSections((prev) =>
      prev.map((s) => (s.tempId === tempId ? { ...s, ...patch } : s))
    )
  }

  function removeSection(tempId: string) {
    setSections((prev) => prev.filter((s) => s.tempId !== tempId))
  }

  function addItem(sectionTempId: string) {
    setSections((prev) =>
      prev.map((s) =>
        s.tempId === sectionTempId ? { ...s, items: [...s.items, makeItem()] } : s
      )
    )
  }

  function updateItem(
    sectionTempId: string,
    itemTempId: string,
    patch: Partial<LocalItem>
  ) {
    setSections((prev) =>
      prev.map((s) =>
        s.tempId === sectionTempId
          ? {
              ...s,
              items: s.items.map((i) =>
                i.tempId === itemTempId ? { ...i, ...patch } : i
              ),
            }
          : s
      )
    )
  }

  function removeItem(sectionTempId: string, itemTempId: string) {
    setSections((prev) =>
      prev.map((s) =>
        s.tempId === sectionTempId
          ? { ...s, items: s.items.filter((i) => i.tempId !== itemTempId) }
          : s
      )
    )
  }

  async function handleSave() {
    if (!clientId) return alert("Selecciona un cliente")
    if (!projectId) return alert("Selecciona un proyecto")
    if (!quoteName.trim()) return alert("Escribe el nombre de la cotización")
    if (sections.length === 0) return alert("Agrega al menos una sección")
    if (sections.some((s) => !s.name.trim()))
      return alert("Todas las secciones deben tener nombre")

    setSaving(true)
    try {
      const { data: quoteData, error: quoteErr } = await supabase
        .from("quotes")
        .insert({
          project_id: projectId,
          name: quoteName.trim(),
          status,
          markup_percentage: parseFloat(markup) || 0,
          created_by: profile.id,
        })
        .select("id")
        .single()

      if (quoteErr) throw quoteErr

      for (let si = 0; si < sections.length; si++) {
        const sec = sections[si]
        const { data: secData, error: secErr } = await supabase
          .from("quote_sections")
          .insert({
            quote_id: quoteData.id,
            name: sec.name.trim(),
            order_index: si,
          })
          .select("id")
          .single()

        if (secErr) throw secErr

        if (sec.items.length > 0) {
          const { error: itemsErr } = await supabase.from("quote_items").insert(
            sec.items.map((item, ii) => ({
              section_id: secData.id,
              description: item.description,
              qty: parseFloat(item.qty) || 0,
              days: parseFloat(item.days) || 0,
              unit_price: parseFloat(item.unit_price) || 0,
              released_expense: parseFloat(item.released_expense) || 0,
              real_expense: parseFloat(item.real_expense) || 0,
              supplier: item.supplier || null,
              order_index: ii,
            }))
          )
          if (itemsErr) throw itemsErr
        }
      }

      setClientId("")
      setProjectId("")
      setQuoteName("")
      setMarkup("0")
      setStatus("draft")
      setSections([makeSection()])
      alert("Cotización guardada. Puedes revisarla desde la sección de Proyectos.")
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const ITEM_GRID = isMobile
    ? "1fr"
    : "2fr 64px 64px 110px 110px 110px 1fr 110px 36px"

  return (
    <div style={appShellStyle}>
      <AppSidebar
        profile={profile}
        user={null}
        isAdmin={isAdmin}
        isMobile={isMobile}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen(!menuOpen)}
        onMenuClose={() => setMenuOpen(false)}
        onLogout={logout}
      />

      <main
        style={{
          ...mainStyle,
          padding: isMobile ? "76px 14px 40px" : "28px 32px 40px",
        }}
      >
        <div style={pageContainerStyle}>
          <header style={pageHeaderStyle}>
            <p style={eyebrowStyle}>Finanzas</p>
            <h1 style={pageTitleStyle}>Nueva cotización</h1>
            <p style={pageSubtitleStyle}>
              Crea un presupuesto completo con secciones e ítems
            </p>
          </header>

          {/* Datos generales */}
          <section style={panelStyle}>
            <div style={panelHeaderStyle}>
              <p style={panelTitleStyle}>Datos generales</p>
            </div>
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              }}
            >
              <Field label="Cliente">
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Selecciona un cliente...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Proyecto">
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  style={inputStyle}
                  disabled={!clientId}
                >
                  <option value="">Selecciona un proyecto...</option>
                  {filteredProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Nombre de la cotización">
                <input
                  value={quoteName}
                  onChange={(e) => setQuoteName(e.target.value)}
                  placeholder="Ej. Propuesta comercial v1"
                  style={inputStyle}
                />
              </Field>

              <div
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
              >
                <Field label="Markup (%)">
                  <input
                    type="number"
                    value={markup}
                    onChange={(e) => setMarkup(e.target.value)}
                    min="0"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Estado">
                  <select
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as "draft" | "sent" | "approved")
                    }
                    style={inputStyle}
                  >
                    <option value="draft">Borrador</option>
                    <option value="sent">Enviada</option>
                    <option value="approved">Aprobada</option>
                  </select>
                </Field>
              </div>
            </div>
          </section>

          {/* Secciones */}
          {sections.map((section, si) => (
            <section key={section.tempId} style={{ ...panelStyle, marginTop: 12 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 12,
                  paddingBottom: 12,
                  borderBottom: "1px solid rgba(148,163,184,0.10)",
                }}
              >
                <input
                  value={section.name}
                  onChange={(e) =>
                    updateSection(section.tempId, { name: e.target.value })
                  }
                  placeholder={`Sección ${si + 1} — Ej. Producción, Locación, Técnica...`}
                  style={{ ...inputStyle, flex: 1, fontWeight: 600, fontSize: 14 }}
                />
                {sections.length > 1 && (
                  <button
                    onClick={() => removeSection(section.tempId)}
                    style={dangerButtonSmallStyle}
                  >
                    Eliminar sección
                  </button>
                )}
              </div>

              {/* Encabezado de tabla — solo desktop */}
              {!isMobile && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: ITEM_GRID,
                    gap: 8,
                    padding: "0 4px 8px",
                    color: "#64748b",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                  }}
                >
                  <span>Descripción</span>
                  <span style={{ textAlign: "right" }}>Cant.</span>
                  <span style={{ textAlign: "right" }}>Días</span>
                  <span style={{ textAlign: "right" }}>P. unit.</span>
                  <span style={{ textAlign: "right" }}>G. lib.</span>
                  <span style={{ textAlign: "right" }}>G. real</span>
                  <span>Proveedor</span>
                  <span style={{ textAlign: "right" }}>Total</span>
                  <span />
                </div>
              )}

              {/* Ítems */}
              <div style={{ display: "grid", gap: 6 }}>
                {section.items.map((item) => {
                  const itemTot = calcItemTotal(item)
                  return (
                    <div
                      key={item.tempId}
                      style={{
                        display: "grid",
                        gridTemplateColumns: ITEM_GRID,
                        gap: 8,
                        alignItems: "center",
                        padding: 8,
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.025)",
                        border: "1px solid rgba(148,163,184,0.08)",
                      }}
                    >
                      {isMobile ? (
                        <div style={{ display: "grid", gap: 8 }}>
                          <Field label="Descripción">
                            <input
                              value={item.description}
                              onChange={(e) =>
                                updateItem(section.tempId, item.tempId, {
                                  description: e.target.value,
                                })
                              }
                              placeholder="Descripción del ítem"
                              style={inputStyle}
                            />
                          </Field>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr 1fr",
                              gap: 8,
                            }}
                          >
                            <Field label="Cant.">
                              <input
                                type="number"
                                value={item.qty}
                                onChange={(e) =>
                                  updateItem(section.tempId, item.tempId, {
                                    qty: e.target.value,
                                  })
                                }
                                min="0"
                                style={inputStyle}
                              />
                            </Field>
                            <Field label="Días">
                              <input
                                type="number"
                                value={item.days}
                                onChange={(e) =>
                                  updateItem(section.tempId, item.tempId, {
                                    days: e.target.value,
                                  })
                                }
                                min="0"
                                style={inputStyle}
                              />
                            </Field>
                            <Field label="P. unit.">
                              <input
                                type="number"
                                value={item.unit_price}
                                onChange={(e) =>
                                  updateItem(section.tempId, item.tempId, {
                                    unit_price: e.target.value,
                                  })
                                }
                                min="0"
                                style={inputStyle}
                              />
                            </Field>
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: 8,
                            }}
                          >
                            <Field label="G. liberado">
                              <input
                                type="number"
                                value={item.released_expense}
                                onChange={(e) =>
                                  updateItem(section.tempId, item.tempId, {
                                    released_expense: e.target.value,
                                  })
                                }
                                min="0"
                                style={inputStyle}
                              />
                            </Field>
                            <Field label="G. real">
                              <input
                                type="number"
                                value={item.real_expense}
                                onChange={(e) =>
                                  updateItem(section.tempId, item.tempId, {
                                    real_expense: e.target.value,
                                  })
                                }
                                min="0"
                                style={inputStyle}
                              />
                            </Field>
                          </div>
                          <Field label="Proveedor">
                            <input
                              value={item.supplier}
                              onChange={(e) =>
                                updateItem(section.tempId, item.tempId, {
                                  supplier: e.target.value,
                                })
                              }
                              placeholder="Nombre del proveedor"
                              style={inputStyle}
                            />
                          </Field>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <span style={itemTotalStyle}>{fmt(itemTot)}</span>
                            {section.items.length > 1 && (
                              <button
                                onClick={() =>
                                  removeItem(section.tempId, item.tempId)
                                }
                                style={dangerButtonSmallStyle}
                              >
                                Quitar
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          <input
                            value={item.description}
                            onChange={(e) =>
                              updateItem(section.tempId, item.tempId, {
                                description: e.target.value,
                              })
                            }
                            placeholder="Descripción"
                            style={inputStyle}
                          />
                          <input
                            type="number"
                            value={item.qty}
                            onChange={(e) =>
                              updateItem(section.tempId, item.tempId, {
                                qty: e.target.value,
                              })
                            }
                            min="0"
                            style={{ ...inputStyle, textAlign: "right" }}
                          />
                          <input
                            type="number"
                            value={item.days}
                            onChange={(e) =>
                              updateItem(section.tempId, item.tempId, {
                                days: e.target.value,
                              })
                            }
                            min="0"
                            style={{ ...inputStyle, textAlign: "right" }}
                          />
                          <input
                            type="number"
                            value={item.unit_price}
                            onChange={(e) =>
                              updateItem(section.tempId, item.tempId, {
                                unit_price: e.target.value,
                              })
                            }
                            min="0"
                            style={{ ...inputStyle, textAlign: "right" }}
                          />
                          <input
                            type="number"
                            value={item.released_expense}
                            onChange={(e) =>
                              updateItem(section.tempId, item.tempId, {
                                released_expense: e.target.value,
                              })
                            }
                            min="0"
                            style={{ ...inputStyle, textAlign: "right" }}
                          />
                          <input
                            type="number"
                            value={item.real_expense}
                            onChange={(e) =>
                              updateItem(section.tempId, item.tempId, {
                                real_expense: e.target.value,
                              })
                            }
                            min="0"
                            style={{ ...inputStyle, textAlign: "right" }}
                          />
                          <input
                            value={item.supplier}
                            onChange={(e) =>
                              updateItem(section.tempId, item.tempId, {
                                supplier: e.target.value,
                              })
                            }
                            placeholder="Proveedor"
                            style={inputStyle}
                          />
                          <span
                            style={{
                              ...itemTotalStyle,
                              textAlign: "right",
                              display: "block",
                            }}
                          >
                            {fmt(itemTot)}
                          </span>
                          <div style={{ display: "flex", justifyContent: "center" }}>
                            {section.items.length > 1 && (
                              <button
                                onClick={() =>
                                  removeItem(section.tempId, item.tempId)
                                }
                                style={{ ...dangerButtonSmallStyle, padding: "5px 8px" }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: "1px solid rgba(148,163,184,0.08)",
                }}
              >
                <button
                  onClick={() => addItem(section.tempId)}
                  style={ghostButtonStyle}
                >
                  + Agregar ítem
                </button>
                <span style={sectionTotalStyle}>
                  Sección:{" "}
                  <strong>{fmt(calcSectionSubtotal(section))}</strong>
                </span>
              </div>
            </section>
          ))}

          <button
            onClick={() => setSections((prev) => [...prev, makeSection()])}
            style={{
              ...ghostButtonStyle,
              marginTop: 12,
              width: "100%",
              padding: "12px 16px",
              borderRadius: 12,
              justifyContent: "center",
            }}
          >
            + Agregar sección
          </button>

          {/* Totales y guardar */}
          <section style={{ ...panelStyle, marginTop: 12 }}>
            <div
              style={{
                display: "flex",
                flexDirection: isMobile ? "column" : "row",
                alignItems: isMobile ? "stretch" : "flex-end",
                justifyContent: "space-between",
                gap: 16,
              }}
            >
              <div style={totalsBoxStyle}>
                <div style={totalRowStyle}>
                  <span style={totalLabelStyle}>Subtotal</span>
                  <span style={totalValueStyle}>{fmt(subtotal)}</span>
                </div>
                <div style={totalRowStyle}>
                  <span style={totalLabelStyle}>Markup ({markup || 0}%)</span>
                  <span style={totalValueStyle}>{fmt(markupAmt)}</span>
                </div>
                <div
                  style={{
                    ...totalRowStyle,
                    borderTop: "1px solid rgba(148,163,184,0.18)",
                    paddingTop: 10,
                    marginTop: 4,
                  }}
                >
                  <span
                    style={{
                      ...totalLabelStyle,
                      color: "#f8fafc",
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    Total
                  </span>
                  <span
                    style={{
                      ...totalValueStyle,
                      color: "#a78bfa",
                      fontSize: 20,
                      fontWeight: 700,
                    }}
                  >
                    {fmt(total)}
                  </span>
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                style={{ ...primaryButtonStyle, padding: "12px 24px", fontSize: 14 }}
              >
                {saving ? "Guardando..." : "Guardar cotización"}
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label style={fieldStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      {children}
    </label>
  )
}

const appShellStyle: React.CSSProperties = {
  display: "flex",
  minHeight: "100vh",
}

const mainStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
}

const pageContainerStyle: React.CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
}

const pageHeaderStyle: React.CSSProperties = {
  marginBottom: 18,
}

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: "#a78bfa",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 1.2,
  fontWeight: 700,
}

const pageTitleStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#f8fafc",
  fontSize: 28,
  letterSpacing: -0.6,
  lineHeight: 1.1,
}

const pageSubtitleStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#64748b",
  fontSize: 13,
}

const panelStyle: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148,163,184,0.14)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
  backdropFilter: "blur(16px)",
  borderRadius: 16,
  padding: "16px 18px",
}

const panelHeaderStyle: React.CSSProperties = {
  marginBottom: 14,
  paddingBottom: 12,
  borderBottom: "1px solid rgba(148,163,184,0.10)",
}

const panelTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 600,
}

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 5,
  minWidth: 0,
}

const fieldLabelStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 500,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 8,
  background: "rgba(2,6,23,0.55)",
  color: "#f8fafc",
  outline: "none",
  fontSize: 13,
  lineHeight: 1.35,
  boxSizing: "border-box",
}

const itemTotalStyle: React.CSSProperties = {
  color: "#a78bfa",
  fontSize: 13,
  fontWeight: 600,
}

const sectionTotalStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
}

const totalsBoxStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  minWidth: 280,
}

const totalRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 24,
}

const totalLabelStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 13,
}

const totalValueStyle: React.CSSProperties = {
  color: "#e2e8f0",
  fontSize: 14,
  fontWeight: 600,
}

const primaryButtonStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "linear-gradient(135deg, #7c3aed, #6366f1)",
  color: "white",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
  boxShadow: "0 8px 24px rgba(124,58,237,0.22)",
  whiteSpace: "nowrap",
}

const ghostButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px dashed rgba(148,163,184,0.22)",
  background: "transparent",
  color: "#94a3b8",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
}

const dangerButtonSmallStyle: React.CSSProperties = {
  padding: "5px 10px",
  background: "transparent",
  color: "#f87171",
  border: "1px solid rgba(248,113,113,0.24)",
  borderRadius: 7,
  cursor: "pointer",
  fontWeight: 500,
  fontSize: 12,
  whiteSpace: "nowrap",
}
