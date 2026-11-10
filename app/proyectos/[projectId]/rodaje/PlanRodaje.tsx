"use client"

// Contenedor del plan de rodaje de un proyecto: carga los datos, los mantiene
// al día en tiempo real, y reparte las acciones a las vistas.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "../../../../lib/supabase"
import type { AppProfile } from "../../../../lib/session-profile"
import { cargarPlan, crearPlan, type DatosPlan } from "../../../../lib/rodaje/datos"
import { aplicarCambios, siguientePos, type CambioOrden } from "../../../../lib/rodaje/orden"
import { armarTandas, escenasSinTexto, leerTandas, type Progreso } from "../../../../lib/rodaje/lectura"
import {
  ETIQUETAS, MAX_TOMAS_POR_ESCENA, puedeEditarRodaje,
  type Etiqueta, type FilaToma, type RodajeDia, type RodajeEscena, type RodajeGuion, type RodajeToma,
} from "../../../../lib/rodaje/tipos"
import { BarraProgreso } from "./comun"
import { C, aviso, avisoAmbar, avisoError, boton, botonChico, botonPrimario, botonVioleta, panel, vacio } from "./estilos"
import { VistaPlan } from "./VistaPlan"
import { VistaGuiones } from "./VistaGuiones"
import { ModoOrdenar } from "./ModoOrdenar"
import { SubirGuiones } from "./SubirGuiones"
import { GuionModal } from "./GuionModal"
import { EditarEscena, EditarGuion } from "./Editores"
import { EditarTomas } from "./Tomas"

export type CamposEscena = Pick<
  RodajeEscena,
  "numero" | "ie" | "locacion" | "momento" | "descripcion" | "personajes" | "dia_id"
>

export type Acciones = {
  recargar: () => Promise<void>
  marcarFilmada: (id: string, valor: boolean) => void
  guardarOrden: (cambios: CambioOrden[]) => void
  crearDia: () => void
  actualizarDia: (id: string, cambios: Partial<Pick<RodajeDia, "fecha" | "nota">>) => void
  borrarDia: (id: string) => void
  crearSeparador: (diaId: string, titulo: string, id?: string) => void
  renombrarSeparador: (id: string, titulo: string) => void
  borrarSeparador: (id: string) => void
  actualizarGuion: (id: string, cambios: Partial<Pick<RodajeGuion, "numero" | "titulo" | "resumen" | "unidad">>) => void
  borrarGuion: (id: string) => void
  crearEscena: (guionId: string, campos: CamposEscena) => void
  actualizarEscena: (id: string, campos: Partial<CamposEscena>) => void
  borrarEscena: (id: string) => void
  cambiarEtiqueta: (etiqueta: Etiqueta) => void
  /** Reemplaza las tomas de la escena por las del formulario (los renglones vacíos se descartan) */
  guardarTomas: (escenaId: string, filas: FilaToma[]) => void
  leerTextoPendiente: () => void
}

type Vista = "plan" | "guiones" | "ordenar" | "subir"
type Lectura = Progreso & { activa: boolean; error: string | null }
type Resultado = PromiseLike<{ error: { message: string } | null }>

