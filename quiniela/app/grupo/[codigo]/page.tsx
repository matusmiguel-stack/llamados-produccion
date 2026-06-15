'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useGrupo } from '@/context/grupo-context'

interface Partido {
  id: string; equipo_local: string; equipo_visitante: string
  fecha: string; estado: string
  prediccion: { goles_local: number; goles_visitante: number; puntos: number | null } | null
}

export default function GrupoPage() {
  const { jugadorId, jugadorNombre, grupoCodigo: codigo, grupo, setSinPrediccion, openUnirse } = useGrupo()

  const [partidos,     setPartidos]     = useState<Partido[]>([])
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/partidos?jugador_id=${jugadorId}`)
      const data: Partido[] = await res.json()
      setPartidos(data)
      const sin = data.filter((p) => p.estado === 'pendiente' && !p.prediccion).length
      setSinPrediccion(sin)
      setLoading(false)
    }
    load()
  }, [jugadorId, setSinPrediccion])

  const hoy         = new Date()
  const proximos    = partidos.filter((p) => p.estado === 'pendiente').slice(0, 3)
  const sinPred     = partidos.filter((p) => p.estado === 'pendiente' && !p.prediccion).length
  const puntosTotal = partidos.reduce((s, p) => s + (p.prediccion?.puntos ?? 0), 0)

  return (
    <div className="max-w-lg mx-auto px-4 py-5 flex flex-col gap-5">

      {/* Stats */}
      <div className="relative bg-white/4 border border-white/8 rounded-2xl p-4 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/30 to-transparent" />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/30 text-xs uppercase tracking-wider">Jugador</p>
            <p className="text-white font-semibold text-sm mt-0.5">{jugadorNombre}</p>
          </div>
          <div className="text-center">
            <p className="text-white/30 text-xs uppercase tracking-wider">Mis puntos</p>
            <p className="text-3xl font-bold text-amber-300 leading-tight">{puntosTotal}</p>
          </div>
          {grupo.entrada > 0 && (
            <div className="text-right">
              <p className="text-white/30 text-xs uppercase tracking-wider">Premio</p>
              <p className="text-xl font-bold text-amber-200 leading-tight">${(grupo.num_jugadores * grupo.entrada).toLocaleString('es-MX')}</p>
              <p className="text-xs text-amber-400/50 mt-0.5">🥇 ${Math.floor(grupo.num_jugadores * grupo.entrada * 0.7).toLocaleString('es-MX')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Alerta predicciones */}
      {sinPred > 0 && (
        <div className="relative overflow-hidden bg-amber-500/8 border border-amber-400/20 rounded-2xl p-4 flex items-center justify-between">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
          <div>
            <p className="font-semibold text-amber-200 text-sm">{sinPred} partido{sinPred !== 1 ? 's' : ''} sin predecir</p>
            <p className="text-amber-400/60 text-xs mt-0.5">Cierra 1h antes del partido</p>
          </div>
          <Link
            href={`/grupo/${codigo}/predicciones`}
            className="bg-amber-500 hover:bg-amber-400 text-white text-sm px-4 py-2 rounded-xl font-medium transition-colors shadow-lg shadow-amber-900/30"
          >
            Predecir
          </Link>
        </div>
      )}

      {/* Próximos partidos */}
      {!loading && (
        <section>
          <h2 className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-3">Próximos partidos</h2>
          {proximos.length === 0 ? (
            <p className="text-white/20 text-sm text-center py-6">No hay partidos próximos</p>
          ) : (
            <div className="flex flex-col gap-2">
              {proximos.map((p) => {
                const fecha = new Date(p.fecha)
                const minutosRestantes = (fecha.getTime() - hoy.getTime()) / 60000
                return (
                  <div key={p.id} className="relative bg-white/4 border border-white/8 rounded-2xl p-4 overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    <div className="flex items-center justify-between text-xs text-white/25 mb-2.5">
                      <span>{fecha.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })} · {fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                      {minutosRestantes < 60 && <span className="text-amber-400 font-medium">Cierra pronto</span>}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-white">
                      <span className="flex-1 font-medium">{p.equipo_local}</span>
                      {p.prediccion
                        ? <span className="text-amber-300 font-bold text-xs bg-amber-500/15 border border-amber-400/20 px-2.5 py-1 rounded-lg">{p.prediccion.goles_local}-{p.prediccion.goles_visitante}</span>
                        : <span className="text-white/15 text-xs px-2">vs</span>
                      }
                      <span className="flex-1 font-medium text-right">{p.equipo_visitante}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Acciones */}
      <div className="flex gap-3">
        <button
          onClick={openUnirse}
          className="flex-1 flex items-center gap-2 justify-center bg-white/4 border border-white/8 hover:border-amber-400/20 hover:bg-amber-500/6 rounded-2xl p-4 transition-all group"
        >
          <span className="text-white/40 text-lg">＋</span>
          <div className="text-left">
            <p className="text-white/70 text-sm font-medium group-hover:text-white transition-colors">Unirse a grupo</p>
            <p className="text-white/25 text-xs">Con un código</p>
          </div>
        </button>
        <Link
          href="/crear"
          className="flex-1 flex items-center gap-2 justify-center bg-white/4 border border-white/8 hover:border-amber-400/20 hover:bg-amber-500/6 rounded-2xl p-4 transition-all group"
        >
          <span className="text-amber-400/70 text-lg">✦</span>
          <div className="text-left">
            <p className="text-white/70 text-sm font-medium group-hover:text-white transition-colors">Crear grupo</p>
            <p className="text-white/25 text-xs">Invita amigos</p>
          </div>
        </Link>
      </div>

      {/* Sistema de puntos */}
      <div className="relative bg-white/4 border border-white/8 rounded-2xl p-4 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/20 to-transparent" />
        <h2 className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-3">Sistema de puntos</h2>
        <div className="flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-amber-300 font-bold text-lg">{grupo.pts_exacto}</span>
            <span className="text-white/40 text-xs">resultado<br/>exacto</span>
          </div>
          <div className="w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <span className="text-amber-200/80 font-bold text-lg">{grupo.pts_ganador}</span>
            <span className="text-white/40 text-xs">ganador<br/>o empate</span>
          </div>
        </div>
      </div>
    </div>
  )
}
