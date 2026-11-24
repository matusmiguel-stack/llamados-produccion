"use client"

// Unidades de rodaje: el selector (desde qué unidad se ve el plan) y la ventana
// para crearlas, renombrarlas y borrarlas.

import { useMemo } from "react"
import type { DatosPlan } from "../../../../lib/rodaje/datos"
import { MAX_UNIDADES, palabras, type RodajeUnidad, type TipoUnidad } from "../../../../lib/rodaje/tipos"
import type { Acciones } from "./PlanRodaje"
import { Modal } from "./comun"
import { C, MONO, boton, botonChico, botonPeligro, botonVerde, botonVioleta, campo, etiquetaCampo } from "./estilos"

/** Cuántas escenas tiene cada unidad y cuántas lleva hechas. */
function useCuentas(datos: DatosPlan): Map<string, { total: number; hechas: number }> {
  return useMemo(() => {
    const m = new Map<string, { total: number; hechas: number }>()
    for (const a of datos.asignaciones) {
      const c = m.get(a.unidad_id) || { total: 0, hechas: 0 }
      c.total++
      if (a.filmada) c.hechas++
      m.set(a.unidad_id, c)
    }
    return m
  }, [datos.asignaciones])
}

export function SelectorUnidad(props: {
  datos: DatosPlan
  puedeEditar: boolean
  onElegir: (id: string) => void
  onAdministrar: () => void
}) {
  const { datos } = props
  const cuentas = useCuentas(datos)
  return (
    <div
      role="group"
      aria-label="Unidad de rodaje"
      style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}
    >
      <span style={{ ...etiquetaCampo, margin: "0 2px 0 0" }}>Unidad</span>
      {datos.unidades.map((u) => {
        const c = cuentas.get(u.id) || { total: 0, hechas: 0 }
        const activa = u.id === datos.unidad.id
        return (
          <button
            key={u.id}
            type="button"
            aria-pressed={activa}
            onClick={() => props.onElegir(u.id)}
            style={activa ? botonVioleta : boton}
            title={`${c.hechas} de ${c.total} ${palabras(u.tipo).hechas}`}
          >
            {u.nombre}
            <span style={{ fontFamily: MONO, fontSize: 11.5, opacity: 0.7 }}>{c.hechas}/{c.total}</span>
          </button>
        )
      })}
      {props.puedeEditar && (
        <button type="button" style={{ ...botonChico, marginLeft: "auto" }} onClick={props.onAdministrar}>
          Administrar
        </button>
      )}
    </div>
  )
}

const TIPOS: { valor: TipoUnidad; texto: string }[] = [
  { valor: "video", texto: "Video" },
  { valor: "foto", texto: "Foto" },
]

