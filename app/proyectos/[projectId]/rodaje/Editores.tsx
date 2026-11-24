"use client"

// Formularios para corregir lo que leyó la IA: una escena o una pieza (guion,
// video, capítulo…).

import { useState } from "react"
import type { DatosPlan } from "../../../../lib/rodaje/datos"
import { diasVista, SIN_DIA } from "../../../../lib/rodaje/orden"
import { ETIQUETAS, nombrePieza, palabras, type RodajeEscena, type RodajeGuion } from "../../../../lib/rodaje/tipos"
import { escenasHechas } from "../../../../lib/rodaje/unidades"
import type { Acciones } from "./PlanRodaje"
import { Modal } from "./comun"
import { C, boton, botonPeligro, botonPrimario, campo, etiquetaCampo } from "./estilos"

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
  // Una foto de una lista de fotos: mismo formulario, con menos campos.
  const esFoto = guion?.tipo === "fotos"
  const cosa = esFoto ? "foto" : "escena"
  const variasUnidades = datos.unidades.length > 1

  const siguiente = () => {
    const nums = datos.todas
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
  // En qué unidades está (solo se pregunta cuando hay más de una).
  const enUnidades = () =>
    new Set(escena ? datos.asignaciones.filter((a) => a.escena_id === escena.id).map((a) => a.unidad_id) : [datos.unidad.id])
  const [unidades, setUnidades] = useState<Set<string>>(enUnidades)

  function guardar() {
    const num = numero.trim()
    if (!num) {
      alert(`Falta el número de la ${cosa}.`)
      return
    }
    if (esFoto && !locacion.trim()) {
      alert("Falta decir qué foto es.")
      return
    }
    const campos = {
      numero: num,
      ie: esFoto ? "" : ie,
      // El título de una foto se queda como se escribió; la locación va en mayúsculas.
      locacion: esFoto ? locacion.trim() : locacion.trim().toUpperCase(),
      momento: esFoto ? "" : momento.trim().toUpperCase(),
      descripcion: descripcion.trim(),
      personajes: [...new Set(personajes.split(",").map((p) => p.trim().toUpperCase()).filter(Boolean))],
      dia_id: dia === SIN_DIA ? null : dia,
    }
    if (!escena) {
      acc.crearEscena(guionId, campos)
      props.onCerrar()
      return
    }

    // Cambios de unidad: salir de una borra lo que esa unidad ya le marcó.
    const antes = enUnidades()
    const salen = datos.unidades.filter((u) => antes.has(u.id) && !unidades.has(u.id))
    const entran = datos.unidades.filter((u) => !antes.has(u.id) && unidades.has(u.id))
    const pierden = salen.filter(
      (u) =>
        datos.asignaciones.some((a) => a.escena_id === escena.id && a.unidad_id === u.id && a.filmada) ||
        datos.tomasTodas.some((t) => t.escena_id === escena.id && t.unidad_id === u.id)
    )
    if (pierden.length) {
      const nombres = pierden.map((u) => u.nombre).join(" y ")
      if (!confirm(`¿Quitar la ${cosa} ${escena.numero} de ${nombres}? Se pierde lo que ya le marcó y sus tomas ahí.`)) return
    }
    acc.actualizarEscena(escena.id, campos)
    for (const u of entran) acc.agregarAUnidad(u.id, [escena.id])
    for (const u of salen) acc.quitarDeUnidad(u.id, [escena.id])
    props.onCerrar()
  }

  function borrar() {
    if (!escena) return
    const aviso = esFoto
      ? `¿Borrar la foto ${escena.numero}?`
      : `¿Borrar la escena ${escena.numero}? También se borra su texto.`
    const deTodas = variasUnidades ? " Se borra de todas las unidades." : ""
    if (!confirm(aviso + deTodas)) return
    acc.borrarEscena(escena.id)
    props.onCerrar()
  }

  return (
    <Modal
      sobre={guion ? `${nombrePieza(etq, guion)} · ${guion.titulo}` : undefined}
      titulo={escena ? `Editar ${cosa} ${escena.numero}` : `Nueva ${cosa}`}
      onCerrar={props.onCerrar}
      pie={
        <>
          {escena && (
            <button type="button" style={{ ...botonPeligro, marginRight: "auto" }} onClick={borrar}>
              Borrar {cosa}
            </button>
          )}
          <button type="button" style={boton} onClick={props.onCerrar}>Cancelar</button>
          <button type="button" style={botonPrimario} onClick={guardar}>Guardar</button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
        {esFoto ? (
          <div style={{ display: "grid", gridTemplateColumns: "90px minmax(0, 1fr)", gap: 10 }}>
            <label>
              <span style={etiquetaCampo}>Número</span>
              <input style={campo} value={numero} onChange={(ev) => setNumero(ev.target.value)} maxLength={12} />
            </label>
            <label>
              <span style={etiquetaCampo}>Foto</span>
              <input style={campo} value={locacion} onChange={(ev) => setLocacion(ev.target.value)} maxLength={160} placeholder="Qué foto es" />
            </label>
          </div>
        ) : (
          <>
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
          </>
        )}
        <label>
          <span style={etiquetaCampo}>{esFoto ? "Notas" : "Qué pasa"}</span>
          <textarea style={{ ...campo, minHeight: 64, resize: "vertical" }} value={descripcion} onChange={(ev) => setDescripcion(ev.target.value)} maxLength={esFoto ? 2000 : 240} />
        </label>
        <label>
          <span style={etiquetaCampo}>{esFoto ? "Quién sale (separados por coma)" : "Personajes (separados por coma)"}</span>
          <input style={campo} value={personajes} onChange={(ev) => setPersonajes(ev.target.value)} />
        </label>
        <label>
          <span style={etiquetaCampo}>
            {variasUnidades ? `Día de rodaje · ${datos.unidad.nombre}` : "Día de rodaje"}
          </span>
          <select style={{ ...campo, colorScheme: "dark" }} value={dia} onChange={(ev) => setDia(ev.target.value)}>
            {dias.map((d) => (
              <option key={d.clave} value={d.clave}>{d.titulo}</option>
            ))}
          </select>
        </label>
        {variasUnidades && escena && (
          <fieldset style={{ margin: 0, padding: 0, border: "none", minWidth: 0 }}>
            <legend style={{ ...etiquetaCampo, padding: 0 }}>Unidades que la trabajan</legend>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {datos.unidades.map((u) => {
                const marcada = unidades.has(u.id)
                return (
                  <label
                    key={u.id}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 9, cursor: "pointer",
                      border: `1px solid ${marcada ? C.violetaBorde : C.linea}`,
                      background: marcada ? C.violetaFondo : "rgba(255,255,255,0.04)",
                      color: marcada ? C.violetaClaro : C.texto2, fontSize: 13, fontWeight: 600,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() =>
                        setUnidades((prev) => {
                          const s = new Set(prev)
                          if (s.has(u.id)) s.delete(u.id)
                          else s.add(u.id)
                          return s
                        })
                      }
                    />
                    {u.nombre}
                  </label>
                )
              })}
            </div>
            <p style={{ margin: "6px 0 0", color: C.apagado, fontSize: 12 }}>
              Cada unidad la ordena, la marca como hecha y califica sus tomas por separado.
            </p>
          </fieldset>
        )}
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
  const escenas = datos.todas.filter((e) => e.guion_id === guion.id)
  const esFotos = guion.tipo === "fotos"
  const pieza = esFotos ? "Lista de fotos" : etq.uno

  const [numero, setNumero] = useState(guion.numero)
  const [titulo, setTitulo] = useState(guion.titulo)
  const [resumen, setResumen] = useState(guion.resumen)

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
    })
    props.onCerrar()
  }

  function borrar() {
    // Hecha = que alguna unidad ya la marcó.
    const hechasPor = escenasHechas(datos.asignaciones)
    const hechas = escenas.filter((e) => hechasPor.has(e.id)).length
    const cosas = esFotos ? "fotos" : "escenas"
    const ya = datos.unidades.length > 1 ? "ya hechas" : `ya ${palabras(datos.unidad.tipo).hechas}`
    const detalle = escenas.length
      ? ` Se borran también sus ${escenas.length} ${cosas}` + (hechas ? ` (${hechas} ${ya}).` : ".")
      : ""
    const que = esFotos ? "la lista de fotos" : `${etq.uno.toLowerCase()} ${guion.numero}`
    if (!confirm(`¿Borrar ${que} "${guion.titulo}"?${detalle} No se puede deshacer.`)) return
    acc.borrarGuion(guion.id)
    props.onCerrar()
  }

  return (
    <Modal
      sobre={pieza}
      titulo={esFotos ? "Editar lista de fotos" : `Editar ${etq.uno.toLowerCase()} ${guion.numero}`}
      onCerrar={props.onCerrar}
      pie={
        <>
          <button type="button" style={{ ...botonPeligro, marginRight: "auto" }} onClick={borrar}>
            {esFotos ? "Borrar lista" : `Borrar ${etq.uno.toLowerCase()}`}
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
            <span style={etiquetaCampo}>Título</span>
            <input style={campo} value={titulo} onChange={(ev) => setTitulo(ev.target.value)} maxLength={160} />
          </label>
        </div>
        <label>
          <span style={etiquetaCampo}>De qué trata</span>
          <textarea style={{ ...campo, minHeight: 80, resize: "vertical" }} value={resumen} onChange={(ev) => setResumen(ev.target.value)} maxLength={600} />
        </label>
      </div>
    </Modal>
  )
}
