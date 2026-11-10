"use client"

// Subir guiones: el archivo se guarda, la IA lo separa en piezas y escenas, el
// usuario revisa lo que leyó y lo agrega al plan.

import { useEffect, useRef, useState, type CSSProperties } from "react"
import {
  aplicarIndice, descartarArchivo, leerIndiceArchivo, subirArchivo, type DatosPlan,
} from "../../../../lib/rodaje/datos"
import {
  ETIQUETAS, MAX_BYTES_GUION, TIPOS_ARCHIVO_GUION,
  type Etiqueta, type IndiceIA, type RodajeArchivo,
} from "../../../../lib/rodaje/tipos"
import type { Acciones } from "./PlanRodaje"
import {
  C, aviso, avisoAmbar, avisoError, boton, botonChico, botonIcono, botonPeligro, botonPrimario, botonVioleta,
  campoChico, chip, chipAmbar, chipVerde, panel, vacio,
} from "./estilos"

type EnCurso = { clave: string; nombre: string; fase: "subiendo" | "leyendo"; archivoId?: string }

/**
 * Si el plan ya tiene piezas y las nuevas repiten número, las nuevas continúan
 * la numeración (el plan no puede tener dos "Video 1").
 */
function prepararBorrador(indice: IndiceIA, datos: DatosPlan): { indice: IndiceIA; renumerado: boolean } {
  const usados = new Set(datos.guiones.map((g) => g.numero))
  const choca = indice.guiones.some((g) => usados.has(g.numero))
  if (!choca) return { indice, renumerado: false }
  const nums = datos.guiones.map((g) => parseInt(g.numero, 10)).filter((n) => Number.isFinite(n))
  let n = nums.length ? Math.max(...nums) : datos.guiones.length
  return {
    renumerado: true,
    indice: { ...indice, guiones: indice.guiones.map((g) => ({ ...g, numero: String(++n) })) },
  }
}

const celda: CSSProperties = { ...campoChico, padding: "5px 7px" }

// Un archivo recién subido que aún no se lee casi siempre está en proceso en
// la computadora de quien lo subió; pasado este tiempo se da por interrumpido.
const MS_EN_PROCESO = 6 * 60_000

