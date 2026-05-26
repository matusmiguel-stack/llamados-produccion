"use client"

import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { AppSidebar } from "../../components/AppSidebar"

type Proveedor = {
  id: string
  nombre: string
  apellido: string
  empresa: string | null
  actividad: string
  email: string
  telefono: string
}

type ProveedorForm = {
  nombre: string
  apellido: string
  empresa: string
  actividad: string
  email: string
  telefono: string
}

const emptyForm: ProveedorForm = {
  nombre: "",
  apellido: "",
  empresa: "",
  actividad: "",
  email: "",
  telefono: "",
}

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [form, setForm] = useState<ProveedorForm>(emptyForm)
  const [editingId, setEditingId] = useState("")
  const [editForm, setEditForm] = useState<ProveedorForm>(emptyForm)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const isAdmin = profile?.role === "admin"

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  async function loadPage() {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      window.location.href = "/login"
      return
    }

    const { data: profiles } = await supabase.from("profiles").select("*")

    const myProfile = profiles?.find(
      (p) =>
        p.email?.trim().toLowerCase() ===
        session.user.email?.trim().toLowerCase()
    )

    if (!myProfile || myProfile.role !== "admin") {
      window.location.href = "/"
      return
    }

    setProfile(myProfile)

    const { data, error } = await supabase
      .from("proveedores")
      .select("*")
      .order("nombre", { ascending: true })
      .order("apellido", { ascending: true })

    if (error) return alert(error.message)

    setProveedores(data || [])
  }

  useEffect(() => {
    loadPage()
  }, [])

  function buildPayload(values: ProveedorForm) {
    if (
      !values.nombre.trim() ||
      !values.apellido.trim() ||
      !values.actividad.trim() ||
      !values.email.trim() ||
      !values.telefono.trim()
    ) {
      alert("Completa nombre, apellido, actividad, email y teléfono")
      return null
    }

    return {
      nombre: values.nombre.trim(),
      apellido: values.apellido.trim(),
      empresa: values.empresa.trim() || null,
      actividad: values.actividad.trim(),
      email: values.email.trim().toLowerCase(),
      telefono: values.telefono.trim(),
    }
  }

  async function createProveedor() {
    const payload = buildPayload(form)
    if (!payload) return

    const { error } = await supabase.from("proveedores").insert(payload)

    if (error) return alert(error.message)

    setForm(emptyForm)
    await loadPage()
  }

  function startEdit(proveedor: Proveedor) {
    setEditingId(proveedor.id)
    setEditForm({
      nombre: proveedor.nombre,
      apellido: proveedor.apellido,
      empresa: proveedor.empresa || "",
      actividad: proveedor.actividad,
      email: proveedor.email,
      telefono: proveedor.telefono,
    })
  }

  function cancelEdit() {
    setEditingId("")
    setEditForm(emptyForm)
  }

  async function saveProveedor(id: string) {
    const payload = buildPayload(editForm)
    if (!payload) return

    const { error } = await supabase.from("proveedores").update(payload).eq("id", id)

    if (error) return alert(error.message)

    cancelEdit()
    await loadPage()
  }

  async function deleteProveedor(id: string, fullName: string) {
    if (!confirm(`¿Eliminar a ${fullName}? Esta acción no se puede deshacer.`)) {
      return
    }

    const { error } = await supabase.from("proveedores").delete().eq("id", id)

    if (error) return alert(error.message)

    if (editingId === id) cancelEdit()
    await loadPage()
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  function fullName(proveedor: Proveedor) {
    return `${proveedor.nombre} ${proveedor.apellido}`.trim()
  }

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

      <main style={{ ...mainStyle, padding: isMobile ? "76px 14px 24px" : "28px 32px" }}>
        <div style={pageContainerStyle}>
          <header style={pageHeaderStyle}>
            <div>
              <p style={eyebrowStyle}>Admin</p>
              <h1 style={pageTitleStyle}>Proveedores</h1>
              <p style={pageSubtitleStyle}>
                {proveedores.length} proveedor{proveedores.length === 1 ? "" : "es"} registrado
                {proveedores.length === 1 ? "" : "s"}
              </p>
            </div>
          </header>

          <section style={panelStyle}>
            <div style={panelHeaderStyle}>
              <p style={panelTitleStyle}>Nuevo proveedor</p>
              <p style={panelHintStyle}>
                Registra contactos externos y sus datos de contacto
              </p>
            </div>

            <ProveedorFormFields
              values={form}
              onChange={setForm}
              isMobile={isMobile}
              action={
                <button onClick={createProveedor} style={primaryButtonStyle}>
                  Agregar
                </button>
              }
            />
          </section>

          <section style={{ ...panelStyle, marginTop: 14 }}>
            <div style={panelHeaderStyle}>
              <p style={panelTitleStyle}>Directorio</p>
              <p style={panelHintStyle}>Consulta, edita o elimina proveedores registrados</p>
            </div>

            {!isMobile && proveedores.length > 0 && (
              <div style={tableHeaderStyle}>
                <span>Proveedor</span>
                <span>Actividad</span>
                <span>Contacto</span>
                <span>Acciones</span>
              </div>
            )}

            <div style={tableBodyStyle}>
              {proveedores.length === 0 ? (
                <div style={emptyStateStyle}>Sin proveedores registrados</div>
              ) : (
                proveedores.map((proveedor) => {
                  const isEditing = editingId === proveedor.id
                  const name = fullName(proveedor)

                  if (isEditing) {
                    return (
                      <div key={proveedor.id} style={editPanelStyle}>
                        <ProveedorFormFields
                          values={editForm}
                          onChange={setEditForm}
                          isMobile={isMobile}
                          action={
                            <div style={rowActionsStyle}>
                              <button
                                onClick={() => saveProveedor(proveedor.id)}
                                style={primaryButtonStyle}
                              >
                                Guardar
                              </button>
                              <button onClick={cancelEdit} style={secondaryButtonStyle}>
                                Cancelar
                              </button>
                            </div>
                          }
                        />
                      </div>
                    )
                  }

                  return (
                    <div
                      key={proveedor.id}
                      style={{
                        ...rowStyle,
                        gridTemplateColumns: isMobile
                          ? "1fr"
                          : "minmax(180px, 1.3fr) 140px 180px 180px",
                      }}
                    >
                      <div style={personCellStyle}>
                        <span style={avatarStyle(name)}>{name.charAt(0).toUpperCase()}</span>
                        <div style={{ minWidth: 0 }}>
                          <p style={personNameStyle}>{name}</p>
                          {proveedor.empresa && (
                            <p style={personMetaStyle}>{proveedor.empresa}</p>
                          )}
                        </div>
                      </div>

                      <div style={metaCellStyle}>
                        <span style={activityBadgeStyle}>{proveedor.actividad}</span>
                      </div>

                      <div style={contactCellStyle}>
                        <p style={contactLineStyle}>{proveedor.email}</p>
                        <p style={contactLineStyle}>{proveedor.telefono}</p>
                      </div>

                      <div style={rowActionsStyle}>
                        <button onClick={() => startEdit(proveedor)} style={secondaryButtonStyle}>
                          Editar
                        </button>
                        <button
                          onClick={() => deleteProveedor(proveedor.id, name)}
                          style={dangerButtonStyle}
                        >
                          Borrar
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}

function ProveedorFormFields({
  values,
  onChange,
  isMobile,
  action,
}: {
  values: ProveedorForm
  onChange: (values: ProveedorForm) => void
  isMobile: boolean
  action: React.ReactNode
}) {
  function updateField(field: keyof ProveedorForm, value: string) {
    onChange({ ...values, [field]: value })
  }

  return (
    <div style={formSectionsStyle}>
      <div
        style={{
          ...formGridStyle,
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1.2fr",
        }}
      >
        <Field label="Nombre">
          <input
            placeholder="Ej. Carlos"
            value={values.nombre}
            onChange={(e) => updateField("nombre", e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Apellido">
          <input
            placeholder="Ej. Ramírez"
            value={values.apellido}
            onChange={(e) => updateField("apellido", e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Empresa">
          <input
            placeholder="Opcional"
            value={values.empresa}
            onChange={(e) => updateField("empresa", e.target.value)}
            style={inputStyle}
          />
        </Field>
      </div>

      <div
        style={{
          ...formGridStyle,
          gridTemplateColumns: isMobile ? "1fr" : "1.2fr 1.2fr 1fr auto",
        }}
      >
        <Field label="Actividad">
          <input
            placeholder="Ej. Catering, transporte, renta de equipo"
            value={values.actividad}
            onChange={(e) => updateField("actividad", e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Email">
          <input
            type="email"
            placeholder="correo@proveedor.com"
            value={values.email}
            onChange={(e) => updateField("email", e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Teléfono">
          <input
            type="tel"
            placeholder="Ej. 55 1234 5678"
            value={values.telefono}
            onChange={(e) => updateField("telefono", e.target.value)}
            style={inputStyle}
          />
        </Field>

        <div style={formActionStyle}>{action}</div>
      </div>
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

function avatarStyle(name: string): React.CSSProperties {
  return {
    width: 34,
    height: 34,
    borderRadius: 10,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    background: "linear-gradient(135deg, rgba(245,158,11,0.35), rgba(234,88,12,0.25))",
    border: "1px solid rgba(251,191,36,0.22)",
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: 700,
  }
}

const activityBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  background: "rgba(245,158,11,0.14)",
  border: "1px solid rgba(251,191,36,0.24)",
  color: "#fde68a",
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
  maxWidth: 980,
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

const panelHintStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#64748b",
  fontSize: 12,
}

const formSectionsStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
}

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  alignItems: "end",
}

const formActionStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  height: "100%",
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
}

const tableHeaderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, 1.3fr) 140px 180px 180px",
  gap: 12,
  padding: "0 4px 10px",
  color: "#64748b",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.6,
}

const tableBodyStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
}

const rowStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  alignItems: "center",
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
}

const editPanelStyle: React.CSSProperties = {
  padding: "12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(251,191,36,0.18)",
}

const personCellStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
}

const personNameStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 600,
  wordBreak: "break-word",
}

const personMetaStyle: React.CSSProperties = {
  margin: "2px 0 0",
  color: "#64748b",
  fontSize: 12,
}

const metaCellStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
}

const contactCellStyle: React.CSSProperties = {
  display: "grid",
  gap: 2,
  minWidth: 0,
}

const contactLineStyle: React.CSSProperties = {
  margin: 0,
  color: "#cbd5e1",
  fontSize: 12,
  wordBreak: "break-word",
}

const rowActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
}

const emptyStateStyle: React.CSSProperties = {
  padding: "18px 12px",
  borderRadius: 12,
  textAlign: "center",
  color: "#64748b",
  fontSize: 13,
  background: "rgba(255,255,255,0.02)",
  border: "1px dashed rgba(148,163,184,0.14)",
}

const primaryButtonStyle: React.CSSProperties = {
  padding: "8px 14px",
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

const secondaryButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "transparent",
  color: "#94a3b8",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 500,
  fontSize: 13,
  whiteSpace: "nowrap",
}

const dangerButtonStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "transparent",
  color: "#f87171",
  border: "1px solid rgba(248,113,113,0.24)",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 500,
  fontSize: 13,
  whiteSpace: "nowrap",
}
