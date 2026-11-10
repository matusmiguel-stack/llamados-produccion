"use client"

// Piezas que comparten las vistas del plan de rodaje.

import { useEffect, type CSSProperties, type ReactNode } from "react"
import { slugEscena } from "../../../../lib/rodaje/orden"
import type { RodajeEscena, RodajeGuion, RodajeToma } from "../../../../lib/rodaje/tipos"
import {
  C, MONO, botonChico, chip, chipVerde, chipVioleta, eyebrow,
  modalCabeza, modalCaja, modalCuerpo, modalFondo,
} from "./estilos"

/** "3.2" cuando el plan tiene varias piezas; "2" cuando es un solo guion. */
export function numeroEscena(e: RodajeEscena, g: RodajeGuion | undefined, varias: boolean): string {
  return varias && g ? `${g.numero}.${e.numero}` : e.numero
}

// Ventanas abiertas, de abajo hacia arriba: Esc solo cierra la de hasta arriba.
const pilaModales: symbol[] = []

/** true si hay una ventana abierta encima de la que pregunta (o cualquiera, si no se pasa id). */
export function hayModalEncima(id?: symbol): boolean {
  if (!pilaModales.length) return false
  return id ? pilaModales[pilaModales.length - 1] !== id : true
}

export function Modal(props: {
  titulo: ReactNode
  sobre?: string
  ancho?: number
  /** Formularios: no se cierra al tocar fuera, para no perder lo capturado */
  fijo?: boolean
  onCerrar: () => void
  children: ReactNode
  pie?: ReactNode
}) {
  const { onCerrar } = props
  useEffect(() => {
    const id = Symbol("modal")
    pilaModales.push(id)
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && !hayModalEncima(id)) onCerrar()
    }
    window.addEventListener("keydown", tecla)
    return () => {
      window.removeEventListener("keydown", tecla)
      const i = pilaModales.indexOf(id)
      if (i >= 0) pilaModales.splice(i, 1)
    }
  }, [onCerrar])

  return (
    <div
      style={modalFondo}
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget && !props.fijo) onCerrar()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div style={{ ...modalCaja, maxWidth: props.ancho || 560 }}>
        <div style={modalCabeza}>
          <div style={{ minWidth: 0 }}>
            {props.sobre && <p style={{ ...eyebrow, fontSize: 10 }}>{props.sobre}</p>}
            <h2 style={{ margin: props.sobre ? "4px 0 0" : 0, color: C.texto, fontSize: 17, fontWeight: 600, lineHeight: 1.25 }}>
              {props.titulo}
            </h2>
          </div>
          <button type="button" onClick={onCerrar} style={{ ...botonChico, flexShrink: 0 }} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div style={modalCuerpo}>{props.children}</div>
        {props.pie && (
          <div
            style={{
              display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap",
              padding: "12px 20px", borderTop: `1px solid ${C.lineaSuave}`, background: "rgba(2,6,23,0.4)",
            }}
          >
            {props.pie}
          </div>
        )}
      </div>
    </div>
  )
}

export function BarraProgreso({ hecho, total, color }: { hecho: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((hecho / total) * 100)) : 0
  return (
    <div
      style={{ height: 6, borderRadius: 999, background: "rgba(148,163,184,0.14)", overflow: "hidden" }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        style={{
          width: `${pct}%`, height: "100%", borderRadius: 999,
          background: color || C.verde, transition: "width 0.3s ease",
        }}
      />
    </div>
  )
}

const sello: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: 6,
  fontFamily: MONO,
  fontSize: 11.5,
  fontWeight: 600,
  whiteSpace: "nowrap",
}

export function tomasDeEscena(tomas: RodajeToma[], escenaId: string): RodajeToma[] {
  return tomas.filter((t) => t.escena_id === escenaId).sort((a, b) => a.orden - b.orden)
}

