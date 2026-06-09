'use client'

import { useState } from 'react'
import Image from 'next/image'

interface Grupo {
  id: string
  codigo: string
  nombre: string
  pts_exacto: number
  pts_ganador: number
  created_at: string
}

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [autenticado, setAutenticado] = useState(false)
  const [errorAuth, setErrorAuth] = useState('')

  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [nombreGrupo, setNombreGrupo] = useState('')
  const [ptsExacto, setPtsExacto] = useState('3')
  const [ptsGanador, setPtsGanador] = useState('1')
  const [creando, setCreando] = useState(false)
  const [errorCrear, setErrorCrear] = useState('')
  const [copiado, setCopiado] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) { setErrorAuth('Contraseña incorrecta'); return }
    setAutenticado(true)
    cargarGrupos()
  }

  const cargarGrupos = async () => {
    const res = await fetch(`/api/admin/grupos?password=${encodeURIComponent(password)}`)
    if (res.ok) setGrupos(await res.json())
  }

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombreGrupo.trim()) return
    setCreando(true)
    setErrorCrear('')
    try {
      const res = await fetch('/api/admin/grupos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          nombre: nombreGrupo.trim(),
          pts_exacto: parseInt(ptsExacto) || 3,
          pts_ganador: parseInt(ptsGanador) || 1,
        }),
      })
      if (!res.ok) { setErrorCrear('Error creando grupo'); return }
      setNombreGrupo('')
      cargarGrupos()
    } finally {
      setCreando(false)
    }
  }

  const copiar = (codigo: string) => {
    navigator.clipboard.writeText(codigo)
    setCopiado(codigo)
    setTimeout(() => setCopiado(null), 2000)
  }

  const handleEliminar = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar el grupo "${nombre}"? Se borrarán todos sus jugadores y predicciones.`)) return
    setEliminando(id)
    await fetch(`/api/admin/grupos?password=${encodeURIComponent(password)}&id=${id}`, { method: 'DELETE' })
    setEliminando(null)
    cargarGrupos()
  }

  const inputClass = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-violet-500/60 transition-colors"

  if (!autenticado) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-xs flex flex-col items-center gap-8">
          <Image src="/logo-retro.png" alt="Retro" width={100} height={34} className="object-contain opacity-80" priority />
          <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="text-white font-semibold mb-4">Admin</h2>
            <form onSubmit={handleLogin} className="flex flex-col gap-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                className={inputClass}
                autoFocus
              />
              {errorAuth && <p className="text-red-400 text-sm">{errorAuth}</p>}
              <button
                type="submit"
                disabled={!password}
                className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors"
              >
                Entrar
              </button>
            </form>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-lg mx-auto flex flex-col gap-6 pt-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo-retro.png" alt="Retro" width={80} height={26} className="object-contain opacity-80" />
            <span className="text-white/40 text-sm">Admin · Quiniela</span>
          </div>
        </div>

        {/* Crear grupo */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h2 className="text-white font-semibold mb-4">Crear grupo</h2>
          <form onSubmit={handleCrear} className="flex flex-col gap-3">
            <input
              value={nombreGrupo}
              onChange={(e) => setNombreGrupo(e.target.value)}
              placeholder="Nombre del grupo"
              className={inputClass}
            />
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-white/40 block mb-1">Pts exacto</label>
                <input type="number" min="1" max="10" value={ptsExacto} onChange={(e) => setPtsExacto(e.target.value)} className={`${inputClass} text-center`} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-white/40 block mb-1">Pts ganador</label>
                <input type="number" min="0" max="10" value={ptsGanador} onChange={(e) => setPtsGanador(e.target.value)} className={`${inputClass} text-center`} />
              </div>
            </div>
            {errorCrear && <p className="text-red-400 text-sm">{errorCrear}</p>}
            <button
              type="submit"
              disabled={creando || !nombreGrupo}
              className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors"
            >
              {creando ? 'Creando…' : 'Crear grupo'}
            </button>
          </form>
        </div>

        {/* Lista de grupos */}
        <div>
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">
            Grupos ({grupos.length})
          </h2>
          {grupos.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-6">No hay grupos todavía</p>
          ) : (
            <div className="flex flex-col gap-2">
              {grupos.map((g) => (
                <div key={g.id} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium text-sm">{g.nombre}</p>
                    <p className="text-white/30 text-xs mt-0.5">{g.pts_exacto} pts exacto · {g.pts_ganador} pt ganador</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-violet-300 tracking-widest text-lg">{g.codigo}</span>
                    <button
                      onClick={() => copiar(g.codigo)}
                      className="text-xs text-white/30 hover:text-white/70 transition-colors"
                    >
                      {copiado === g.codigo ? '✓' : 'copiar'}
                    </button>
                    <button
                      onClick={() => handleEliminar(g.id, g.nombre)}
                      disabled={eliminando === g.id}
                      className="text-xs text-red-500/50 hover:text-red-400 disabled:opacity-30 transition-colors"
                    >
                      {eliminando === g.id ? '…' : 'eliminar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
