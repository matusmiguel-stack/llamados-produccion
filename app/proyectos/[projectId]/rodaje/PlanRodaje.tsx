"use client"

// Contenedor del plan de rodaje de un proyecto: carga los datos, los mantiene
// al día en tiempo real, y reparte las acciones a las vistas.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "../../../../lib/supabase"
import type { AppProfile } from "../../../../lib/session-profile"
import { borrarPlanCompleto, cargarPlan, crearPlan, type DatosCrudos } from "../../../../lib/rodaje/datos"
import type { CambioOrden } from "../../../../lib/rodaje/orden"
import { armarTandas, escenasSinTexto, leerTandas, type Progreso } from "../../../../lib/rodaje/lectura"
import {
  ETIQUETAS, MAX_TOMAS_POR_ESCENA, MAX_UNIDADES, puedeEditarRodaje,
  type EscenaBase, type Etiqueta, type FilaToma, type RodajeDia, type RodajeEscena,
  type RodajeGuion, type RodajeToma, type RodajeUnidad, type TipoUnidad,
} from "../../../../lib/rodaje/tipos"
import {
  aplicarOrden, nombreUnidadNueva, numeroListaFotos, proyectar, siguientePosEn, unidadActual,
} from "../../../../lib/rodaje/unidades"
import { BarraProgreso } from "./comun"
import {
  C, aviso, avisoAmbar, avisoError, boton, botonChico, botonPeligro, botonPrimario, botonVioleta, panel, vacio,
} from "./estilos"
import { VistaPlan } from "./VistaPlan"
import { VistaGuiones } from "./VistaGuiones"
import { ModoOrdenar } from "./ModoOrdenar"
import { SubirGuiones } from "./SubirGuiones"
import { GuionModal } from "./GuionModal"
import { EditarEscena, EditarGuion } from "./Editores"
import { EditarTomas } from "./Tomas"
import { ExportarPDF } from "./ExportarPDF"
import { BorrarTodo } from "./BorrarTodo"
import { AdministrarUnidades, SelectorUnidad } from "./Unidades"
import { NuevaListaFotos } from "./ListaFotos"

/** Lo que se captura de una escena; dia_id es su día en la unidad que se está viendo. */
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
  actualizarGuion: (id: string, cambios: Partial<Pick<RodajeGuion, "numero" | "titulo" | "resumen">>) => void
  borrarGuion: (id: string) => void
  crearEscena: (guionId: string, campos: CamposEscena) => void
  actualizarEscena: (id: string, campos: Partial<CamposEscena>) => void
  borrarEscena: (id: string) => void
  cambiarEtiqueta: (etiqueta: Etiqueta) => void
  /** Reemplaza las tomas de la escena por las del formulario (los renglones vacíos se descartan) */
  guardarTomas: (escenaId: string, filas: FilaToma[]) => void
  leerTextoPendiente: () => void
  /** Crea una unidad con el primer nombre libre y devuelve su id (null si ya no caben más) */
  crearUnidad: (tipo: TipoUnidad) => string | null
  actualizarUnidad: (id: string, cambios: Partial<Pick<RodajeUnidad, "nombre" | "tipo">>) => void
  /** Borra la unidad con su plan; las escenas siguen en las demás unidades */
  borrarUnidad: (id: string) => void
  /** Mete escenas al plan de una unidad, en "Sin día asignado" y en el orden en que vienen */
  agregarAUnidad: (unidadId: string, escenaIds: string[]) => void
  /** Saca escenas del plan de una unidad (se pierde su avance y sus tomas en esa unidad) */
  quitarDeUnidad: (unidadId: string, escenaIds: string[]) => void
  /** Crea una lista de fotos (una pieza con una "escena" por foto) en el plan de una unidad */
  crearListaFotos: (titulo: string, fotos: string[], unidadId: string) => void
}

type Vista = "plan" | "guiones" | "ordenar" | "subir"
type Lectura = Progreso & { activa: boolean; error: string | null }
type Resultado = PromiseLike<{ error: { message: string } | null }>

