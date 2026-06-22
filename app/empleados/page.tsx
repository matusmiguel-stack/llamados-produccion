"use client"
import { PageLoader } from "../../components/PageLoader"

import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { requireSessionProfile } from "../../lib/session-profile"
import { AppSidebar } from "../../components/AppSidebar"
import { DatePickerField } from "../../components/DatePickerField"
import { resumenVacaciones, diasPorAnios, MESES } from "../../lib/vacaciones"

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
  vac_anios: number | null
  vac_mes_reseteo: number | null
  vac_dias_base: number | null
  vac_ultimo_reset_anio: number | null
}

type SalaryChange = {
  id: string
  employee_id: string
  sueldo_anterior: number | null
  sueldo_nuevo: number
  effective_date: string
  applied: boolean
  created_at: string
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
  vac_anios: string
  vac_mes_reseteo: string
  vac_dias_base: string
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
  vac_anios: "",
  vac_mes_reseteo: "",
  vac_dias_base: "0",
}

export default function EmpleadosPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [vacRangesByEmp, setVacRangesByEmp] = useState<Record<string, { start_date: string; end_date: string }[]>>({})
  const [profile, setProfile] = useState<any>(null)
  const [form, setForm] = useState<EmployeeForm>(emptyForm)
  const [editingId, setEditingId] = useState("")
  const [editForm, setEditForm] = useState<EmployeeForm>(emptyForm)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [salaryChanges, setSalaryChanges] = useState<SalaryChange[]>([])
  const [adjustingId, setAdjustingId] = useState("")
  const [adjustMonto, setAdjustMonto] = useState("")
  const [adjustFecha, setAdjustFecha] = useState("")
  const [savingAdjust, setSavingAdjust] = useState(false)

  const isAdmin = profile?.role === "admin"
  // Editor premium entra pero solo ve/edita vacaciones (sin sueldos)
  const vacOnly = profile?.role === "editor_premium"
  const canSeeSalary = isAdmin

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

    if (myProfile.role !== "admin" && myProfile.role !== "editor_premium") {
      window.location.href = "/"
      return
    }

    setProfile(myProfile)

    // Aplicar aumentos programados cuya fecha ya llegó (solo admin)
    const todayStr = new Date().toLocaleDateString("sv")
    const { data: pendientes } = myProfile.role === "admin"
      ? await supabase
          .from("employee_salary_changes")
          .select("*")
          .eq("applied", false)
          .lte("effective_date", todayStr)
      : { data: null }

    if (pendientes && pendientes.length > 0) {
      const latestByEmp: Record<string, SalaryChange> = {}
      for (const change of pendientes as SalaryChange[]) {
        const current = latestByEmp[change.employee_id]
        if (!current || change.effective_date > current.effective_date) {
          latestByEmp[change.employee_id] = change
        }
      }
      for (const change of Object.values(latestByEmp)) {
        await supabase
          .from("employee_compensation")
          .upsert({ employee_id: change.employee_id, sueldo_mensual: change.sueldo_nuevo, updated_at: new Date().toISOString() })
      }
      await supabase
        .from("employee_salary_changes")
        .update({ applied: true })
        .in("id", pendientes.map((p) => p.id))
    }

    const [{ data, error }, { data: changes }] = await Promise.all([
      supabase
        .from("employees")
        .select("*")
        .order("nombre", { ascending: true })
        .order("apellido_paterno", { ascending: true }),
      myProfile.role === "admin"
        ? supabase
            .from("employee_salary_changes")
            .select("*")
            .order("effective_date", { ascending: false })
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ])

    if (error) return alert(error.message)

    // Vacaciones del calendario por empleado (para descontar días)
    const { data: vacAssign } = await supabase
      .from("vacation_employees")
      .select("employee_id, vacations(start_date, end_date)")
    const rangesByEmp: Record<string, { start_date: string; end_date: string }[]> = {}
    for (const va of (vacAssign as any[]) || []) {
      const v = va.vacations
      if (!v?.start_date || !v?.end_date) continue
      ;(rangesByEmp[va.employee_id] ||= []).push({ start_date: v.start_date, end_date: v.end_date })
    }
    setVacRangesByEmp(rangesByEmp)

    // Sueldos (solo admin): vienen de una tabla aparte protegida
    const emps = (data || []) as unknown as Employee[]
    if (myProfile.role === "admin") {
      const { data: comp } = await supabase
        .from("employee_compensation")
        .select("employee_id, sueldo_mensual")
      const compMap = new Map((comp || []).map((c: any) => [c.employee_id, Number(c.sueldo_mensual)]))
      for (const e of emps) e.sueldo_mensual = compMap.get(e.id) ?? 0
    }

    // Reinicio automático: si pasó el mes de reseteo, sube años y limpia base
    for (const e of emps) {
      if (e.vac_mes_reseteo == null || e.vac_anios == null) continue
      const r = resumenVacaciones(e, rangesByEmp[e.id] || [])
      if (r.needsReset) {
        await supabase.from("employees")
          .update({ vac_anios: r.newAnios, vac_dias_base: 0, vac_ultimo_reset_anio: r.startISO.slice(0, 4) })
          .eq("id", e.id)
        e.vac_anios = r.newAnios
        e.vac_dias_base = 0
        e.vac_ultimo_reset_anio = parseInt(r.startISO.slice(0, 4))
      }
    }

    setEmployees(emps)
    setSalaryChanges((changes as SalaryChange[]) || [])
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
      fecha_ingreso: values.fecha_ingreso,
      cumpleanos: values.cumpleanos.trim() || null,
      vac_anios: values.vac_anios.trim() !== "" ? parseInt(values.vac_anios) : null,
      vac_mes_reseteo: values.vac_mes_reseteo.trim() !== "" ? parseInt(values.vac_mes_reseteo) : null,
      vac_dias_base: values.vac_dias_base.trim() !== "" ? parseFloat(values.vac_dias_base) : 0,
    }
  }

  async function createEmployee() {
    const payload = buildPayload(form)
    if (!payload) return

    const { data: created, error } = await supabase.from("employees").insert(payload).select("id").single()
    if (error) return alert(error.message)

    // Sueldo en la tabla protegida
    if (created) {
      await supabase.from("employee_compensation")
        .upsert({ employee_id: created.id, sueldo_mensual: Number(form.sueldo_mensual) || 0, updated_at: new Date().toISOString() })
    }

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
      vac_anios: employee.vac_anios != null ? String(employee.vac_anios) : "",
      vac_mes_reseteo: employee.vac_mes_reseteo != null ? String(employee.vac_mes_reseteo) : "",
      vac_dias_base: employee.vac_dias_base != null ? String(employee.vac_dias_base) : "0",
    })
  }

  function cancelEdit() {
    setEditingId("")
    setEditForm(emptyForm)
  }

  async function saveEmployee(id: string) {
    let payload: Record<string, unknown> | null
    if (vacOnly) {
      // Editor premium: solo actualiza vacaciones
      payload = {
        vac_anios: editForm.vac_anios.trim() !== "" ? parseInt(editForm.vac_anios) : null,
        vac_mes_reseteo: editForm.vac_mes_reseteo.trim() !== "" ? parseInt(editForm.vac_mes_reseteo) : null,
        vac_dias_base: editForm.vac_dias_base.trim() !== "" ? parseFloat(editForm.vac_dias_base) : 0,
      }
    } else {
      payload = buildPayload(editForm)
    }
    if (!payload) return

    const { error } = await supabase.from("employees").update(payload).eq("id", id)
    if (error) return alert(error.message)

    // Sueldo (solo admin) en la tabla protegida
    if (!vacOnly && isAdmin) {
      await supabase.from("employee_compensation")
        .upsert({ employee_id: id, sueldo_mensual: Number(editForm.sueldo_mensual) || 0, updated_at: new Date().toISOString() })
    }

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

  function startAdjust(employee: Employee) {
    setAdjustingId(employee.id)
    setAdjustMonto("")
    setAdjustFecha("")
    if (editingId === employee.id) cancelEdit()
  }

  function cancelAdjust() {
    setAdjustingId("")
    setAdjustMonto("")
    setAdjustFecha("")
  }

  async function saveAdjust(employee: Employee) {
    const monto = Number(adjustMonto)

    if (!adjustMonto.trim() || Number.isNaN(monto) || monto < 0) {
      alert("Ingresa la nueva cantidad mensual")
      return
    }
    if (!adjustFecha) {
      alert("Selecciona a partir de qué día se aplicará el ajuste")
      return
    }

    setSavingAdjust(true)
    const todayStr = new Date().toLocaleDateString("sv")
    const applyNow = adjustFecha <= todayStr

    const { error } = await supabase.from("employee_salary_changes").insert({
      employee_id: employee.id,
      sueldo_anterior: employee.sueldo_mensual,
      sueldo_nuevo: monto,
      effective_date: adjustFecha,
      applied: applyNow,
    })

    if (error) {
      setSavingAdjust(false)
      return alert(error.message)
    }

    if (applyNow) {
      const { error: updateError } = await supabase
        .from("employee_compensation")
        .upsert({ employee_id: employee.id, sueldo_mensual: monto, updated_at: new Date().toISOString() })
      if (updateError) {
        setSavingAdjust(false)
        return alert(updateError.message)
      }
    }

    setSavingAdjust(false)
    cancelAdjust()
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

  if (!profile) return <PageLoader />
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

          {!vacOnly && (
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
          )}

          <section style={{ ...panelStyle, marginTop: 14 }}>
            <div style={panelHeaderStyle}>
              <p style={panelTitleStyle}>Plantilla</p>
              <p style={panelHintStyle}>Consulta, edita o elimina empleados registrados</p>
            </div>

            {!isMobile && employees.length > 0 && (
              <div style={{
                ...tableHeaderStyle,
                gridTemplateColumns: canSeeSalary
                  ? "minmax(180px, 1.2fr) 120px 110px 90px 90px 210px"
                  : "minmax(180px, 1.4fr) 140px 110px 110px 160px",
              }}>
                <span>Empleado</span>
                <span>Puesto</span>
                {canSeeSalary && <span>Sueldo</span>}
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
                          vacOnly={vacOnly}
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

                  const history = salaryChanges.filter((c) => c.employee_id === employee.id)
                  const pendingRaise = history.find((c) => !c.applied)
                  const isAdjusting = adjustingId === employee.id

                  return (
                    <div key={employee.id} style={{ display: "grid", gap: 8 }}>
                      <div
                        style={{
                          ...rowStyle,
                          gridTemplateColumns: isMobile
                            ? "1fr"
                            : canSeeSalary
                              ? "minmax(180px, 1.2fr) 120px 110px 90px 90px 210px"
                              : "minmax(180px, 1.4fr) 140px 110px 110px 160px",
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

                        {canSeeSalary && (
                          <div style={{ ...metaCellStyle, flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                            <span style={salaryStyle}>{formatSalary(employee.sueldo_mensual)}</span>
                            {pendingRaise && (
                              <span style={pendingRaiseStyle}>
                                → {formatSalary(pendingRaise.sueldo_nuevo)} desde {formatDate(pendingRaise.effective_date)}
                              </span>
                            )}
                          </div>
                        )}

                        <div style={metaCellStyle}>
                          <span style={dateStyle}>{formatDate(employee.fecha_ingreso)}</span>
                        </div>

                        <div style={metaCellStyle}>
                          <span style={dateStyle}>{formatBirthday(employee.cumpleanos)}</span>
                        </div>

                        <div style={rowActionsStyle}>
                          {canSeeSalary && (
                            <button
                              onClick={() => (isAdjusting ? cancelAdjust() : startAdjust(employee))}
                              style={isAdjusting ? primaryButtonStyle : secondaryButtonStyle}
                            >
                              Sueldo
                            </button>
                          )}
                          <button onClick={() => startEdit(employee)} style={secondaryButtonStyle}>
                            {vacOnly ? "Vacaciones" : "Editar"}
                          </button>
                          {canSeeSalary && (
                            <button
                              onClick={() => deleteEmployee(employee.id, name)}
                              style={dangerButtonStyle}
                            >
                              Borrar
                            </button>
                          )}
                        </div>
                      </div>

                      {(() => {
                        if (employee.vac_mes_reseteo == null || employee.vac_anios == null) {
                          return (
                            <div style={vacBarStyle}>
                              <span style={{ color: "#64748b", fontSize: 12 }}>
                                🏖️ Vacaciones sin configurar · usa “Editar” para asignar años y mes de reseteo
                              </span>
                            </div>
                          )
                        }
                        const r = resumenVacaciones(employee, vacRangesByEmp[employee.id] || [])
                        const pct = r.corresponden > 0 ? Math.max(0, Math.min(100, (r.restantes / r.corresponden) * 100)) : 0
                        const barColor = r.restantes <= 0 ? "#f87171" : r.restantes <= 3 ? "#fb923c" : "#34d399"
                        return (
                          <div style={vacBarStyle}>
                            <span style={{ fontSize: 14 }}>🏖️</span>
                            <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 700 }}>
                              {r.restantes} <span style={{ color: "#64748b", fontWeight: 400 }}>de {r.corresponden} días restantes</span>
                            </span>
                            <span style={{ color: "#64748b", fontSize: 11 }}>· {r.tomados} tomados</span>
                            <div style={{ flex: 1, minWidth: 60, maxWidth: 160, height: 6, borderRadius: 999, background: "rgba(148,163,184,0.15)", overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: barColor }} />
                            </div>
                            <span style={{ color: "#64748b", fontSize: 11, marginLeft: "auto" }}>
                              {r.anios} año{r.anios !== 1 ? "s" : ""} · resetea {MESES[r.mesReseteo - 1]}
                            </span>
                          </div>
                        )
                      })()}

                      {isAdjusting && (
                        <div style={adjustPanelStyle}>
                          <p style={adjustTitleStyle}>Ajuste de sueldo · {name}</p>
                          <div
                            style={{
                              display: "grid",
                              gap: 10,
                              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr auto",
                              alignItems: "end",
                            }}
                          >
                            <div style={fieldStyle}>
                              <span style={fieldLabelStyle}>Sueldo actual</span>
                              <span style={{ ...salaryStyle, fontSize: 15, padding: "8px 0" }}>
                                {formatSalary(employee.sueldo_mensual)}
                              </span>
                            </div>

                            <Field label="Nueva cantidad mensual">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={adjustMonto}
                                onChange={(e) => setAdjustMonto(e.target.value)}
                                style={inputStyle}
                              />
                            </Field>

                            <DatePickerField
                              label="Se aplica a partir de"
                              value={adjustFecha}
                              labelStyle={fieldLabelStyle}
                              onChange={setAdjustFecha}
                            />

                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                onClick={() => saveAdjust(employee)}
                                disabled={savingAdjust}
                                style={{ ...primaryButtonStyle, opacity: savingAdjust ? 0.6 : 1 }}
                              >
                                {savingAdjust ? "Guardando…" : "Guardar ajuste"}
                              </button>
                              <button onClick={cancelAdjust} style={secondaryButtonStyle}>
                                Cancelar
                              </button>
                            </div>
                          </div>

                          <div style={historyBlockStyle}>
                            <p style={historyTitleStyle}>Histórico de sueldos</p>
                            {history.length === 0 ? (
                              <p style={historyEmptyStyle}>
                                Sin ajustes registrados. El sueldo actual es el registrado desde su ingreso
                                ({formatDate(employee.fecha_ingreso)}).
                              </p>
                            ) : (
                              <div style={{ display: "grid", gap: 6 }}>
                                {history.map((change) => (
                                  <div key={change.id} style={historyRowStyle}>
                                    <span style={dateStyle}>{formatDate(change.effective_date)}</span>
                                    <span style={historyAmountStyle}>
                                      {change.sueldo_anterior != null
                                        ? `${formatSalary(change.sueldo_anterior)} → `
                                        : ""}
                                      <strong style={{ color: "#86efac" }}>
                                        {formatSalary(change.sueldo_nuevo)}
                                      </strong>
                                    </span>
                                    <span
                                      style={
                                        change.applied
                                          ? historyBadgeAppliedStyle
                                          : historyBadgePendingStyle
                                      }
                                    >
                                      {change.applied ? "Aplicado" : "Programado"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
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
  vacOnly = false,
}: {
  values: EmployeeForm
  onChange: (values: EmployeeForm) => void
  isMobile: boolean
  action: React.ReactNode
  vacOnly?: boolean
}) {
  function updateField(field: keyof EmployeeForm, value: string) {
    onChange({ ...values, [field]: value })
  }

  if (vacOnly) {
    return (
      <div style={formSectionsStyle}>
        <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>
          Vacaciones de <strong style={{ color: "#e2e8f0" }}>{values.nombre} {values.apellido_paterno}</strong>
        </p>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr" }}>
          <Field label="Años laborados">
            <input type="number" min="0" value={values.vac_anios}
              onChange={(e) => updateField("vac_anios", e.target.value)} placeholder="ej. 5" style={inputStyle} />
            {values.vac_anios.trim() !== "" && (
              <span style={{ fontSize: 11, color: "#34d399", marginTop: 4 }}>
                Le corresponden {diasPorAnios(parseInt(values.vac_anios) || 0)} días
              </span>
            )}
          </Field>
          <Field label="Mes de reseteo">
            <select value={values.vac_mes_reseteo} onChange={(e) => updateField("vac_mes_reseteo", e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </Field>
          <Field label="Días ya tomados (este período)">
            <input type="number" min="0" step="0.5" value={values.vac_dias_base}
              onChange={(e) => updateField("vac_dias_base", e.target.value)} placeholder="0" style={inputStyle} />
          </Field>
        </div>
        <div style={formActionRowStyle}>{action}</div>
      </div>
    )
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

      {/* Vacaciones */}
      <p style={{ margin: "6px 0 0", fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.6 }}>🏖️ Vacaciones</p>
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
        }}
      >
        <Field label="Años laborados">
          <input
            type="number" min="0" value={values.vac_anios}
            onChange={(e) => updateField("vac_anios", e.target.value)}
            placeholder="ej. 5" style={inputStyle}
          />
          {values.vac_anios.trim() !== "" && (
            <span style={{ fontSize: 11, color: "#34d399", marginTop: 4 }}>
              Le corresponden {diasPorAnios(parseInt(values.vac_anios) || 0)} días
            </span>
          )}
        </Field>
        <Field label="Mes de reseteo">
          <select
            value={values.vac_mes_reseteo}
            onChange={(e) => updateField("vac_mes_reseteo", e.target.value)}
            style={inputStyle}
          >
            <option value="">—</option>
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </Field>
        <Field label="Días ya tomados (este período)">
          <input
            type="number" min="0" step="0.5" value={values.vac_dias_base}
            onChange={(e) => updateField("vac_dias_base", e.target.value)}
            placeholder="0" style={inputStyle}
          />
        </Field>
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
  gridTemplateColumns: "minmax(180px, 1.2fr) 120px 110px 90px 90px 210px",
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

const vacBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  padding: "8px 14px",
  margin: "0 2px",
  borderRadius: 10,
  background: "rgba(52,211,153,0.06)",
  border: "1px solid rgba(52,211,153,0.16)",
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

const pendingRaiseStyle: React.CSSProperties = {
  color: "#fbbf24",
  fontSize: 11,
  fontWeight: 600,
}

const adjustPanelStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  background: "rgba(124,58,237,0.06)",
  border: "1px solid rgba(167,139,250,0.22)",
}

const adjustTitleStyle: React.CSSProperties = {
  margin: "0 0 12px",
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 600,
}

const historyBlockStyle: React.CSSProperties = {
  marginTop: 14,
  paddingTop: 12,
  borderTop: "1px solid rgba(148,163,184,0.12)",
}

const historyTitleStyle: React.CSSProperties = {
  margin: "0 0 8px",
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.6,
}

const historyEmptyStyle: React.CSSProperties = {
  margin: 0,
  color: "#64748b",
  fontSize: 12,
}

const historyRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "7px 10px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.05)",
  flexWrap: "wrap",
}

const historyAmountStyle: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 13,
  flex: 1,
}

const historyBadgeAppliedStyle: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 600,
  background: "rgba(52,211,153,0.12)",
  border: "1px solid rgba(52,211,153,0.24)",
  color: "#6ee7b7",
}

const historyBadgePendingStyle: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 600,
  background: "rgba(251,191,36,0.12)",
  border: "1px solid rgba(251,191,36,0.26)",
  color: "#fbbf24",
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
