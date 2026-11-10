"use client"

// Modo ordenar: se crean los días, se reparten las escenas (arrastrando o con
// ▲▼), se agregan separadores con título y se asigna la unidad de cada pieza.
// Cada cambio se guarda solo.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react"
import type { DatosPlan } from "../../../../lib/rodaje/datos"
import {
  cambiosDeFilas, construirFilas, diaDeFila, diasVista, moverADia, moverFila, moverUnPaso, slugEscena,
  SIN_DIA, type Fila,
} from "../../../../lib/rodaje/orden"
import { ETIQUETAS } from "../../../../lib/rodaje/tipos"
import type { Acciones } from "./PlanRodaje"
import { numeroEscena } from "./comun"
import { useConjuntoGuardado } from "./VistaPlan"
import { C, MONO, aviso, botonChico, botonIcono, botonPeligro, botonVerde, botonVioleta, campoChico, chip, chipAmbar, panel } from "./estilos"

const asa: CSSProperties = {
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 34,
  height: 34,
  borderRadius: 8,
  border: `1px solid ${C.linea}`,
  background: "rgba(255,255,255,0.04)",
  color: C.tenue,
  fontSize: 16,
  cursor: "grab",
  touchAction: "none",
  userSelect: "none",
}

const renglon: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 8px",
  borderRadius: 11,
  border: `1px solid ${C.linea}`,
  background: "rgba(255,255,255,0.025)",
}