export function PlanRodaje(props: { projectId: string; perfil: AppProfile; esMovil: boolean }) {
  const { projectId, perfil, esMovil } = props
  const puedeEditar = puedeEditarRodaje(perfil.role)

  const [datos, setDatos] = useState<DatosPlan | null>(null)
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando")
  const [errorCarga, setErrorCarga] = useState("")
  const [vista, setVista] = useState<Vista>("plan")
  const [creando, setCreando] = useState(false)
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [guionAbierto, setGuionAbierto] = useState<{ id: string; lista: string[] } | null>(null)
  const [editEscena, setEditEscena] = useState<{ escena: RodajeEscena | null; guionId: string } | null>(null)
  const [editGuion, setEditGuion] = useState<RodajeGuion | null>(null)
  const [tomasDe, setTomasDe] = useState<string | null>(null)

  const datosRef = useRef<DatosPlan | null>(null)
  const lecturaRef = useRef({ activa: false, cancelada: false })
  // Cambios propios: cuántos se han hecho y cuántos siguen guardándose. Sirve
  // para no pintar una recarga que se pidió antes de que el cambio llegara.
  const cambiosRef = useRef({ version: 0, enVuelo: 0 })
  // Los cambios se guardan de uno en uno y en el orden en que se hicieron: si
  // dos movimientos seguidos llegaran al servidor al revés, ganaría el viejo.
  const colaRef = useRef<Promise<unknown>>(Promise.resolve())

  // ── Carga ───────────────────────────────────────────────────────────────────
  const recargar = useCallback(async () => {
    try {
      // Una recarga que se cruza con un cambio propio traería datos de antes
      // del cambio y lo "desharía" en pantalla; en ese caso se repite.
      for (let intento = 0; ; intento++) {
        const ultimo = intento >= 8
        if (cambiosRef.current.enVuelo > 0 && !ultimo) {
          await new Promise((r) => setTimeout(r, 250))
          continue
        }
        const version = cambiosRef.current.version
        const d = await cargarPlan(projectId)
        const cruzada = cambiosRef.current.version !== version || cambiosRef.current.enVuelo > 0
        if (cruzada && !ultimo) {
          await new Promise((r) => setTimeout(r, 250))
          continue
        }
        datosRef.current = d
        setDatos(d)
        setEstado("listo")
        setErrorCarga("")
        return
      }
    } catch (err) {
      setErrorCarga((err as Error).message)
      setEstado((prev) => (prev === "listo" ? "listo" : "error"))
    }
  }, [projectId])

  useEffect(() => {
    let vivo = true
    cargarPlan(projectId)
      .then((d) => {
        if (!vivo) return
        datosRef.current = d
        setDatos(d)
        setEstado("listo")
      })
      .catch((err: Error) => {
        if (!vivo) return
        setErrorCarga(err.message)
        setEstado("error")
      })
    return () => {
      vivo = false
      // Al salir de la página se detiene la lectura que esté corriendo.
      lecturaRef.current.cancelada = true
    }
  }, [projectId])

  // ── Tiempo real ─────────────────────────────────────────────────────────────
  // Cualquier cambio de otra persona (o de la lectura de la IA) vuelve a cargar
  // el plan. Se junta en una sola recarga si llegan varios seguidos.
  const planId = datos?.plan.id || null
  useEffect(() => {
    let cancelado = false
    let canal: ReturnType<typeof supabase.channel> | null = null
    let temporizador: ReturnType<typeof setTimeout> | null = null
    let yaSuscrito = false

    const programar = () => {
      if (temporizador) clearTimeout(temporizador)
      temporizador = setTimeout(() => {
        if (!cancelado) recargar()
      }, 450)
    }
    // Los eventos llegan de todos los planes; solo importan los de este (los
    // borrados no traen plan_id, así que esos recargan siempre).
    const alCambio = (p: { new: unknown; old: unknown }) => {
      const fila = (p.new || {}) as { plan_id?: string; project_id?: string; id?: string }
      const vieja = (p.old || {}) as { plan_id?: string }
      const plan = fila.plan_id || vieja.plan_id
      if (plan && planId && plan !== planId) return
      if (fila.project_id && fila.project_id !== projectId) return
      programar()
    }

    async function conectar() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelado) return
      // Sin el token, Realtime descarta los eventos de tablas con RLS.
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token)
      if (cancelado) return

      const tablas = [
        "rodaje_planes", "rodaje_archivos", "rodaje_guiones",
        "rodaje_dias", "rodaje_escenas", "rodaje_separadores", "rodaje_tomas",
      ]
      let c = supabase.channel(`rodaje-${projectId}`)
      for (const table of tablas) {
        c = c.on("postgres_changes", { event: "*", schema: "public", table }, alCambio)
      }
      canal = c.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Al reconectar pudieron perderse eventos: vuelve a cargar.
          if (yaSuscrito) programar()
          yaSuscrito = true
        }
      })
    }
    conectar()

    const { data: sub } = supabase.auth.onAuthStateChange((evento, session) => {
      if (session?.access_token && (evento === "TOKEN_REFRESHED" || evento === "SIGNED_IN")) {
        supabase.realtime.setAuth(session.access_token)
      }
    })
    const alVolver = () => {
      if (document.visibilityState === "visible") programar()
    }
    document.addEventListener("visibilitychange", alVolver)

    return () => {
      cancelado = true
      if (temporizador) clearTimeout(temporizador)
      if (canal) supabase.removeChannel(canal)
      sub.subscription.unsubscribe()
      document.removeEventListener("visibilitychange", alVolver)
    }
  }, [projectId, planId, recargar])

  // ── Acciones ────────────────────────────────────────────────────────────────
  // Primero se pinta el cambio y luego se guarda; si el servidor lo rechaza, se
  // avisa y se vuelve a cargar lo que realmente quedó.
  const mutar = useCallback(
    async (local: (d: DatosPlan) => DatosPlan, remoto: () => Resultado, queFallo: string) => {
      // datosRef es la copia al momento: dos acciones seguidas ven el cambio
      // de la anterior sin esperar a que React vuelva a pintar.
      const base = datosRef.current
      if (!base) return
      const nuevo = local(base)
      datosRef.current = nuevo
      setDatos(nuevo)
      cambiosRef.current.version++
      cambiosRef.current.enVuelo++
      let fallo: string | null = null
      try {
        const turno = colaRef.current.then(() => remoto())
        colaRef.current = turno.then(() => undefined, () => undefined)
        const { error } = await turno
        if (error) fallo = error.message
      } catch (err) {
        fallo = (err as Error).message
      } finally {
        cambiosRef.current.enVuelo--
      }
      if (fallo) {
        alert(`No se pudo ${queFallo}: ${fallo}`)
        await recargar()
      }
    },
    [recargar]
  )

  const leerTextoPendiente = useCallback(async () => {
    if (lecturaRef.current.activa) return
    const ref = { activa: true, cancelada: false }
    lecturaRef.current = ref
    // Da varias vueltas por si mientras leía se agregó otro guion al plan.
    for (let vuelta = 0; vuelta < 6 && !ref.cancelada; vuelta++) {
      const d = datosRef.current
      const tandas = d ? armarTandas(d.escenas, d.guiones) : []
      if (!tandas.length) break
      const total = tandas.reduce((n, t) => n + t.ids.length, 0)
      setLectura({ activa: true, total, leidas: 0, fallidas: 0, error: null })
      const r = await leerTandas({
        tandas,
        alAvanzar: (p) => setLectura({ ...p, activa: true, error: null }),
        cancelado: () => ref.cancelada,
      })
      if (ref.cancelada) break
      setLectura({ total: r.total, leidas: r.leidas, fallidas: r.fallidas, error: r.error, activa: false })
      await recargar()
      if (r.error || r.fallidas) break
    }
    ref.activa = false
  }, [recargar])

  const acc: Acciones = useMemo(() => {
    const ahora = () => new Date().toISOString()
    const id = () => crypto.randomUUID()

    return {
      recargar,
      leerTextoPendiente,

      marcarFilmada(escenaId, valor) {
        const cambio = {
          filmada: valor,
          filmada_at: valor ? ahora() : null,
          filmada_por: valor ? perfil.id : null,
        }
        mutar(
          (d) => ({ ...d, escenas: d.escenas.map((e) => (e.id === escenaId ? { ...e, ...cambio } : e)) }),
          () => supabase.from("rodaje_escenas").update({ ...cambio, updated_at: ahora() }).eq("id", escenaId),
          "guardar la escena"
        )
      },

      guardarOrden(cambios) {
        const d = datosRef.current
        if (!d || !cambios.length) return
        mutar(
          (x) => ({ ...x, ...aplicarCambios(x.escenas, x.seps, cambios) }),
          () => supabase.rpc("rodaje_guardar_orden", { p_plan: d.plan.id, p_items: cambios }),
          "guardar el orden"
        )
      },

      crearDia() {
        const d = datosRef.current
        if (!d) return
        const dia: RodajeDia = { id: id(), plan_id: d.plan.id, fecha: null, nota: "", created_at: ahora() }
        mutar(
          (x) => ({ ...x, dias: [...x.dias, dia] }),
          () => supabase.from("rodaje_dias").insert({ id: dia.id, plan_id: dia.plan_id }),
          "crear el día"
        )
      },

      actualizarDia(diaId, cambios) {
        mutar(
          (x) => ({ ...x, dias: x.dias.map((dd) => (dd.id === diaId ? { ...dd, ...cambios } : dd)) }),
          () => supabase.from("rodaje_dias").update(cambios).eq("id", diaId),
          "guardar el día"
        )
      },

      borrarDia(diaId) {
        const d = datosRef.current
        if (!d) return
        // Sus escenas regresan a "Sin día asignado", al final.
        let pos = siguientePos(null, d.escenas, d.seps)
        const cambios: CambioOrden[] = d.escenas
          .filter((e) => e.dia_id === diaId)
          .sort((a, b) => a.pos - b.pos)
          .map((e) => ({ t: "e" as const, id: e.id, dia: null, pos: pos++ }))
        mutar(
          (x) => ({
            ...x,
            dias: x.dias.filter((dd) => dd.id !== diaId),
            seps: x.seps.filter((s) => s.dia_id !== diaId),
            escenas: aplicarCambios(x.escenas, x.seps, cambios).escenas,
          }),
          async () => {
            if (cambios.length) {
              const r = await supabase.rpc("rodaje_guardar_orden", { p_plan: d.plan.id, p_items: cambios })
              if (r.error) return r
            }
            return supabase.from("rodaje_dias").delete().eq("id", diaId)
          },
          "borrar el día"
        )
      },

      crearSeparador(diaId, titulo, sepId) {
        const d = datosRef.current
        if (!d) return
        const sep = { id: sepId || id(), plan_id: d.plan.id, dia_id: diaId, titulo, pos: siguientePos(diaId, d.escenas, d.seps) }
        mutar(
          (x) => ({ ...x, seps: [...x.seps, sep] }),
          () => supabase.from("rodaje_separadores").insert(sep),
          "crear el separador"
        )
      },

      renombrarSeparador(sepId, titulo) {
        mutar(
          (x) => ({ ...x, seps: x.seps.map((s) => (s.id === sepId ? { ...s, titulo } : s)) }),
          () => supabase.from("rodaje_separadores").update({ titulo }).eq("id", sepId),
          "guardar el separador"
        )
      },

      borrarSeparador(sepId) {
        mutar(
          (x) => ({ ...x, seps: x.seps.filter((s) => s.id !== sepId) }),
          () => supabase.from("rodaje_separadores").delete().eq("id", sepId),
          "borrar el separador"
        )
      },

      actualizarGuion(guionId, cambios) {
        mutar(
          (x) => ({ ...x, guiones: x.guiones.map((g) => (g.id === guionId ? { ...g, ...cambios } : g)) }),
          () => supabase.from("rodaje_guiones").update(cambios).eq("id", guionId),
          "guardar los cambios"
        )
      },

      borrarGuion(guionId) {
        mutar(
          (x) => ({
            ...x,
            guiones: x.guiones.filter((g) => g.id !== guionId),
            escenas: x.escenas.filter((e) => e.guion_id !== guionId),
            tomas: x.tomas.filter((t) => x.escenas.some((e) => e.id === t.escena_id && e.guion_id !== guionId)),
          }),
          () => supabase.from("rodaje_guiones").delete().eq("id", guionId),
          "borrar"
        )
      },

      crearEscena(guionId, campos) {
        const d = datosRef.current
        if (!d) return
        const orden = d.escenas.filter((e) => e.guion_id === guionId).reduce((m, e) => Math.max(m, e.orden), -1) + 1
        const fila = {
          id: id(),
          plan_id: d.plan.id,
          guion_id: guionId,
          orden,
          ...campos,
          encabezado: "",
          pos: siguientePos(campos.dia_id, d.escenas, d.seps),
        }
        const escena: RodajeEscena = {
          ...fila, pagina: null, tiene_texto: false, filmada: false, filmada_at: null, filmada_por: null,
        }
        mutar(
          (x) => ({ ...x, escenas: [...x.escenas, escena] }),
          () => supabase.from("rodaje_escenas").insert(fila),
          "crear la escena"
        )
      },

      actualizarEscena(escenaId, campos) {
        const d = datosRef.current
        if (!d) return
        const actual = d.escenas.find((e) => e.id === escenaId)
        if (!actual) return
        // Si cambia de día, entra al final del día nuevo.
        const cambiaDia = "dia_id" in campos && (campos.dia_id || null) !== (actual.dia_id || null)
        const cambio = cambiaDia
          ? { ...campos, pos: siguientePos(campos.dia_id || null, d.escenas, d.seps) }
          : campos
        mutar(
          (x) => ({ ...x, escenas: x.escenas.map((e) => (e.id === escenaId ? { ...e, ...cambio } : e)) }),
          () => supabase.from("rodaje_escenas").update({ ...cambio, updated_at: ahora() }).eq("id", escenaId),
          "guardar la escena"
        )
      },

      borrarEscena(escenaId) {
        mutar(
          (x) => ({
            ...x,
            escenas: x.escenas.filter((e) => e.id !== escenaId),
            tomas: x.tomas.filter((t) => t.escena_id !== escenaId),
          }),
          () => supabase.from("rodaje_escenas").delete().eq("id", escenaId),
          "borrar la escena"
        )
      },

      guardarTomas(escenaId, filas) {
        const d = datosRef.current
        if (!d) return
        const limpio = (v: string, max: number) => (v || "").trim().slice(0, max)
        const nuevas: RodajeToma[] = filas
          .map((f) => ({
            id: f.id,
            emplazamiento: limpio(f.emplazamiento, 80),
            buena: limpio(f.buena, 40),
            proteccion: limpio(f.proteccion, 40),
            notas: limpio(f.notas, 2000),
          }))
          .filter((f) => f.emplazamiento || f.buena || f.proteccion || f.notas)
          .slice(0, MAX_TOMAS_POR_ESCENA)
          .map((f, i) => ({
            ...f,
            id: f.id || id(),
            plan_id: d.plan.id,
            escena_id: escenaId,
            orden: i,
            updated_by: perfil.id,
            updated_at: ahora(),
          }))
        const quedan = nuevas.map((t) => t.id)
        mutar(
          (x) => ({ ...x, tomas: [...x.tomas.filter((t) => t.escena_id !== escenaId), ...nuevas] }),
          async () => {
            // Primero se guardan los renglones y después se quitan los que ya
            // no están: si algo falla a medias, no se pierde lo capturado.
            if (nuevas.length) {
              const r = await supabase.from("rodaje_tomas").upsert(nuevas)
              if (r.error) return r
            }
            const borrar = supabase.from("rodaje_tomas").delete().eq("escena_id", escenaId)
            return quedan.length ? borrar.not("id", "in", `(${quedan.join(",")})`) : borrar
          },
          "guardar las tomas"
        )
      },

      cambiarEtiqueta(etiqueta) {
        const d = datosRef.current
        if (!d) return
        mutar(
          (x) => ({ ...x, plan: { ...x.plan, etiqueta } }),
          () => supabase.from("rodaje_planes").update({ etiqueta }).eq("id", d.plan.id),
          "guardar el cambio"
        )
      },
    }
  }, [mutar, recargar, leerTextoPendiente, perfil.id])

  async function generarPlan() {
    setCreando(true)
    try {
      await crearPlan(projectId, perfil.id)
      await recargar()
      setVista("subir")
    } catch (err) {
      alert(`No se pudo generar el plan: ${(err as Error).message}`)
    } finally {
      setCreando(false)
    }
  }

  // ── Pantallas ───────────────────────────────────────────────────────────────
  if (estado === "cargando") {
    return <div style={{ ...panel, color: C.apagado, fontSize: 14 }}>Cargando el plan de rodaje…</div>
  }

  if (estado === "error") {
    const faltaTabla = /rodaje_|relation|schema cache|does not exist/i.test(errorCarga)
    return (
      <div style={panel}>
        <div style={avisoError}>
          {faltaTabla
            ? "El plan de rodaje todavía no está instalado en la base de datos. Falta ejecutar el script supabase/migrations/20261109_plan_rodaje.sql en Supabase."
            : `No se pudo cargar el plan de rodaje: ${errorCarga}`}
        </div>
        <button type="button" style={{ ...boton, marginTop: 12 }} onClick={() => { setEstado("cargando"); recargar() }}>
          Reintentar
        </button>
      </div>
    )
  }

  if (!datos) {
    return (
      <div style={panel}>
        <div style={{ ...vacio, padding: "36px 20px" }}>
          <p style={{ margin: 0, color: C.texto, fontSize: 16, fontWeight: 600 }}>
            Este proyecto todavía no tiene plan de rodaje
          </p>
          {puedeEditar ? (
            <>
              <p style={{ margin: "8px auto 18px", maxWidth: 460 }}>
                Sube los guiones y la IA los separa en escenas. Después repartes las escenas en días
                y vas marcando lo filmado.
              </p>
              <button type="button" style={{ ...botonPrimario, padding: "11px 18px", fontSize: 14 }} onClick={generarPlan} disabled={creando}>
                {creando ? "Generando…" : "Generar plan de trabajo"}
              </button>
            </>
          ) : (
            <p style={{ margin: "8px 0 0" }}>Cuando producción lo genere, aquí lo vas a poder consultar.</p>
          )}
        </div>
      </div>
    )
  }

  const etq = ETIQUETAS[datos.plan.etiqueta] || ETIQUETAS.guion
  const escenaDeTomas = tomasDe && puedeEditar ? datos.escenas.find((e) => e.id === tomasDe) : undefined
  const hayGuiones = datos.guiones.length > 0
  const vistaReal: Vista = !hayGuiones ? "subir" : !puedeEditar && (vista === "ordenar" || vista === "subir") ? "plan" : vista
  const pendientesTexto = puedeEditar ? escenasSinTexto(datos.escenas, datos.guiones).length : 0
  const porRevisar = datos.archivos.filter((a) => a.estado !== "aplicado").length

  const pestana = (v: Vista, texto: string) => (
    <button
      type="button"
      onClick={() => setVista(v)}
      aria-pressed={vistaReal === v}
      style={vistaReal === v ? botonVioleta : boton}
    >
      {texto}
    </button>
  )

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
      {hayGuiones && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {pestana("plan", "Plan")}
          {pestana("guiones", etq.varios)}
          {puedeEditar && (
            <>
              <span style={{ flex: 1 }} />
              {pestana("ordenar", vistaReal === "ordenar" ? "Ordenando" : "Ordenar")}
              {pestana("subir", porRevisar ? `+ Subir guion (${porRevisar})` : "+ Subir guion")}
            </>
          )}
        </div>
      )}

      {errorCarga && estado === "listo" && (
        <div style={avisoAmbar}>
          No se pudo actualizar el plan ({errorCarga}). Lo que ves puede estar atrasado.{" "}
          <button type="button" style={botonChico} onClick={() => recargar()}>Actualizar</button>
        </div>
      )}

      {puedeEditar && lectura?.activa && (
        <div style={aviso}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
            <span>La IA está leyendo el texto de las escenas. Puedes seguir trabajando; no cierres esta pestaña.</span>
            <span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{lectura.leidas} de {lectura.total}</span>
          </div>
          <BarraProgreso hecho={lectura.leidas} total={lectura.total} color={C.violeta} />
        </div>
      )}

      {puedeEditar && !lectura?.activa && pendientesTexto > 0 && hayGuiones && (
        <div style={lectura?.error ? avisoError : avisoAmbar}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <span>
              {lectura?.error
                ? `La lectura se detuvo: ${lectura.error}`
                : pendientesTexto === 1
                  ? "A 1 escena le falta el texto para el botón GUION."
                  : `A ${pendientesTexto} escenas les falta el texto para el botón GUION.`}
            </span>
            <button type="button" style={botonChico} onClick={() => leerTextoPendiente()}>
              {lectura?.error ? "Reintentar" : "Leer texto con IA"}
            </button>
          </div>
        </div>
      )}

      {vistaReal === "subir" && (
        <SubirGuiones
          datos={datos}
          puedeEditar={puedeEditar}
          acc={acc}
          onAplicado={() => {
            setVista("plan")
            leerTextoPendiente()
          }}
        />
      )}

      {vistaReal === "plan" && (
        <VistaPlan
          datos={datos}
          puedeEditar={puedeEditar}
          esMovil={esMovil}
          acc={acc}
          onGuion={(id, lista) => setGuionAbierto({ id, lista })}
          onEditarEscena={(e) => setEditEscena({ escena: e, guionId: e.guion_id })}
          onTomas={(e) => setTomasDe(e.id)}
          onOrdenar={() => setVista("ordenar")}
        />
      )}

      {vistaReal === "guiones" && (
        <VistaGuiones
          datos={datos}
          puedeEditar={puedeEditar}
          acc={acc}
          onGuion={(id, lista) => setGuionAbierto({ id, lista })}
          onEditarEscena={(e) => setEditEscena({ escena: e, guionId: e.guion_id })}
          onTomas={(e) => setTomasDe(e.id)}
          onNuevaEscena={(guionId) => setEditEscena({ escena: null, guionId })}
          onEditarGuion={(g) => setEditGuion(g)}
        />
      )}

      {vistaReal === "ordenar" && (
        <ModoOrdenar datos={datos} esMovil={esMovil} acc={acc} onSalir={() => setVista("plan")} />
      )}

      {guionAbierto && (
        <GuionModal
          datos={datos}
          escenaId={guionAbierto.id}
          lista={guionAbierto.lista}
          puedeEditar={puedeEditar}
          acc={acc}
          onCambiar={(id) => setGuionAbierto({ id, lista: guionAbierto.lista })}
          onTomas={(id) => setTomasDe(id)}
          onCerrar={() => setGuionAbierto(null)}
        />
      )}

      {editEscena && (
        <EditarEscena
          datos={datos}
          escena={editEscena.escena}
          guionId={editEscena.guionId}
          acc={acc}
          onCerrar={() => setEditEscena(null)}
        />
      )}

      {editGuion && (
        <EditarGuion datos={datos} guion={editGuion} acc={acc} onCerrar={() => setEditGuion(null)} />
      )}

      {escenaDeTomas && (
        <EditarTomas datos={datos} escena={escenaDeTomas} acc={acc} onCerrar={() => setTomasDe(null)} />
      )}
    </div>
  )
}
