"use client"

// Calificación de tomas: por cada emplazamiento de la escena se anota cuál toma
// es la buena y cuál la protección. Una escena puede tener varios.

import { useState } from "react"
import type { DatosPlan } from "../../../../lib/rodaje/datos"
import { slugEscena } from "../../../../lib/rodaje/orden"
import {
  ETIQUETAS, MAX_TOMAS_POR_ESCENA,
  type FilaToma, type RodajeEscena,
} from "../../../../lib/rodaje/tipos"
import type { Acciones } from "./PlanRodaje"
import { Modal, numeroEscena, tomasDeEscena } from "./comun"
import { C, MONO, boton, botonChico, botonPrimario, campo, etiquetaCampo } from "./estilos"

const vacia = (): FilaToma => ({ emplazamiento: "", buena: "", proteccion: "", notas: "" })

export function EditarTomas(props: {
  datos: DatosPlan
  escena: RodajeEscena
  acc: Acciones
  onCerrar: () => void
}) {
  const { datos, escena, acc } = props
  const etq = ETIQUETAS[datos.plan.etiqueta] || ETIQUETAS.guion
  const varias = datos.guiones.length > 1
  const guion = datos.guiones.find((g) => g.id === escena.guion_id)

  const [filas, setFilas] = useState<FilaToma[]>(() => {
    const actuales = tomasDeEscena(datos.tomas, escena.id).map((t) => ({
      id: t.id, emplazamiento: t.emplazamiento, buena: t.buena, proteccion: t.proteccion, notas: t.notas,
    }))
    return actuales.length ? actuales : [vacia()]
  })

  const cambiar = (i: number, campoFila: keyof FilaToma, valor: string) =>
    setFilas((prev) => prev.map((f, k) => (k === i ? { ...f, [campoFila]: valor } : f)))

  function guardar() {
    acc.guardarTomas(escena.id, filas)
    props.onCerrar()
  }

  const num = numeroEscena(escena, guion, varias)

  return (
    <Modal
      sobre={varias && guion ? `${etq.uno} ${guion.numero} · ${guion.titulo}` : "Tomas"}
      titulo={
        <>
          Tomas de la escena <span style={{ fontFamily: MONO, color: C.violetaClaro }}>{num}</span>
          <span style={{ display: "block", marginTop: 3, color: C.apagado, fontSize: 12.5, fontWeight: 400 }}>
            {slugEscena(escena)}
          </span>
        </>
      }
      ancho={600}
      fijo
      onCerrar={props.onCerrar}
      pie={
        <>
          <button
            type="button"
            style={{ ...boton, marginRight: "auto", borderStyle: "dashed", opacity: filas.length >= MAX_TOMAS_POR_ESCENA ? 0.4 : 1 }}
            disabled={filas.length >= MAX_TOMAS_POR_ESCENA}
            onClick={() => setFilas((prev) => [...prev, vacia()])}
          >
            + Emplazamiento
          </button>
          <button type="button" style={boton} onClick={props.onCerrar}>Cancelar</button>
          <button type="button" style={botonPrimario} onClick={guardar}>Guardar</button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
        {filas.map((f, i) => (
          <fieldset
            key={i}
            style={{
              margin: 0, minWidth: 0, padding: "8px 12px 12px", borderRadius: 12,
              border: `1px solid ${C.linea}`, background: C.hueco,
              display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10,
            }}
          >
            <legend style={{ padding: "0 6px", color: C.violetaClaro, fontSize: 11, fontWeight: 700, letterSpacing: 0.9, textTransform: "uppercase" }}>
              Emplazamiento {i + 1}
            </legend>
            <label style={{ gridColumn: "1 / -1" }}>
              <span style={etiquetaCampo}>Emplazamiento</span>
              <input
                style={campo}
                value={f.emplazamiento}
                maxLength={80}
                placeholder="Ej. 1A · Plano general"
                autoFocus={i === filas.length - 1 && !f.id}
                onChange={(ev) => cambiar(i, "emplazamiento", ev.target.value)}
              />
            </label>
            <label>
              <span style={etiquetaCampo}>Toma buena</span>
              <input
                style={campo}
                value={f.buena}
                maxLength={40}
                inputMode="numeric"
                placeholder="Ej. 3"
                onChange={(ev) => cambiar(i, "buena", ev.target.value)}
              />
            </label>
            <label>
              <span style={etiquetaCampo}>Protección</span>
              <input
                style={campo}
                value={f.proteccion}
                maxLength={40}
                inputMode="numeric"
                placeholder="Ej. 5"
                onChange={(ev) => cambiar(i, "proteccion", ev.target.value)}
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              <span style={etiquetaCampo}>Notas</span>
              <textarea
                style={{ ...campo, minHeight: 62, resize: "vertical" }}
                value={f.notas}
                maxLength={2000}
                placeholder="Algo que haya que recordar para edición o continuidad"
                onChange={(ev) => cambiar(i, "notas", ev.target.value)}
              />
            </label>
            {filas.length > 1 && (
              <button
                type="button"
                style={{ ...botonChico, gridColumn: "1 / -1", justifySelf: "start", color: "#fca5a5" }}
                onClick={() => setFilas((prev) => prev.filter((_, k) => k !== i))}
              >
                Quitar emplazamiento {i + 1}
              </button>
            )}
          </fieldset>
        ))}
        <p style={{ margin: 0, color: C.apagado, fontSize: 12 }}>
          Para borrar todas las tomas de la escena, deja los campos vacíos y guarda.
        </p>
      </div>
    </Modal>
  )
}
