"use client"

// Formularios para corregir lo que leyó la IA: una escena o una pieza (guion,
// video, capítulo…).

import { useState } from "react"
import type { DatosPlan } from "../../../../lib/rodaje/datos"
import { diasVista, SIN_DIA } from "../../../../lib/rodaje/orden"
import { ETIQUETAS, type RodajeEscena, type RodajeGuion } from "../../../../lib/rodaje/tipos"
import type { Acciones } from "./PlanRodaje"
import { Modal } from "./comun"
import { boton, botonPeligro, botonPrimario, campo, etiquetaCampo } from "./estilos"

const MOMENTOS = ["DÍA", "NOCHE", "AMANECER", "ATARDECER"]

export function EditarEscena(props: {
  datos: DatosPlan
  /** null = escena nueva */
  escena: RodajeEscena | null
  guionId: string
  acc: Acciones
  onCerrar: () => void
}) {
  const { datos, escena, guionId, acc } = props
  const etq = ETIQUETAS[datos.plan.etiqueta] || ETIQUETAS.guion
  const guion = datos.guiones.find((g) => g.id === guionId)
  const dias = diasVista(datos.dias)

  const siguiente = () => {
    const nums = datos.escenas
      .filter((e) => e.guion_id === guionId)
      .map((e) => parseInt(e.numero, 10))
      .filter((n) => Number.isFinite(n))
    return String((nums.length ? Math.max(...nums) : 0) + 1)
  }

  const [numero, setNumero] = useState(escena?.numero ?? siguiente())
  const [ie, setIe] = useState(escena?.ie ?? "")
  const [locacion, setLocacion] = useState(escena?.locacion ?? "")
  const [momento, setMomento] = useState(escena?.momento ?? "")
  const [descripcion, setDescripcion] = useState(escena?.descripcion ?? "")
  const [personajes, setPersonajes] = useState((escena?.personajes ?? []).join(", "))
  const [dia, setDia] = useState(escena?.dia_id || SIN_DIA)

  function guardar() {
    const num = numero.trim()
    if (!num) {
      alert("Falta el número de la escena.")
      return
    }
    const campos = {
      numero: num,
      ie,
      locacion: locacion.trim().toUpperCase(),
      momento: momento.trim().toUpperCase(),
      descripcion: descripcion.trim(),
      personajes: [...new Set(personajes.split(",").map((p) => p.trim().toUpperCase()).filter(Boolean))],
      dia_id: dia === SIN_DIA ? null : dia,
    }
    if (escena) acc.actualizarEscena(escena.id, campos)
    else acc.crearEscena(guionId, campos)
    props.onCerrar()
  }

  function borrar() {
    if (!escena) return
    if (!confirm(`¿Borrar la escena ${escena.numero}? También se borra su texto.`)) return
    acc.borrarEscena(escena.id)
    props.onCerrar()
  }

  return (
    <Modal
      sobre={guion ? `${etq.uno} ${guion.numero} · ${guion.titulo}` : undefined}
      titulo={escena ? `Editar escena ${escena.numero}` : "Nueva escena"}
      onCerrar={props.onCerrar}
      pie={
        <>
          {escena && (
            <button type="button" style={{ ...botonPeligro, marginRight: "auto" }} onClick={borrar}>
              Borrar escena
            </button>
          )}
          <button type="button" style={boton} onClick={props.onCerrar}>Cancelar</button>
          <button type="button" style={botonPrimario} onClick={guardar}>Guardar</button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "90px minmax(0, 1fr) minmax(0, 1fr)", gap: 10 }}>
          <label>
            <span style={etiquetaCampo}>Número</span>
            <input style={campo} value={numero} onChange={(ev) => setNumero(ev.target.value)} maxLength={12} />
          </label>
          <label>
            <span style={etiquetaCampo}>Int / Ext</span>
            <select style={{ ...campo, colorScheme: "dark" }} value={ie} onChange={(ev) => setIe(ev.target.value)}>
              <option value="">—</option>
              <option value="INT">INT</option>
              <option value="EXT">EXT</option>
              <option value="INT/EXT">INT/EXT</option>
            </select>
          </label>
          <label>
            <span style={etiquetaCampo}>Momento</span>
            <input style={campo} value={momento} onChange={(ev) => setMomento(ev.target.value)} list="rodaje-momentos" maxLength={30} />
            <datalist id="rodaje-momentos">
              {MOMENTOS.map((m) => <option key={m} value={m} />)}
            </datalist>
          </label>
        </div>
        <label>
          <span style={etiquetaCampo}>Locación</span>
          <input style={campo} value={locacion} onChange={(ev) => setLocacion(ev.target.value)} maxLength={160} />
        </label>
        <label>
          <span style={etiquetaCampo}>Qué pasa</span>
          <textarea style={{ ...campo, minHeight: 64, resize: "vertical" }} value={descripcion} onChange={(ev) => setDescripcion(ev.target.value)} maxLength={240} />
        </label>
        <label>
          <span style={etiquetaCampo}>Personajes (separados por coma)</span>
          <input style={campo} value={personajes} onChange={(ev) => setPersonajes(ev.target.value)} />
        </label>
        <label>
          <span style={etiquetaCampo}>Día de rodaje</span>
          <select style={{ ...campo, colorScheme: "dark" }} value={dia} onChange={(ev) => setDia(ev.target.value)}>
            {dias.map((d) => (
              <option key={d.clave} value={d.clave}>{d.titulo}</option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  )
}

export function EditarGuion(props: {
  datos: DatosPlan
  guion: RodajeGuion
  acc: Acciones
  onCerrar: () => void
}) {
  const { datos, guion, acc } = props
  const etq = ETIQUETAS[datos.plan.etiqueta] || ETIQUETAS.guion
  const escenas = datos.escenas.filter((e) => e.guion_id === guion.id)

  const [numero, setNumero] = useState(guion.numero)
  const [titulo, setTitulo] = useState(guion.titulo)
  const [resumen, setResumen] = useState(guion.resumen)
  const [unidad, setUnidad] = useState(guion.unidad ? String(guion.unidad) : "")

  function guardar() {
    const num = numero.trim()
    if (!num) {
      alert("Falta el número.")
      return
    }
    acc.actualizarGuion(guion.id, {
      numero: num,
      titulo: titulo.trim(),
      resumen: resumen.trim(),
      unidad: unidad ? (Number(unidad) as 1 | 2) : null,
    })
    props.onCerrar()
  }

  function borrar() {
    const filmadas = escenas.filter((e) => e.filmada).length
    const detalle = escenas.length
      ? ` Se borran también sus ${escenas.length} escenas` + (filmadas ? ` (${filmadas} ya filmadas).` : ".")
      : ""
    if (!confirm(`¿Borrar ${etq.uno.toLowerCase()} ${guion.numero} "${guion.titulo}"?${detalle} No se puede deshacer.`)) return
    acc.borrarGuion(guion.id)
    props.onCerrar()
  }

  return (
    <Modal
      sobre={etq.uno}
      titulo={`Editar ${etq.uno.toLowerCase()} ${guion.numero}`}
      onCerrar={props.onCerrar}
      pie={
        <>
          <button type="button" style={{ ...botonPeligro, marginRight: "auto" }} onClick={borrar}>
            Borrar {etq.uno.toLowerCase()}
          </button>
          <button type="button" style={boton} onClick={props.onCerrar}>Cancelar</button>
          <button type="button" style={botonPrimario} onClick={guardar}>Guardar</button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "90px minmax(0, 1fr)", gap: 10 }}>
          <label>
            <span style={etiquetaCampo}>Número</span>
            <input style={campo} value={numero} onChange={(ev) => setNumero(ev.target.value)} maxLength={12} />
          </label>
          <label>
            <span style={etiquetaCampo}>Unidad de rodaje</span>
            <select style={{ ...campo, colorScheme: "dark" }} value={unidad} onChange={(ev) => setUnidad(ev.target.value)}>
              <option value="">Sin asignar</option>
              <option value="1">Unidad 1</option>
              <option value="2">Unidad 2</option>
            </select>
          </label>
        </div>
        <label>
          <span style={etiquetaCampo}>Título</span>
          <input style={campo} value={titulo} onChange={(ev) => setTitulo(ev.target.value)} maxLength={160} />
        </label>
        <label>
          <span style={etiquetaCampo}>De qué trata</span>
          <textarea style={{ ...campo, minHeight: 80, resize: "vertical" }} value={resumen} onChange={(ev) => setResumen(ev.target.value)} maxLength={600} />
        </label>
      </div>
    </Modal>
  )
}
