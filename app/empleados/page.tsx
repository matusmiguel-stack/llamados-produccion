"use client"

import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { requireSessionProfile } from "../../lib/session-profile"
import { AppSidebar } from "../../components/AppSidebar"
import { DatePickerField } from "../../components/DatePickerField"

type Employee = {
  id: string
  nombre: string
  apellido_paterno: string
  apellido_materno: string | null
  nickname: string | null
  email: string
  puesto: string
  sueldo_mensual: number
  fecha_ingreso: string
  cumpleanos: string | null
}

type EmployeeForm = {
  nombre: string
  apellido_paterno: string
  apellido_materno: string
  nickname: string
  email: string
  puesto: string
  sueldo_mensual: string
  fecha_ingreso: string
  cumpleanos: string
}

const emptyForm: EmployeeForm = {
  nombre: "",
  apellido_paterno: "",
  apellido_materno: "",
  nickname: "",
  email: "",
  puesto: "",
  sueldo_mensual: "",
  fecha_ingreso: "",
  cumpleanos: "",
}

export default function EmpleadosPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [form, setForm] = useState<EmployeeForm>(emptyForm)
  const [editingId, setEditingId] = useState("")
  const [editForm, setEditForm] = useState<EmployeeForm>(emptyForm)
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
    const auth = await requireSessionProfile()
    if (!auth) return

    const myProfile = auth.profile

    if (myProfile.role !== "admin") {
      window.location.href = "/"
      return
    }

    setProfile(myProfile)

    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .order("nombre", { ascending: true })
      .order("apellido_paterno", { ascending: true })

    if (error) return alert(error.message)

    setEmployees(data || [])
  }

  useEffect(() => {
    loadPage()
  }, [])

  function buildPayload(values: EmployeeForm) {
    const sueldo = Number(values.sueldo_mensual)

    if (
      !values.nombre.trim() ||
      !values.apellido_paterno.trim() ||
      !values.email.trim() ||
      !values.puesto.trim() ||
      !values.fecha_ingreso ||
      Number.isNaN(sueldo) ||
      sueldo < 0
    ) {
      alert("Completa nombre, apellido paterno, email, puesto, sueldo y fecha de ingreso")
      return null
    }

    return {
      nombre: values.nombre.trim(),
      apellido_paterno: values.apellido_paterno.trim(),
      apellido_materno: values.apellido_materno.trim() || null,
      nickname: values.nickname.trim() || null,
      email: values.email.trim().toLowerCase(),
      puesto: values.puesto.trim(),
      sueldo_mensual: sueldo,
      fecha_ingreso: values.fecha_ingreso,
      cumpleanos: values.cumpleanos.trim() || null,
    }
  }

  async function createEmployee() {
    const payload = buildPayload(form)
    if (!payload) return

    const { error } = await supabase.from("employees").insert(payload)

    if (error) return alert(error.message)

    setForm(emptyForm)
    await loadPage()
  }

  function startEdit(employee: Employee) {
    setEditingId(employee.id)
    setEditForm({
      nombre: employee.nombre,
      apellido_paterno: employee.apellido_paterno,
      apellido_materno: employee.apellido_materno || "",
      nickname: employee.nickname || "",
      email: employee.email,
      puesto: employee.puesto,
      sueldo_mensual: String(employee.sueldo_mensual),
      fecha_ingreso: employee.fecha_ingreso,
      cumpleanos: employee.cumpleanos || "",
    })
  }

  function cancelEdit() {
    setEditingId("")
    setEditForm(emptyForm)
  }

  async function saveEmployee(id: string) {
    const payload = buildPayload(editForm)
    if (!payload) return

    const { error } = await supabase.from("employees").update(payload).eq("id", id)

    if (error) return alert(error.message)

    cancelEdit()
    await loadPage()
  }

  async function deleteEmployee(id: string, fullName: string) {
    if (!confirm(`¿Eliminar a ${fullName}? Esta acción no se puede deshacer.`)) {
      return
    }

    const { error } = await supabase.from("employees").delete().eq("id", id)

    if (error) return alert(error.message)

    if (editingId === id) cancelEdit()
    await loadPage()
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  function formatSalary(value: number) {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 2,
    }).format(value)
  }

  function formatDate(value: string) {
    const [year, month, day] = value.split("-")
    if (!year || !month || !day) return value

    return `${day}/${month}/${year}`
  }

  function formatBirthday(value: string | null) {
    if (!value) return "—"

    const [year, month, day] = value.split("-")
    if (!year || !month || !day) return value

    return `${day}/${month}/${year}`
  }

  function fullName(employee: Employee) {
    return [employee.nombre, employee.apellido_paterno, employee.apellido_materno]
      .filter(Boolean)
      .join(" ")
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
              <h1 style={pageTitleStyle}>Empleados</h1>
              <p style={pageSubtitleStyle}>
                {employees.length} persona{employees.length === 1 ? "" : "s"} registrada
                {employees.length === 1 ? "" : "s"}
              </p>
            </div>
          </header>

          <section style={panelStyle}>
            <div style={panelHeaderStyle}>
              <p style={panelTitleStyle}>Nuevo empleado</p>
              <p style={panelHintStyle}>
                Registra al personal con puesto, sueldo, fecha de ingreso y cumpleaños
              </p>
            </div>

            <EmployeeFormFields
              values={form}
              onChange={setForm}
              isMobile={isMobile}
              action={
                <button onClick={createEmployee} style={primaryButtonStyle}>
                  Agregar
                </button>
              }
            />
          </section>

          <section style={{ ...panelStyle, marginTop: 14 }}>
            <div style={panelHeaderStyle}>
              <p style={panelTitleStyle}>Plantilla</p>
              <p style={panelHintStyle}>Consulta, edita o elimina empleados registrados</p>
            </div>

            {!isMobile && employees.length > 0 && (
              <div style={tableHeaderStyle}>
                <span>Empleado</span>
                <span>Puesto</span>
                <span>Sueldo</span>
                <span>Ingreso</span>
                <span>Cumpleaños</span>
                <span>Acciones</span>
              </div>
            )}

            <div style={tableBodyStyle}>
              {employees.length === 0 ? (
                <div style={emptyStateStyle}>Sin empleados registrados</div>
              ) : (
                employees.map((employee) => {
                  const isEditing = editingId === employee.id
                  const name = fullName(employee)

                  if (isEditing) {
                    return (
                      <div key={employee.id} style={editPanelStyle}>
                        <EmployeeFormFields
                          values={editForm}
                          onChange={setEditForm}
                          isMobile={isMobile}
                          action={
                            <div style={rowActionsStyle}>
                              <button
                                onClick={() => saveEmployee(employee.id)}
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
                      key={employee.id}
                      style={{
                        ...rowStyle,
                        gridTemplateColumns: isMobile
                          ? "1fr"
                          : "minmax(180px, 1.2fr) 130px 110px 96px 96px 170px",
                      }}
                    >
                      <div style={employeeCellStyle}>
                        <span style={avatarStyle(name)}>{name.charAt(0).toUpperCase()}</span>
                        <div style={{ minWidth: 0 }}>
                          <p style={employeeNameStyle}>{name}</p>
                          <p style={employeeMetaStyle}>{employee.email}</p>
                          {employee.nickname && (
                            <p style={employeeMetaStyle}>@{employee.nickname}</p>
                          )}
                        </div>
                      </div>

                      <div style={metaCellStyle}>
                        <span style={positionBadgeStyle}>{employee.puesto}</span>
                      </div>

                      <div style={metaCellStyle}>
                        <span style={salaryStyle}>{formatSalary(employee.sueldo_mensual)}</span>
                      </div>

                      <div style={metaCellStyle}>
                        <span style={dateStyle}>{formatDate(employee.fecha_ingreso)}</span>
                      </div>

                      <div style={metaCellStyle}>
                        <span style={dateStyle}>{formatBirthday(employee.cumpleanos)}</span>
                      </div>

                      <div style={rowActionsStyle}>
                        <button onClick={() => startEdit(employee)} style={secondaryButtonStyle}>
                          Editar
                        </button>
                        <button
                          onClick={() => deleteEmployee(employee.id, name)}
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

function EmployeeFormFields({
  values,
  onChange,
  isMobile,
  action,
}: {
  values: EmployeeForm
  onChange: (values: EmployeeForm) => void
  isMobile: boolean
  action: React.ReactNode
}) {
  function updateField(field: keyof EmployeeForm, value: string) {
    onChange({ ...values, [field]: value })
  }

  return (
    <div style={formSectionsStyle}>
      <div
        style={{
          ...formGridStyle,
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
        }}
      >
        <Field label="Nombre">
          <input
            placeholder="Ej. María"
            value={values.nombre}
            onChange={(e) => updateField("nombre", e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Apellido paterno">
          <input
            placeholder="Ej. López"
            value={values.apellido_paterno}
            onChange={(e) => updateField("apellido_paterno", e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Apellido materno">
          <input
            placeholder="Opcional"
            value={values.apellido_materno}
            onChange={(e) => updateField("apellido_materno", e.target.value)}
            style={inputStyle}
          />
        </Field>
      </div>

      <div
        style={{
          ...formGridStyle,
          gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr 1fr",
        }}
      >
        <Field label="Email">
          <input
            type="email"
            placeholder="correo@empresa.com"
            value={values.email}
            onChange={(e) => updateField("email", e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Nickname">
          <input
            placeholder="Opcional"
            value={values.nickname}
            onChange={(e) => updateField("nickname", e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Puesto">
          <input
            placeholder="Ej. Productor"
            value={values.puesto}
            onChange={(e) => updateField("puesto", e.target.value)}
            style={inputStyle}
          />
        </Field>
      </div>

      <div
        style={{
          ...formGridStyle,
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        }}
      >
        <Field label="Sueldo mensual">
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={values.sueldo_mensual}
            onChange={(e) => updateField("sueldo_mensual", e.target.value)}
            style={inputStyle}
          />
        </Field>
      </div>

      <div
        style={{
          ...formGridStyle,
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        }}
      >
        <DatePickerField
          label="Fecha de ingreso"
          value={values.fecha_ingreso}
          labelStyle={fieldLabelStyle}
          onChange={(value) => updateField("fecha_ingreso", value)}
        />

        <DatePickerField
          label="Cumpleaños"
          value={values.cumpleanos}
          labelStyle={fieldLabelStyle}
          placeholder="Opcional"
          onChange={(value) => updateField("cumpleanos", value)}
        />
      </div>

      <div style={formActionRowStyle}>{action}</div>
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
    background: "linear-gradient(135deg, rgba(124,58,237,0.35), rgba(14,165,233,0.25))",
    border: "1px solid rgba(167,139,250,0.22)",
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: 700,
  }
}

const positionBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  background: "rgba(14,165,233,0.14)",
  border: "1px solid rgba(56,189,248,0.24)",
  color: "#bae6fd",
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

const formActionRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-start",
  paddingTop: 2,
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
  gridTemplateColumns: "minmax(180px, 1.2fr) 130px 110px 96px 96px 170px",
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
  border: "1px solid rgba(167,139,250,0.18)",
}

const employeeCellStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
}

const employeeNameStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 14,
  fontWeight: 600,
  wordBreak: "break-word",
}

const employeeMetaStyle: React.CSSProperties = {
  margin: "2px 0 0",
  color: "#64748b",
  fontSize: 12,
}

const metaCellStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
}

const salaryStyle: React.CSSProperties = {
  color: "#86efac",
  fontSize: 13,
  fontWeight: 600,
}

const dateStyle: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 13,
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
