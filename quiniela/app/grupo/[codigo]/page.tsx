'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface Jugador { id: string; nombre: string; grupo_id: string }
interface Grupo { id: string; nombre: string; codigo: string; pts_exacto: number; pts_ganador: number }
interface Partido {
  id: string; equipo_local: string; equipo_visitante: string; bandera_local: string
  bandera_visitante: string; fecha: string; estado: string; goles_local: number | null
  goles_visitante: number | null; prediccion: { goles_local: number; goles_visitante: number; puntos: number | null } | null
}

export default function GrupoPage() {
  const params = useParams()
  const router = useRouter()
  const codigo = params.codigo as string

  const [jugador, setJugador] = useState<Jugador | null>(null)
  const [grupo, setGrupo] = useState<Grupo | null>(null)
  const [partidos, setPartidos] = useState<Partido[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('quiniela_jugador')
    if (!stored) { router.replace('/'); return }
    const j: Jugador = JSON.parse(stored)
    setJugador(j)

    const load = async () => {
      const [grupoRes, partidosRes] = await Promise.all([
        fetch(`/api/grupo?codigo=${codigo}`),
        fetch(`/api/partidos?jugador_id=${j.id}`),
      ])
      if (!grupoRes.ok) { router.replace('/'); return }
      setGrupo(await grupoRes.json())
      setPartidos(await partidosRes.json())
      setLoading(false)
    }
    load()
  }, [codigo, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-emerald-900 flex items-center justify-center">
        <div className="text-white text-lg animate-pulse">Cargando…</div>
      </div>
    )
  }

  const hoy = new Date()
  const proximos = partidos.filter((p) => p.estado === 'pendiente').slice(0, 3)
  const sinPrediccion = partidos.filter((p) => p.estado === 'pendiente' && !p.prediccion).length
  const puntosTotal = partidos.reduce((s, p) => s + (p.prediccion?.puntos ?? 0), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-emerald-800 text-white px-4 py-5">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h1 className="text-xl font-bold">{grupo?.nombre}</h1>
              <p className="text-emerald-300 text-xs">Código: <span className="font-mono font-bold">{codigo}</span></p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{puntosTotal}</div>
              <div className="text-emerald-300 text-xs">tus puntos</div>
            </div>
          </div>
          <p className="text-emerald-200 text-sm mt-2">Hola, <strong>{jugador?.nombre}</strong> 👋</p>
        </div>
      </div>

      {/* Nav */}
      <div className="bg-emerald-700 text-white">
        <div className="max-w-lg mx-auto flex">
          <Link href={`/grupo/${codigo}`} className="flex-1 text-center py-2.5 text-sm font-medium border-b-2 border-white">
            Inicio
          </Link>
          <Link href={`/grupo/${codigo}/predicciones`} className="flex-1 text-center py-2.5 text-sm text-emerald-200 hover:text-white">
            Predicciones {sinPrediccion > 0 && <span className="ml-1 bg-amber-400 text-emerald-900 text-xs rounded-full px-1.5">{sinPrediccion}</span>}
          </Link>
          <Link href={`/grupo/${codigo}/tabla`} className="flex-1 text-center py-2.5 text-sm text-emerald-200 hover:text-white">
            Tabla
          </Link>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Alerta predicciones pendientes */}
        {sinPrediccion > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-amber-800 text-sm">Tienes {sinPrediccion} partido{sinPrediccion !== 1 ? 's' : ''} sin predecir</p>
              <p className="text-amber-600 text-xs mt-0.5">Cierra 1 hora antes del partido</p>
            </div>
            <Link href={`/grupo/${codigo}/predicciones`} className="bg-amber-500 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-amber-600">
              Predecir
            </Link>
          </div>
        )}

        {/* Próximos partidos */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Próximos partidos</h2>
          {proximos.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-4">No hay partidos próximos</p>
          ) : (
            <div className="flex flex-col gap-2">
              {proximos.map((p) => {
                const fecha = new Date(p.fecha)
                const minutosRestantes = (fecha.getTime() - hoy.getTime()) / 60000
                const bloqueado = minutosRestantes < 60
                return (
                  <div key={p.id} className="bg-white rounded-xl border p-4">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                      <span>{fecha.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })} {fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                      {bloqueado && <span className="text-amber-500 text-xs">Cierra pronto</span>}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="flex-1 font-medium">{p.equipo_local}</span>
                      {p.prediccion
                        ? <span className="text-emerald-700 font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded">{p.prediccion.goles_local}-{p.prediccion.goles_visitante}</span>
                        : <span className="text-gray-300 text-xs">vs</span>
                      }
                      <span className="flex-1 font-medium text-right">{p.equipo_visitante}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Info puntuación */}
        <section className="bg-white rounded-xl border p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Sistema de puntos</h2>
          <div className="flex gap-4 text-sm text-gray-600">
            <div><span className="font-bold text-emerald-700">{grupo?.pts_exacto} pts</span> resultado exacto</div>
            <div><span className="font-bold text-emerald-600">{grupo?.pts_ganador} pt</span> ganador/empate</div>
          </div>
        </section>

        <button
          onClick={() => { localStorage.removeItem('quiniela_jugador'); router.replace('/') }}
          className="text-xs text-gray-400 text-center hover:text-gray-600"
        >
          Salir del grupo
        </button>
      </div>
    </div>
  )
}
