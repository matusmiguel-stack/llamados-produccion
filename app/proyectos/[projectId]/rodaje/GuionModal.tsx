"use client"

// Botón GUION: el texto de la escena, con ← → para recorrer las escenas en el
// orden del plan y marcar lo filmado sin salir.

import { useEffect, useState, type CSSProperties } from "react"
import { leerTextoEscenas, textoDeEscena, type DatosPlan } from "../../../../lib/rodaje/datos"
import { slugEscena } from "../../../../lib/rodaje/orden"
import { ETIQUETAS, type LineaGuion } from "../../../../lib/rodaje/tipos"
import type { Acciones } from "./PlanRodaje"
import { Modal, ResumenTomas, numeroEscena, tomasDeEscena } from "./comun"
import { C, MONO, avisoAmbar, avisoError, boton, botonVerde, botonVioleta, chipAmbar, vacio } from "./estilos"

const ESTILO_LINEA: Record<LineaGuion["t"], CSSProperties> = {
  accion: { margin: "0 0 10px", color: C.texto2, lineHeight: 1.55 },
  personaje: {
    margin: "14px 0 2px", paddingLeft: "22%", color: C.violetaClaro,
    fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
  },
  dialogo: { margin: "0 0 10px", paddingLeft: "11%", paddingRight: "9%", color: C.texto, lineHeight: 1.5 },
  acotacion: { margin: "0 0 2px", paddingLeft: "17%", color: C.apagado, fontStyle: "italic" },
  super: {
    margin: "10px 0", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.linea}`,
    background: "rgba(148,163,184,0.07)", color: C.texto, fontWeight: 600,
  },
  transicion: {
    margin: "10px 0", textAlign: "right", color: C.apagado,
    fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase",
  },
  nota: {
    margin: "0 0 10px", paddingLeft: 10, borderLeft: `2px solid ${C.ambarBorde}`,
    color: C.tenue, fontStyle: "italic", lineHeight: 1.5,
  },
}

export function GuionModal(props: {
  datos: DatosPlan
  escenaId: string
  lista: string[]
  puedeEditar: boolean
  acc: Acciones
  onCambiar: (id: string) => void
  onTomas: (escenaId: string) => void
  onCerrar: () => void
}) {
  const { datos, escenaId, lista, puedeEditar, acc, onCambiar } = props
  const etq = ETIQUETAS[datos.plan.etiqueta] || ETIQUETAS.guion
  const varias = datos.guiones.length > 1

  const escena = datos.escenas.find((e) => e.id === escenaId)
  const guion = escena ? datos.guiones.find((g) => g.id === escena.guion_id) : undefined
  const tieneTexto = !!escena?.tiene_texto

  // undefined = todavía no se pide · null = la escena no tiene texto leído
  const [textos, setTextos] = useState<Record<string, LineaGuion[] | null>>({})
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState("")

  const texto = textos[escenaId]
  const falta = texto === undefined || (texto === null && tieneTexto)

  useEffect(() => {
    if (!falta) return
    let vivo = true
    textoDeEscena(escenaId)
      .then((t) => {
        if (vivo) setTextos((prev) => ({ ...prev, [escenaId]: t }))
      })
      .catch((err: Error) => {
        if (vivo) setError(err.message)
      })
    return () => {
      vivo = false
    }
  }, [escenaId, falta])

  const i = lista.indexOf(escenaId)
  const anterior = i > 0 ? lista[i - 1] : null
  const siguiente = i >= 0 && i < lista.length - 1 ? lista[i + 1] : null

  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      // Con el formulario de tomas abierto encima, las flechas no cambian de escena.
      if (document.querySelectorAll('[role="dialog"]').length > 1) return
      if (ev.key === "ArrowLeft" && anterior) onCambiar(anterior)
      if (ev.key === "ArrowRight" && siguiente) onCambiar(siguiente)
    }
    window.addEventListener("keydown", tecla)
    return () => window.removeEventListener("keydown", tecla)
  }, [anterior, siguiente, onCambiar])

  if (!escena) {
    return (
      <Modal titulo="Escena" onCerrar={props.onCerrar}>
        <div style={vacio}>Esta escena ya no existe en el plan.</div>
      </Modal>
    )
  }

  async function leerAhora() {
    if (!guion?.archivo_id || leyendo) return
    setLeyendo(true)
    setError("")
    try {
      await leerTextoEscenas(guion.archivo_id, [escenaId])
      const t = await textoDeEscena(escenaId)
      setTextos((prev) => ({ ...prev, [escenaId]: t }))
      acc.recargar()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLeyendo(false)
    }
  }

  const num = numeroEscena(escena, guion, varias)
  const tomas = tomasDeEscena(datos.tomas, escena.id)
  const sobre = varias && guion ? `${etq.uno} ${guion.numero} · ${guion.titulo}` : guion?.titulo || "Guion"

  return (
    <Modal
      sobre={sobre}
      titulo={
        <>
          <span style={{ fontFamily: MONO, color: escena.filmada ? C.verdeClaro : C.violetaClaro }}>{num}</span>{" "}
          {slugEscena(escena)}
        </>
      }
      ancho={720}
      onCerrar={props.onCerrar}
      pie={
        <>
          <span style={{ marginRight: "auto", color: C.apagado, fontSize: 12, alignSelf: "center", fontFamily: MONO }}>
            {i >= 0 ? `${i + 1} de ${lista.length}` : ""}
          </span>
          <button type="button" style={{ ...boton, opacity: anterior ? 1 : 0.4 }} disabled={!anterior} onClick={() => anterior && onCambiar(anterior)}>
            ← Anterior
          </button>
          <button type="button" style={{ ...boton, opacity: siguiente ? 1 : 0.4 }} disabled={!siguiente} onClick={() => siguiente && onCambiar(siguiente)}>
            Siguiente →
          </button>
          {puedeEditar && (
            <button type="button" style={boton} onClick={() => props.onTomas(escena.id)}>
              {tomas.length ? "Editar tomas" : "+ Tomas"}
            </button>
          )}
          {puedeEditar && (
            <button type="button" style={escena.filmada ? botonVerde : botonVioleta} onClick={() => acc.marcarFilmada(escena.id, !escena.filmada)}>
              {escena.filmada ? "✓ Filmada" : "Marcar filmada"}
            </button>
          )}
        </>
      }
    >
      {escena.descripcion && (
        <p style={{ margin: "0 0 10px", color: C.tenue, fontSize: 13.5, lineHeight: 1.45 }}>{escena.descripcion}</p>
      )}
      {escena.personajes.length > 0 && (
        <p style={{ margin: "0 0 12px", color: C.apagado, fontSize: 12, letterSpacing: 0.3 }}>
          {escena.personajes.join(" · ")}
        </p>
      )}
      {guion && guion.notas.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "0 0 12px" }}>
          {guion.notas.map((n, k) => (
            <span key={k} style={{ ...chipAmbar, whiteSpace: "normal", borderRadius: 8, padding: "3px 8px" }}>{n}</span>
          ))}
        </div>
      )}

      {tomas.length > 0 && (
        <div style={{ margin: "0 0 12px", padding: "10px 12px", borderRadius: 12, border: `1px solid ${C.lineaSuave}`, background: C.hueco }}>
          <p style={{ margin: "0 0 7px", color: C.apagado, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.9, textTransform: "uppercase" }}>
            Tomas
          </p>
          <ResumenTomas tomas={tomas} />
        </div>
      )}

      {error && <div style={{ ...avisoError, marginBottom: 12 }}>{error}</div>}

      <div
        style={{
          padding: "16px 16px 8px", borderRadius: 12, border: `1px solid ${C.lineaSuave}`,
          background: "rgba(2,6,23,0.5)", fontSize: 14.5, minHeight: 120,
        }}
      >
        {falta && !error ? (
          <p style={{ margin: 0, color: C.apagado }}>Cargando el texto…</p>
        ) : texto && texto.length > 0 ? (
          texto.map((l, k) => (
            <p key={k} style={ESTILO_LINEA[l.t] || ESTILO_LINEA.accion}>
              {l.t === "super" && (
                <span style={{ display: "block", color: C.apagado, fontSize: 10, letterSpacing: 1, fontWeight: 700, marginBottom: 2 }}>
                  SUPER
                </span>
              )}
              {l.x}
            </p>
          ))
        ) : texto && texto.length === 0 ? (
          <p style={{ margin: "0 0 8px", color: C.apagado }}>El guion no trae texto para esta escena.</p>
        ) : (
          <div style={{ ...avisoAmbar, marginBottom: 8 }}>
            <p style={{ margin: 0 }}>El texto de esta escena todavía no se lee.</p>
            {puedeEditar && guion?.archivo_id && (
              <button type="button" style={{ ...boton, marginTop: 10 }} onClick={leerAhora} disabled={leyendo}>
                {leyendo ? "Leyendo… (puede tardar un minuto)" : "Leer ahora con IA"}
              </button>
            )}
            {!guion?.archivo_id && (
              <p style={{ margin: "6px 0 0" }}>Esta escena se agregó a mano, así que no hay archivo de dónde leerla.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
