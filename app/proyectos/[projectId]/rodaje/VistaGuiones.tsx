"use client"

// Vista por pieza: cada guion (o video, capítulo…) con sus escenas en el orden
// de la historia y el día en que se filma cada una. Aquí también se corrige lo
// que leyó la IA y se consultan los archivos originales.

import { useMemo, useState } from "react"
import { ligaArchivo, type DatosPlan } from "../../../../lib/rodaje/datos"
import { comparadorGuion, diasVista } from "../../../../lib/rodaje/orden"
import {
  ETIQUETAS, TIPOS_ARCHIVO_GUION,
  type Etiqueta, type RodajeArchivo, type RodajeEscena, type RodajeGuion,
} from "../../../../lib/rodaje/tipos"
import type { Acciones } from "./PlanRodaje"
import { TarjetaEscena } from "./comun"
import { useConjuntoGuardado } from "./VistaPlan"
import { C, MONO, boton, botonChico, botonVioleta, chip, chipAmbar, chipVerde, panel } from "./estilos"

export function VistaGuiones(props: {
  datos: DatosPlan
  puedeEditar: boolean
  acc: Acciones
  onGuion: (id: string, lista: string[]) => void
  onEditarEscena: (e: RodajeEscena) => void
  onNuevaEscena: (guionId: string) => void
  onEditarGuion: (g: RodajeGuion) => void
}) {
  const { datos, puedeEditar, acc } = props
  const etq = ETIQUETAS[datos.plan.etiqueta] || ETIQUETAS.guion
  const varias = datos.guiones.length > 1
  const [cerrados, alternar] = useConjuntoGuardado(`rodaje-gui-${datos.plan.id}`)
  const [abriendo, setAbriendo] = useState<string | null>(null)

  const guiones = useMemo(() => [...datos.guiones].sort((a, b) => a.orden - b.orden), [datos.guiones])
  const enOrden = useMemo(
    () => [...datos.escenas].sort(comparadorGuion(datos.guiones)),
    [datos.escenas, datos.guiones]
  )
  const lista = useMemo(() => enOrden.map((e) => e.id), [enOrden])
  const diaDe = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of diasVista(datos.dias)) if (d.id) m.set(d.id, `Día ${d.n}`)
    return m
  }, [datos.dias])
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
        const escenas = enOrden.filter((e) => e.guion_id === g.id)
        const hechas = escenas.filter((e) => e.filmada).length
        const cerrado = cerrados.has(g.id)
        return (
          <section key={g.id} style={{ ...panel, padding: "12px 14px" }}>
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
                  {etq.uno} {g.numero}
                </span>
                <span style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {g.titulo || "Sin título"}
                </span>
              </button>
              {g.unidad && <span style={chipAmbar}>Unidad {g.unidad}</span>}
              <span style={escenas.length > 0 && hechas === escenas.length ? chipVerde : chip}>
                <span style={{ fontFamily: MONO }}>{hechas}/{escenas.length}</span> filmadas
              </span>
              {puedeEditar && (
                <>
                  <button type="button" style={botonChico} onClick={() => props.onNuevaEscena(g.id)}>+ Escena</button>
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
                    <p style={{ margin: 0, color: C.apagado, fontSize: 13 }}>Sin escenas.</p>
                  )}
                  {escenas.map((e) => (
                    <TarjetaEscena
                      key={e.id}
                      escena={e}
                      guion={g}
                      varias={varias}
                      puedeEditar={puedeEditar}
                      dia={e.dia_id ? diaDe.get(e.dia_id) || "" : "Sin día"}
                      onFilmada={(v) => acc.marcarFilmada(e.id, v)}
                      onGuion={() => props.onGuion(e.id, lista)}
                      onEditar={() => props.onEditarEscena(e)}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}
