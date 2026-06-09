'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

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
  const [miJugadorId, setMiJugadorId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const supabase = createSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const jugadorRes = await fetch(`/api/auth/jugador?user_id=${user.id}`)
      if (!jugadorRes.ok) { router.replace('/login'); return }
      const jugador = await jugadorRes.json()
      setMiJugadorId(jugador.id)

      const grupoRes = await fetch(`/api/grupo?codigo=${codigo}`)
      if (!grupoRes.ok) { router.replace('/login'); return }
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
    <div className="min-h-screen">
      <div className="border-b border-white/10 bg-white/3 backdrop-blur-sm px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link href={`/grupo/${codigo}`} className="text-white/40 hover:text-white text-lg">←</Link>
          <h1 className="text-white font-semibold">Tabla de posiciones</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4">
        {loading ? (
          <div className="text-center text-white/30 py-12 animate-pulse">Cargando…</div>
        ) : tabla.length === 0 ? (
          <div className="text-center text-white/30 py-12">Aún no hay puntos. ¡Predice los partidos!</div>
        ) : (
          <div className="flex flex-col gap-2">
            {tabla.map((pos, i) => (
              <div
                key={pos.jugador_id}
                className={`rounded-xl border px-4 py-3 flex items-center gap-4 transition-colors ${
                  pos.jugador_id === miJugadorId
                    ? 'bg-violet-500/10 border-violet-500/30'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                <div className="text-2xl w-8 text-center">{medallaEmoji(i)}</div>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-white">
                    {pos.nombre}
                    {pos.jugador_id === miJugadorId && <span className="ml-1 text-xs text-violet-400">(tú)</span>}
                  </p>
                  <p className="text-xs text-white/30">{pos.predicciones} predicciones</p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-violet-300">{pos.puntos_total}</div>
                  <div className="text-xs text-white/30">pts</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => grupoId && fetch(`/api/tabla?grupo_id=${grupoId}`).then((r) => r.json()).then(setTabla)}
          className="mt-4 w-full text-xs text-center text-white/20 hover:text-white/50 transition-colors"
        >
          ↻ Actualizar
        </button>
      </div>
    </div>
  )
}
