"use client"
import { PageLoader } from "../../components/PageLoader"
import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { requireSessionProfile } from "../../lib/session-profile"
import { AppSidebar } from "../../components/AppSidebar"

type Task = {
  id: string
  title: string
  due_date: string
  due_time: string | null
  completed: boolean
  completed_at: string | null
  created_at: string
}

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

  const [editTitle, setEditTitle] = useState("")
  const [editDate, setEditDate] = useState("")
  const [editTime, setEditTime] = useState("")

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
    await loadTasks()
  }

  async function loadTasks() {
    const { data } = await supabase
      .from("user_tasks")
      .select("*")
      .order("due_date")
      .order("due_time", { nullsFirst: true })
    setTasks(data || [])
  }

  useEffect(() => { loadPage() }, [])

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  async function createTask() {
    if (!newTitle.trim()) return
    const { error } = await supabase.from("user_tasks").insert({
      title: newTitle.trim(),
      due_date: newDate,
      due_time: newTime || null,
    })
    if (error) return alert(error.message)
    setNewTitle("")
    setNewDate(getLocalToday())
    setNewTime("")
    await loadTasks()
  }

  async function toggleComplete(task: Task) {
    const now = new Date().toISOString()
    const { error } = await supabase.from("user_tasks").update({
      completed: !task.completed,
      completed_at: !task.completed ? now : null,
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
  }

  async function saveEdit(id: string) {
    if (!editTitle.trim()) return
    const { error } = await supabase.from("user_tasks").update({
      title: editTitle.trim(),
      due_date: editDate,
      due_time: editTime || null,
    }).eq("id", id)
    if (error) return alert(error.message)
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
            Solo vos podés ver estas tareas
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
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  style={{ ...inputStyle, flex: 1, minWidth: 140 }}
                />
                <input
                  type="time"
                  value={newTime}
                  onChange={e => setNewTime(e.target.value)}
                  style={{ ...inputStyle, flex: 1, minWidth: 120 }}
                  placeholder="Hora (opcional)"
                />
              </div>
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

function TaskRow({
  task, editing, overdue,
  editTitle, setEditTitle,
  editDate, setEditDate,
  editTime, setEditTime,
  onToggle, onEdit, onSave, onCancel, onDelete,
}: {
  task: Task; editing: boolean; overdue: boolean
  editTitle: string; setEditTitle: (v: string) => void
  editDate: string; setEditDate: (v: string) => void
  editTime: string; setEditTime: (v: string) => void
  onToggle: () => void; onEdit: () => void; onSave: () => void
  onCancel: () => void; onDelete: () => void
}) {
  if (editing) {
    return (
      <div style={taskRowStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          <input value={editTitle} onChange={e => setEditTitle(e.target.value)} style={inputStyle} />
          <div style={{ display: "flex", gap: 6 }}>
            <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
            <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          </div>
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
        </p>
      </div>
      {!task.completed && (
        <button onClick={onEdit} style={iconButtonStyle} title="Editar">✏</button>
      )}
      <button onClick={onDelete} style={{ ...iconButtonStyle, color: "#f87171" }} title="Borrar">×</button>
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
