'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import PartidoCard from '@/components/PartidoCard'
import { Partido, Prediccion } from '@/types'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

type PartidoConPred = Partido & { prediccion?: Prediccion | null }

export default function PrediccionesPage() {
  const params = useParams()
  const router = useRouter()
  const codigo = params.codigo as string

  const [jugadorId, setJugadorId] = useState<string | null>(null)
  const [partidos, setPartidos] = useState<PartidoConPred[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<'pendientes' | 'todos'>('pendientes')

  const cargar = useCallback(async (jId: string) => {
    const res = await fetch(`/api/partidos?jugador_id=${jId}`)
    setPartidos(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    const init = async () => {
      const supabase = createSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const res = await fetch(`/api/auth/jugador?user_id=${user.id}`)
      if (!res.ok) { router.replace('/login'); return }
      const j = await res.json()
      setJugadorId(j.id)
      cargar(j.id)
    }
    init()
  }, [cargar, router])

  const mostrados = filtro === 'pendientes'
    ? partidos.filter((p) => p.estado === 'pendiente')
    : partidos

  const sinPred = partidos.filter((p) => p.estado === 'pendiente' && !p.prediccion).length

  return (
    <div className="min-h-screen">
      <div className="h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

      <div className="bg-black/30 backdrop-blur-md border-b border-white/8 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link href={`/grupo/${codigo}`} className="text-white/30 hover:text-white transition-colors">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 15L7 10L12 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </Link>
          <div className="flex-1 flex items-center gap-3">
            <Image src="/logo-quiniela.png" alt="" width={32} height={32} className="object-contain opacity-80" />
            <div>
              <h1 className="text-white font-semibold text-sm">Predicciones</h1>
              {sinPred > 0 && <p className="text-amber-400/70 text-xs">{sinPred} pendiente{sinPred !== 1 ? 's' : ''}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4">
        <div className="flex gap-2 mb-5">
          {(['pendientes', 'todos'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`text-sm px-5 py-2 rounded-xl border font-medium transition-all ${
                filtro === f
                  ? 'bg-amber-500/15 border-amber-400/30 text-amber-300'
                  : 'bg-white/4 border-white/8 text-white/35 hover:text-white/60'
              }`}
            >
              {f === 'pendientes' ? 'Por jugar' : 'Todos'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-white/20 py-16 animate-pulse">Cargando partidos…</div>
        ) : mostrados.length === 0 ? (
          <div className="text-center text-white/20 py-16">No hay partidos en esta vista</div>
        ) : (
          <div className="flex flex-col gap-3">
            {mostrados.map((p) => (
              <PartidoCard
                key={p.id}
                partido={p}
                jugadorId={jugadorId!}
                onSave={() => jugadorId && cargar(jugadorId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
