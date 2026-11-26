"use client"

// Lista de fotos: lo que tiene que hacer la unidad de foto cuando no trabaja
// sobre las escenas del guion. Se pega una foto por renglón y cada una queda
// como una "escena" de la pieza, lista para ordenar, marcar y calificar.

import { useState } from "react"
import type { DatosPlan } from "../../../../lib/rodaje/datos"
import { lineasDeFotos } from "../../../../lib/rodaje/unidades"
import { MAX_UNIDADES } from "../../../../lib/rodaje/tipos"
import type { Acciones } from "./PlanRodaje"
import { Modal } from "./comun"
import { C, MONO, boton, botonPrimario, campo, etiquetaCampo } from "./estilos"

const NUEVA = "nueva-foto"
const MAX_FOTOS = 300

export function NuevaListaFotos(props: {
  datos: DatosPlan
  acc: Acciones
  onElegir: (unidadId: string) => void
  onCerrar: () => void
}) {
  const { datos, acc } = props
  const deFoto = datos.unidades.filter((u) => u.tipo === "foto")
  const puedeCrear = datos.unidades.length < MAX_UNIDADES

  // De preferencia a la unidad de foto; si no hay, se ofrece crearla aquí mismo.
  const inicial =
    datos.unidad.tipo === "foto" ? datos.unidad.id : deFoto[0]?.id || (puedeCrear ? NUEVA : datos.unidad.id)
  const [titulo, setTitulo] = useState("Fotos")
  const [unidad, setUnidad] = useState(inicial)
  const [texto, setTexto] = useState("")

  const fotos = lineasDeFotos(texto)
  const sobran = fotos.length > MAX_FOTOS

  function guardar() {
    if (!fotos.length || sobran) return
    let destino = unidad
    if (destino === NUEVA) {
      const id = acc.crearUnidad("foto")
      if (!id) return
      destino = id
    }
    acc.crearListaFotos(titulo, fotos, destino)
    props.onElegir(destino)
    props.onCerrar()
  }

  const listo = fotos.length > 0 && !sobran

  return (
    <Modal
      sobre="Plan de rodaje"
      titulo="Nueva lista de fotos"
      ancho={560}
      fijo
      onCerrar={props.onCerrar}
      pie={
        <>
          <span style={{ marginRight: "auto", alignSelf: "center", color: sobran ? "#B42318" : C.apagado, fontSize: 12, fontFamily: MONO }}>
            {sobran
              ? `Máximo ${MAX_FOTOS} fotos por lista`
              : fotos.length === 1 ? "1 foto" : `${fotos.length} fotos`}
          </span>
          <button type="button" style={boton} onClick={props.onCerrar}>Cancelar</button>
          <button
            type="button"
            style={{ ...botonPrimario, opacity: listo ? 1 : 0.45, cursor: listo ? "pointer" : "not-allowed" }}
            disabled={!listo}
            onClick={guardar}
          >
            Crear lista
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10 }}>
          <label>
            <span style={etiquetaCampo}>Título</span>
            <input style={campo} value={titulo} maxLength={160} onChange={(ev) => setTitulo(ev.target.value)} />
          </label>
          <label>
            <span style={etiquetaCampo}>Unidad que las hace</span>
            <select style={{ ...campo, colorScheme: "dark" }} value={unidad} onChange={(ev) => setUnidad(ev.target.value)}>
              {datos.unidades.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              {puedeCrear && <option value={NUEVA}>+ Nueva unidad de foto</option>}
            </select>
          </label>
        </div>
        <label>
          <span style={etiquetaCampo}>Fotos · una por renglón</span>
          <textarea
            style={{ ...campo, minHeight: 190, resize: "vertical", lineHeight: 1.5 }}
            value={texto}
            onChange={(ev) => setTexto(ev.target.value)}
            placeholder={"Producto sobre la mesa, luz natural\nRetrato de la protagonista en la sala\nDetalle de manos con el celular"}
            aria-label="Fotos, una por renglón"
          />
        </label>
        <p style={{ margin: 0, color: C.apagado, fontSize: 12, lineHeight: 1.5 }}>
          Puedes pegar la lista desde un documento. Después las fotos se ordenan por día y se marcan como
          hechas, igual que las escenas, y puedes agregar más una por una.
        </p>
      </div>
    </Modal>
  )
}