export function SubirGuiones(props: {
  datos: DatosPlan
  puedeEditar: boolean
  acc: Acciones
  /** Se llama cuando ya no queda nada por revisar */
  onAplicado: () => void
}) {
  const { datos, puedeEditar, acc } = props
  const etqPlan = ETIQUETAS[datos.plan.etiqueta] || ETIQUETAS.guion
  const primeraVez = datos.guiones.length === 0

  const [enCurso, setEnCurso] = useState<EnCurso[]>([])
  const [fallos, setFallos] = useState<string[]>([])
  const [borradores, setBorradores] = useState<Record<string, IndiceIA>>({})
  const [etiquetas, setEtiquetas] = useState<Record<string, Etiqueta>>({})
  const [abierto, setAbierto] = useState<string | null>(null)
  const [aplicando, setAplicando] = useState<string | null>(null)
  const [sobre, setSobre] = useState(false)
  const [erroresLectura, setErroresLectura] = useState<Record<string, string>>({})
  const [ahora, setAhora] = useState(() => Date.now())
  const entrada = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const subiendo = new Set(enCurso.filter((p) => p.fase === "subiendo").map((p) => p.nombre))
  const pendientes = datos.archivos.filter(
    // Mientras se sube, el archivo ya existe en la lista pero todavía no hay nada que mostrar.
    (a) => a.estado !== "aplicado" && !(a.estado === "subido" && subiendo.has(a.nombre))
  )
  const leyendoIds = new Set(enCurso.map((p) => p.archivoId).filter(Boolean) as string[])

  async function leer(archivoId: string, clave: string, nombre: string) {
    setEnCurso((prev) => [
      ...prev.filter((p) => p.clave !== clave),
      { clave, nombre, fase: "leyendo", archivoId },
    ])
    setErroresLectura((prev) => {
      const resto = { ...prev }
      delete resto[archivoId]
      return resto
    })
    try {
      await leerIndiceArchivo(archivoId)
      setAbierto(archivoId)
    } catch (err) {
      // Normalmente el servidor deja el error guardado en el archivo; si la
      // lectura se cortó antes (por tiempo o conexión), se muestra este.
      setErroresLectura((prev) => ({ ...prev, [archivoId]: (err as Error).message }))
    } finally {
      await acc.recargar()
      setEnCurso((prev) => prev.filter((p) => p.clave !== clave))
    }
  }

  async function procesar(lista: FileList | File[]) {
    const archivos = Array.from(lista)
    if (!archivos.length) return
    setFallos([])
    for (const f of archivos) {
      const clave = crypto.randomUUID()
      const ext = f.name.toLowerCase().split(".").pop() || ""
      if (!["pdf", "docx", "txt"].includes(ext) && !TIPOS_ARCHIVO_GUION[f.type]) {
        setFallos((prev) => [...prev, `${f.name}: el guion debe ser PDF, Word (.docx) o texto (.txt).`])
        continue
      }
      if (f.size > MAX_BYTES_GUION) {
        setFallos((prev) => [...prev, `${f.name}: pesa más de ${Math.round(MAX_BYTES_GUION / 1024 / 1024)} MB.`])
        continue
      }
      setEnCurso((prev) => [...prev, { clave, nombre: f.name, fase: "subiendo" }])
      try {
        const archivo = await subirArchivo(datos.plan.id, f)
        await acc.recargar()
        await leer(archivo.id, clave, f.name)
      } catch (err) {
        setFallos((prev) => [...prev, `${f.name}: ${(err as Error).message}`])
        setEnCurso((prev) => prev.filter((p) => p.clave !== clave))
        await acc.recargar()
      }
    }
  }

  async function quitar(a: RodajeArchivo) {
    if (a.estado === "leido" && !confirm(`¿Descartar la lectura de "${a.nombre}"?`)) return
    try {
      await descartarArchivo(a.id)
    } catch (err) {
      alert(`No se pudo quitar el archivo: ${(err as Error).message}`)
    }
    await acc.recargar()
  }

  function borradorDe(a: RodajeArchivo): { indice: IndiceIA; renumerado: boolean } | null {
    if (!a.indice) return null
    const base = prepararBorrador(a.indice, datos)
    return borradores[a.id] ? { indice: borradores[a.id], renumerado: base.renumerado } : base
  }

  function editar(a: RodajeArchivo, cambio: (i: IndiceIA) => IndiceIA) {
    const actual = borradorDe(a)
    if (!actual) return
    setBorradores((prev) => ({ ...prev, [a.id]: cambio(actual.indice) }))
  }

  async function aplicar(a: RodajeArchivo) {
    const b = borradorDe(a)
    if (!b) return
    const guiones = b.indice.guiones.filter((g) => g.escenas.length > 0)
    if (!guiones.length) {
      alert("No hay escenas que agregar.")
      return
    }
    const etiqueta = primeraVez ? etiquetas[a.id] || b.indice.tipo_unidad : datos.plan.etiqueta
    const nombre = ETIQUETAS[etiqueta].uno.toLowerCase()
    const vistos = new Set(datos.guiones.map((g) => g.numero))
    for (const g of guiones) {
      const num = g.numero.trim()
      if (!num) {
        alert(`Falta el número de un ${nombre}.`)
        return
      }
      if (vistos.has(num)) {
        alert(`El número ${num} está repetido. Cada ${nombre} necesita un número distinto.`)
        return
      }
      vistos.add(num)
      if (g.escenas.some((e) => !e.numero.trim())) {
        alert(`Hay una escena sin número en ${nombre} ${num}.`)
        return
      }
    }
    setAplicando(a.id)
    try {
      await aplicarIndice({ datos, archivo: a, indice: { ...b.indice, guiones }, etiqueta })
      await acc.recargar()
      const quedan = pendientes.filter((p) => p.id !== a.id).length + enCurso.length
      if (quedan === 0) props.onAplicado()
      else acc.leerTextoPendiente()
    } catch (err) {
      alert(`No se pudo agregar al plan: ${(err as Error).message}`)
      await acc.recargar()
    } finally {
      setAplicando(null)
    }
  }

  if (!puedeEditar) {
    return <div style={{ ...panel, ...vacio }}>Todavía no hay guiones cargados en este plan.</div>
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
      <div style={panel}>
        <p style={{ margin: "0 0 4px", color: C.texto, fontSize: 15, fontWeight: 600 }}>
          {primeraVez ? "Sube los guiones del proyecto" : "Agregar más guiones"}
        </p>
        <p style={{ margin: "0 0 12px", color: C.tenue, fontSize: 13, lineHeight: 1.45 }}>
          La IA lee el archivo y lo separa en escenas. Antes de agregarlo al plan revisas lo que encontró.
        </p>
        <label
          onDragOver={(ev) => {
            ev.preventDefault()
            setSobre(true)
          }}
          onDragLeave={() => setSobre(false)}
          onDrop={(ev) => {
            ev.preventDefault()
            setSobre(false)
            procesar(ev.dataTransfer.files)
          }}
          style={{
            display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6, justifyItems: "center", textAlign: "center",
            padding: "26px 16px", borderRadius: 14, cursor: "pointer",
            border: `1.5px dashed ${sobre ? C.violeta : "rgba(148,163,184,0.28)"}`,
            background: sobre ? C.violetaFondo : "rgba(255,255,255,0.02)",
          }}
        >
          <span style={{ ...botonPrimario, pointerEvents: "none" }}>Elegir archivos</span>
          <span style={{ color: C.tenue, fontSize: 13 }}>o arrástralos aquí</span>
          <span style={{ color: C.apagado, fontSize: 12 }}>
            PDF, Word (.docx) o texto · hasta {Math.round(MAX_BYTES_GUION / 1024 / 1024)} MB · un archivo puede traer varios guiones
          </span>
          <input
            ref={entrada}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={(ev) => {
              if (ev.target.files) procesar(ev.target.files)
              ev.target.value = ""
            }}
            style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
          />
        </label>
        <p style={{ margin: "10px 0 0", color: C.apagado, fontSize: 12 }}>
          Para leerlo, el archivo se envía a la IA (Claude, de Anthropic).
        </p>
      </div>

      {fallos.map((f, k) => (
        <div key={k} style={avisoError}>{f}</div>
      ))}

      {enCurso
        .filter((p) => p.fase === "subiendo")
        .map((p) => (
          <div key={p.clave} style={aviso}>Subiendo <strong>{p.nombre}</strong>…</div>
        ))}

      {pendientes.map((a) => {
        const leyendo = leyendoIds.has(a.id)
        const b = a.estado === "leido" ? borradorDe(a) : null
        const escenas = b ? b.indice.guiones.reduce((n, g) => n + g.escenas.length, 0) : 0
        const etiqueta = primeraVez ? etiquetas[a.id] || b?.indice.tipo_unidad || "guion" : datos.plan.etiqueta
        const etq = ETIQUETAS[etiqueta]
        const estaAbierto = abierto === a.id
        const enProceso =
          a.estado === "subido" && !erroresLectura[a.id] && ahora - Date.parse(a.created_at) < MS_EN_PROCESO

        return (
          <div key={a.id} style={{ ...panel, padding: "12px 14px" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={chip}>{TIPOS_ARCHIVO_GUION[a.mime] || "Archivo"}</span>
              <strong style={{ flex: "1 1 160px", minWidth: 0, color: C.texto, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.nombre}
              </strong>
              {leyendo && <span style={chipAmbar}>Leyendo…</span>}
              {!leyendo && a.estado === "leido" && <span style={chipVerde}>Listo para revisar</span>}
              {!leyendo && a.estado === "error" && <span style={{ ...chip, color: "#fca5a5", border: `1px solid ${C.rojoBorde}` }}>No se pudo leer</span>}
            </div>

            {leyendo && (
              <div style={{ ...aviso, marginTop: 10 }}>
                La IA está leyendo el guion. Tarda desde unos segundos hasta un par de minutos, según el largo.
                No cierres esta pestaña.
              </div>
            )}

            {!leyendo && enProceso && (
              <div style={{ ...aviso, marginTop: 10 }}>
                Se está subiendo o la IA lo está leyendo en otra pestaña. En cuanto termine aparece aquí para revisarlo.
              </div>
            )}

            {!leyendo && a.estado === "subido" && !enProceso && (
              <div style={{ ...avisoAmbar, marginTop: 10, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <span>{erroresLectura[a.id] || "Este archivo se subió pero no se terminó de leer."}</span>
                <span style={{ display: "inline-flex", gap: 6 }}>
                  <button type="button" style={botonChico} onClick={() => leer(a.id, crypto.randomUUID(), a.nombre)}>Leer con IA</button>
                  <button type="button" style={botonChico} onClick={() => quitar(a)}>Quitar</button>
                </span>
              </div>
            )}

            {!leyendo && a.estado === "error" && (
              <div style={{ ...avisoError, marginTop: 10, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <span>{a.error || "La IA no pudo leer este archivo."}</span>
                <span style={{ display: "inline-flex", gap: 6 }}>
                  <button type="button" style={botonChico} onClick={() => leer(a.id, crypto.randomUUID(), a.nombre)}>Reintentar</button>
                  <button type="button" style={botonChico} onClick={() => quitar(a)}>Quitar</button>
                </span>
              </div>
            )}

            {!leyendo && b && (
              <>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                  <span style={{ color: C.texto2, fontSize: 13 }}>
                    La IA encontró <strong>{b.indice.guiones.length}</strong>{" "}
                    {b.indice.guiones.length === 1 ? etq.uno.toLowerCase() : etq.varios.toLowerCase()} y{" "}
                    <strong>{escenas}</strong> {escenas === 1 ? "escena" : "escenas"}.
                  </span>
                  <span style={{ flex: 1 }} />
                  <button type="button" style={botonChico} onClick={() => setAbierto(estaAbierto ? null : a.id)} aria-expanded={estaAbierto}>
                    {estaAbierto ? "Ocultar detalle" : "Revisar detalle"}
                  </button>
                </div>

                {primeraVez && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                    <span style={{ color: C.tenue, fontSize: 13 }}>Cada pieza es un:</span>
                    {(Object.keys(ETIQUETAS) as Etiqueta[]).map((k) => (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={etiqueta === k}
                        style={{ ...(etiqueta === k ? botonVioleta : boton), padding: "5px 10px", fontSize: 12 }}
                        onClick={() => setEtiquetas((prev) => ({ ...prev, [a.id]: k }))}
                      >
                        {ETIQUETAS[k].uno}
                      </button>
                    ))}
                  </div>
                )}

                {b.renumerado && !borradores[a.id] && (
                  <div style={{ ...avisoAmbar, marginTop: 10 }}>
                    Los números se continuaron después de los que ya tiene el plan ({etqPlan.varios.toLowerCase()}{" "}
                    {b.indice.guiones[0]?.numero} en adelante). Puedes cambiarlos en el detalle.
                  </div>
                )}

                {estaAbierto && (
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12, marginTop: 12 }}>
                    {b.indice.guiones.map((g, gi) => (
                      <div key={gi} style={{ border: `1px solid ${C.lineaSuave}`, borderRadius: 12, padding: 10, background: C.hueco }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: C.violetaClaro, whiteSpace: "nowrap" }}>
                            {etq.uno}
                          </span>
                          <input
                            aria-label={`Número de ${etq.uno.toLowerCase()}`}
                            value={g.numero}
                            maxLength={12}
                            onChange={(ev) => editar(a, (i) => ({
                              ...i,
                              guiones: i.guiones.map((x, k) => (k === gi ? { ...x, numero: ev.target.value } : x)),
                            }))}
                            style={{ ...celda, width: 54, textAlign: "center" }}
                          />
                          <input
                            aria-label="Título"
                            value={g.titulo}
                            maxLength={160}
                            onChange={(ev) => editar(a, (i) => ({
                              ...i,
                              guiones: i.guiones.map((x, k) => (k === gi ? { ...x, titulo: ev.target.value } : x)),
                            }))}
                            style={{ ...celda, flex: 1, fontWeight: 600 }}
                          />
                          <button
                            type="button"
                            style={botonIcono}
                            aria-label={`Quitar ${etq.uno.toLowerCase()} ${g.numero}`}
                            title={`No agregar este ${etq.uno.toLowerCase()}`}
                            onClick={() => editar(a, (i) => ({ ...i, guiones: i.guiones.filter((_, k) => k !== gi) }))}
                          >
                            ✕
                          </button>
                        </div>
                        {g.resumen && <p style={{ margin: "7px 0 0", color: C.tenue, fontSize: 12.5, lineHeight: 1.4 }}>{g.resumen}</p>}

                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 6, marginTop: 8 }}>
                          {g.escenas.map((e, ei) => {
                            const cambia = (campo: "numero" | "ie" | "locacion" | "momento", valor: string) =>
                              editar(a, (i) => ({
                                ...i,
                                guiones: i.guiones.map((x, k) =>
                                  k === gi
                                    ? { ...x, escenas: x.escenas.map((y, m) => (m === ei ? { ...y, [campo]: valor } : y)) }
                                    : x
                                ),
                              }))
                            return (
                              <div key={ei} style={{ borderTop: `1px solid ${C.lineaSuave}`, paddingTop: 6 }}>
                                <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                                  <input aria-label="Número de escena" value={e.numero} maxLength={12} onChange={(ev) => cambia("numero", ev.target.value)} style={{ ...celda, width: 48, textAlign: "center" }} />
                                  <select aria-label="Interior o exterior" value={e.ie} onChange={(ev) => cambia("ie", ev.target.value)} style={{ ...celda, width: 84, colorScheme: "dark" }}>
                                    <option value="">—</option>
                                    <option value="INT">INT</option>
                                    <option value="EXT">EXT</option>
                                    <option value="INT/EXT">INT/EXT</option>
                                  </select>
                                  <input aria-label="Locación" value={e.locacion} maxLength={160} onChange={(ev) => cambia("locacion", ev.target.value.toUpperCase())} style={{ ...celda, flex: "1 1 150px", width: "auto" }} />
                                  <input aria-label="Momento" value={e.momento} maxLength={30} onChange={(ev) => cambia("momento", ev.target.value.toUpperCase())} style={{ ...celda, width: 92 }} />
                                  <button
                                    type="button"
                                    style={botonIcono}
                                    aria-label={`Quitar escena ${e.numero}`}
                                    title="No agregar esta escena"
                                    onClick={() => editar(a, (i) => ({
                                      ...i,
                                      guiones: i.guiones.map((x, k) =>
                                        k === gi ? { ...x, escenas: x.escenas.filter((_, m) => m !== ei) } : x
                                      ),
                                    }))}
                                  >
                                    ✕
                                  </button>
                                </div>
                                {e.descripcion && <p style={{ margin: "4px 0 0 2px", color: C.apagado, fontSize: 12 }}>{e.descripcion}</p>}
                              </div>
                            )
                          })}
                          {g.escenas.length === 0 && <p style={{ margin: 0, color: C.apagado, fontSize: 12 }}>Sin escenas: no se va a agregar.</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 12 }}>
                  <button type="button" style={botonPeligro} onClick={() => quitar(a)} disabled={aplicando === a.id}>Descartar</button>
                  <button type="button" style={botonPrimario} onClick={() => aplicar(a)} disabled={aplicando === a.id}>
                    {aplicando === a.id ? "Agregando…" : "Agregar al plan"}
                  </button>
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