/** Las tomas calificadas de una escena, un renglón por emplazamiento. */
export function ResumenTomas({ tomas }: { tomas: RodajeToma[] }) {
  if (!tomas.length) return null
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 5 }} data-tomas>
      {tomas.map((t, i) => (
        <div key={t.id} style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", minWidth: 0 }}>
          <span style={{ ...sello, background: C.violetaFondo, color: C.violetaClaro, whiteSpace: "normal" }}>
            {t.emplazamiento || `Emplazamiento ${i + 1}`}
          </span>
          {t.buena && (
            <span style={{ ...sello, background: C.verdeFondo, color: C.verdeClaro, border: `1px solid ${C.verdeBorde}` }}>
              TOMA BUENA {t.buena}
            </span>
          )}
          {t.proteccion && (
            <span style={{ ...sello, background: C.ambarFondo, color: C.ambar, border: `1px solid ${C.ambarBorde}` }}>
              PROTECCIÓN {t.proteccion}
            </span>
          )}
          {t.notas && (
            <span style={{ flexBasis: "100%", color: C.texto2, fontSize: 12.5, lineHeight: 1.4, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {t.notas}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

const palomita: CSSProperties = {
  flexShrink: 0,
  width: 30,
  height: 30,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1,
}

export function TarjetaEscena(props: {
  escena: RodajeEscena
  guion: RodajeGuion | undefined
  varias: boolean
  puedeEditar: boolean
  /** Texto del día asignado; solo se muestra en la vista por guion */
  dia?: string
  /** Tomas calificadas de esta escena, ya en orden */
  tomas?: RodajeToma[]
  onFilmada: (valor: boolean) => void
  onGuion: () => void
  onEditar?: () => void
  onTomas?: () => void
}) {
  const { escena: e, guion, varias, puedeEditar } = props
  const tomas = props.tomas || []
  // Filmada y sin nada más que mostrar: un solo renglón.
  const compacta = e.filmada && !tomas.length && !(puedeEditar && props.onTomas)
  const filmada = e.filmada
  const num = numeroEscena(e, guion, varias)

  const circulo = (
    <span
      style={{
        ...palomita,
        border: `1.5px solid ${filmada ? C.verde : "rgba(148,163,184,0.4)"}`,
        background: filmada ? C.verde : "transparent",
        color: filmada ? "#052e1f" : "transparent",
      }}
    >
      ✓
    </span>
  )

  return (
    <div
      data-escena={e.id}
      style={{
        display: "flex",
        alignItems: compacta ? "center" : "flex-start",
        gap: 10,
        padding: filmada ? "7px 10px" : "10px 10px",
        borderRadius: 12,
        border: `1px solid ${filmada ? C.verdeBorde : C.linea}`,
        background: filmada ? "rgba(52,211,153,0.06)" : "rgba(255,255,255,0.025)",
      }}
    >
      {puedeEditar ? (
        <button
          type="button"
          onClick={() => props.onFilmada(!filmada)}
          aria-pressed={filmada}
          aria-label={filmada ? `Escena ${num} filmada: desmarcar` : `Marcar escena ${num} como filmada`}
          title={filmada ? "Filmada: toca para desmarcar" : "Marcar como filmada"}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex" }}
        >
          {circulo}
        </button>
      ) : (
        <span title={filmada ? "Filmada" : "Pendiente"} style={{ display: "inline-flex" }}>{circulo}</span>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: filmada ? C.verdeClaro : C.violetaClaro }}>
            {num}
          </span>
          <span
            style={{
              color: filmada ? C.tenue : C.texto, fontSize: 13.5, fontWeight: 600, lineHeight: 1.3,
              ...(filmada ? { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" } : {}),
            }}
          >
            {slugEscena(e)}
          </span>
          {filmada && <span style={chipVerde}>Filmada</span>}
          {props.dia && <span style={e.dia_id ? chipVioleta : chip}>{props.dia}</span>}
        </div>
        {!filmada && e.descripcion && (
          <p style={{ margin: "3px 0 0", color: C.tenue, fontSize: 13, lineHeight: 1.4 }}>{e.descripcion}</p>
        )}
        {!filmada && e.personajes.length > 0 && (
          <p style={{ margin: "4px 0 0", color: C.apagado, fontSize: 11.5, letterSpacing: 0.3 }}>
            {e.personajes.join(" · ")}
          </p>
        )}
        {(tomas.length > 0 || (puedeEditar && props.onTomas)) && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6, marginTop: 7, justifyItems: "start" }}>
            <ResumenTomas tomas={tomas} />
            {puedeEditar && props.onTomas && (
              <button
                type="button"
                onClick={props.onTomas}
                style={{ ...botonChico, padding: "4px 9px", fontSize: 11.5, letterSpacing: 0.4 }}
                aria-label={tomas.length ? `Editar tomas de la escena ${num}` : `Agregar tomas a la escena ${num}`}
              >
                {tomas.length ? "EDITAR TOMAS" : "+ TOMAS"}
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button type="button" onClick={props.onGuion} style={botonChico} title="Ver el texto de la escena">
          GUION
        </button>
        {puedeEditar && props.onEditar && (
          <button type="button" onClick={props.onEditar} style={botonChico} aria-label={`Editar escena ${num}`} title="Editar escena">
            ✎
          </button>
        )}
      </div>
    </div>
  )
}
