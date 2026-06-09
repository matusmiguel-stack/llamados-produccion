'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

interface Jugador { id: string; nombre: string; grupo_id: string }
interface Grupo { id: string; nombre: string; codigo: string; pts_exacto: number; pts_ganador: number }
interface Partido {
  id: string; equipo_local: string; equipo_visitante: string; bandera_local: string
  bandera_visitante: string; fecha: string; estado: string; goles_local: number | null
  goles_visitante: number | null
  prediccion: { goles_local: number; goles_visitante: number; puntos: number | null } | null
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white/40 animate-pulse">Cargando…</div>
      </div>
    )
  }

  const hoy = new Date()
  const proximos = partidos.filter((p) => p.estado === 'pendiente').slice(0, 3)
  const sinPrediccion = partidos.filter((p) => p.estado === 'pendiente' && !p.prediccion).length
  const puntosTotal = partidos.reduce((s, p) => s + (p.prediccion?.puntos ?? 0), 0)

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-white/10 bg-white/3 backdrop-blur-sm px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo-retro.png" alt="Retro" width={80} height={26} className="object-contain opacity-90" />
            <div className="w-px h-6 bg-white/15" />
            <div>
              <p className="text-white font-semibold text-sm leading-tight">{grupo?.nombre}</p>
              <p className="text-white/40 text-xs font-mono">{codigo}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-violet-300">{puntosTotal}</div>
            <div className="text-white/40 text-xs">tus pts</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="border-b border-white/10 bg-white/2">
        <div className="max-w-lg mx-auto flex">
          {[
            { href: `/grupo/${codigo}`, label: 'Inicio' },
            { href: `/grupo/${codigo}/predicciones`, label: `Predicciones${sinPrediccion > 0 ? ` (${sinPrediccion})` : ''}` },
            { href: `/grupo/${codigo}/tabla`, label: 'Tabla' },
          ].map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 text-center py-3 text-sm transition-colors ${i === 0 ? 'text-white border-b-2 border-violet-400' : 'text-white/40 hover:text-white/70'}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-5">
        <p className="text-white/50 text-sm">Hola, <span className="text-white font-medium">{jugador?.nombre}</span> 👋</p>

        {/* Alerta */}
        {sinPrediccion > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-amber-300 text-sm">{sinPrediccion} partido{sinPrediccion !== 1 ? 's' : ''} sin predecir</p>
              <p className="text-amber-400/70 text-xs mt-0.5">Cierra 1h antes del partido</p>
            </div>
            <Link href={`/grupo/${codigo}/predicciones`} className="bg-amber-500 hover:bg-amber-400 text-white text-sm px-4 py-1.5 rounded-lg transition-colors">
              Predecir
            </Link>
          </div>
        )}

        {/* Próximos */}
        <section>
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Próximos partidos</h2>
          {proximos.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-4">No hay partidos próximos</p>
          ) : (
            <div className="flex flex-col gap-2">
              {proximos.map((p) => {
                const fecha = new Date(p.fecha)
                const minutosRestantes = (fecha.getTime() - hoy.getTime()) / 60000
                return (
                  <div key={p.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <div className="flex items-center justify-between text-xs text-white/30 mb-2">
                      <span>{fecha.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })} · {fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                      {minutosRestantes < 60 && <span className="text-amber-400">Cierra pronto</span>}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-white">
                      <span className="flex-1 font-medium">{p.equipo_local}</span>
                      {p.prediccion
                        ? <span className="text-violet-300 font-bold text-xs bg-violet-500/15 px-2 py-0.5 rounded">{p.prediccion.goles_local}-{p.prediccion.goles_visitante}</span>
                        : <span className="text-white/20 text-xs">vs</span>
                      }
                      <span className="flex-1 font-medium text-right">{p.equipo_visitante}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Puntos */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">Sistema de puntos</h2>
          <div className="flex gap-5 text-sm text-white/60">
            <span><span className="text-violet-300 font-bold">{grupo?.pts_exacto} pts</span> resultado exacto</span>
            <span><span className="text-violet-200 font-bold">{grupo?.pts_ganador} pt</span> ganador/empate</span>
          </div>
        </div>

        <button
          onClick={() => { localStorage.removeItem('quiniela_jugador'); router.replace('/') }}
          className="text-xs text-white/20 text-center hover:text-white/40 transition-colors"
        >
          Salir del grupo
        </button>
      </div>
    </div>
  )
}
