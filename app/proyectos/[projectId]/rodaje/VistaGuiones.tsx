"use client"

// Vista por pieza: cada guion (o video, capítulo…) con sus escenas en el orden
// de la historia y el día en que se filma cada una. Aquí también se corrige lo
// que leyó la IA, se consultan los archivos originales y se decide qué escenas
// trabaja la unidad que se está viendo.

import { useMemo, useState } from "react"
import { ligaArchivo, type DatosPlan } from "../../../../lib/rodaje/datos"
import { comparadorGuion, diasVista, slugEscena } from "../../../../lib/rodaje/orden"
import {
  ETIQUETAS, TIPOS_ARCHIVO_GUION, nombrePieza, palabras,
  type EscenaBase, type Etiqueta, type RodajeArchivo, type RodajeEscena, type RodajeGuion,
} from "../../../../lib/rodaje/tipos"
import type { Acciones } from "./PlanRodaje"
import { TarjetaEscena, numeroEscena } from "./comun"
import { agruparTomas, useConjuntoGuardado } from "./VistaPlan"
import { C, MONO, boton, botonChico, botonVioleta, chip, chipAmbar, chipVerde, panel } from "./estilos"

export function VistaGuiones(props: {
  datos: DatosPlan
  puedeEditar: boolean
  acc: Acciones
  onGuion: (id: string, lista: string[]) => void
  onEditarEscena: (e: RodajeEscena) => void
  onTomas: (e: RodajeEscena) => void
  onNuevaEscena: (guionId: string) => void
  onEditarGuion: (g: RodajeGuion) => void
  onUnidades: () => void
  onListaFotos: () => void
}) {
  const { datos, puedeEditar, acc } = props
  const etq = ETIQUETAS[datos.plan.etiqueta] || ETIQUETAS.guion
  const unidad = datos.unidad
  const p = palabras(unidad.tipo)
  const varias = datos.guiones.length > 1
  const variasUnidades = datos.unidades.length > 1
  const [cerrados, alternar] = useConjuntoGuardado(`rodaje-gui-${datos.plan.id}`)
  const [abriendo, setAbriendo] = useState<string | null>(null)

  const guiones = useMemo(() => [...datos.guiones].sort((a, b) => a.orden - b.orden), [datos.guiones])
  // Todas las escenas del plan en el orden de la historia, estén o no en la unidad.
  const todas = useMemo(() => [...datos.todas].sort(comparadorGuion(datos.guiones)), [datos.todas, datos.guiones])
  // La escena como la tiene esta unidad (su día y si ya la hizo).
  const enUnidad = useMemo(() => new Map(datos.escenas.map((e) => [e.id, e])), [datos.escenas])
  const lista = useMemo(() => todas.filter((e) => enUnidad.has(e.id)).map((e) => e.id), [todas, enUnidad])
  const tomasPorEscena = useMemo(() => agruparTomas(datos.tomas), [datos.tomas])
  const diaDe = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of diasVista(datos.dias)) if (d.id) m.set(d.id, `Día ${d.n}`)
    return m
  }, [datos.dias])
  // En qué otras unidades está cada escena, para avisarlo en su tarjeta.
  const otrasDe = useMemo(() => {
    const nombre = new Map(datos.unidades.map((u) => [u.id, u.nombre]))
    const m = new Map<string, { nombre: string; hecha: boolean }[]>()
    for (const a of datos.asignaciones) {
      if (a.unidad_id === unidad.id) continue
      const n = nombre.get(a.unidad_id)
      if (!n) continue
      const l = m.get(a.escena_id)
      if (l) l.push({ nombre: n, hecha: a.filmada })
      else m.set(a.escena_id, [{ nombre: n, hecha: a.filmada }])
    }
    return m
  }, [datos.asignaciones, datos.unidades, unidad.id])
  const aplicados = datos.archivos.filter((a) => a.estado === "aplicado")

  async function verOriginal(a: RodajeArchivo) {
    setAbriendo(a.id)
    // La pestaña se abre antes de pedir la liga: si no, el navegador la bloquea.
    const ventana = window.open("", "_blank")
    try {
      const url = await ligaArchivo(a.id)
      if (ventana) ventana.location.replace(url)
      else window.location.assign(url)
    } catch (err) {
      ventana?.close()
      alert(`No se pudo abrir el archivo: ${(err as Error).message}`)
    } finally {
      setAbriendo(null)
    }
  }

  /** Saca escenas del plan de la unidad; avisa si se pierde avance o tomas. */
  function quitar(ids: string[], que: string) {
    const hechas = ids.filter((id) => enUnidad.get(id)?.filmada).length
    const conTomas = ids.filter((id) => tomasPorEscena.has(id)).length
    if (hechas || conTomas) {
      const pierde = [
        hechas ? `${hechas} ${hechas === 1 ? "marcada" : "marcadas"} como ${hechas === 1 ? p.unaHecha : p.hechas}` : "",
        conTomas ? `tomas calificadas en ${conTomas}` : "",
      ].filter(Boolean).join(" y ")
      if (!confirm(`¿Quitar ${que} de ${unidad.nombre}? Tiene ${pierde}; eso se pierde. La escena sigue en el proyecto.`)) return
    }
    acc.quitarDeUnidad(unidad.id, ids)
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
      {(puedeEditar || aplicados.length > 0) && (
        <div style={{ ...panel, padding: "12px 14px", display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
          {puedeEditar && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ color: C.tenue, fontSize: 13 }}>En este proyecto cada pieza es un:</span>
              <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }} role="group" aria-label="Tipo de pieza">
                {(Object.keys(ETIQUETAS) as Etiqueta[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={datos.plan.etiqueta === k}
                    style={{ ...(datos.plan.etiqueta === k ? botonVioleta : boton), padding: "5px 10px", fontSize: 12 }}
                    onClick={() => datos.plan.etiqueta !== k && acc.cambiarEtiqueta(k)}
                  >
                    {ETIQUETAS[k].uno}
                  </button>
                ))}
              </div>
            </div>
          )}
          {puedeEditar && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ color: C.tenue, fontSize: 13 }}>
                {variasUnidades
                  ? `Unidades de rodaje: ${datos.unidades.map((u) => u.nombre).join(", ")}.`
                  : "¿Hay segunda unidad o unidad de foto? Cada una lleva su propio plan de trabajo."}
              </span>
              <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" style={{ ...boton, padding: "5px 10px", fontSize: 12 }} onClick={props.onUnidades}>
                  {variasUnidades ? "Administrar unidades" : "+ Agregar unidad"}
                </button>
                <button type="button" style={{ ...boton, padding: "5px 10px", fontSize: 12 }} onClick={props.onListaFotos}>
                  + Lista de fotos
                </button>
              </span>
            </div>
          )}
          {aplicados.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6 }}>
              <span style={{ color: C.apagado, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>
                Archivos originales
              </span>
              {aplicados.map((a) => (
                <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                  <span style={chip}>{TIPOS_ARCHIVO_GUION[a.mime] || "Archivo"}</span>
                  <span style={{ flex: 1, minWidth: 0, color: C.texto2, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.nombre}
                  </span>
                  <button type="button" style={botonChico} onClick={() => verOriginal(a)} disabled={abriendo === a.id}>
                    {abriendo === a.id ? "Abriendo…" : "Ver original"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {guiones.map((g) => {
        const escenas = todas.filter((e) => e.guion_id === g.id)
        const dentro = escenas.filter((e) => enUnidad.has(e.id))
        const fuera = escenas.filter((e) => !enUnidad.has(e.id))
        const hechas = dentro.filter((e) => enUnidad.get(e.id)?.filmada).length
        const cerrado = cerrados.has(g.id)
        const esFotos = g.tipo === "fotos"
        const pieza = nombrePieza(etq, g)
        return (
          <section key={g.id} data-pieza={g.id} style={{ ...panel, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => alternar(g.id)}
                aria-expanded={!cerrado}
                style={{
                  flex: "1 1 220px", minWidth: 0, display: "flex", alignItems: "center", gap: 8, textAlign: "left",
                  background: "none", border: "none", padding: 0, cursor: "pointer", color: C.texto,
                }}
              >
                <span style={{ color: C.apagado, fontSize: 11, width: 10 }}>{cerrado ? "▸" : "▾"}</span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: C.violetaClaro, whiteSpace: "nowrap" }}>
                  {pieza}
                </span>
                <span style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {g.titulo || "Sin título"}
                </span>
              </button>
              {dentro.length > 0 ? (
                <span style={hechas === dentro.length ? chipVerde : chip}>
                  <span style={{ fontFamily: MONO }}>{hechas}/{dentro.length}</span> {p.hechas}
                </span>
              ) : (
                escenas.length > 0 && <span style={chip}>No está en {unidad.nombre}</span>
              )}
              {dentro.length > 0 && fuera.length > 0 && (
                <span style={chipAmbar}>{fuera.length} fuera de {unidad.nombre}</span>
              )}
              {puedeEditar && (
                <>
                  {fuera.length > 0 && (
                    <button
                      type="button"
                      style={{ ...botonChico, borderColor: C.violetaBorde, color: C.violetaClaro }}
                      onClick={() => acc.agregarAUnidad(unidad.id, fuera.map((e) => e.id))}
                      title={`Agregar ${fuera.length === escenas.length ? "todas sus escenas" : "las que faltan"} al plan de ${unidad.nombre}`}
                    >
                      + Todo a {unidad.nombre}
                    </button>
                  )}
                  {variasUnidades && dentro.length > 0 && fuera.length === 0 && (
                    <button
                      type="button"
                      style={botonChico}
                      onClick={() => quitar(dentro.map((e) => e.id), `${pieza.toLowerCase()} completo`)}
                      title={`Sacar todas sus escenas del plan de ${unidad.nombre}`}
                    >
                      Quitar de {unidad.nombre}
                    </button>
                  )}
                  <button type="button" style={botonChico} onClick={() => props.onNuevaEscena(g.id)}>
                    {esFotos ? "+ Foto" : "+ Escena"}
                  </button>
                  <button type="button" style={botonChico} onClick={() => props.onEditarGuion(g)}>Editar</button>
                </>
              )}
            </div>

            {!cerrado && (
              <>
                {g.resumen && (
                  <p style={{ margin: "8px 0 0", color: C.tenue, fontSize: 13, lineHeight: 1.45 }}>{g.resumen}</p>
                )}
                {g.notas.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {g.notas.map((n, k) => (
                      <span key={k} style={{ ...chipAmbar, whiteSpace: "normal", borderRadius: 8, padding: "3px 8px" }}>{n}</span>
                    ))}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8, marginTop: 10 }}>
                  {escenas.length === 0 && (
                    <p style={{ margin: 0, color: C.apagado, fontSize: 13 }}>{esFotos ? "Sin fotos." : "Sin escenas."}</p>
                  )}
                  {escenas.map((base) => {
                    const e = enUnidad.get(base.id)
                    if (!e) {
                      return (
                        <EscenaFuera
                          key={base.id}
                          escena={base}
                          guion={g}
                          varias={varias}
                          unidad={unidad.nombre}
                          otras={otrasDe.get(base.id)}
                          onAgregar={puedeEditar ? () => acc.agregarAUnidad(unidad.id, [base.id]) : undefined}
                        />
                      )
                    }
                    return (
                      <TarjetaEscena
                        key={e.id}
                        escena={e}
                        guion={g}
                        varias={varias}
                        puedeEditar={puedeEditar}
                        dia={e.dia_id ? diaDe.get(e.dia_id) || "" : "Sin día"}
                        tomas={tomasPorEscena.get(e.id)}
                        tipoUnidad={unidad.tipo}
                        otras={otrasDe.get(e.id)}
                        onFilmada={(v) => acc.marcarFilmada(e.id, v)}
                        onGuion={() => props.onGuion(e.id, lista)}
                        onEditar={() => props.onEditarEscena(e)}
                        onTomas={() => props.onTomas(e)}
                      />
                    )
                  })}
                </div>
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}

/** Una escena que la unidad que se está viendo no trabaja: se ve apagada y se puede agregar. */
function EscenaFuera(props: {
  escena: EscenaBase
  guion: RodajeGuion
  varias: boolean
  unidad: string
  otras?: { nombre: string; hecha: boolean }[]
  onAgregar?: () => void
}) {
  const { escena: e, guion } = props
  const num = numeroEscena(e, guion, props.varias)
  return (
    <div
      data-escena-fuera={e.id}
      style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 10px", borderRadius: 12,
        border: `1px dashed ${C.linea}`, background: "transparent",
      }}
    >
      <div style={{ flex: "1 1 200px", minWidth: 0, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: C.apagado }}>{num}</span>
        <span style={{ color: C.apagado, fontSize: 13.5, fontWeight: 600, lineHeight: 1.3 }}>{slugEscena(e)}</span>
        {props.otras?.length ? (
          props.otras.map((o) => (
            <span key={o.nombre} style={o.hecha ? chipVerde : chip}>{o.nombre}{o.hecha ? " ✓" : ""}</span>
          ))
        ) : (
          <span style={chipAmbar}>Sin unidad</span>
        )}
      </div>
      {props.onAgregar && (
        <button
          type="button"
          style={{ ...botonChico, borderColor: C.violetaBorde, color: C.violetaClaro }}
          onClick={props.onAgregar}
          aria-label={`Agregar ${guion.tipo === "fotos" ? "foto" : "escena"} ${num} a ${props.unidad}`}
        >
          + {props.unidad}
        </button>
      )}
    </div>
  )
}
