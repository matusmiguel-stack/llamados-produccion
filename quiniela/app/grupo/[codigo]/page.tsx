'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

interface Jugador { id: string; nombre: string }
interface Grupo { id: string; nombre: string; codigo: string; pts_exacto: number; pts_ganador: number; entrada: number; num_jugadores: number }
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
  const [showUnirse, setShowUnirse] = useState(false)
  const [codigoUnirse, setCodigoUnirse] = useState('')
  const [uniendose, setUniendose] = useState(false)
  const [errorUnirse, setErrorUnirse] = useState('')
  const [misGrupos, setMisGrupos] = useState<{ codigo: string; nombre: string }[]>([])
  const [showGrupos, setShowGrupos] = useState(false)
  const [saliendose, setSaliendose] = useState(false)

  useEffect(() => {
    const load = async () => {
      const supabase = createSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      // Primero obtenemos el grupo para tener su ID y filtrar el jugador correcto
      const grupoRes = await fetch(`/api/grupo?codigo=${codigo}`)
      if (!grupoRes.ok) { router.replace('/login'); return }
      const g = await grupoRes.json()
      setGrupo(g)
      const res = await fetch(`/api/auth/jugador?user_id=${user.id}&grupo_id=${g.id}`)
      if (!res.ok) { router.replace('/login'); return }
      const j = await res.json()
      setJugador(j)
      const [partidosRes, gruposRes] = await Promise.all([
        fetch(`/api/partidos?jugador_id=${j.id}`),
        fetch(`/api/auth/mis-grupos?user_id=${user.id}`),
      ])
      setPartidos(await partidosRes.json())
      if (gruposRes.ok) setMisGrupos(await gruposRes.json())
      setLoading(false)
    }
    load()
  }, [codigo, router])

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  const handleSalirGrupo = async () => {
    if (!jugador) return
    if (!confirm(`¿Salir del grupo "${grupo?.nombre}"? Se borrarán tus predicciones en este grupo.`)) return
    setSaliendose(true)
    await fetch(`/api/grupo/jugador?jugador_id=${jugador.id}`, { method: 'DELETE' })
    setSaliendose(false)
    const otroGrupo = misGrupos.find((g) => g.codigo !== codigo)
    if (otroGrupo) router.replace(`/grupo/${otroGrupo.codigo}`)
    else router.replace('/mi-grupo')
  }

  const handleUnirse = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!codigoUnirse.trim() || !jugador) return
    setUniendose(true)
    setErrorUnirse('')
    try {
      const res = await fetch('/api/grupo/jugador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: codigoUnirse.trim().toUpperCase(), jugador_id: jugador.id }),
      })
      const data = await res.json()
      if (!res.ok) { setErrorUnirse(data.error ?? 'Error al unirse'); return }
      router.push(`/grupo/${codigoUnirse.trim().toUpperCase()}`)
    } finally {
      setUniendose(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Image src="/logo-quiniela.png" alt="" width={48} height={48} className="object-contain opacity-40 animate-pulse" />
        </div>
      </div>
    )
  }

  const hoy = new Date()
  const proximos = partidos.filter((p) => p.estado === 'pendiente').slice(0, 3)
  const sinPrediccion = partidos.filter((p) => p.estado === 'pendiente' && !p.prediccion).length
  const puntosTotal = partidos.reduce((s, p) => s + (p.prediccion?.puntos ?? 0), 0)

  return (
    <div className="min-h-screen">
      {/* Modal unirse a otro grupo */}
      {showUnirse && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-xs">
            <h2 className="text-white font-semibold mb-1">Unirse a otro grupo</h2>
            <p className="text-white/30 text-xs mb-4">Ingresa el código que te compartieron</p>
            <form onSubmit={handleUnirse} className="flex flex-col gap-3">
              <input
                value={codigoUnirse}
                onChange={(e) => setCodigoUnirse(e.target.value.toUpperCase())}
                placeholder="Ej: ABC123"
                maxLength={6}
                className="w-full bg-white/6 border border-white/12 rounded-xl px-4 py-3 text-white placeholder-white/20 font-mono text-center text-xl tracking-widest focus:outline-none focus:border-amber-400/50 uppercase"
                autoFocus
              />
              {errorUnirse && <p className="text-red-400 text-sm text-center">{errorUnirse}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowUnirse(false); setCodigoUnirse(''); setErrorUnirse('') }}
                  className="flex-1 bg-white/6 hover:bg-white/10 text-white/50 font-medium py-2.5 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uniendose || codigoUnirse.length < 4}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors"
                >
                  {uniendose ? 'Uniéndome…' : 'Unirme'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Línea dorada top */}
      <div className="h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

      {/* Header premium */}
      <div className="bg-black/30 backdrop-blur-md border-b border-white/8 px-4 py-4">
        <div className="max-w-lg mx-auto">
          {/* Logo + grupo centrado */}
          <div className="flex flex-col items-center gap-2 mb-4">
            <div className="relative">
              <div className="absolute inset-0 blur-2xl bg-amber-400/15 rounded-full scale-150" />
              <Image src="/logo-quiniela.png" alt="Quiniela" width={100} height={100} className="relative object-contain drop-shadow-2xl" />
            </div>
            <div className="text-center">
              <p className="text-white font-bold text-lg tracking-tight">{grupo?.nombre}</p>
              <p className="text-white/30 text-xs font-mono tracking-widest">{codigo}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between">
            <div className="text-center">
              <p className="text-xs text-white/30 uppercase tracking-wider">Jugador</p>
              <p className="text-white font-medium text-sm mt-0.5">{jugador?.nombre}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-white/30 uppercase tracking-wider">Mis puntos</p>
              <p className="text-2xl font-bold text-amber-300 leading-tight">{puntosTotal}</p>
            </div>
            {grupo && grupo.entrada > 0 && (
              <div className="text-center">
                <p className="text-xs text-white/30 uppercase tracking-wider">Premio acumulado</p>
                <p className="text-2xl font-bold text-amber-200 leading-tight">${(grupo.num_jugadores * grupo.entrada).toLocaleString('es-MX')}</p>
                <p className="text-xs text-amber-400/50 mt-0.5">🥇 ${Math.floor(grupo.num_jugadores * grupo.entrada * 0.7).toLocaleString('es-MX')}</p>
                <p className="text-xs text-white/25">🥈 ${Math.floor(grupo.num_jugadores * grupo.entrada * 0.3).toLocaleString('es-MX')}</p>
              </div>
            )}
            <div className="relative">
              <button onClick={() => setShowGrupos(!showGrupos)} className="text-white/30 hover:text-white/70 transition-colors text-xs flex flex-col items-center gap-1">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                <span>Mis Quinielas</span>
              </button>

              {showGrupos && (
                <>
                  {/* Overlay para cerrar al tocar fuera */}
                  <div className="fixed inset-0 z-[100] bg-black/60" onClick={() => setShowGrupos(false)} />
                  <div className="fixed right-4 top-20 w-64 z-[101] overflow-hidden rounded-2xl shadow-2xl" style={{background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.15)'}}>
                    {/* Línea dorada top */}
                    <div className="h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />

                    <div className="px-4 py-3 border-b border-white/8">
                      <p className="text-white/40 text-xs uppercase tracking-widest font-semibold">Mis quinielas</p>
                    </div>

                    {misGrupos.map((g) => (
                      <Link
                        key={g.codigo}
                        href={`/grupo/${g.codigo}`}
                        onClick={() => setShowGrupos(false)}
                        className={`flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-white/5 ${g.codigo === codigo ? 'bg-amber-500/8' : ''}`}
                      >
                        <div>
                          <p className={`text-sm font-semibold ${g.codigo === codigo ? 'text-amber-300' : 'text-white/70'}`}>{g.nombre}</p>
                          <p className="text-white/20 text-xs font-mono mt-0.5">{g.codigo}</p>
                        </div>
                        {g.codigo === codigo
                          ? <span className="text-amber-400/50 text-xs border border-amber-400/20 rounded-full px-2 py-0.5">actual</span>
                          : <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-white/20"><path d="M5 2.5L9.5 7L5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        }
                      </Link>
                    ))}

                    <div className="border-t border-white/8 mt-1">
                      <button
                        onClick={() => { setShowGrupos(false); setShowUnirse(true) }}
                        className="w-full text-left px-4 py-3.5 text-white/50 hover:text-white hover:bg-white/5 text-sm transition-colors flex items-center gap-2"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        Unirse a otra quiniela
                      </button>
                    </div>
                    <div className="border-t border-white/8">
                      <button
                        onClick={() => { setShowGrupos(false); handleSalirGrupo() }}
                        disabled={saliendose}
                        className="w-full text-left px-4 py-3.5 text-red-400/60 hover:text-red-400 hover:bg-red-500/5 text-sm transition-colors flex items-center gap-2"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2H11.5C12.05 2 12.5 2.45 12.5 3V11C12.5 11.55 12.05 12 11.5 12H9M6 9.5L9 7M9 7L6 4.5M9 7H1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        {saliendose ? 'Saliendo…' : 'Salir de este grupo'}
                      </button>
                      <button
                        onClick={() => { setShowGrupos(false); handleLogout() }}
                        className="w-full text-left px-4 py-3.5 text-white/25 hover:text-white/50 hover:bg-white/4 text-sm transition-colors flex items-center gap-2 border-t border-white/6"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2H2.5C1.95 2 1.5 2.45 1.5 3V11C1.5 11.55 1.95 12 2.5 12H5M8 9.5L5 7M5 7L8 4.5M5 7H12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Cerrar sesión
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="bg-black/20 border-b border-white/8">
        <div className="max-w-lg mx-auto flex">
          {[
            { href: `/grupo/${codigo}`, label: 'Inicio', active: true },
            { href: `/grupo/${codigo}/predicciones`, label: sinPrediccion > 0 ? `Predecir (${sinPrediccion})` : 'Predecir', active: false },
            { href: `/grupo/${codigo}/tabla`, label: 'Tabla', active: false },
            { href: `/grupo/${codigo}/calendario`, label: 'Calendario', active: false },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 text-center py-2.5 text-xs font-medium transition-colors leading-tight ${
                item.active
                  ? 'text-amber-300 border-b-2 border-amber-400'
                  : 'text-white/35 hover:text-white/70'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-5">
        {/* Alerta predicciones */}
        {sinPrediccion > 0 && (
          <div className="relative overflow-hidden bg-amber-500/8 border border-amber-400/20 rounded-2xl p-4 flex items-center justify-between">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
            <div>
              <p className="font-semibold text-amber-200 text-sm">{sinPrediccion} partido{sinPrediccion !== 1 ? 's' : ''} sin predecir</p>
              <p className="text-amber-400/60 text-xs mt-0.5">Cierra 1h antes del partido</p>
            </div>
            <Link href={`/grupo/${codigo}/predicciones`} className="bg-amber-500 hover:bg-amber-400 text-white text-sm px-4 py-2 rounded-xl font-medium transition-colors shadow-lg shadow-amber-900/30">
              Predecir
            </Link>
          </div>
        )}

        {/* Próximos partidos */}
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

        {/* Acciones de grupo */}
        <div className="flex gap-3">
          <button
            onClick={() => setShowUnirse(true)}
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
              <span className="text-amber-300 font-bold text-lg">{grupo?.pts_exacto}</span>
              <span className="text-white/40 text-xs">resultado<br/>exacto</span>
            </div>
            <div className="w-px bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="text-amber-200/80 font-bold text-lg">{grupo?.pts_ganador}</span>
              <span className="text-white/40 text-xs">ganador<br/>o empate</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
