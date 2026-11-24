"use client"

// Menú de PDF: el plan de trabajo (completo o por día) y el reporte de tomas
// buenas (en orden de guion o de rodaje). Cada PDF es de una unidad; si el plan
// tiene varias, aquí se elige de cuál.

import { useMemo, useState, type ReactNode } from "react"
import type { DatosCrudos } from "../../../../lib/rodaje/datos"
import { diasVista } from "../../../../lib/rodaje/orden"
import { descargarPlanPDF, descargarTomasPDF } from "../../../../lib/rodaje/pdf"
import { ETIQUETAS } from "../../../../lib/rodaje/tipos"
import { proyectar } from "../../../../lib/rodaje/unidades"
import { Modal } from "./comun"
import { C, MONO, avisoError, boton, botonVioleta, etiquetaCampo } from "./estilos"

export function ExportarPDF(props: {
  crudos: DatosCrudos
  /** La unidad que se está viendo: es la que sale elegida */
  unidadId: string
  proyecto: string
  onCerrar: () => void
}) {
  const { crudos, proyecto } = props
  const [unidadId, setUnidadId] = useState(props.unidadId)
  const datos = useMemo(() => proyectar(crudos, unidadId), [crudos, unidadId])
  const etq = ETIQUETAS[datos.plan.etiqueta] || ETIQUETAS.guion
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState("")

  const dias = diasVista(datos.dias)
  const enDia = (id: string | null) => datos.escenas.filter((e) => (e.dia_id || null) === id).length
  const conTomas = new Set(
    datos.tomas.filter((t) => t.emplazamiento || t.buena || t.proteccion || t.notas).map((t) => t.escena_id)
  ).size

  async function hacer(clave: string, tarea: () => Promise<void>) {
    if (ocupado) return
    setOcupado(clave)
    setError("")
    try {
      await tarea()
    } catch (err) {
      setError(`No se pudo generar el PDF: ${(err as Error).message}`)
    } finally {
      setOcupado(null)
    }
  }

  const opcion = (clave: string, texto: ReactNode, detalle: string, tarea: () => Promise<void>) => (
    <button
      key={clave}
      type="button"
      onClick={() => hacer(clave, tarea)}
      disabled={!!ocupado}
      style={{
        ...boton, width: "100%", justifyContent: "space-between", padding: "10px 12px", fontSize: 13.5,
        whiteSpace: "normal", textAlign: "left", opacity: ocupado && ocupado !== clave ? 0.5 : 1,
      }}
    >
      <span style={{ minWidth: 0 }}>{ocupado === clave ? "Generando…" : texto}</span>
      <span style={{ color: C.apagado, fontSize: 12, fontFamily: MONO, whiteSpace: "nowrap" }}>{detalle}</span>
    </button>
  )

  const esc = (n: number) => `${n} esc.`
  const variasUnidades = datos.unidades.length > 1

  return (
    <Modal titulo="Descargar PDF" sobre="Plan de rodaje" ancho={520} onCerrar={props.onCerrar}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 18 }}>
        {error && <div style={avisoError}>{error}</div>}

        {variasUnidades && (
          <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6 }}>
            <span style={etiquetaCampo}>Unidad</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label="Unidad del PDF">
              {datos.unidades.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  aria-pressed={u.id === datos.unidad.id}
                  disabled={!!ocupado}
                  onClick={() => setUnidadId(u.id)}
                  style={u.id === datos.unidad.id ? botonVioleta : boton}
                >
                  {u.nombre}
                </button>
              ))}
            </div>
          </section>
        )}

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6 }}>
          <span style={etiquetaCampo}>Plan de trabajo{variasUnidades ? ` · ${datos.unidad.nombre}` : ""}</span>
          {opcion("plan:todo", "Plan completo", esc(datos.escenas.length), () =>
            descargarPlanPDF(datos, proyecto, { tipo: "todo" })
          )}
          {dias
            .filter((d) => d.id && enDia(d.id) > 0)
            .map((d) =>
              opcion(`plan:${d.clave}`, d.titulo, esc(enDia(d.id)), () =>
                descargarPlanPDF(datos, proyecto, { tipo: "dia", diaId: d.id })
              )
            )}
          {datos.dias.length > 0 && enDia(null) > 0 &&
            opcion("plan:sin-dia", "Sin día asignado", esc(enDia(null)), () =>
              descargarPlanPDF(datos, proyecto, { tipo: "dia", diaId: null })
            )}
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6 }}>
          <span style={etiquetaCampo}>Reporte de tomas buenas{variasUnidades ? ` · ${datos.unidad.nombre}` : ""}</span>
          {opcion("tomas:guion", "Orden del guion", `por ${etq.uno.toLowerCase()}`, () =>
            descargarTomasPDF(datos, proyecto, "guion")
          )}
          {opcion("tomas:rodaje", "Orden de rodaje", "por día", () => descargarTomasPDF(datos, proyecto, "rodaje"))}
          <p style={{ margin: "2px 2px 0", color: C.apagado, fontSize: 12 }}>
            {conTomas} de {datos.escenas.length} escenas con tomas calificadas.
          </p>
        </section>
      </div>
    </Modal>
  )
}