export function AdministrarUnidades(props: {
  datos: DatosPlan
  acc: Acciones
  onElegir: (id: string) => void
  onCerrar: () => void
}) {
  const { datos, acc } = props
  const cuentas = useCuentas(datos)
  const llena = datos.unidades.length >= MAX_UNIDADES

  function crear(tipo: TipoUnidad) {
    const id = acc.crearUnidad(tipo)
    // Se pasa a la unidad nueva para empezar a armar su plan.
    if (id) props.onElegir(id)
  }

  function borrar(u: RodajeUnidad) {
    const c = cuentas.get(u.id) || { total: 0, hechas: 0 }
    const p = palabras(u.tipo)
    const otras = new Set(datos.asignaciones.filter((a) => a.unidad_id !== u.id).map((a) => a.escena_id))
    const huerfanas = datos.asignaciones.filter((a) => a.unidad_id === u.id && !otras.has(a.escena_id)).length
    const tomas = new Set(datos.tomasTodas.filter((t) => t.unidad_id === u.id).map((t) => t.escena_id)).size
    const partes = [
      `¿Borrar la unidad "${u.nombre}"?`,
      c.total
        ? `Se borra su plan de trabajo: el orden de ${c.total === 1 ? "su escena" : `sus ${c.total} escenas`}` +
          (c.hechas ? (c.hechas === 1 ? `, la que ya marcó como ${p.unaHecha}` : `, las ${c.hechas} que ya marcó como ${p.hechas}`) : "") +
          (tomas ? `, las tomas que calificó en ${tomas}` : "") +
          ", sus separadores y sus notas de día."
        : "Se borran sus separadores y sus notas de día.",
      huerfanas
        ? `${huerfanas} ${huerfanas === 1 ? "escena queda" : "escenas quedan"} sin unidad; siguen en el proyecto y las puedes pasar a otra unidad.`
        : c.total
          ? "Las escenas siguen en el proyecto."
          : "",
      "No se puede deshacer.",
    ]
    if (!confirm(partes.filter(Boolean).join(" "))) return
    acc.borrarUnidad(u.id)
  }

  return (
    <Modal
      sobre="Plan de rodaje"
      titulo="Unidades de rodaje"
      ancho={560}
      fijo
      onCerrar={props.onCerrar}
      pie={
        <>
          <button
            type="button"
            style={{ ...boton, borderStyle: "dashed", opacity: llena ? 0.4 : 1 }}
            disabled={llena}
            onClick={() => crear("video")}
          >
            + Unidad de video
          </button>
          <button
            type="button"
            style={{ ...boton, borderStyle: "dashed", marginRight: "auto", opacity: llena ? 0.4 : 1 }}
            disabled={llena}
            onClick={() => crear("foto")}
          >
            + Unidad de foto
          </button>
          <button type="button" style={botonVerde} onClick={props.onCerrar}>Listo</button>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
        <p style={{ margin: 0, color: C.tenue, fontSize: 13, lineHeight: 1.5 }}>
          Cada unidad tiene su propio plan de trabajo: su orden, sus separadores, su nota de llamado y su
          avance. Los días son los mismos para todas, y una escena puede estar en varias unidades.
        </p>

        {datos.unidades.map((u) => {
          const c = cuentas.get(u.id) || { total: 0, hechas: 0 }
          const unica = datos.unidades.length <= 1
          return (
            <div
              key={u.id}
              data-unidad={u.id}
              style={{
                display: "grid", gridTemplateColumns: "minmax(0, 1fr) 96px auto", gap: 8, alignItems: "end",
                padding: "10px 12px", borderRadius: 12, border: `1px solid ${C.linea}`, background: C.hueco,
              }}
            >
              <label style={{ minWidth: 0 }}>
                <span style={etiquetaCampo}>Nombre</span>
                <input
                  key={u.nombre}
                  style={campo}
                  defaultValue={u.nombre}
                  maxLength={40}
                  aria-label={`Nombre de ${u.nombre}`}
                  onBlur={(ev) => {
                    const v = ev.target.value.trim()
                    if (v && v !== u.nombre) acc.actualizarUnidad(u.id, { nombre: v })
                    else ev.target.value = u.nombre
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") ev.currentTarget.blur()
                  }}
                />
              </label>
              <label>
                <span style={etiquetaCampo}>Tipo</span>
                <select
                  style={{ ...campo, colorScheme: "dark" }}
                  value={u.tipo}
                  aria-label={`Tipo de ${u.nombre}`}
                  onChange={(ev) => acc.actualizarUnidad(u.id, { tipo: ev.target.value as TipoUnidad })}
                >
                  {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.texto}</option>)}
                </select>
              </label>
              <button
                type="button"
                style={{ ...botonPeligro, opacity: unica ? 0.4 : 1 }}
                disabled={unica}
                title={unica ? "El plan necesita al menos una unidad" : `Borrar ${u.nombre} y su plan de trabajo`}
                aria-label={`Borrar ${u.nombre}`}
                onClick={() => borrar(u)}
              >
                Borrar
              </button>
              <span style={{ gridColumn: "1 / -1", color: C.apagado, fontSize: 12 }}>
                {c.total === 0
                  ? "Sin escenas todavía"
                  : `${c.total} ${c.total === 1 ? "escena" : "escenas"} · ${c.hechas} ${palabras(u.tipo).hechas}`}
              </span>
            </div>
          )
        })}

        {llena && (
          <p style={{ margin: 0, color: C.apagado, fontSize: 12 }}>
            Un plan admite hasta {MAX_UNIDADES} unidades.
          </p>
        )}
      </div>
    </Modal>
  )
}
