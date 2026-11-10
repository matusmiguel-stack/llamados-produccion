"use client"

// El plan de trabajo: los días en orden, y dentro de cada día las escenas en el
// orden en que se filman, agrupadas por pieza y con sus separadores.

import { useEffect, useMemo, useRef, useState } from "react"
import type { DatosPlan } from "../../../../lib/rodaje/datos"
import { bloquesDia, diasVista, norm, secuenciaDia, slugEscena } from "../../../../lib/rodaje/orden"
import { ETIQUETAS, type RodajeEscena, type RodajeToma } from "../../../../lib/rodaje/tipos"
import type { Acciones } from "./PlanRodaje"
import { BarraProgreso, TarjetaEscena } from "./comun"
import { C, MONO, boton, botonChico, botonVioleta, campo, chip, chipAmbar, chipVerde, panel, vacio } from "./estilos"

/** Tomas por escena, cada lista en su orden. */
export function agruparTomas(tomas: RodajeToma[]): Map<string, RodajeToma[]> {
  const m = new Map<string, RodajeToma[]>()
  for (const t of [...tomas].sort((a, b) => a.orden - b.orden)) {
    const lista = m.get(t.escena_id)
    if (lista) lista.push(t)
    else m.set(t.escena_id, [t])
  }
  return m
}

/** Un conjunto de ids que se recuerda en este navegador (qué está colapsado). */
export function useConjuntoGuardado(clave: string): [Set<string>, (id: string) => void, (ids: string[]) => void] {
  const [conjunto, setConjunto] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(window.localStorage.getItem(clave) || "[]") as string[])
    } catch {
      return new Set()
    }
  })
  const guardar = (s: Set<string>) => {
    try {
      window.localStorage.setItem(clave, JSON.stringify([...s]))
    } catch {
      // Sin almacenamiento (modo privado): funciona igual, solo no se recuerda.
    }
  }
  const alternar = (id: string) => {
    setConjunto((prev) => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      guardar(s)
      return s
    })
  }
  const fijar = (ids: string[]) => {
    const s = new Set(ids)
    guardar(s)
    setConjunto(s)
  }
  return [conjunto, alternar, fijar]
}

