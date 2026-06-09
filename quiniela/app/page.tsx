'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function Home() {
  const router = useRouter()
  const [tab, setTab] = useState<'unirse' | 'crear'>('unirse')

  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [loadingUnirse, setLoadingUnirse] = useState(false)
  const [errorUnirse, setErrorUnirse] = useState('')

  const [nombreGrupo, setNombreGrupo] = useState('')
  const [ptsExacto, setPtsExacto] = useState('3')
  const [ptsGanador, setPtsGanador] = useState('1')
  const [loadingCrear, setLoadingCrear] = useState(false)
  const [errorCrear, setErrorCrear] = useState('')
  const [codigoCreado, setCodigoCreado] = useState('')
  const [nombreJugadorNuevo, setNombreJugadorNuevo] = useState('')

  const handleUnirse = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!codigo.trim() || !nombre.trim()) return
    setLoadingUnirse(true)
    setErrorUnirse('')
    try {
      const grupoRes = await fetch(`/api/grupo?codigo=${codigo.trim().toUpperCase()}`)
      if (!grupoRes.ok) { setErrorUnirse('Código de grupo no encontrado'); return }
      const grupo = await grupoRes.json()
      const jugadorRes = await fetch('/api/grupo/jugador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim(), grupo_id: grupo.id }),
      })
      if (!jugadorRes.ok) { setErrorUnirse('Error al unirse'); return }
      const jugador = await jugadorRes.json()
      localStorage.setItem('quiniela_jugador', JSON.stringify({ id: jugador.id, nombre: jugador.nombre, grupo_id: grupo.id }))
      router.push(`/grupo/${grupo.codigo}`)
    } finally {
      setLoadingUnirse(false)
    }
  }

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombreGrupo.trim()) return
    setLoadingCrear(true)
    setErrorCrear('')
    try {
      const res = await fetch('/api/grupo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombreGrupo.trim(), pts_exacto: parseInt(ptsExacto) || 3, pts_ganador: parseInt(ptsGanador) || 1 }),
      })
      if (!res.ok) { setErrorCrear('Error creando el grupo'); return }
      const grupo = await res.json()
      setCodigoCreado(grupo.codigo)
    } finally {
      setLoadingCrear(false)
    }
  }

  const handleEntrarGrupoNuevo = async () => {
    if (!nombreJugadorNuevo.trim() || !codigoCreado) return
    const grupoRes = await fetch(`/api/grupo?codigo=${codigoCreado}`)
    const grupo = await grupoRes.json()
    const jugadorRes = await fetch('/api/grupo/jugador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: nombreJugadorNuevo.trim(), grupo_id: grupo.id }),
    })
    const jugador = await jugadorRes.json()
    localStorage.setItem('quiniela_jugador', JSON.stringify({ id: jugador.id, nombre: jugador.nombre, grupo_id: grupo.id }))
    router.push(`/grupo/${codigoCreado}`)
  }

  const inputClass = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-violet-500/60 focus:bg-white/8 transition-colors"
  const btnPrimary = "w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors"

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <Image src="/logo-retro.png" alt="Retro" width={120} height={40} className="object-contain" priority />
          <div className="flex items-center gap-2 text-white/50 text-sm">
            <span>⚽</span>
            <span>Quiniela Mundial 2026</span>
          </div>
        </div>

        {/* Card */}
        <div className="w-full bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-white/10">
            {(['unirse', 'crear'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  tab === t
                    ? 'text-white border-b-2 border-violet-400 bg-white/5'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                {t === 'unirse' ? 'Unirse a grupo' : 'Crear grupo'}
              </button>
            ))}
          </div>

          <div className="p-6">
            {tab === 'unirse' && (
              <form onSubmit={handleUnirse} className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-medium text-white/50 block mb-1.5">Código del grupo</label>
                  <input
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                    placeholder="ej. AB12CD"
                    maxLength={6}
                    className={`${inputClass} text-xl font-mono tracking-widest text-center`}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-white/50 block mb-1.5">Tu nombre</label>
                  <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="¿Cómo te llamas?" className={inputClass} />
                </div>
                {errorUnirse && <p className="text-red-400 text-sm">{errorUnirse}</p>}
                <button type="submit" disabled={loadingUnirse || !codigo || !nombre} className={btnPrimary}>
                  {loadingUnirse ? 'Entrando…' : 'Entrar'}
                </button>
              </form>
            )}

            {tab === 'crear' && !codigoCreado && (
              <form onSubmit={handleCrear} className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-medium text-white/50 block mb-1.5">Nombre del grupo</label>
                  <input value={nombreGrupo} onChange={(e) => setNombreGrupo(e.target.value)} placeholder="ej. Familia García" className={inputClass} />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-white/50 block mb-1.5">Pts exacto</label>
                    <input type="number" min="1" max="10" value={ptsExacto} onChange={(e) => setPtsExacto(e.target.value)} className={`${inputClass} text-center`} />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-medium text-white/50 block mb-1.5">Pts ganador</label>
                    <input type="number" min="0" max="10" value={ptsGanador} onChange={(e) => setPtsGanador(e.target.value)} className={`${inputClass} text-center`} />
                  </div>
                </div>
                {errorCrear && <p className="text-red-400 text-sm">{errorCrear}</p>}
                <button type="submit" disabled={loadingCrear || !nombreGrupo} className={btnPrimary}>
                  {loadingCrear ? 'Creando…' : 'Crear grupo'}
                </button>
              </form>
            )}

            {tab === 'crear' && codigoCreado && (
              <div className="flex flex-col gap-5">
                <div className="text-center">
                  <p className="text-white/50 text-sm mb-2">¡Grupo creado! Comparte este código:</p>
                  <div className="text-4xl font-mono font-bold text-violet-300 tracking-widest my-3">{codigoCreado}</div>
                  <button onClick={() => navigator.clipboard.writeText(codigoCreado)} className="text-xs text-violet-400 hover:text-violet-300 underline">
                    Copiar código
                  </button>
                </div>
                <div className="border-t border-white/10 pt-4">
                  <label className="text-xs font-medium text-white/50 block mb-1.5">Tu nombre para entrar</label>
                  <input value={nombreJugadorNuevo} onChange={(e) => setNombreJugadorNuevo(e.target.value)} placeholder="¿Cómo te llamas?" className={`${inputClass} mb-3`} />
                  <button onClick={handleEntrarGrupoNuevo} disabled={!nombreJugadorNuevo} className={btnPrimary}>
                    Entrar a mi grupo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