export function ModoOrdenar(props: { datos: DatosPlan; esMovil: boolean; acc: Acciones; onSalir: () => void }) {
  const { datos, esMovil, acc } = props
  const etq = ETIQUETAS[datos.plan.etiqueta] || ETIQUETAS.guion
  const varias = datos.guiones.length > 1

  const [separados, alternarSeparado] = useConjuntoGuardado(`rodaje-sep-${datos.plan.id}`)
  const [enfocar, setEnfocar] = useState<string | null>(null)
  const [arrastre, setArrastre] = useState<{ clave: string; destino: number } | null>(null)

  const porGuion = useMemo(() => new Map(datos.guiones.map((g) => [g.id, g])), [datos.guiones])
  const porEscena = useMemo(() => new Map(datos.escenas.map((e) => [e.id, e])), [datos.escenas])
  const porSep = useMemo(() => new Map(datos.seps.map((s) => [s.id, s])), [datos.seps])
  const dias = useMemo(() => diasVista(datos.dias), [datos.dias])
  const porDia = useMemo(() => new Map(dias.map((d) => [d.clave, d])), [dias])

  const filas = useMemo(() => {
    // Con una sola pieza no hay bloques: cada escena es su propio renglón.
    const sueltos = varias ? separados : new Set(datos.guiones.map((g) => g.id))
    return construirFilas(dias, datos.escenas, datos.seps, datos.guiones, sueltos)
  }, [dias, datos.escenas, datos.seps, datos.guiones, separados, varias])

  const aplicar = (nuevas: Fila[]) => {
    if (nuevas === filas) return
    acc.guardarOrden(cambiosDeFilas(nuevas, datos.escenas, datos.seps))
  }

  // ── Arrastre ────────────────────────────────────────────────────────────────
  const contenedor = useRef<HTMLDivElement | null>(null)
  const punteroY = useRef(0)
  const arrastrando = !!arrastre
  const numFilas = filas.length

  // Mientras se arrastra: calcula entre qué renglones caería y desplaza la
  // página cuando el dedo o el mouse se acerca al borde.
  useEffect(() => {
    if (!arrastrando) return
    let cuadro = 0
    const paso = () => {
      const y = punteroY.current
      const margen = 80
      if (y < margen) window.scrollBy(0, -Math.ceil((margen - y) / 5))
      else if (y > window.innerHeight - margen) window.scrollBy(0, Math.ceil((y - (window.innerHeight - margen)) / 5))

      const nodos = contenedor.current?.querySelectorAll<HTMLElement>("[data-fila]")
      if (nodos) {
        let destino = numFilas
        for (let i = 0; i < nodos.length; i++) {
          const r = nodos[i].getBoundingClientRect()
          if (y < r.top + r.height / 2) {
            destino = i
            break
          }
        }
        destino = Math.max(1, destino)
        setArrastre((a) => (a && a.destino !== destino ? { ...a, destino } : a))
      }
      cuadro = requestAnimationFrame(paso)
    }
    cuadro = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(cuadro)
  }, [arrastrando, numFilas])

  const alBajar = (ev: ReactPointerEvent<HTMLElement>, clave: string) => {
    if (ev.pointerType === "mouse" && ev.button !== 0) return
    ev.preventDefault()
    ev.currentTarget.setPointerCapture(ev.pointerId)
    punteroY.current = ev.clientY
    setArrastre({ clave, destino: filas.findIndex((f) => f.clave === clave) })
  }
  const alMover = (ev: ReactPointerEvent<HTMLElement>) => {
    if (arrastre) punteroY.current = ev.clientY
  }
  const alSoltar = () => {
    if (!arrastre) return
    const desde = filas.findIndex((f) => f.clave === arrastre.clave)
    const destino = arrastre.destino > desde ? arrastre.destino - 1 : arrastre.destino
    setArrastre(null)
    if (desde >= 0) aplicar(moverFila(filas, arrastre.clave, destino))
  }

  const manija = (clave: string, nombre: string) => (
    <span
      role="button"
      tabIndex={-1}
      aria-label={`Arrastrar ${nombre}`}
      title="Arrastra para mover"
      style={{ ...asa, cursor: arrastre?.clave === clave ? "grabbing" : "grab" }}
      onPointerDown={(ev) => alBajar(ev, clave)}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerCancel={() => setArrastre(null)}
    >
      ≡
    </span>
  )

  const flechas = (clave: string, nombre: string) => (
    <span style={{ display: "inline-flex", gap: 4, flexShrink: 0 }}>
      <button type="button" style={botonIcono} aria-label={`Subir ${nombre}`} title="Subir" onClick={() => aplicar(moverUnPaso(filas, clave, -1))}>▲</button>
      <button type="button" style={botonIcono} aria-label={`Bajar ${nombre}`} title="Bajar" onClick={() => aplicar(moverUnPaso(filas, clave, 1))}>▼</button>
    </span>
  )

  const mandarA = (clave: string, nombre: string, conSinDia: boolean) => {
    const actual = diaDeFila(filas, clave) || SIN_DIA
    return (
      <select
        aria-label={`Mandar ${nombre} a otro día`}
        value={actual}
        onChange={(ev) => aplicar(moverADia(filas, clave, ev.target.value === SIN_DIA ? null : ev.target.value))}
        style={{ ...campoChico, width: esMovil ? 92 : 118, flexShrink: 0, colorScheme: "dark" }}
      >
        {dias
          .filter((d) => d.id || conSinDia)
          .map((d) => (
            <option key={d.clave} value={d.clave}>
              {d.id ? `Día ${d.n}` : "Sin día"}
            </option>
          ))}
      </select>
    )
  }

  // En teléfono los controles de cada renglón bajan a una segunda línea.
  const controles: CSSProperties = esMovil
    ? { display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", flex: "1 1 100%", minWidth: 0 }
    : { display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }

  const lineaDestino = (
    <div style={{ height: 4, borderRadius: 4, background: C.violeta, boxShadow: "0 0 0 3px rgba(167,139,250,0.22)", margin: "1px 0" }} />
  )

  const escenasEn = (clave: string) =>
    datos.escenas.filter((e) => (e.dia_id || SIN_DIA) === clave).length

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10 }}>
      <div style={{ ...aviso, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <span>Arrastra con ≡ o usa ▲▼ para mover. Cada cambio se guarda solo.</span>
        <button type="button" style={botonVerde} onClick={props.onSalir}>Listo</button>
      </div>

      <div ref={contenedor} style={{ ...panel, padding: 10, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6, userSelect: arrastre ? "none" : undefined }}>
        {filas.map((f, i) => {
          const antes = arrastre && arrastre.destino === i && filas[i].clave !== arrastre.clave ? lineaDestino : null
          const tenue: CSSProperties = arrastre?.clave === f.clave ? { opacity: 0.4 } : {}

          if (f.k === "dia") {
            const d = porDia.get(f.diaId || SIN_DIA)
            if (!d) return null
            const n = escenasEn(d.clave)
            return (
              <div key={f.clave}>
                {antes}
                {!d.id && (
                  <button type="button" style={{ ...botonVioleta, width: "100%", margin: "4px 0 10px" }} onClick={() => acc.crearDia()}>
                    + Agregar día
                  </button>
                )}
                <div
                  data-fila={f.clave}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                    padding: "9px 10px", marginTop: i === 0 ? 0 : 6, borderRadius: 11,
                    background: d.id ? C.violetaFondo : "rgba(148,163,184,0.08)",
                    border: `1px solid ${d.id ? C.violetaBorde : C.linea}`,
                  }}
                >
                  <strong style={{ color: d.id ? C.texto : C.tenue, fontSize: 14, whiteSpace: "nowrap" }}>
                    {d.id ? `Día ${d.n}` : "Sin día asignado"}
                  </strong>
                  <span style={{ ...chip, fontFamily: MONO }}>{n} esc</span>
                  {d.id && (
                    <>
                      <input
                        key={`f:${d.fecha || ""}`}
                        type="date"
                        defaultValue={d.fecha || ""}
                        aria-label={`Fecha del día ${d.n}`}
                        onChange={(ev) => {
                          const v = ev.target.value
                          if (v !== (d.fecha || "")) acc.actualizarDia(d.id as string, { fecha: v || null })
                        }}
                        style={{ ...campoChico, width: 148, colorScheme: "dark" }}
                      />
                      <input
                        key={`n:${d.nota}`}
                        type="text"
                        defaultValue={d.nota}
                        placeholder="Nota del día (locación, llamado…)"
                        aria-label={`Nota del día ${d.n}`}
                        onBlur={(ev) => {
                          const v = ev.target.value.trim()
                          if (v !== d.nota) acc.actualizarDia(d.id as string, { nota: v })
                        }}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") ev.currentTarget.blur()
                        }}
                        style={{ ...campoChico, flex: "1 1 160px", width: "auto" }}
                      />
                      <button
                        type="button"
                        style={botonChico}
                        onClick={() => {
                          const id = crypto.randomUUID()
                          setEnfocar(id)
                          acc.crearSeparador(d.id as string, "NUEVO SEPARADOR", id)
                        }}
                      >
                        + Separador
                      </button>
                      <button
                        type="button"
                        style={{ ...botonPeligro, padding: "5px 9px", fontSize: 12 }}
                        aria-label={`Borrar el día ${d.n}`}
                        title="Borrar el día (sus escenas regresan a Sin día)"
                        onClick={() => {
                          const aviso = n
                            ? `¿Borrar el Día ${d.n}? Sus ${n} escenas regresan a "Sin día asignado".`
                            : `¿Borrar el Día ${d.n}?`
                          if (confirm(aviso)) acc.borrarDia(d.id as string)
                        }}
                      >
                        Borrar
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          }

          if (f.k === "sep") {
            const s = porSep.get(f.id)
            if (!s) return null
            return (
              <div key={f.clave}>
                {antes}
                <div data-fila={f.clave} style={{ ...renglon, ...tenue, border: `1px solid ${C.ambarBorde}`, background: C.ambarFondo }}>
                  {manija(f.clave, `separador ${s.titulo}`)}
                  <input
                    key={s.titulo}
                    type="text"
                    defaultValue={s.titulo}
                    aria-label="Título del separador"
                    autoFocus={enfocar === s.id}
                    onFocus={(ev) => {
                      if (enfocar === s.id) ev.currentTarget.select()
                    }}
                    onBlur={(ev) => {
                      if (enfocar === s.id) setEnfocar(null)
                      const v = ev.target.value.trim()
                      if (v && v !== s.titulo) acc.renombrarSeparador(s.id, v)
                      else ev.target.value = s.titulo
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") ev.currentTarget.blur()
                    }}
                    style={{ ...campoChico, flex: 1, fontWeight: 700, letterSpacing: 0.5, color: C.ambar, textTransform: "uppercase" }}
                  />
                  {flechas(f.clave, `separador ${s.titulo}`)}
                  <button type="button" style={botonIcono} aria-label={`Borrar separador ${s.titulo}`} title="Borrar separador" onClick={() => acc.borrarSeparador(s.id)}>
                    ✕
                  </button>
                </div>
              </div>
            )
          }

          if (f.k === "blk") {
            const g = porGuion.get(f.guionId)
            const nombre = `${etq.uno} ${g?.numero || ""}`
            const hechas = f.ids.filter((id) => porEscena.get(id)?.filmada).length
            const unica = f.ids.length === 1 ? porEscena.get(f.ids[0]) : undefined
            // "Separar" solo sirve si la pieza tiene más escenas que mover por su lado.
            const separable = datos.escenas.filter((x) => x.guion_id === f.guionId).length > 1
            return (
              <div key={f.clave}>
                {antes}
                <div data-fila={f.clave} style={{ ...renglon, ...tenue, flexWrap: esMovil ? "wrap" : "nowrap" }}>
                  {manija(f.clave, nombre)}
                  <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "baseline", minWidth: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: C.violetaClaro, whiteSpace: "nowrap" }}>
                        {nombre}
                      </span>
                      <span style={{ color: C.texto, fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g?.titulo}
                      </span>
                    </div>
                    <div style={{ color: C.apagado, fontSize: 11.5, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.ids.length === 1 && unica
                        ? `Escena ${unica.numero} · ${slugEscena(unica)}${hechas ? " · filmada" : ""}`
                        : `${f.ids.length} escenas juntas${hechas ? ` · ${hechas} filmadas` : ""}`}
                    </div>
                  </div>
                  <div style={controles}>
                  <select
                    aria-label={`Unidad de ${nombre}`}
                    value={g?.unidad ? String(g.unidad) : ""}
                    onChange={(ev) => g && acc.actualizarGuion(g.id, { unidad: ev.target.value ? (Number(ev.target.value) as 1 | 2) : null })}
                    style={{ ...campoChico, width: esMovil ? 84 : 96, flexShrink: 0, colorScheme: "dark" }}
                  >
                    <option value="">Unidad</option>
                    <option value="1">U1</option>
                    <option value="2">U2</option>
                  </select>
                  {separable && (
                    <button type="button" style={botonChico} onClick={() => alternarSeparado(f.guionId)} title="Mostrar cada escena por separado para moverlas una por una">
                      Separar
                    </button>
                  )}
                  {flechas(f.clave, nombre)}
                  {mandarA(f.clave, nombre, true)}
                  </div>
                </div>
              </div>
            )
          }

          const e = porEscena.get(f.id)
          if (!e) return null
          const g = porGuion.get(e.guion_id)
          const nombre = `escena ${numeroEscena(e, g, varias)}`
          const agrupable = varias && separados.has(e.guion_id)
          return (
            <div key={f.clave}>
              {antes}
              <div data-fila={f.clave} style={{ ...renglon, ...tenue, flexWrap: esMovil ? "wrap" : "nowrap", border: `1px solid ${e.filmada ? C.verdeBorde : C.linea}` }}>
                {manija(f.clave, nombre)}
                <div style={{ flex: "1 1 160px", minWidth: 0, display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: e.filmada ? C.verdeClaro : C.violetaClaro }}>
                    {numeroEscena(e, g, varias)}
                  </span>
                  <span style={{ color: C.texto2, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {slugEscena(e)}
                  </span>
                  {g?.unidad && <span style={chipAmbar}>U{g.unidad}</span>}
                </div>
                <div style={controles}>
                  {agrupable && (
                    <button type="button" style={botonChico} onClick={() => alternarSeparado(e.guion_id)} title={`Volver a juntar las escenas seguidas de ${etq.uno.toLowerCase()} ${g?.numero}`}>
                      Agrupar
                    </button>
                  )}
                  {flechas(f.clave, nombre)}
                  {mandarA(f.clave, nombre, true)}
                </div>
              </div>
            </div>
          )
        })}
        {arrastre && arrastre.destino >= filas.length && lineaDestino}
      </div>

      <div style={{ textAlign: "right" }}>
        <button type="button" style={botonVerde} onClick={props.onSalir}>Listo</button>
      </div>
    </div>
  )
}
