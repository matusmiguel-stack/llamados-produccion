'use client'

import { useEffect, useState } from 'react'
import { useGrupo } from '@/context/grupo-context'

interface Posicion {
  jugador_id: string
  nombre: string
  puntos_total: number
  exactos: number
  predicciones: number
  pagado: boolean
}

export default function TablaPage() {
  const { grupoId, jugadorId: miJugadorId } = useGrupo()

  const [tabla,   setTabla]   = useState<Posicion[]>([])
  const [loading, setLoading] = useState(true)

  const cargarTabla = async () => {
    const res = await fetch(`/api/tabla?grupo_id=${grupoId}`)
    setTabla(await res.json())
    setLoading(false)
  }

  useEffect(() => {
    cargarTabla()
  }, [grupoId])

  const medalla = (pos: number) => {
    if (pos === 0) return { emoji: '🥇', color: 'text-amber-300' }
    if (pos === 1) return { emoji: '🥈', color: 'text-slate-300' }
    if (pos === 2) return { emoji: '🥉', color: 'text-amber-600' }
    return { emoji: `${pos + 1}°`, color: 'text-white/30' }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4">
      {loading ? (
        <div className="text-center text-white/20 py-16 animate-pulse">Cargando…</div>
      ) : tabla.length === 0 ? (
        <div className="text-center text-white/20 py-16">Aún no hay puntos.<br/>¡Predice los partidos!</div>
      ) : (
        <div className="flex flex-col gap-2">
          {tabla.map((pos, i) => {
            const { emoji, color } = medalla(i)
            const esMio = pos.jugador_id === miJugadorId
            return (
              <div
                key={pos.jugador_id}
                className={`relative rounded-2xl border px-4 py-3.5 flex items-center gap-4 overflow-hidden transition-colors ${
                  esMio ? 'bg-amber-500/8 border-amber-400/25' : 'bg-white/4 border-white/8'
                }`}
              >
                {esMio && <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />}
                <div className={`text-xl w-8 text-center font-bold ${color}`}>{emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-white truncate">
                      {pos.nombre}
                      {esMio && <span className="ml-1.5 text-xs text-amber-400/70 font-normal">(tú)</span>}
                    </p>
                    {pos.pagado && (
                      <span className="text-xs bg-green-500/15 border border-green-500/25 text-green-400 px-2 py-0.5 rounded-full flex-shrink-0">✓ Pagado</span>
                    )}
                  </div>
                  <p className="text-xs text-white/25 mt-0.5">
                    {pos.predicciones} predicciones
                    {pos.exactos > 0 && <span className="ml-1.5 text-amber-400/60">· {pos.exactos} exacto{pos.exactos !== 1 ? 's' : ''} ✓</span>}
                  </p>
                </div>
                <div className="text-right">
                  <div className={`text-xl font-bold ${esMio ? 'text-amber-300' : 'text-white/70'}`}>{pos.puntos_total}</div>
                  <div className="text-xs text-white/25">pts</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button
        onClick={cargarTabla}
        className="mt-5 w-full text-xs text-center text-white/15 hover:text-white/40 transition-colors py-2"
      >
        ↻ Actualizar tabla
      </button>
    </div>
  )
}
