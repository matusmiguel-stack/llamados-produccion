'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  const [tab, setTab] = useState<'unirse' | 'crear'>('unirse')

  // unirse
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')
  const [loadingUnirse, setLoadingUnirse] = useState(false)
  const [errorUnirse, setErrorUnirse] = useState('')

  // crear
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
        body: JSON.stringify({
          nombre: nombreGrupo.trim(),
          pts_exacto: parseInt(ptsExacto) || 3,
          pts_ganador: parseInt(ptsGanador) || 1,
        }),
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

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-green-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⚽</div>
          <h1 className="text-3xl font-bold text-white">Quiniela</h1>
          <p className="text-emerald-300 text-sm mt-1">Mundial 2026 · USA · México · Canadá</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="flex border-b">
            <button
              onClick={() => setTab('unirse')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === 'unirse' ? 'text-emerald-700 border-b-2 border-emerald-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Unirse a grupo
            </button>
            <button
              onClick={() => setTab('crear')}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === 'crear' ? 'text-emerald-700 border-b-2 border-emerald-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Crear grupo
            </button>
          </div>

          <div className="p-6">
            {tab === 'unirse' && (
              <form onSubmit={handleUnirse} className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Código del grupo</label>
                  <input
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                    placeholder="ej. AB12CD"
                    maxLength={6}
                    className="w-full border rounded-lg px-3 py-2 text-lg font-mono tracking-widest text-center uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Tu nombre</label>
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="¿Cómo te llamas?"
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                {errorUnirse && <p className="text-red-500 text-sm">{errorUnirse}</p>}
                <button
                  type="submit"
                  disabled={loadingUnirse || !codigo || !nombre}
                  className="bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {loadingUnirse ? 'Entrando…' : 'Entrar'}
                </button>
              </form>
            )}

            {tab === 'crear' && !codigoCreado && (
              <form onSubmit={handleCrear} className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Nombre del grupo</label>
                  <input
                    value={nombreGrupo}
                    onChange={(e) => setNombreGrupo(e.target.value)}
                    placeholder="ej. Familia García"
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-600 block mb-1">Pts resultado exacto</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={ptsExacto}
                      onChange={(e) => setPtsExacto(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-600 block mb-1">Pts ganador/empate</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={ptsGanador}
                      onChange={(e) => setPtsGanador(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                {errorCrear && <p className="text-red-500 text-sm">{errorCrear}</p>}
                <button
                  type="submit"
                  disabled={loadingCrear || !nombreGrupo}
                  className="bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {loadingCrear ? 'Creando…' : 'Crear grupo'}
                </button>
              </form>
            )}

            {tab === 'crear' && codigoCreado && (
              <div className="flex flex-col gap-4">
                <div className="text-center">
                  <p className="text-sm text-gray-500 mb-1">¡Grupo creado! Comparte este código:</p>
                  <div className="text-4xl font-mono font-bold text-emerald-700 tracking-widest my-3">{codigoCreado}</div>
                  <button
                    onClick={() => navigator.clipboard.writeText(codigoCreado)}
                    className="text-xs text-emerald-600 underline"
                  >
                    Copiar código
                  </button>
                </div>
                <hr />
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Tu nombre para entrar</label>
                  <input
                    value={nombreJugadorNuevo}
                    onChange={(e) => setNombreJugadorNuevo(e.target.value)}
                    placeholder="¿Cómo te llamas?"
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <button
                  onClick={handleEntrarGrupoNuevo}
                  disabled={!nombreJugadorNuevo}
                  className="bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  Entrar a mi grupo
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
