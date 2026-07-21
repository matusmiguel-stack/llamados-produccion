"use client"

import React, { useEffect, useState } from "react"
import { supabase } from "../../../lib/supabase"

// ─── Types ────────────────────────────────────────────────────────────────────

type MatrizData = {
  id?: string
  project_id: string
  // Nombre de esta matriz (un proyecto puede tener varias)
  nombre: string
  // Generales
  nombre_proyecto: string
  cliente: string
  director: string
  productor: string
  lider_post: string
  nomenclatura: string
  // Entregas
  time_table: string
  // Recursos
  material: string
  calificacion: string
  entregables: string
  asignacion_capsulas: string
  guion_ppm: string
  legales: string
  referencia_musica: string
  paqueteria_grafica: string
  assets: string
  liga_masters: string
  backup_produccion: string
  backup_post: string
  // Minuta
  minuta: string
  // Indicaciones extra
  indicaciones_extra: string
}

function emptyMatriz(projectId: string): MatrizData {
  return {
    project_id: projectId,
    nombre: "",
    nombre_proyecto: "",
    cliente: "",
    director: "",
    productor: "",
    lider_post: "",
    nomenclatura: "",
    time_table: "",
    material: "",
    calificacion: "",
    entregables: "",
    asignacion_capsulas: "",
    guion_ppm: "",
    legales: "",
    referencia_musica: "",
    paqueteria_grafica: "",
    assets: "",
    liga_masters: "",
    backup_produccion: "",
    backup_post: "",
    minuta: "",
    indicaciones_extra: "",
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const URL_REGEX = /(https?:\/\/[^\s]+)/g

// Convierte los enlaces dentro de una línea en <a> clickeables, dejando el
// resto como texto. Así una línea tipo "Master 1: https://..." también linkea.
function renderLineWithLinks(line: string): React.ReactNode {
  const parts = line.split(URL_REGEX)
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noreferrer"
        style={{
          color: "#60a5fa",
          textDecoration: "underline",
          wordBreak: "break-all",
        }}
      >
        {part}
      </a>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  )
}

function ValueView({
  val,
  center,
  bold,
}: {
  val: string
  center?: boolean
  bold?: boolean
}) {
  if (!val || !val.trim()) return <span style={{ color: "#2d3748" }}>—</span>
  // Cada línea se muestra por separado; los enlaces se vuelven clickeables.
  const lines = val.split("\n")
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        color: "#e2e8f0",
        fontSize: 13,
        lineHeight: 1.5,
        fontWeight: bold ? 700 : 400,
        textAlign: center ? "center" : "left",
      }}
    >
      {lines.map((line, i) =>
        line.trim() === "" ? (
          // Línea en blanco: pequeño espacio para mantener separaciones
          <span key={i} style={{ height: 6 }} />
        ) : (
          <span key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {renderLineWithLinks(line)}
          </span>
        )
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({
  title,
  note,
}: {
  title: string
  note?: string
}) {
  return (
    <div style={sectionHeaderStyle}>
      <span>{title}</span>
      {note && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 400,
            opacity: 0.65,
            marginLeft: 8,
            textTransform: "none",
            letterSpacing: 0,
          }}
        >
          {note}
        </span>
      )}
    </div>
  )
}

// Renders [label cell][value cell] — used inside the 4-col GENERALES grid
function GenCell({
  label,
  fieldKey,
  draft,
  editing,
  onChange,
  multiline,
  bold,
  rightSide,
}: {
  label: string
  fieldKey: keyof MatrizData
  draft: MatrizData
  editing: boolean
  onChange: (k: keyof MatrizData, v: string) => void
  multiline?: boolean
  bold?: boolean
  rightSide?: boolean
}) {
  const value = draft[fieldKey] as string
  const labelCell: React.CSSProperties = {
    ...genLabelCellStyle,
    ...(rightSide
      ? { borderLeft: "1px solid rgba(148,163,184,0.12)" }
      : {}),
  }
  return (
    <>
      <div style={labelCell}>{label}</div>
      <div style={{ ...genValueCellStyle, fontWeight: bold ? 700 : 400 }}>
        {editing ? (
          <textarea
            value={value}
            onChange={(e) => onChange(fieldKey, e.target.value)}
            style={textareaStyle}
            rows={multiline ? 2 : 1}
            placeholder={label}
          />
        ) : (
          <ValueView val={value} bold={bold} />
        )}
      </div>
    </>
  )
}

