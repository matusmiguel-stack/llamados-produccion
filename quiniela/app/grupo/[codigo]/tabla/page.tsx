'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface Posicion {
  jugador_id: string
  nombre: string
  puntos_total: number
  predicciones: number
}

export default function TablaPage() {
  const params = useParams()
  const router = useRouter()
  const codigo = params.codigo as string

  const [tabla, setTabla] = useState<Posicion[]>([])
  const [grupoId, setGrupoId] = useState<string | null>(null)
  const [miId, setMiId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('quiniela_jugador')
    if (!stored) { router.replace('/'); return }
    const j = JSON.parse(stored)
    setMiId(j.id)

    const load = async () => {
      const grupoRes = await fetch(`/api/grupo?codigo=${codigo}`)
      if (!grupoRes.ok) { router.replace('/'); return }
      const grupo = await grupoRes.json()
      setGrupoId(grupo.id)

      const tablaRes = await fetch(`/api/tabla?grupo_id=${grupo.id}`)
      setTabla(await tablaRes.json())
      setLoading(false)
    }
    load()
  }, [codigo, router])

  const medallaEmoji = (pos: number) => {
    if (pos === 0) return '🥇'
    if (pos === 1) return '🥈'
    if (pos === 2) return '🥉'
    return `${pos + 1}°`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-emerald-800 text-white px-4 py-5">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link href={`/grupo/${codigo}`} className="text-emerald-300 hover:text-white">←</Link>
          <h1 className="text-lg font-bold">Tabla de posiciones</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4">
        {loading ? (
          <div className="text-center text-gray-400 py-12 animate-pulse">Cargando…</div>
        ) : tabla.length === 0 ? (
          <div className="text-center text-gray-400 py-12">Aún no hay puntos. ¡Predice los partidos!</div>
        ) : (
          <div className="flex flex-col gap-2">
            {tabla.map((pos, i) => (
              <div
                key={pos.jugador_id}
                className={`bg-white rounded-xl border px-4 py-3 flex items-center gap-4 ${pos.jugador_id === miId ? 'border-emerald-400 bg-emerald-50' : ''}`}
              >
                <div className="text-2xl w-8 text-center">{medallaEmoji(i)}</div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">
                    {pos.nombre}
                    {pos.jugador_id === miId && <span className="ml-1 text-xs text-emerald-600">(tú)</span>}
                  </p>
                  <p className="text-xs text-gray-400">{pos.predicciones} predicciones anotadas</p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-emerald-700">{pos.puntos_total}</div>
                  <div className="text-xs text-gray-400">pts</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => grupoId && fetch(`/api/tabla?grupo_id=${grupoId}`).then((r) => r.json()).then(setTabla)}
          className="mt-4 w-full text-sm text-center text-gray-400 hover:text-gray-600"
        >
          ↻ Actualizar
        </button>
      </div>
    </div>
  )
}
