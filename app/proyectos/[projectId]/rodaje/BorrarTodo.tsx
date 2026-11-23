"use client"

// Confirmación para borrar todo el plan de rodaje del proyecto. Es la única
// acción del módulo que se lleva todo de un golpe y no tiene regreso, así que
// enseña qué se va a perder y pide escribir BORRAR.

import { useState } from "react"
import type { DatosPlan } from "../../../../lib/rodaje/datos"
import { ETIQUETAS } from "../../../../lib/rodaje/tipos"
import { Modal } from "./comun"
import { C, MONO, avisoError, boton, botonPeligro, campo, etiquetaCampo } from "./estilos"

const PALABRA = "BORRAR"

type Renglon = { n: number; texto: string; detalle?: string }

export function BorrarTodo(props: {
  datos: DatosPlan
  proyecto: string
  /** Borra el plan y cierra esta ventana; si algo falla, lanza el error */
  onBorrar: () => Promise<void>
  onCerrar: () => void
}) {
  const { datos } = props
  const etq = ETIQUETAS[datos.plan.etiqueta] || ETIQUETAS.guion
  const [texto, setTexto] = useState("")
  const [borrando, setBorrando] = useState(false)
  const [error, setError] = useState("")

  const filmadas = datos.escenas.filter((e) => e.filmada).length
  const conTomas = new Set(
    datos.tomas.filter((t) => t.emplazamiento || t.buena || t.proteccion || t.notas).map((t) => t.escena_id)
  ).size
  const nGuiones = datos.guiones.length
  const nEscenas = datos.escenas.length
  const nDias = datos.dias.length
  const nArchivos = datos.archivos.length

  const renglones: Renglon[] = [
    { n: nGuiones, texto: (nGuiones === 1 ? etq.uno : etq.varios).toLowerCase() },
    {
      n: nEscenas,
      texto: nEscenas === 1 ? "escena" : "escenas",
      detalle: filmadas ? (filmadas === 1 ? "1 ya filmada" : `${filmadas} ya filmadas`) : "",
    },
    { n: conTomas, texto: conTomas === 1 ? "escena con tomas calificadas" : "escenas con tomas calificadas" },
    { n: nDias, texto: nDias === 1 ? "día de rodaje" : "días de rodaje" },
    { n: nArchivos, texto: nArchivos === 1 ? "archivo subido" : "archivos subidos" },
  ].filter((r) => r.n > 0)

  const listo = texto.trim().toUpperCase() === PALABRA

  async function confirmar() {
    if (!listo || borrando) return
    setBorrando(true)
    setError("")
    try {
      await props.onBorrar()
    } catch (err) {
      setError(`No se pudo borrar el plan: ${(err as Error).message}`)
      setBorrando(false)
    }
  }

  return (
    <Modal
      sobre="Plan de rodaje"
      titulo="Borrar todo el plan"
      ancho={480}
      fijo
      onCerrar={() => {
        if (!borrando) props.onCerrar()
      }}
      pie={
        <>
          <button type="button" style={boton} onClick={props.onCerrar} disabled={borrando}>
            Cancelar
          </button>
          <button
            type="button"
            style={{ ...botonPeligro, opacity: listo && !borrando ? 1 : 0.45, cursor: listo && !borrando ? "pointer" : "not-allowed" }}
            onClick={confirmar}
            disabled={!listo || borrando}
          >
            {borrando ? "Borrando…" : "Borrar todo"}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
        {error && <div style={avisoError}>{error}</div>}

        <p style={{ margin: 0, color: C.texto2, fontSize: 14, lineHeight: 1.5 }}>
          Vas a borrar todo el plan de rodaje de{" "}
          <strong style={{ color: C.texto }}>{props.proyecto}</strong>
          {renglones.length ? ":" : "."}
        </p>

        {renglones.length > 0 && (
          <ul
            style={{
              margin: 0, padding: "10px 12px", listStyle: "none", borderRadius: 10,
              border: `1px solid ${C.linea}`, background: C.hueco,
              display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6,
            }}
            data-resumen-borrado
          >
            {renglones.map((r) => (
              <li key={r.texto} style={{ display: "flex", gap: 8, alignItems: "baseline", color: C.texto2, fontSize: 13.5 }}>
                <span style={{ fontFamily: MONO, color: C.texto, fontWeight: 600, minWidth: 28, textAlign: "right" }}>{r.n}</span>
                <span>
                  {r.texto}
                  {r.detalle && <span style={{ color: C.ambar }}> · {r.detalle}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}

        <p style={{ margin: 0, color: "#fca5a5", fontSize: 13.5, lineHeight: 1.5 }}>
          No se puede deshacer.
          {nGuiones > 0 && (
            <span style={{ color: C.tenue }}> Si quieres conservar algo, cancela y descarga antes los PDF.</span>
          )}
        </p>

        <label>
          <span style={etiquetaCampo}>Para confirmar, escribe {PALABRA}</span>
          <input
            style={{ ...campo, fontFamily: MONO, letterSpacing: 1 }}
            value={texto}
            onChange={(ev) => setTexto(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter") confirmar()
            }}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={12}
            disabled={borrando}
            aria-label={`Escribe ${PALABRA} para confirmar`}
          />
        </label>
      </div>
    </Modal>
  )
}
