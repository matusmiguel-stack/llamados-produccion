'use client'

import { useEffect, useState, useCallback } from 'react'
import PartidoCard from '@/components/PartidoCard'
import { Partido, Prediccion } from '@/types'
import { useGrupo } from '@/context/grupo-context'

type PartidoConPred = Partido & { prediccion?: Prediccion | null }

interface Dia {
  label: string
  fecha: string
  partidos: PartidoConPred[]
  sinPred: number
}

const TZ = 'America/Mexico_City'

function agruparPorDia(partidos: PartidoConPred[]): Dia[] {
  const map = new Map<string, PartidoConPred[]>()
  for (const p of partidos) {
    const key = new Date(p.fecha).toLocaleDateString('en-CA', { timeZone: TZ })
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(p)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, ps]) => {
      const label = new Date(fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
      return {
        fecha,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        partidos: ps,
        sinPred: ps.filter((p) => p.estado === 'pendiente' && !p.prediccion).length,
      }
    })
}

export default function PrediccionesPage() {
  const { jugadorId, setSinPrediccion } = useGrupo()

  const [partidos,    setPartidos]    = useState<PartidoConPred[]>([])
  const [loading,     setLoading]     = useState(true)
  const [filtro,      setFiltro]      = useState<'pendientes' | 'todos'>('pendientes')
  const [diaAbierto,  setDiaAbierto]  = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const res  = await fetch(`/api/partidos?jugador_id=${jugadorId}`)
    const data: PartidoConPred[] = await res.json()
    setPartidos(data)
    setLoading(false)

    const sin = data.filter((p) => p.estado === 'pendiente' && !p.prediccion).length
    setSinPrediccion(sin)

    const hoy  = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
    const dias = agruparPorDia(data.filter((p) => p.estado === 'pendiente'))
    if (dias.length > 0) {
      const diaHoy = dias.find((d) => d.fecha >= hoy)
      setDiaAbierto(diaHoy?.fecha ?? dias[0].fecha)
    }
  }, [jugadorId, setSinPrediccion])

  useEffect(() => { cargar() }, [cargar])

  const filtrados       = filtro === 'pendientes' ? partidos.filter((p) => p.estado === 'pendiente') : partidos
  const dias            = agruparPorDia(filtrados)
  const sinPredTotal    = partidos.filter((p) => p.estado === 'pendiente' && !p.prediccion).length

  return (
    <div className="max-w-lg mx-auto px-4 py-4">
      {/* Filtro */}
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
            {f === 'pendientes' ? `Por jugar${sinPredTotal > 0 ? ` (${sinPredTotal})` : ''}` : 'Todos'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-white/20 py-16 animate-pulse">Cargando partidos…</div>
      ) : dias.length === 0 ? (
        <div className="text-center text-white/20 py-16">No hay partidos en esta vista</div>
      ) : (
        <div className="flex flex-col gap-3">
          {dias.map((dia) => {
            const abierto = diaAbierto === dia.fecha
            return (
              <div key={dia.fecha} className="relative rounded-2xl border border-white/8 overflow-hidden">
                <button
                  onClick={() => setDiaAbierto(abierto ? null : dia.fecha)}
                  className="w-full flex items-center justify-between px-4 py-3.5 bg-white/4 hover:bg-white/6 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-white font-semibold text-sm">{dia.label}</span>
                    {dia.sinPred > 0 && (
                      <span className="bg-amber-500/20 border border-amber-400/25 text-amber-300 text-xs px-2 py-0.5 rounded-full font-medium">
                        {dia.sinPred} sin predecir
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-white/25 text-xs">{dia.partidos.length} partidos</span>
                    <svg
                      width="16" height="16" viewBox="0 0 16 16" fill="none"
                      className={`text-white/30 transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`}
                    >
                      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </button>

                {abierto && (
                  <div className="flex flex-col gap-2 p-3 bg-black/10">
                    {dia.partidos.map((p) => (
                      <PartidoCard
                        key={p.id}
                        partido={p}
                        jugadorId={jugadorId}
                        onSave={cargar}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
