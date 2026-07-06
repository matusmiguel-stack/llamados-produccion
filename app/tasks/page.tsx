"use client"
import { PageLoader } from "../../components/PageLoader"
import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { requireSessionProfile } from "../../lib/session-profile"
import { AppSidebar } from "../../components/AppSidebar"
import { DatePickerField } from "../../components/DatePickerField"

type Task = {
  id: string
  user_id: string
  title: string
  due_date: string
  due_time: string | null
  completed: boolean
  completed_at: string | null
  completed_by: string | null
  created_at: string
  shares: string[] // ids de usuarios con quienes está compartida
}

type AppUser = { id: string; full_name: string | null; email: string }

function getLocalToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function isOverdue(task: Task): boolean {
  if (task.completed) return false
  const today = getLocalToday()
  if (task.due_date < today) return true
  if (task.due_date === today && task.due_time) {
    const now = new Date()
    const [h, m] = task.due_time.split(":").map(Number)
    return now.getHours() > h || (now.getHours() === h && now.getMinutes() >= m)
  }
  return false
}

function formatDueLabel(task: Task): string {
  const today = getLocalToday()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`

  const [y, mo, d] = task.due_date.split("-")
  const dateLabel =
    task.due_date === today
      ? "Hoy"
      : task.due_date === tomorrowStr
      ? "Mañana"
      : new Date(task.due_date + "T12:00:00").toLocaleDateString("es-CL", {
          weekday: "short", day: "numeric", month: "short"
        })

  return task.due_time ? `${dateLabel} ${task.due_time.slice(0, 5)}` : dateLabel
}

export default function TasksPage() {
  const [profile, setProfile] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [newTitle, setNewTitle] = useState("")
  const [newDate, setNewDate] = useState(getLocalToday())
  const [newTime, setNewTime] = useState("")
  const [newShares, setNewShares] = useState<string[]>([])
  const [showNewShares, setShowNewShares] = useState(false)

  const [editTitle, setEditTitle] = useState("")
  const [editDate, setEditDate] = useState("")
  const [editTime, setEditTime] = useState("")
  const [editShares, setEditShares] = useState<string[]>([])

  const [appUsers, setAppUsers] = useState<AppUser[]>([])

  const [showCompleted, setShowCompleted] = useState(false)

  useEffect(() => {
    function checkMobile() { setIsMobile(window.innerWidth < 768) }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  async function loadPage() {
    const auth = await requireSessionProfile()
    if (!auth) return
    setUser(auth.session.user)
    setProfile(auth.profile)
    const { data: profs } = await supabase
      .from("profiles").select("id,full_name,email").order("full_name")
    setAppUsers(profs || [])
    await loadTasks()
  }

  async function loadTasks() {
    const { data } = await supabase
      .from("user_tasks")
      .select("*, user_task_shares(user_id)")
      .order("due_date")
      .order("due_time", { nullsFirst: true })
    setTasks((data || []).map((t: any) => ({
      ...t,
      shares: (t.user_task_shares || []).map((s: any) => s.user_id),
    })))
  }

  const nameOf = (id: string | null): string => {
    if (!id) return "—"
    const u = appUsers.find(x => x.id === id)
    return u?.full_name || u?.email?.split("@")[0] || "—"
  }

  useEffect(() => { loadPage() }, [])

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  async function createTask() {
    if (!newTitle.trim()) return
    const { data: created, error } = await supabase.from("user_tasks").insert({
      user_id: user.id,
      title: newTitle.trim(),
      due_date: newDate,
      due_time: newTime || null,
    }).select("id").single()
    if (error) return alert(error.message)
    if (created && newShares.length > 0) {
      const { error: shareErr } = await supabase.from("user_task_shares")
        .insert(newShares.map(uid => ({ task_id: created.id, user_id: uid })))
      if (shareErr) alert(`La tarea se creó pero no se pudo compartir: ${shareErr.message}`)
    }
    setNewTitle("")
    setNewDate(getLocalToday())
    setNewTime("")
    setNewShares([])
    setShowNewShares(false)
    await loadTasks()
  }

  async function toggleComplete(task: Task) {
    const now = new Date().toISOString()
    const { error } = await supabase.from("user_tasks").update({
      completed: !task.completed,
      completed_at: !task.completed ? now : null,
      completed_by: !task.completed ? user.id : null,
    }).eq("id", task.id)
    if (error) return alert(error.message)
    await loadTasks()
  }

  async function deleteTask(id: string) {
    if (!confirm("¿Borrar esta tarea?")) return
    const { error } = await supabase.from("user_tasks").delete().eq("id", id)
    if (error) return alert(error.message)
    await loadTasks()
  }

  function startEdit(task: Task) {
    setEditingId(task.id)
    setEditTitle(task.title)
    setEditDate(task.due_date)
    setEditTime(task.due_time?.slice(0, 5) || "")
    setEditShares(task.shares)
  }

  async function saveEdit(id: string) {
    if (!editTitle.trim()) return
    const { error } = await supabase.from("user_tasks").update({
      title: editTitle.trim(),
      due_date: editDate,
      due_time: editTime || null,
    }).eq("id", id)
    if (error) return alert(error.message)
    // Sincronizar con quiénes está compartida (solo el dueño puede editar)
    const original = tasks.find(t => t.id === id)
    if (original && original.user_id === user.id) {
      const antes = new Set(original.shares)
      const despues = new Set(editShares)
      const quitar = original.shares.filter(x => !despues.has(x))
      const agregar = editShares.filter(x => !antes.has(x))
      if (quitar.length > 0) {
        await supabase.from("user_task_shares").delete().eq("task_id", id).in("user_id", quitar)
      }
      if (agregar.length > 0) {
        await supabase.from("user_task_shares").insert(agregar.map(uid => ({ task_id: id, user_id: uid })))
      }
    }
    setEditingId(null)
    await loadTasks()
  }

  const pending = tasks.filter(t => !t.completed)
  const completed = tasks.filter(t => t.completed)
  const overdue = pending.filter(isOverdue)
  const upcoming = pending.filter(t => !isOverdue(t))

  if (!profile) return <PageLoader />

  return (
    <div style={appShellStyle}>
      <AppSidebar
        profile={profile}
        user={user}
        isAdmin={profile?.role === "admin"}
        isMobile={isMobile}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen(!menuOpen)}
        onMenuClose={() => setMenuOpen(false)}
        onLogout={logout}
      />

      <main style={{ flex: 1, minWidth: 0, padding: isMobile ? "76px 14px 24px" : "28px 32px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>
            Mis Tareas
          </h1>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 28 }}>
            Tus tareas privadas y las que te comparten 👥
          </p>

          {/* Nueva tarea */}
          <section style={panelStyle}>
            <p style={panelTitleStyle}>Nueva tarea</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createTask()}
                placeholder="Título de la tarea…"
                style={inputStyle}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <DatePickerField label="Fecha" value={newDate} onChange={setNewDate} />
                </div>
                <input
                  type="time"
                  value={newTime}
                  onChange={e => setNewTime(e.target.value)}
                  style={{ ...inputStyle, flex: 1, minWidth: 110 }}
                />
              </div>
              <button onClick={() => setShowNewShares(!showNewShares)} style={{ ...ghostButtonStyle, textAlign: "left" }}>
                👥 {newShares.length > 0
                  ? `Compartida con ${newShares.map(nameOf).join(", ")}`
                  : "Compartir con… (opcional)"}
              </button>
              {showNewShares && (
                <SharePicker
                  users={appUsers}
                  selfId={user?.id}
                  selected={newShares}
                  onToggle={id => setNewShares(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])}
                />
              )}
              <button onClick={createTask} style={primaryButtonStyle}>
                Agregar tarea
              </button>
            </div>
          </section>

          {/* Vencidas */}
          {overdue.length > 0 && (
            <section style={{ ...panelStyle, borderColor: "rgba(239,68,68,0.35)", marginTop: 20 }}>
              <p style={{ ...panelTitleStyle, color: "#f87171" }}>
                ⚠ Vencidas ({overdue.length})
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {overdue.map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    editing={editingId === task.id}
                    esMia={task.user_id === user?.id}
                    ownerName={nameOf(task.user_id)}
                    sharedNames={task.shares.map(nameOf)}
                    completedByName={nameOf(task.completed_by)}
                    users={appUsers} selfId={user?.id}
                    editShares={editShares} setEditShares={setEditShares}
                    editTitle={editTitle} setEditTitle={setEditTitle}
                    editDate={editDate} setEditDate={setEditDate}
                    editTime={editTime} setEditTime={setEditTime}
                    onToggle={() => toggleComplete(task)}
                    onEdit={() => startEdit(task)}
                    onSave={() => saveEdit(task.id)}
                    onCancel={() => setEditingId(null)}
                    onDelete={() => deleteTask(task.id)}
                    overdue
                  />
                ))}
              </div>
            </section>
          )}

          {/* Pendientes */}
          <section style={{ ...panelStyle, marginTop: 20 }}>
            <p style={panelTitleStyle}>
              Pendientes ({upcoming.length})
            </p>
            {upcoming.length === 0 ? (
              <p style={emptyStyle}>Sin tareas pendientes 🎉</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {upcoming.map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    editing={editingId === task.id}
                    esMia={task.user_id === user?.id}
                    ownerName={nameOf(task.user_id)}
                    sharedNames={task.shares.map(nameOf)}
                    completedByName={nameOf(task.completed_by)}
                    users={appUsers} selfId={user?.id}
                    editShares={editShares} setEditShares={setEditShares}
                    editTitle={editTitle} setEditTitle={setEditTitle}
                    editDate={editDate} setEditDate={setEditDate}
                    editTime={editTime} setEditTime={setEditTime}
                    onToggle={() => toggleComplete(task)}
                    onEdit={() => startEdit(task)}
                    onSave={() => saveEdit(task.id)}
                    onCancel={() => setEditingId(null)}
                    onDelete={() => deleteTask(task.id)}
                    overdue={false}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Completadas */}
          {completed.length > 0 && (
            <section style={{ marginTop: 20 }}>
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                style={ghostButtonStyle}
              >
                {showCompleted ? "▾" : "▸"} Completadas ({completed.length})
              </button>
              {showCompleted && (
                <div style={{ ...panelStyle, marginTop: 8 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {completed.map(task => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        editing={false}
                        esMia={task.user_id === user?.id}
                        ownerName={nameOf(task.user_id)}
                        sharedNames={task.shares.map(nameOf)}
                        completedByName={nameOf(task.completed_by)}
                        users={appUsers} selfId={user?.id}
                        editShares={[]} setEditShares={() => {}}
                        editTitle="" setEditTitle={() => {}}
                        editDate="" setEditDate={() => {}}
                        editTime="" setEditTime={() => {}}
                        onToggle={() => toggleComplete(task)}
                        onEdit={() => {}}
                        onSave={() => {}}
                        onCancel={() => {}}
                        onDelete={() => deleteTask(task.id)}
                        overdue={false}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

function SharePicker({ users, selfId, selected, onToggle }: {
  users: AppUser[]; selfId: string | undefined
  selected: string[]; onToggle: (id: string) => void
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {users.filter(u => u.id !== selfId).map(u => {
        const active = selected.includes(u.id)
        return (
          <button
            key={u.id}
            onClick={() => onToggle(u.id)}
            style={{
              padding: "4px 10px", borderRadius: 999, cursor: "pointer",
              fontSize: 12, fontWeight: 600,
              border: active ? "1px solid rgba(167,139,250,0.5)" : "1px solid rgba(148,163,184,0.2)",
              background: active ? "rgba(124,58,237,0.18)" : "transparent",
              color: active ? "#c4b5fd" : "#94a3b8",
            }}
          >
            {active ? "✓ " : ""}{u.full_name || u.email.split("@")[0]}
          </button>
        )
      })}
    </div>
  )
}

function TaskRow({
  task, editing, overdue,
  esMia, ownerName, sharedNames, completedByName,
  editTitle, setEditTitle,
  editDate, setEditDate,
  editTime, setEditTime,
  users, selfId, editShares, setEditShares,
  onToggle, onEdit, onSave, onCancel, onDelete,
}: {
  task: Task; editing: boolean; overdue: boolean
  esMia: boolean; ownerName: string; sharedNames: string[]; completedByName: string
  editTitle: string; setEditTitle: (v: string) => void
  editDate: string; setEditDate: (v: string) => void
  editTime: string; setEditTime: (v: string) => void
  users: AppUser[]; selfId: string | undefined
  editShares: string[]; setEditShares: (fn: (prev: string[]) => string[]) => void
  onToggle: () => void; onEdit: () => void; onSave: () => void
  onCancel: () => void; onDelete: () => void
}) {
  if (editing) {
    return (
      <div style={taskRowStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          <input value={editTitle} onChange={e => setEditTitle(e.target.value)} style={inputStyle} />
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <DatePickerField label="Fecha" value={editDate} onChange={setEditDate} />
            </div>
            <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#64748b" }}>👥 Compartir con:</p>
          <SharePicker
            users={users}
            selfId={selfId}
            selected={editShares}
            onToggle={id => setEditShares(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onSave} style={primaryButtonStyle}>Guardar</button>
            <button onClick={onCancel} style={ghostButtonStyle}>Cancelar</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...taskRowStyle, opacity: task.completed ? 0.55 : 1 }}>
      <button onClick={onToggle} style={checkboxStyle(task.completed)}>
        {task.completed ? "✓" : ""}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: task.completed ? "#64748b" : "#e2e8f0", textDecoration: task.completed ? "line-through" : "none", margin: 0 }}>
          {task.title}
        </p>
        <p style={{ fontSize: 12, color: overdue ? "#f87171" : "#64748b", margin: "2px 0 0" }}>
          {overdue ? "⚠ " : ""}{formatDueLabel(task)}
          {!esMia && (
            <span style={{ color: "#38bdf8" }}> · 👥 de {ownerName}</span>
          )}
          {esMia && sharedNames.length > 0 && (
            <span style={{ color: "#a78bfa" }} title={sharedNames.join(", ")}>
              {" "}· 👥 con {sharedNames.length === 1 ? sharedNames[0] : `${sharedNames.length} personas`}
            </span>
          )}
          {task.completed && task.completed_by && (
            <span style={{ color: "#34d399" }}> · ✓ por {completedByName}</span>
          )}
        </p>
      </div>
      {!task.completed && esMia && (
        <button onClick={onEdit} style={iconButtonStyle} title="Editar">✏</button>
      )}
      {esMia && (
        <button onClick={onDelete} style={{ ...iconButtonStyle, color: "#f87171" }} title="Borrar">×</button>
      )}
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const appShellStyle: React.CSSProperties = {
  display: "flex", minHeight: "100vh",
  background: "#05070d", fontFamily: "Inter, system-ui, sans-serif",
}

const panelStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(148,163,184,0.1)",
  borderRadius: 12, padding: 16,
}

const panelTitleStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: "#94a3b8",
  textTransform: "uppercase", letterSpacing: "0.05em",
  marginBottom: 12,
}

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 8, padding: "8px 12px",
  color: "#f1f5f9", fontSize: 14, width: "100%", boxSizing: "border-box",
}

const primaryButtonStyle: React.CSSProperties = {
  background: "rgba(124,58,237,0.25)",
  border: "1px solid rgba(124,58,237,0.4)",
  borderRadius: 8, padding: "8px 16px",
  color: "#a78bfa", fontSize: 13, fontWeight: 600, cursor: "pointer",
}

const ghostButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 8, padding: "6px 12px",
  color: "#94a3b8", fontSize: 13, cursor: "pointer",
}

const iconButtonStyle: React.CSSProperties = {
  background: "transparent", border: "none",
  color: "#94a3b8", cursor: "pointer", fontSize: 16, padding: "2px 6px",
}

const taskRowStyle: React.CSSProperties = {
  display: "flex", alignItems: "flex-start", gap: 10,
  padding: "10px 0", borderBottom: "1px solid rgba(148,163,184,0.07)",
}

const emptyStyle: React.CSSProperties = {
  fontSize: 13, color: "#475569", textAlign: "center", padding: "12px 0",
}

const checkboxStyle = (checked: boolean): React.CSSProperties => ({
  width: 20, height: 20, borderRadius: 6, flexShrink: 0,
  border: checked ? "2px solid #4ade80" : "2px solid rgba(148,163,184,0.3)",
  background: checked ? "rgba(74,222,128,0.15)" : "transparent",
  cursor: "pointer", fontSize: 13, color: "#4ade80",
  display: "flex", alignItems: "center", justifyContent: "center",
})
