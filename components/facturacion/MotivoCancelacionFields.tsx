"use client"
// Motivo de cancelación ante el SAT; con 01 pide el UUID de la factura que
// sustituye a la cancelada.
import type React from "react"
import { MOTIVOS_CANCELACION } from "../../lib/sat-catalogos"
import { validarSustitucion } from "../../lib/cfdi-sustitucion"
import { fInput, fNote } from "./ui"

export function MotivoCancelacionFields({ motivo, sustituidaPor, onChange, selectStyle }: {
  motivo: string
  sustituidaPor: string
  onChange: (v: { motivo: string; sustituidaPor: string }) => void
  selectStyle?: React.CSSProperties
}) {
  const { error } = validarSustitucion(sustituidaPor)
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <select value={motivo} onChange={e => onChange({ motivo: e.target.value, sustituidaPor })} style={selectStyle || fInput}>
        {MOTIVOS_CANCELACION.map(m => <option key={m.clave} value={m.clave}>{m.clave} · {m.nombre}</option>)}
      </select>
      {motivo === "01" && (
        <>
          <input
            value={sustituidaPor}
            onChange={e => onChange({ motivo, sustituidaPor: e.target.value })}
            placeholder="UUID de la factura que la sustituye"
            spellCheck={false}
            autoComplete="off"
            style={{ ...(selectStyle || fInput), fontFamily: "var(--font-mono)", fontSize: 12, ...(error ? { borderColor: "rgba(248,113,113,0.6)" } : {}) }}
          />
          <span style={fNote(error ? "#C2362B" : undefined)}>
            {error || "La factura nueva debe estar timbrada antes, con relación 04 a esta."}
          </span>
        </>
      )}
    </div>
  )
}