// Single-column label + value row for ENTREGAS / RECURSOS
function FieldRow({
  label,
  fieldKey,
  draft,
  editing,
  onChange,
  multiline,
  isMobile,
}: {
  label: string
  fieldKey: keyof MatrizData
  draft: MatrizData
  editing: boolean
  onChange: (k: keyof MatrizData, v: string) => void
  multiline?: boolean
  isMobile: boolean
}) {
  const value = draft[fieldKey] as string
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "190px 1fr",
        borderBottom: "1px solid rgba(148,163,184,0.08)",
      }}
    >
      <div style={singleLabelCellStyle(isMobile)}>{label}</div>
      <div style={singleValueCellStyle}>
        {editing ? (
          <textarea
            value={value}
            onChange={(e) => onChange(fieldKey, e.target.value)}
            style={textareaStyle}
            rows={multiline ? 3 : 2}
            placeholder={multiline ? label + "..." : label}
          />
        ) : (
          <ValueView val={value} />
        )}
      </div>
    </div>
  )
}

// Special backup row: two sub-rows within one logical field
function BackupRow({
  draft,
  editing,
  onChange,
  isMobile,
}: {
  draft: MatrizData
  editing: boolean
  onChange: (k: keyof MatrizData, v: string) => void
  isMobile: boolean
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "190px 1fr",
        borderBottom: "1px solid rgba(148,163,184,0.08)",
      }}
    >
      <div style={singleLabelCellStyle(isMobile)}>Backup</div>
      <div style={{ ...singleValueCellStyle, display: "grid", gap: 10 }}>
        {editing ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "160px 1fr",
                gap: 6,
                alignItems: "center",
              }}
            >
              <span style={{ color: "#64748b", fontSize: 12 }}>Backup de producción:</span>
              <textarea
                value={draft.backup_produccion}
                onChange={(e) => onChange("backup_produccion", e.target.value)}
                style={textareaStyle}
                rows={2}
                placeholder="Discos, ubicación, links..."
              />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "160px 1fr",
                gap: 6,
                alignItems: "center",
              }}
            >
              <span style={{ color: "#64748b", fontSize: 12 }}>Backup de post:</span>
              <textarea
                value={draft.backup_post}
                onChange={(e) => onChange("backup_post", e.target.value)}
                style={textareaStyle}
                rows={2}
                placeholder="Discos, ubicación, links..."
              />
            </div>
          </>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <span style={{ fontSize: 12, color: "#64748b" }}>Backup de producción:</span>
              <ValueView val={draft.backup_produccion} />
            </div>
            <div>
              <span style={{ fontSize: 12, color: "#64748b" }}>Backup de post:</span>
              <ValueView val={draft.backup_post} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MatrizPanel({
  projectId,
  isMobile,
  projectName,
  clientName,
}: {
  projectId: string
  isMobile: boolean
  projectName: string
  clientName: string
}) {
  const [matrices, setMatrices] = useState<MatrizData[]>([])
  // id de la matriz activa, o "new" cuando es un borrador aún no guardado
  const [activeId, setActiveId] = useState<string>("new")
  const [draft, setDraft] = useState<MatrizData>(emptyMatriz(projectId))
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const isNew = activeId === "new"

  function newPrefilled(nombre: string): MatrizData {
    const m = emptyMatriz(projectId)
    m.nombre = nombre
    m.nombre_proyecto = projectName
    m.cliente = clientName
    return m
  }

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("project_matrices")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true })

      if (data && data.length > 0) {
        setMatrices(data)
        setActiveId(data[0].id)
        setDraft(data[0])
        setEditing(false)
      } else {
        setMatrices([])
        setActiveId("new")
        setDraft(newPrefilled("Matriz 1"))
        setEditing(true)
      }
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, projectName, clientName])

  function onChange(key: keyof MatrizData, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function confirmDiscard(): boolean {
    if (!editing) return true
    return window.confirm("Tienes cambios sin guardar. ¿Descartarlos?")
  }

  function switchTo(m: MatrizData) {
    if (m.id === activeId) return
    if (!confirmDiscard()) return
    setActiveId(m.id!)
    setDraft(m)
    setEditing(false)
  }

  function handleAdd() {
    if (!confirmDiscard()) return
    setActiveId("new")
    setDraft(newPrefilled(`Matriz ${matrices.length + 1}`))
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = {
        ...draft,
        nombre: draft.nombre.trim() || `Matriz ${matrices.length + 1}`,
        project_id: projectId,
        updated_at: new Date().toISOString(),
      }
      if (isNew) {
        delete payload.id
        const { data, error } = await supabase
          .from("project_matrices")
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        setMatrices((prev) => [...prev, data])
        setActiveId(data.id)
        setDraft(data)
      } else {
        const { error } = await supabase
          .from("project_matrices")
          .update(payload)
          .eq("id", draft.id!)
        if (error) throw error
        setMatrices((prev) =>
          prev.map((m) => (m.id === draft.id ? { ...payload } : m))
        )
        setDraft({ ...payload })
      }
      setEditing(false)
    } catch (err: any) {
      alert("Error al guardar: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    if (isNew) {
      // Cancelar un borrador nuevo regresa a la primera matriz existente
      if (matrices.length === 0) return
      setActiveId(matrices[0].id!)
      setDraft(matrices[0])
      setEditing(false)
    } else {
      const saved = matrices.find((m) => m.id === activeId)
      if (saved) setDraft(saved)
      setEditing(false)
    }
  }

  async function handleDelete() {
    if (isNew) return
    const nombre = draft.nombre || "esta matriz"
    if (!window.confirm(`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`)) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from("project_matrices")
        .delete()
        .eq("id", draft.id!)
      if (error) throw error
      const remaining = matrices.filter((m) => m.id !== draft.id)
      setMatrices(remaining)
      if (remaining.length > 0) {
        setActiveId(remaining[0].id!)
        setDraft(remaining[0])
        setEditing(false)
      } else {
        setActiveId("new")
        setDraft(newPrefilled("Matriz 1"))
        setEditing(true)
      }
    } catch (err: any) {
      alert("Error al eliminar: " + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "32px 16px", textAlign: "center" }}>
        <p style={{ color: "#64748b", fontSize: 13 }}>Cargando matriz...</p>
      </div>
    )
  }

  // GENERALES: 4-col desktop (label | value | label | value), 2-col mobile
  const genCols = isMobile ? "100px 1fr" : "130px 1fr 130px 1fr"

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* ── Tabs de matrices ───────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {matrices.map((m, i) => {
          const active = m.id === activeId
          return (
            <button
              key={m.id}
              onClick={() => switchTo(m)}
              style={active ? tabActiveStyle : tabStyle}
            >
              {(active ? draft.nombre : m.nombre) || `Matriz ${i + 1}`}
            </button>
          )
        })}
        {isNew && (
          <button style={tabActiveStyle}>
            {draft.nombre || "Nueva matriz"}
          </button>
        )}
        {!isNew && (
          <button onClick={handleAdd} style={addTabStyle}>
            + Agregar matriz
          </button>
        )}
      </div>

      {/* ── Panel header ───────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          paddingBottom: 14,
          borderBottom: "1px solid rgba(148,163,184,0.10)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <input
              type="text"
              value={draft.nombre}
              onChange={(e) => onChange("nombre", e.target.value)}
              placeholder="Nombre de la matriz"
              style={{
                ...inputStyle,
                maxWidth: 320,
                fontSize: 15,
                fontWeight: 600,
              }}
            />
          ) : (
            <p style={{ margin: 0, color: "#f8fafc", fontSize: 15, fontWeight: 600 }}>
              {draft.nombre || "Matriz de proyecto"}
            </p>
          )}
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
            {isNew
              ? "Sin datos aún — llena el formulario y guarda"
              : "Información general, recursos y entregables del proyecto"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {editing ? (
            <>
              {!isNew && (
                <button onClick={handleDelete} disabled={saving} style={deleteBtnStyle}>
                  Eliminar
                </button>
              )}
              {(!isNew || matrices.length > 0) && (
                <button onClick={handleCancel} style={cancelBtnStyle}>
                  Cancelar
                </button>
              )}
              <button onClick={handleSave} disabled={saving} style={saveBtnStyle}>
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} style={editBtnStyle}>
              ✏ Editar
            </button>
          )}
        </div>
      </div>

      {/* ── Matrix document ─────────────────── */}
      <div style={matrixDocStyle}>

        {/* ─ GENERALES ─────────────────────── */}
        <SectionHeader title="GENERALES" />
        {isMobile ? (
          // Mobile: single 2-col grid for all 6 fields stacked
          <div style={{ display: "grid", gridTemplateColumns: genCols }}>
            <GenCell label="Nombre del proyecto" fieldKey="nombre_proyecto" draft={draft} editing={editing} onChange={onChange} multiline bold />
            <GenCell label="Cliente" fieldKey="cliente" draft={draft} editing={editing} onChange={onChange} bold />
            <GenCell label="Director" fieldKey="director" draft={draft} editing={editing} onChange={onChange} multiline />
            <GenCell label="Productor" fieldKey="productor" draft={draft} editing={editing} onChange={onChange} />
            <GenCell label="Líder de post" fieldKey="lider_post" draft={draft} editing={editing} onChange={onChange} />
            <GenCell label="Nomenclatura" fieldKey="nomenclatura" draft={draft} editing={editing} onChange={onChange} />
          </div>
        ) : (
          // Desktop: 4-col grid — pairs: [nombre | cliente], [director | productor], [lider_post | nomenclatura]
          <div style={{ display: "grid", gridTemplateColumns: genCols }}>
            <GenCell label="Nombre del proyecto" fieldKey="nombre_proyecto" draft={draft} editing={editing} onChange={onChange} multiline bold />
            <GenCell label="Cliente" fieldKey="cliente" draft={draft} editing={editing} onChange={onChange} bold rightSide />
            <GenCell label="Director" fieldKey="director" draft={draft} editing={editing} onChange={onChange} multiline />
            <GenCell label="Productor" fieldKey="productor" draft={draft} editing={editing} onChange={onChange} rightSide />
            <GenCell label="Líder de post" fieldKey="lider_post" draft={draft} editing={editing} onChange={onChange} />
            <GenCell label="Nomenclatura" fieldKey="nomenclatura" draft={draft} editing={editing} onChange={onChange} rightSide />
          </div>
        )}

        {/* ─ ENTREGAS ──────────────────────── */}
        <SectionHeader title="ENTREGAS" />
        <FieldRow label="Time Table" fieldKey="time_table" draft={draft} editing={editing} onChange={onChange} multiline isMobile={isMobile} />

        {/* ─ RECURSOS ──────────────────────── */}
        <SectionHeader title="RECURSOS" />
        <FieldRow label="Material" fieldKey="material" draft={draft} editing={editing} onChange={onChange} multiline isMobile={isMobile} />
        <FieldRow label="Calificación" fieldKey="calificacion" draft={draft} editing={editing} onChange={onChange} isMobile={isMobile} />
        <FieldRow label="Entregables" fieldKey="entregables" draft={draft} editing={editing} onChange={onChange} isMobile={isMobile} />
        <FieldRow label="Asignación de cápsulas" fieldKey="asignacion_capsulas" draft={draft} editing={editing} onChange={onChange} isMobile={isMobile} />
        <FieldRow label="Guión / PPM" fieldKey="guion_ppm" draft={draft} editing={editing} onChange={onChange} isMobile={isMobile} />
        <FieldRow label="Legales" fieldKey="legales" draft={draft} editing={editing} onChange={onChange} isMobile={isMobile} />
        <FieldRow label="Referencia de música" fieldKey="referencia_musica" draft={draft} editing={editing} onChange={onChange} isMobile={isMobile} />
        <FieldRow label="Paquetería gráfica" fieldKey="paqueteria_grafica" draft={draft} editing={editing} onChange={onChange} multiline isMobile={isMobile} />
        <FieldRow label="Assets" fieldKey="assets" draft={draft} editing={editing} onChange={onChange} multiline isMobile={isMobile} />
        <FieldRow label="Liga de masters" fieldKey="liga_masters" draft={draft} editing={editing} onChange={onChange} isMobile={isMobile} />
        <BackupRow draft={draft} editing={editing} onChange={onChange} isMobile={isMobile} />

        {/* ─ MINUTA ────────────────────────── */}
        <SectionHeader title="MINUTA" />
        <div
          style={{
            padding: "18px 20px",
            minHeight: 72,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderBottom: "1px solid rgba(148,163,184,0.08)",
          }}
        >
          {editing ? (
            <textarea
              value={draft.minuta}
              onChange={(e) => onChange("minuta", e.target.value)}
              style={{ ...textareaStyle, width: "100%", textAlign: "left" }}
              rows={3}
              placeholder="URL de la minuta o notas..."
            />
          ) : (
            <ValueView val={draft.minuta} center />
          )}
        </div>

        {/* ─ INDICACIONES EXTRA ────────────── */}
        <SectionHeader
          title="INDICACIONES EXTRA"
          note="(nombres y cargos en caso de aplicar, etc.)"
        />
        <div style={{ padding: "16px 20px", minHeight: 80 }}>
          {editing ? (
            <textarea
              value={draft.indicaciones_extra}
              onChange={(e) => onChange("indicaciones_extra", e.target.value)}
              style={{ ...textareaStyle, width: "100%" }}
              rows={5}
              placeholder="Indicaciones adicionales, nombres, cargos..."
            />
          ) : (
            <ValueView val={draft.indicaciones_extra} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sectionHeaderStyle: React.CSSProperties = {
  background: "linear-gradient(90deg, rgba(29,78,216,0.28), rgba(30,58,138,0.18))",
  borderTop: "1px solid rgba(59,130,246,0.20)",
  borderBottom: "1px solid rgba(59,130,246,0.20)",
  padding: "8px 16px",
  color: "#bfdbfe",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 1.4,
  textAlign: "center",
}

// GENERALES label cell
const genLabelCellStyle: React.CSSProperties = {
  padding: "10px 12px",
  background: "rgba(255,255,255,0.022)",
  color: "#64748b",
  fontSize: 11,
  textAlign: "right",
  borderBottom: "1px solid rgba(148,163,184,0.10)",
  borderRight: "1px solid rgba(148,163,184,0.10)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "flex-end",
  lineHeight: 1.4,
}

// GENERALES value cell
const genValueCellStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderBottom: "1px solid rgba(148,163,184,0.10)",
  color: "#e2e8f0",
  fontSize: 13,
  lineHeight: 1.45,
  minHeight: 44,
}

// Single-column label cell
function singleLabelCellStyle(isMobile: boolean): React.CSSProperties {
  return {
    padding: isMobile ? "10px 12px 4px" : "12px 14px",
    background: "rgba(255,255,255,0.022)",
    color: "#64748b",
    fontSize: 11,
    textAlign: isMobile ? "left" : "right",
    borderRight: isMobile ? "none" : "1px solid rgba(148,163,184,0.10)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: isMobile ? "flex-start" : "flex-end",
    lineHeight: 1.4,
  }
}

// Single-column value cell
const singleValueCellStyle: React.CSSProperties = {
  padding: "12px 16px",
  color: "#e2e8f0",
  fontSize: 13,
  lineHeight: 1.5,
}

const matrixDocStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 14,
  overflow: "hidden",
  background: "rgba(8,12,28,0.82)",
  backdropFilter: "blur(14px)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
}

