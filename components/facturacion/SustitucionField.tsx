"use client"
// Campo opcional "CFDI relacionado por sustitución" (TipoRelacion 04). Vacío =
// factura normal; con UUID = la nueva factura sustituye a esa.
import { validarSustitucion } from "../../lib/cfdi-sustitucion"
import { FField, fInput, fNote } from "./ui"

export function SustitucionField({ value, onChange, bloqueado }: { value: string; onChange: (v: string) => void; bloqueado?: string | null }) {
  const { uuid, error } = validarSustitucion(value)
  return (
    <FField label="CFDI relacionado por sustitución (opcional)">
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => { if (uuid) onChange(uuid) }}
        placeholder="UUID de la factura anterior, p. ej. 5FB2822E-396D-4725-8521-CDC4BDD20CCF"
        style={{ ...fInput, fontFamily: "var(--font-mono)", fontSize: 12, ...(error ? { borderColor: "rgba(248,113,113,0.6)" } : {}), ...(bloqueado ? { opacity: 0.75 } : {}) }}
        spellCheck={false}
        autoComplete="off"
        readOnly={!!bloqueado}
      />
      {bloqueado ? (
        <span style={fNote("#a78bfa")}>Refacturando {bloqueado}: la nueva factura la sustituye (relación 04) y la anterior se cancela con motivo 01 (sola, si se timbró en la app).</span>
      ) : error ? (
        <span style={fNote("#f87171")}>{error}</span>
      ) : uuid ? (
        <span style={fNote("#a78bfa")}>Se emitirá con relación 04 · Sustitución de los CFDI previos. Después cancela la factura anterior con motivo 01.</span>
      ) : (
        <span style={fNote()}>Déjalo vacío para una factura normal. Pega el UUID solo si estás refacturando.</span>
      )}
    </FField>
  )
}
