'use client'

import { useState } from 'react'
import Image from 'next/image'

interface Grupo {
  id: string
  codigo: string
  nombre: string
  pts_exacto: number
  pts_ganador: number
  entrada: number
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
  const [entrada, setEntrada] = useState('100')
  const [creando, setCreando] = useState(false)
  const [errorCrear, setErrorCrear] = useState('')
  const [copiado, setCopiado] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState<string | null>(null)

  // Edición
  const [editando, setEditando] = useState<Grupo | null>(null)
  const [guardando, setGuardando] = useState(false)

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
          entrada: parseInt(entrada) || 0,
        }),
      })
      if (!res.ok) { setErrorCrear('Error creando grupo'); return }
      setNombreGrupo('')
      cargarGrupos()
    } finally {
      setCreando(false)
    }
  }

  const handleGuardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editando) return
    setGuardando(true)
    try {
      const res = await fetch('/api/admin/grupos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          id: editando.id,
          nombre: editando.nombre,
          pts_exacto: editando.pts_exacto,
          pts_ganador: editando.pts_ganador,
          entrada: editando.entrada,
        }),
      })
      if (res.ok) {
        setEditando(null)
        cargarGrupos()
      }
    } finally {
      setGuardando(false)
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

  const inputClass = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-amber-500/60 transition-colors"

  if (!autenticado) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-xs flex flex-col items-center gap-8">
          <Image src="/logo-quiniela.png" alt="Quiniela" width={56} height={56} className="object-contain opacity-80" priority />
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
                className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors"
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
        <div className="flex items-center gap-3">
          <Image src="/logo-quiniela.png" alt="Quiniela" width={40} height={40} className="object-contain opacity-80" />
          <span className="text-white/40 text-sm">Admin · Quiniela</span>
        </div>

        {/* Modal editar */}
        {editando && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
              <h2 className="text-white font-semibold mb-4">Editar grupo</h2>
              <form onSubmit={handleGuardarEdicion} className="flex flex-col gap-3">
                <div>
                  <label className="text-xs text-white/40 block mb-1">Nombre</label>
                  <input
                    value={editando.nombre}
                    onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-white/40 block mb-1">Pts exacto</label>
                    <input type="number" min="1" max="10"
                      value={editando.pts_exacto}
                      onChange={(e) => setEditando({ ...editando, pts_exacto: parseInt(e.target.value) || 1 })}
                      className={`${inputClass} text-center`}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-white/40 block mb-1">Pts ganador</label>
                    <input type="number" min="0" max="10"
                      value={editando.pts_ganador}
                      onChange={(e) => setEditando({ ...editando, pts_ganador: parseInt(e.target.value) || 0 })}
                      className={`${inputClass} text-center`}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-white/40 block mb-1">Entrada por jugador ($MXN)</label>
                  <input type="number" min="0" step="50"
                    value={editando.entrada}
                    onChange={(e) => setEditando({ ...editando, entrada: parseInt(e.target.value) || 0 })}
                    className={inputClass}
                  />
                </div>
                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => setEditando(null)}
                    className="flex-1 bg-white/6 hover:bg-white/10 text-white/50 font-medium py-2.5 rounded-xl transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={guardando}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors"
                  >
                    {guardando ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

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
            <div>
              <label className="text-xs text-white/40 block mb-1">Entrada por jugador ($MXN)</label>
              <input
                type="number" min="0" step="50" value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                placeholder="Ej: 100"
                className={inputClass}
              />
            </div>
            {errorCrear && <p className="text-red-400 text-sm">{errorCrear}</p>}
            <button
              type="submit"
              disabled={creando || !nombreGrupo}
              className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors"
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
                <div key={g.id} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-medium text-sm truncate">{g.nombre}</p>
                    <p className="text-white/30 text-xs mt-0.5">
                      {g.pts_exacto}pts exacto · {g.pts_ganador}pt ganador
                      {g.entrada > 0 && <span className="text-amber-400/60"> · ${g.entrada} entrada</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="font-mono font-bold text-amber-300 tracking-widest">{g.codigo}</span>
                    <button onClick={() => copiar(g.codigo)} className="text-xs text-white/30 hover:text-white/70 transition-colors">
                      {copiado === g.codigo ? '✓' : 'copiar'}
                    </button>
                    <button onClick={() => setEditando(g)} className="text-xs text-blue-400/60 hover:text-blue-300 transition-colors">
                      editar
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