const tabStyle: React.CSSProperties = {
  padding: "7px 16px",
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.20)",
  background: "rgba(255,255,255,0.03)",
  color: "#94a3b8",
  cursor: "pointer",
  fontSize: 12.5,
  fontWeight: 600,
  maxWidth: 220,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const tabActiveStyle: React.CSSProperties = {
  ...tabStyle,
  border: "1px solid rgba(99,102,241,0.55)",
  background: "rgba(99,102,241,0.16)",
  color: "#c7d2fe",
  cursor: "default",
}

const addTabStyle: React.CSSProperties = {
  ...tabStyle,
  border: "1px dashed rgba(52,211,153,0.40)",
  background: "rgba(52,211,153,0.06)",
  color: "#34d399",
}

const deleteBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid rgba(248,113,113,0.30)",
  background: "rgba(248,113,113,0.08)",
  color: "#f87171",
  cursor: "pointer",
  fontSize: 13,
}

const saveBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 20px",
  borderRadius: 8,
  border: "none",
  background: "linear-gradient(135deg, #7c3aed, #6366f1)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  boxShadow: "0 6px 20px rgba(124,58,237,0.22)",
}

const cancelBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.20)",
  background: "transparent",
  color: "#64748b",
  cursor: "pointer",
  fontSize: 13,
}

const editBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "8px 16px",
  borderRadius: 8,
  border: "1px solid rgba(52,211,153,0.30)",
  background: "rgba(52,211,153,0.08)",
  color: "#34d399",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(2,6,23,0.60)",
  color: "#f8fafc",
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
}

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(2,6,23,0.60)",
  color: "#f8fafc",
  fontSize: 13,
  outline: "none",
  resize: "vertical",
  lineHeight: 1.5,
  boxSizing: "border-box",
  fontFamily: "inherit",
}
