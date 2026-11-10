"use client"

// Piezas que comparten las vistas del plan de rodaje.

import { useEffect, type CSSProperties, type ReactNode } from "react"
import { slugEscena } from "../../../../lib/rodaje/orden"
import type { RodajeEscena, RodajeGuion } from "../../../../lib/rodaje/tipos"
import {
  C, MONO, botonChico, chip, chipVerde, chipVioleta, eyebrow,
  modalCabeza, modalCaja, modalCuerpo, modalFondo,
} from "./estilos"

/** "3.2" cuando el plan tiene varias piezas; "2" cuando es un solo guion. */
export function numeroEscena(e: RodajeEscena, g: RodajeGuion | undefined, varias: boolean): string {
  return varias && g ? `${g.numero}.${e.numero}` : e.numero
}

export function Modal(props: {
  titulo: ReactNode
  sobre?: string
  ancho?: number
  onCerrar: () => void
  children: ReactNode
  pie?: ReactNode
}) {
  const { onCerrar } = props
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onCerrar()
    }
    window.addEventListener("keydown", tecla)
    return () => window.removeEventListener("keydown", tecla)
  }, [onCerrar])

  return (
    <div
      style={modalFondo}
      onMouseDown={(ev) => {
        if (ev.target === ev.currentTarget) onCerrar()
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
  onFilmada: (valor: boolean) => void
  onGuion: () => void
  onEditar?: () => void
}) {
  const { escena: e, guion, varias, puedeEditar } = props
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
        alignItems: filmada ? "center" : "flex-start",
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