export function PlanRodaje(props: {
  projectId: string
  /** Nombre del proyecto, para el encabezado y el nombre de los PDF */
  proyecto: string
  perfil: AppProfile
  esMovil: boolean
}) {
  const { projectId, perfil, esMovil } = props
  const puedeEditar = puedeEditarRodaje(perfil.role)

  // Lo que hay en la base. Las vistas reciben `datos`: el plan visto desde la
  // unidad elegida (ver proyectar).
  const [crudos, setDatos] = useState<DatosCrudos | null>(null)
  // Cada quien recuerda su unidad en este navegador: foto abre en Foto.
  const claveUnidad = `rodaje-unidad-${projectId}`
  const [unidadSel, setUnidadSel] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(claveUnidad)
    } catch {
      return null
    }
  })
  const unidadRef = useRef<string | null>(unidadSel)
  const elegirUnidad = useCallback(
    (id: string) => {
      unidadRef.current = id
      setUnidadSel(id)
      try {
        window.localStorage.setItem(claveUnidad, id)
      } catch {
        // Sin almacenamiento (modo privado): funciona igual, solo no se recuerda.
      }
    },
    [claveUnidad]
  )
  const datos = useMemo(() => (crudos ? proyectar(crudos, unidadSel) : null), [crudos, unidadSel])
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando")
  const [errorCarga, setErrorCarga] = useState("")
  const [vista, setVista] = useState<Vista>("plan")
  const [creando, setCreando] = useState(false)
  const [lectura, setLectura] = useState<Lectura | null>(null)
  const [guionAbierto, setGuionAbierto] = useState<{ id: string; lista: string[] } | null>(null)
  const [editEscena, setEditEscena] = useState<{ escena: RodajeEscena | null; guionId: string } | null>(null)
  const [editGuion, setEditGuion] = useState<RodajeGuion | null>(null)
  const [tomasDe, setTomasDe] = useState<string | null>(null)
  const [pdfAbierto, setPdfAbierto] = useState(false)
  const [borrarAbierto, setBorrarAbierto] = useState(false)
  const [unidadesAbierto, setUnidadesAbierto] = useState(false)
  const [fotosAbierto, setFotosAbierto] = useState(false)

  const datosRef = useRef<DatosCrudos | null>(null)
  const lecturaRef = useRef({ activa: false, cancelada: false })
  // Cambios propios: cuántos se han hecho y cuántos siguen guardándose. Sirve
  // para no pintar una recarga que se pidió antes de que el cambio llegara.
  const cambiosRef = useRef({ version: 0, enVuelo: 0 })
  // Los cambios se guardan de uno en uno y en el orden en que se hicieron: si
  // dos movimientos seguidos llegaran al servidor al revés, ganaría el viejo.
  const colaRef = useRef<Promise<unknown>>(Promise.resolve())

  // Cuando el plan que estaba en pantalla deja de existir (se borró todo, aquí
  // o desde otra sesión), se cierran sus ventanas y se detiene la lectura: si
  // no, reaparecerían apuntando a escenas que ya no están.
  const cerrarTodo = useCallback(() => {
    lecturaRef.current.cancelada = true
    setLectura(null)
    setGuionAbierto(null)
    setEditEscena(null)
    setEditGuion(null)
    setTomasDe(null)
    setPdfAbierto(false)
    setBorrarAbierto(false)
    setUnidadesAbierto(false)
    setFotosAbierto(false)
    setVista("plan")
  }, [])

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
        const anterior = datosRef.current?.plan.id || null
        if (anterior && anterior !== (d?.plan.id || null)) cerrarTodo()
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
  }, [projectId, cerrarTodo])

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
  const planId = crudos?.plan.id || null
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
        "rodaje_unidades", "rodaje_asignaciones", "rodaje_dia_notas",
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
    async (local: (d: DatosCrudos) => DatosCrudos, remoto: () => Resultado, queFallo: string) => {
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
    // La unidad que se está viendo: es en la que caen los cambios del plan.
    const u = () => unidadActual(datosRef.current?.unidades || [], unidadRef.current)?.id || ""
    const SIN_AVANCE = { filmada: false, filmada_at: null, filmada_por: null }

    return {
      recargar,
      leerTextoPendiente,

      marcarFilmada(escenaId, valor) {
        const unidad = u()
        const cambio = {
          filmada: valor,
          filmada_at: valor ? ahora() : null,
          filmada_por: valor ? perfil.id : null,
        }
        mutar(
          (d) => ({
            ...d,
            asignaciones: d.asignaciones.map((a) =>
              a.escena_id === escenaId && a.unidad_id === unidad ? { ...a, ...cambio } : a
            ),
          }),
          () =>
            supabase
              .from("rodaje_asignaciones")
              .update({ ...cambio, updated_at: ahora() })
              .eq("escena_id", escenaId)
              .eq("unidad_id", unidad),
          "guardar la escena"
        )
      },

      guardarOrden(cambios) {
        const d = datosRef.current
        const unidad = u()
        if (!d || !cambios.length) return
        mutar(
          (x) => ({ ...x, ...aplicarOrden(x, unidad, cambios) }),
          () => supabase.rpc("rodaje_guardar_orden_unidad", { p_plan: d.plan.id, p_unidad: unidad, p_items: cambios }),
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
        const d = datosRef.current
        const unidad = u()
        if (!d) return
        // La fecha es del día (igual para todas las unidades); la nota de
        // llamado es de la unidad que la escribe.
        if ("fecha" in cambios) {
          const fecha = cambios.fecha ?? null
          mutar(
            (x) => ({ ...x, dias: x.dias.map((dd) => (dd.id === diaId ? { ...dd, fecha } : dd)) }),
            () => supabase.from("rodaje_dias").update({ fecha }).eq("id", diaId),
            "guardar el día"
          )
        }
        if ("nota" in cambios) {
          const fila = { dia_id: diaId, unidad_id: unidad, plan_id: d.plan.id, nota: cambios.nota || "" }
          mutar(
            (x) => ({
              ...x,
              notas: [...x.notas.filter((n) => !(n.dia_id === diaId && n.unidad_id === unidad)), fila],
            }),
            () => supabase.from("rodaje_dia_notas").upsert(fila, { onConflict: "dia_id,unidad_id" }),
            "guardar la nota del día"
          )
        }
      },

      borrarDia(diaId) {
        const d = datosRef.current
        if (!d) return
        // El día se borra para todas las unidades: en cada una, sus escenas de
        // ese día regresan a "Sin día asignado", al final.
        const porUnidad = d.unidades
          .map((un) => {
            let pos = siguientePosEn(d, un.id, null)
            const cambios: CambioOrden[] = d.asignaciones
              .filter((a) => a.unidad_id === un.id && a.dia_id === diaId)
              .sort((a, b) => a.pos - b.pos)
              .map((a) => ({ t: "e" as const, id: a.escena_id, dia: null, pos: pos++ }))
            return { unidad: un.id, cambios }
          })
          .filter((x) => x.cambios.length)
        mutar(
          (x) => {
            let y = x
            for (const p of porUnidad) y = { ...y, ...aplicarOrden(y, p.unidad, p.cambios) }
            return {
              ...y,
              dias: y.dias.filter((dd) => dd.id !== diaId),
              seps: y.seps.filter((s) => s.dia_id !== diaId),
              notas: y.notas.filter((n) => n.dia_id !== diaId),
            }
          },
          async () => {
            for (const p of porUnidad) {
              const r = await supabase.rpc("rodaje_guardar_orden_unidad", {
                p_plan: d.plan.id, p_unidad: p.unidad, p_items: p.cambios,
              })
              if (r.error) return r
            }
            return supabase.from("rodaje_dias").delete().eq("id", diaId)
          },
          "borrar el día"
        )
      },

      crearSeparador(diaId, titulo, sepId) {
        const d = datosRef.current
        const unidad = u()
        if (!d) return
        const sep = {
          id: sepId || id(), plan_id: d.plan.id, dia_id: diaId, unidad_id: unidad, titulo,
          pos: siguientePosEn(d, unidad, diaId),
        }
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
          (x) => {
            const fuera = new Set(x.escenas.filter((e) => e.guion_id === guionId).map((e) => e.id))
            return {
              ...x,
              guiones: x.guiones.filter((g) => g.id !== guionId),
              escenas: x.escenas.filter((e) => !fuera.has(e.id)),
              asignaciones: x.asignaciones.filter((a) => !fuera.has(a.escena_id)),
              tomas: x.tomas.filter((t) => !fuera.has(t.escena_id)),
            }
          },
          () => supabase.from("rodaje_guiones").delete().eq("id", guionId),
          "borrar"
        )
      },

      crearEscena(guionId, campos) {
        const d = datosRef.current
        const unidad = u()
        if (!d) return
        const { dia_id: dia, ...contenido } = campos
        const orden = d.escenas.filter((e) => e.guion_id === guionId).reduce((m, e) => Math.max(m, e.orden), -1) + 1
        const fila = { id: id(), plan_id: d.plan.id, guion_id: guionId, orden, ...contenido, encabezado: "" }
        const escena: EscenaBase = { ...fila, pagina: null, tiene_texto: false }
        // Entra al plan de la unidad que se está viendo, al final de su día.
        const lugar = {
          id: id(), plan_id: d.plan.id, escena_id: fila.id, unidad_id: unidad,
          dia_id: dia || null, pos: siguientePosEn(d, unidad, dia || null),
        }
        mutar(
          (x) => ({
            ...x,
            escenas: [...x.escenas, escena],
            asignaciones: [...x.asignaciones, { ...lugar, ...SIN_AVANCE }],
          }),
          async () => {
            const r = await supabase.from("rodaje_escenas").insert(fila)
            if (r.error) return r
            return supabase.from("rodaje_asignaciones").insert(lugar)
          },
          "crear la escena"
        )
      },

      actualizarEscena(escenaId, campos) {
        const d = datosRef.current
        const unidad = u()
        if (!d) return
        const { dia_id: dia, ...contenido } = campos
        // Lo que dice la escena es igual para todas las unidades; el día es el
        // de la unidad que se está viendo (si cambia, entra al final del nuevo).
        const actual = d.asignaciones.find((a) => a.escena_id === escenaId && a.unidad_id === unidad)
        const cambiaDia = "dia_id" in campos && !!actual && (dia || null) !== (actual.dia_id || null)
        const lugar = cambiaDia ? { dia_id: dia || null, pos: siguientePosEn(d, unidad, dia || null) } : null
        const hayContenido = Object.keys(contenido).length > 0
        if (!hayContenido && !lugar) return
        mutar(
          (x) => ({
            ...x,
            escenas: hayContenido ? x.escenas.map((e) => (e.id === escenaId ? { ...e, ...contenido } : e)) : x.escenas,
            asignaciones: lugar
              ? x.asignaciones.map((a) => (a.escena_id === escenaId && a.unidad_id === unidad ? { ...a, ...lugar } : a))
              : x.asignaciones,
          }),
          async () => {
            if (hayContenido) {
              const r = await supabase.from("rodaje_escenas").update({ ...contenido, updated_at: ahora() }).eq("id", escenaId)
              if (r.error || !lugar) return r
            }
            return supabase
              .from("rodaje_asignaciones")
              .update({ ...lugar, updated_at: ahora() })
              .eq("escena_id", escenaId)
              .eq("unidad_id", unidad)
          },
          "guardar la escena"
        )
      },

      borrarEscena(escenaId) {
        mutar(
          (x) => ({
            ...x,
            escenas: x.escenas.filter((e) => e.id !== escenaId),
            asignaciones: x.asignaciones.filter((a) => a.escena_id !== escenaId),
            tomas: x.tomas.filter((t) => t.escena_id !== escenaId),
          }),
          () => supabase.from("rodaje_escenas").delete().eq("id", escenaId),
          "borrar la escena"
        )
      },

      guardarTomas(escenaId, filas) {
        const d = datosRef.current
        const unidad = u()
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
            unidad_id: unidad,
            orden: i,
            updated_by: perfil.id,
            updated_at: ahora(),
          }))
        const quedan = nuevas.map((t) => t.id)
        // Las tomas son de la unidad: las que otra unidad le calificó a la
        // misma escena no se tocan.
        const deOtra = (t: RodajeToma) => t.escena_id !== escenaId || (!!t.unidad_id && t.unidad_id !== unidad)
        mutar(
          (x) => ({ ...x, tomas: [...x.tomas.filter(deOtra), ...nuevas] }),
          async () => {
            // Primero se guardan los renglones y después se quitan los que ya
            // no están: si algo falla a medias, no se pierde lo capturado.
            if (nuevas.length) {
              const r = await supabase.from("rodaje_tomas").upsert(nuevas)
              if (r.error) return r
            }
            const borrar = supabase.from("rodaje_tomas").delete().eq("escena_id", escenaId).eq("unidad_id", unidad)
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

      // ── Unidades ──────────────────────────────────────────────────────────────
      crearUnidad(tipo) {
        const d = datosRef.current
        if (!d || d.unidades.length >= MAX_UNIDADES) return null
        const fila = {
          id: id(),
          plan_id: d.plan.id,
          nombre: nombreUnidadNueva(d.unidades, tipo),
          tipo,
          orden: d.unidades.reduce((m, x) => Math.max(m, x.orden), -1) + 1,
        }
        mutar(
          (x) => ({ ...x, unidades: [...x.unidades, { ...fila, created_at: ahora() }] }),
          () => supabase.from("rodaje_unidades").insert(fila),
          "crear la unidad"
        )
        return fila.id
      },

      actualizarUnidad(unidadId, cambios) {
        mutar(
          (x) => ({ ...x, unidades: x.unidades.map((un) => (un.id === unidadId ? { ...un, ...cambios } : un)) }),
          () => supabase.from("rodaje_unidades").update(cambios).eq("id", unidadId),
          "guardar la unidad"
        )
      },

      borrarUnidad(unidadId) {
        const d = datosRef.current
        if (!d || d.unidades.length <= 1) return
        mutar(
          (x) => ({
            ...x,
            unidades: x.unidades.filter((un) => un.id !== unidadId),
            asignaciones: x.asignaciones.filter((a) => a.unidad_id !== unidadId),
            seps: x.seps.filter((s) => s.unidad_id !== unidadId),
            tomas: x.tomas.filter((t) => t.unidad_id !== unidadId),
            notas: x.notas.filter((n) => n.unidad_id !== unidadId),
          }),
          () => supabase.from("rodaje_unidades").delete().eq("id", unidadId),
          "borrar la unidad"
        )
      },

      agregarAUnidad(unidadId, escenaIds) {
        const d = datosRef.current
        if (!d || !unidadId) return
        const ya = new Set(d.asignaciones.filter((a) => a.unidad_id === unidadId).map((a) => a.escena_id))
        let pos = siguientePosEn(d, unidadId, null)
        const filas = [...new Set(escenaIds)]
          .filter((e) => !ya.has(e))
          .map((escena_id) => ({ id: id(), plan_id: d.plan.id, escena_id, unidad_id: unidadId, dia_id: null, pos: pos++ }))
        if (!filas.length) return
        mutar(
          (x) => ({ ...x, asignaciones: [...x.asignaciones, ...filas.map((f) => ({ ...f, ...SIN_AVANCE }))] }),
          async () => {
            // Si otra persona ya la agregó, no es error: se queda la que está.
            for (let i = 0; i < filas.length; i += 500) {
              const r = await supabase
                .from("rodaje_asignaciones")
                .upsert(filas.slice(i, i + 500), { onConflict: "escena_id,unidad_id", ignoreDuplicates: true })
              if (r.error) return r
            }
            return { error: null }
          },
          "agregar a la unidad"
        )
      },

      quitarDeUnidad(unidadId, escenaIds) {
        const ids = [...new Set(escenaIds)]
        if (!unidadId || !ids.length) return
        const fuera = new Set(ids)
        mutar(
          (x) => ({
            ...x,
            asignaciones: x.asignaciones.filter((a) => !(a.unidad_id === unidadId && fuera.has(a.escena_id))),
            tomas: x.tomas.filter((t) => !(t.unidad_id === unidadId && fuera.has(t.escena_id))),
          }),
          async () => {
            // En la base, al irse la escena de la unidad se van sus tomas ahí.
            for (let i = 0; i < ids.length; i += 100) {
              const r = await supabase
                .from("rodaje_asignaciones")
                .delete()
                .eq("unidad_id", unidadId)
                .in("escena_id", ids.slice(i, i + 100))
              if (r.error) return r
            }
            return { error: null }
          },
          "quitar de la unidad"
        )
      },

      crearListaFotos(titulo, fotos, unidadId) {
        const d = datosRef.current
        if (!d || !unidadId || !fotos.length) return
        const guion: RodajeGuion = {
          id: id(),
          plan_id: d.plan.id,
          archivo_id: null,
          orden: d.guiones.reduce((m, g) => Math.max(m, g.orden), -1) + 1,
          numero: numeroListaFotos(d.guiones),
          titulo: titulo.trim().slice(0, 160) || "Lista de fotos",
          resumen: "",
          notas: [],
          tipo: "fotos",
        }
        // Cada renglón es una foto. Lo corto va de título; si no cabe, completo abajo.
        const escenas: EscenaBase[] = fotos.map((texto, i) => ({
          id: id(),
          plan_id: d.plan.id,
          guion_id: guion.id,
          orden: i,
          numero: String(i + 1),
          encabezado: "",
          ie: "",
          locacion: texto.length > 160 ? texto.slice(0, 157).trimEnd() + "…" : texto,
          momento: "",
          descripcion: texto.length > 160 ? texto.slice(0, 2000) : "",
          personajes: [],
          pagina: null,
          tiene_texto: false,
        }))
        let pos = siguientePosEn(d, unidadId, null)
        const lugares = escenas.map((e) => ({
          id: id(), plan_id: d.plan.id, escena_id: e.id, unidad_id: unidadId, dia_id: null, pos: pos++,
        }))
        mutar(
          (x) => ({
            ...x,
            guiones: [...x.guiones, guion],
            escenas: [...x.escenas, ...escenas],
            asignaciones: [...x.asignaciones, ...lugares.map((l) => ({ ...l, ...SIN_AVANCE }))],
          }),
          async () => {
            const { id: guionId, plan_id, orden, numero, titulo: t, tipo } = guion
            const r = await supabase.from("rodaje_guiones").insert({ id: guionId, plan_id, orden, numero, titulo: t, tipo })
            if (r.error) return r
            // Si algo falla a medias se borra la pieza, y con ella lo que haya entrado.
            const deshacer = async <T extends { error: { message: string } | null }>(fallo: T): Promise<T> => {
              await supabase.from("rodaje_guiones").delete().eq("id", guionId)
              return fallo
            }
            for (let i = 0; i < escenas.length; i += 200) {
              // tiene_texto lo calcula la base: no se manda.
              const filas = escenas.slice(i, i + 200).map((e) => ({
                id: e.id, plan_id: e.plan_id, guion_id: e.guion_id, orden: e.orden, numero: e.numero,
                locacion: e.locacion, descripcion: e.descripcion,
              }))
              const re = await supabase.from("rodaje_escenas").insert(filas)
              if (re.error) return deshacer(re)
            }
            for (let i = 0; i < lugares.length; i += 500) {
              const rl = await supabase.from("rodaje_asignaciones").insert(lugares.slice(i, i + 500))
              if (rl.error) return deshacer(rl)
            }
            return { error: null }
          },
          "crear la lista de fotos"
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

  // Borra el plan entero. Si el servidor falla, el error sube a la ventana de
  // confirmación, que se queda abierta.
  async function borrarTodo() {
    const d = datosRef.current
    if (!d) return
    // Lo que se esté guardando termina primero, para que no truene contra un
    // plan que ya no existe.
    await colaRef.current
    await borrarPlanCompleto(d.plan.id)
    cerrarTodo()
    datosRef.current = null
    setDatos(null)
    // Se confirma contra el servidor, por si alguien generó otro plan mientras tanto.
    await recargar()
  }

  // ── Pantallas ───────────────────────────────────────────────────────────────
  if (estado === "cargando") {
    return <div style={{ ...panel, color: C.apagado, fontSize: 14 }}>Cargando el plan de rodaje…</div>
  }

  if (estado === "error") {
    const faltaTabla = /rodaje_|relation|schema cache|does not exist/i.test(errorCarga)
    // La app nueva con la base sin el script de unidades.
    const faltaUnidades = faltaTabla && /rodaje_unidades|rodaje_asignaciones|rodaje_dia_notas|rodaje_preparar_unidades|unidad_id|\btipo\b/i.test(errorCarga)
    return (
      <div style={panel}>
        <div style={avisoError}>
          {faltaUnidades
            ? "Falta un paso para las unidades de rodaje: ejecutar en Supabase el script supabase/migrations/20261123_rodaje_unidades.sql. Mientras tanto no se pierde nada del plan."
            : faltaTabla
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
  const pendientesTexto = puedeEditar ? escenasSinTexto(datos.todas, datos.guiones).length : 0
  const porRevisar = datos.archivos.filter((a) => a.estado !== "aplicado").length
  // Un plan recién generado y vacío no tiene nada que borrar.
  const hayAlgo = hayGuiones || datos.archivos.length > 0 || datos.dias.length > 0 || datos.unidades.length > 1
  const variasUnidades = datos.unidades.length > 1

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
          <span style={{ flex: 1 }} />
          <button type="button" style={boton} onClick={() => setPdfAbierto(true)} title="Descargar el plan de trabajo o el reporte de tomas">
            PDF
          </button>
          {puedeEditar && (
            <>
              {pestana("ordenar", vistaReal === "ordenar" ? "Ordenando" : "Ordenar")}
              {pestana("subir", porRevisar ? `+ Subir guion (${porRevisar})` : "+ Subir guion")}
            </>
          )}
        </div>
      )}

      {variasUnidades && (
        <SelectorUnidad
          datos={datos}
          puedeEditar={puedeEditar}
          onElegir={elegirUnidad}
          onAdministrar={() => setUnidadesAbierto(true)}
        />
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
          onAgregarEscenas={() => setVista("guiones")}
          onListaFotos={() => setFotosAbierto(true)}
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
          onUnidades={() => setUnidadesAbierto(true)}
          onListaFotos={() => setFotosAbierto(true)}
        />
      )}

      {vistaReal === "ordenar" && (
        <ModoOrdenar
          datos={datos}
          esMovil={esMovil}
          acc={acc}
          onUnidades={() => setUnidadesAbierto(true)}
          onSalir={() => setVista("plan")}
        />
      )}

      {puedeEditar && hayAlgo && vistaReal !== "ordenar" && (
        <div
          style={{
            display: "flex", justifyContent: "flex-end", marginTop: 6, paddingTop: 12,
            borderTop: `1px solid ${C.lineaSuave}`,
          }}
        >
          <button
            type="button"
            style={{ ...botonPeligro, opacity: lectura?.activa ? 0.5 : 1 }}
            onClick={() => setBorrarAbierto(true)}
            disabled={!!lectura?.activa}
            title={
              lectura?.activa
                ? "Espera a que la IA termine de leer"
                : "Borra los guiones, escenas, tomas, días y archivos de este proyecto"
            }
          >
            Borrar todo el plan
          </button>
        </div>
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

      {pdfAbierto && crudos && (
        <ExportarPDF
          crudos={crudos}
          unidadId={datos.unidad.id}
          proyecto={props.proyecto}
          onCerrar={() => setPdfAbierto(false)}
        />
      )}

      {unidadesAbierto && puedeEditar && (
        <AdministrarUnidades
          datos={datos}
          acc={acc}
          onElegir={elegirUnidad}
          onCerrar={() => setUnidadesAbierto(false)}
        />
      )}

      {fotosAbierto && puedeEditar && (
        <NuevaListaFotos
          datos={datos}
          acc={acc}
          onElegir={elegirUnidad}
          onCerrar={() => setFotosAbierto(false)}
        />
      )}

      {borrarAbierto && puedeEditar && (
        <BorrarTodo
          datos={datos}
          proyecto={props.proyecto}
          onBorrar={borrarTodo}
          onCerrar={() => setBorrarAbierto(false)}
        />
      )}

      {escenaDeTomas && (
        <EditarTomas datos={datos} escena={escenaDeTomas} acc={acc} onCerrar={() => setTomasDe(null)} />
      )}
    </div>
  )
}