export function VistaPlan(props: {
  datos: DatosPlan
  puedeEditar: boolean
  esMovil: boolean
  acc: Acciones
  onGuion: (id: string, lista: string[]) => void
  onEditarEscena: (e: RodajeEscena) => void
  onTomas: (e: RodajeEscena) => void
  onOrdenar: () => void
}) {
  const { datos, puedeEditar, esMovil, acc } = props
  const etq = ETIQUETAS[datos.plan.etiqueta] || ETIQUETAS.guion

  const [buscar, setBuscar] = useState("")
  const [soloPendientes, setSoloPendientes] = useState(false)
  const [unidad, setUnidad] = useState<"" | "1" | "2">("")
  const [colapsadas, alternarColapso, fijarColapsadas] = useConjuntoGuardado(`rodaje-col-${datos.plan.id}`)

  // La barra de avance se queda fija arriba al bajar por el plan. (No se usa
  // position: sticky porque html y body traen overflow y ahí no pega.)
  const ancla = useRef<HTMLDivElement | null>(null)
  const barra = useRef<HTMLDivElement | null>(null)
  const [fija, setFija] = useState<{ left: number; width: number; alto: number } | null>(null)
  useEffect(() => {
    let cuadro = 0
    const medir = () => {
      const el = ancla.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const alto = barra.current?.offsetHeight || 0
      setFija((prev) => {
        if (r.top >= 0) return null
        if (prev && prev.left === r.left && prev.width === r.width) return prev
        return { left: r.left, width: r.width, alto: prev?.alto || alto }
      })
    }
    const alMover = () => {
      cancelAnimationFrame(cuadro)
      cuadro = requestAnimationFrame(medir)
    }
    alMover()
    window.addEventListener("scroll", alMover, { passive: true })
    window.addEventListener("resize", alMover)
    return () => {
      cancelAnimationFrame(cuadro)
      window.removeEventListener("scroll", alMover)
      window.removeEventListener("resize", alMover)
    }
  }, [])

  const porGuion = useMemo(() => new Map(datos.guiones.map((g) => [g.id, g])), [datos.guiones])
  const tomasPorEscena = useMemo(() => agruparTomas(datos.tomas), [datos.tomas])
  const varias = datos.guiones.length > 1
  const hayUnidades = datos.guiones.some((g) => g.unidad)
  const dias = useMemo(() => diasVista(datos.dias), [datos.dias])

  const q = norm(buscar.trim())
  const filtrando = !!q || soloPendientes || !!unidad

  const secciones = useMemo(() => {
    const pasa = (e: RodajeEscena) => {
      if (soloPendientes && e.filmada) return false
      const g = porGuion.get(e.guion_id)
      if (unidad && String(g?.unidad || "") !== unidad) return false
      if (q) {
        const donde = norm(
          [e.numero, g?.numero, g?.titulo, slugEscena(e), e.descripcion, e.personajes.join(" ")].join(" ")
        )
        if (!donde.includes(q)) return false
      }
      return true
    }
    return dias.map((d) => {
      const items = secuenciaDia(d.id, datos.escenas, datos.seps, datos.guiones)
      const escenasDia = items.filter((i) => i.t === "e")
      const visibles = items.filter((i) => (i.t === "s" ? !filtrando : pasa(i.e)))
      return {
        d,
        total: escenasDia.length,
        filmadas: escenasDia.filter((i) => i.t === "e" && i.e.filmada).length,
        bloques: bloquesDia(visibles),
      }
    })
  }, [dias, datos.escenas, datos.seps, datos.guiones, porGuion, q, soloPendientes, unidad, filtrando])

  // Orden en que se recorren las escenas con ← → dentro del guion.
  const lista = useMemo(
    () => secciones.flatMap((s) => s.bloques.flatMap((b) => (b.t === "corrida" ? b.c.escenas.map((e) => e.id) : []))),
    [secciones]
  )

  const total = datos.escenas.length
  const filmadas = datos.escenas.filter((e) => e.filmada).length
  const visibles = lista.length
  const sinDias = datos.dias.length === 0
  const guionesEnPlan = [...new Set(datos.escenas.map((e) => e.guion_id))]
  const todoColapsado = varias && guionesEnPlan.length > 0 && guionesEnPlan.every((id) => colapsadas.has(id))

  const irA = (clave: string) => {
    document.getElementById(`dia-${clave}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
      {/* Avance y saltos por día */}
      <div ref={ancla} style={{ minHeight: fija ? fija.alto : undefined }}>
      <div
        ref={barra}
        style={{
          ...panel,
          // En teléfono, al quedar fija deja libre el botón del menú.
          padding: fija && esMovil ? "10px 14px 10px 62px" : "10px 14px",
          borderRadius: fija ? "0 0 14px 14px" : 14,
          background: "rgba(10,14,26,0.96)",
          ...(fija ? { position: "fixed", top: 0, left: fija.left, width: fija.width, zIndex: 50 } : {}),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", marginBottom: 7 }}>
          <span style={{ color: C.texto2, fontSize: 13, fontWeight: 600 }}>
            <span style={{ fontFamily: MONO, color: C.verdeClaro }}>{filmadas}</span>
            <span style={{ color: C.apagado }}> de </span>
            <span style={{ fontFamily: MONO }}>{total}</span>
            <span style={{ color: C.apagado }}> {total === 1 ? "escena filmada" : "escenas filmadas"}</span>
          </span>
          <span style={{ fontFamily: MONO, color: C.apagado, fontSize: 12 }}>
            {total ? Math.round((filmadas / total) * 100) : 0}%
          </span>
        </div>
        <BarraProgreso hecho={filmadas} total={total} />
        {secciones.length > 1 && (
          <div data-desliza style={{ display: "flex", gap: 6, marginTop: 9, overflowX: "auto", paddingBottom: 2 }}>
            {secciones
              .filter((s) => s.d.id || s.total > 0)
              .map((s) => {
                const lleno = s.total > 0 && s.filmadas === s.total
                return (
                  <button
                    key={s.d.clave}
                    type="button"
                    onClick={() => irA(s.d.clave)}
                    style={{ ...(lleno ? chipVerde : chip), cursor: "pointer", padding: "4px 10px", fontSize: 12 }}
                    title={s.d.titulo}
                  >
                    {s.d.id ? s.d.corto : "Sin día"}
                    <span style={{ fontFamily: MONO, opacity: 0.75 }}>{s.filmadas}/{s.total}</span>
                  </button>
                )
              })}
          </div>
        )}
      </div>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="search"
          value={buscar}
          onChange={(ev) => setBuscar(ev.target.value)}
          placeholder="Buscar escena, locación o personaje"
          aria-label="Buscar en el plan"
          style={{ ...campo, flex: "1 1 220px", width: "auto" }}
        />
        <button type="button" onClick={() => setSoloPendientes(!soloPendientes)} aria-pressed={soloPendientes} style={soloPendientes ? botonVioleta : boton}>
          Solo pendientes
        </button>
        {hayUnidades && (
          <div style={{ display: "inline-flex", gap: 4 }} role="group" aria-label="Unidad">
            {(["", "1", "2"] as const).map((u) => (
              <button key={u || "todas"} type="button" onClick={() => setUnidad(u)} aria-pressed={unidad === u} style={unidad === u ? botonVioleta : boton}>
                {u ? `U${u}` : "Todas"}
              </button>
            ))}
          </div>
        )}
        {varias && (
          <button
            type="button"
            style={boton}
            onClick={() => fijarColapsadas(todoColapsado ? [] : guionesEnPlan)}
          >
            {todoColapsado ? "Expandir todo" : "Colapsar todo"}
          </button>
        )}
      </div>

      {sinDias && puedeEditar && (
        <div style={{ ...vacio, textAlign: "left", display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <span>Todavía no hay días de rodaje. Crea los días y reparte las escenas para armar el plan.</span>
          <button type="button" style={botonVioleta} onClick={props.onOrdenar}>Armar el plan</button>
        </div>
      )}

      {filtrando && visibles === 0 && <div style={vacio}>Ninguna escena coincide con el filtro.</div>}

      {secciones.map((s) => {
        // "Sin día" solo aparece si tiene escenas; un día vacío sí se muestra.
        if (!s.d.id && s.total === 0) return null
        if (filtrando && s.bloques.length === 0) return null
        return (
          <section key={s.d.clave} id={`dia-${s.d.clave}`} style={{ ...panel, padding: "14px 14px 12px", scrollMarginTop: 96 }}>
            <header style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: s.d.nota ? 4 : 10 }}>
              <h2 style={{ margin: 0, color: s.d.id ? C.texto : C.tenue, fontSize: 16, fontWeight: 600 }}>{s.d.titulo}</h2>
              <span style={{ color: C.apagado, fontSize: 12, fontFamily: MONO }}>
                {s.filmadas}/{s.total}
              </span>
              {s.total > 0 && s.filmadas === s.total && <span style={chipVerde}>Día completo</span>}
            </header>
            {s.d.nota && <p style={{ margin: "0 0 10px", color: C.tenue, fontSize: 13 }}>{s.d.nota}</p>}

            {s.bloques.length === 0 && (
              <p style={{ margin: 0, color: C.apagado, fontSize: 13 }}>Sin escenas asignadas.</p>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8 }}>
              {s.bloques.map((b) => {
                if (b.t === "sep") {
                  return (
                    <div
                      key={"s" + b.s.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, margin: "4px 0 2px",
                        color: C.ambar, fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
                      }}
                    >
                      <span style={{ flex: "0 0 14px", height: 1, background: C.ambarBorde }} />
                      <span>{b.s.titulo}</span>
                      <span style={{ flex: 1, height: 1, background: C.ambarBorde }} />
                    </div>
                  )
                }
                const g = porGuion.get(b.c.guionId)
                const cerrada = varias && colapsadas.has(b.c.guionId)
                const hechas = b.c.escenas.filter((e) => e.filmada).length
                const tarjetas = b.c.escenas.map((e) => (
                  <TarjetaEscena
                    key={e.id}
                    escena={e}
                    guion={g}
                    varias={varias}
                    puedeEditar={puedeEditar}
                    tomas={tomasPorEscena.get(e.id)}
                    onFilmada={(v) => acc.marcarFilmada(e.id, v)}
                    onGuion={() => props.onGuion(e.id, lista)}
                    onEditar={() => props.onEditarEscena(e)}
                    onTomas={() => props.onTomas(e)}
                  />
                ))
                if (!varias) return <div key={b.c.clave} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8 }}>{tarjetas}</div>
                return (
                  <div key={b.c.clave} style={{ border: `1px solid ${C.lineaSuave}`, borderRadius: 13, background: C.hueco, overflow: "hidden" }}>
                    <button
                      type="button"
                      onClick={() => alternarColapso(b.c.guionId)}
                      aria-expanded={!cerrada}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                        padding: "9px 11px", background: "none", border: "none", cursor: "pointer", color: C.texto2,
                      }}
                    >
                      <span style={{ color: C.apagado, fontSize: 11, width: 10 }}>{cerrada ? "▸" : "▾"}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: C.violetaClaro, whiteSpace: "nowrap" }}>
                        {etq.uno} {g?.numero}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: C.texto, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {g?.titulo}
                      </span>
                      {g?.unidad && <span style={chipAmbar}>U{g.unidad}</span>}
                      <span style={hechas === b.c.escenas.length ? chipVerde : chip}>
                        <span style={{ fontFamily: MONO }}>{hechas}/{b.c.escenas.length}</span>
                      </span>
                    </button>
                    {!cerrada && <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8, padding: "0 8px 8px" }}>{tarjetas}</div>}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      {puedeEditar && !sinDias && (
        <div style={{ textAlign: "center" }}>
          <button type="button" style={botonChico} onClick={props.onOrdenar}>Cambiar el orden o los días</button>
        </div>
      )}
    </div>
  )
}
