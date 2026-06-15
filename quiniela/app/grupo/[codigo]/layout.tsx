'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { GrupoContext, GrupoInfo } from '@/context/grupo-context'

export default function GrupoLayout({ children }: { children: React.ReactNode }) {
  const params   = useParams()
  const router   = useRouter()
  const pathname = usePathname()
  const codigo   = params.codigo as string

  const [grupo,          setGrupo]          = useState<GrupoInfo | null>(null)
  const [jugadorId,      setJugadorId]      = useState<string | null>(null)
  const [jugadorNombre,  setJugadorNombre]  = useState('')
  const [misGrupos,      setMisGrupos]      = useState<{ codigo: string; nombre: string }[]>([])
  const [sinPrediccion,  setSinPrediccion]  = useState(0)
  const [showGrupos,     setShowGrupos]     = useState(false)
  const [showUnirse,     setShowUnirse]     = useState(false)
  const [codigoUnirse,   setCodigoUnirse]   = useState('')
  const [uniendose,      setUniendose]      = useState(false)
  const [errorUnirse,    setErrorUnirse]    = useState('')
  const [saliendose,     setSaliendose]     = useState(false)
  const [ready,          setReady]          = useState(false)

  useEffect(() => {
    setReady(false)
    const init = async () => {
      const supabase = createSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const [grupoRes, gruposRes] = await Promise.all([
        fetch(`/api/grupo?codigo=${codigo}`),
        fetch(`/api/auth/mis-grupos?user_id=${user.id}`),
      ])
      if (!grupoRes.ok) { router.replace('/login'); return }
      const g: GrupoInfo = await grupoRes.json()
      setGrupo(g)
      if (gruposRes.ok) setMisGrupos(await gruposRes.json())

      const jugadorRes = await fetch(`/api/auth/jugador?user_id=${user.id}&grupo_id=${g.id}`)
      if (!jugadorRes.ok) { router.replace('/login'); return }
      const j = await jugadorRes.json()
      setJugadorId(j.id)
      setJugadorNombre(j.nombre)
      setReady(true)
    }
    init()
  }, [codigo, router])

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  const handleSalirGrupo = async () => {
    if (!jugadorId || !grupo) return
    if (!confirm(`¿Salir del grupo "${grupo.nombre}"? Se borrarán tus predicciones en este grupo.`)) return
    setSaliendose(true)
    await fetch(`/api/grupo/jugador?jugador_id=${jugadorId}`, { method: 'DELETE' })
    setSaliendose(false)
    const otro = misGrupos.find((g) => g.codigo !== codigo)
    if (otro) router.replace(`/grupo/${otro.codigo}`)
    else router.replace('/mi-grupo')
  }

  const handleUnirse = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!codigoUnirse.trim() || !jugadorId) return
    setUniendose(true)
    setErrorUnirse('')
    try {
      const res = await fetch('/api/grupo/jugador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: codigoUnirse.trim().toUpperCase(), jugador_id: jugadorId }),
      })
      const data = await res.json()
      if (!res.ok) { setErrorUnirse(data.error ?? 'Error al unirse'); return }
      setShowUnirse(false)
      setCodigoUnirse('')
      router.push(`/grupo/${codigoUnirse.trim().toUpperCase()}`)
    } finally {
      setUniendose(false)
    }
  }

  const base            = `/grupo/${codigo}`
  const isHome          = pathname === base
  const isPredicciones  = pathname.startsWith(`${base}/predicciones`)
  const isTabla         = pathname.startsWith(`${base}/tabla`)
  const isCalendario    = pathname.startsWith(`${base}/calendario`)

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Image src="/logo-quiniela.png" alt="" width={48} height={48} className="object-contain opacity-40 animate-pulse" />
      </div>
    )
  }

  return (
    <GrupoContext.Provider value={{
      grupoId:       grupo!.id,
      jugadorId:     jugadorId!,
      jugadorNombre,
      grupoCodigo:   codigo,
      grupoNombre:   grupo!.nombre,
      grupo:         grupo!,
      misGrupos,
      sinPrediccion,
      setSinPrediccion,
      openUnirse:    () => setShowUnirse(true),
    }}>
      {/* Modal unirse */}
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

      {/* ── Header persistente ── */}
      <div className="h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

      <div className="bg-black/30 backdrop-blur-md border-b border-white/8 px-4 pt-3 pb-0 sticky top-0 z-40">
        <div className="max-w-lg mx-auto">

          {/* Logo + nombre + menú */}
          <div className="flex items-center gap-3 pb-3">
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 blur-xl bg-amber-400/20 rounded-full scale-150" />
              <Image
                src="/logo-quiniela.png"
                alt="Quiniela"
                width={40}
                height={40}
                className="relative object-contain drop-shadow-xl"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm leading-tight truncate">{grupo?.nombre}</p>
              <p className="text-white/25 text-xs font-mono tracking-widest">{codigo}</p>
            </div>

            {/* Mis Quinielas */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowGrupos(!showGrupos)}
                className="text-white/30 hover:text-white/70 transition-colors text-xs flex flex-col items-center gap-0.5 p-1"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span>Mis Quinielas</span>
              </button>

              {showGrupos && (
                <>
                  <div className="fixed inset-0 z-[100] bg-black/60" onClick={() => setShowGrupos(false)} />
                  <div className="fixed right-4 top-20 w-64 z-[101] overflow-hidden rounded-2xl shadow-2xl"
                    style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.15)' }}>
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

          {/* Nav tabs */}
          <div className="flex">
            {[
              { href: base,              label: 'Inicio',     active: isHome },
              { href: `${base}/predicciones`, label: sinPrediccion > 0 ? `Predecir (${sinPrediccion})` : 'Predecir', active: isPredicciones },
              { href: `${base}/tabla`,   label: 'Tabla',      active: isTabla },
              { href: `${base}/calendario`, label: 'Calendario', active: isCalendario },
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
      </div>

      {children}
    </GrupoContext.Provider>
  )
}
