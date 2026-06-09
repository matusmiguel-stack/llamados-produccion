'use client'

import { useState } from 'react'
import { Partido, Prediccion } from '@/types'

interface Props {
  partido: Partido & { prediccion?: Prediccion | null }
  jugadorId: string
  onSave?: () => void
}

export default function PartidoCard({ partido, jugadorId, onSave }: Props) {
  const [local, setLocal] = useState<string>(partido.prediccion?.goles_local?.toString() ?? '')
  const [visitante, setVisitante] = useState<string>(partido.prediccion?.goles_visitante?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const fecha = new Date(partido.fecha)
  const ahora = new Date()
  const minutosRestantes = (fecha.getTime() - ahora.getTime()) / 60000
  const bloqueado = partido.estado !== 'pendiente' || minutosRestantes < 60

  const handleSave = async () => {
    if (local === '' || visitante === '') return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/prediccion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jugador_id: jugadorId,
          partido_id: partido.id,
          goles_local: parseInt(local),
          goles_visitante: parseInt(visitante),
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error)
      } else {
        setSaved(true)
        onSave?.()
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  const inputClass = "w-10 h-10 text-center bg-white/8 border border-white/15 rounded-lg font-bold text-lg text-white focus:outline-none focus:border-violet-500/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"

  const estadoBadge = {
    pendiente: null,
    en_curso: <span className="text-xs bg-green-500/15 text-green-400 px-2 py-0.5 rounded-full border border-green-500/20">En curso</span>,
    finalizado: <span className="text-xs bg-white/8 text-white/30 px-2 py-0.5 rounded-full">Finalizado</span>,
  }[partido.estado]

  return (
    <div className={`bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3 ${bloqueado ? 'opacity-70' : ''}`}>
      <div className="flex items-center justify-between text-xs text-white/30">
        <span>{fecha.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })} · {fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
        <div className="flex items-center gap-2">
          <span className="text-white/20">{partido.fase.replace(/_/g, ' ')}</span>
          {estadoBadge}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2">
          {partido.bandera_local && <img src={partido.bandera_local} alt="" className="w-6 h-6 object-contain" />}
          <span className="font-medium text-sm text-white truncate">{partido.equipo_local}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {partido.estado === 'finalizado' ? (
            <span className="text-lg font-bold text-white/70 px-2">
              {partido.goles_local} - {partido.goles_visitante}
            </span>
          ) : (
            <>
              <input type="number" min="0" max="20" value={local} disabled={bloqueado} onChange={(e) => setLocal(e.target.value)} className={inputClass} />
              <span className="text-white/20 font-bold">-</span>
              <input type="number" min="0" max="20" value={visitante} disabled={bloqueado} onChange={(e) => setVisitante(e.target.value)} className={inputClass} />
            </>
          )}
        </div>

        <div className="flex-1 flex items-center gap-2 justify-end">
          <span className="font-medium text-sm text-white truncate text-right">{partido.equipo_visitante}</span>
          {partido.bandera_visitante && <img src={partido.bandera_visitante} alt="" className="w-6 h-6 object-contain" />}
        </div>
      </div>

      {partido.prediccion && partido.estado === 'finalizado' && (
        <div className="text-xs text-center text-white/30">
          Tu pred: {partido.prediccion.goles_local} - {partido.prediccion.goles_visitante}
          {partido.prediccion.puntos != null && (
            <span className={`ml-2 font-bold ${partido.prediccion.puntos > 0 ? 'text-green-400' : 'text-red-400'}`}>
              +{partido.prediccion.puntos} pts
            </span>
          )}
        </div>
      )}

      {!bloqueado && (
        <div className="flex justify-end items-center gap-2">
          {error && <span className="text-xs text-red-400">{error}</span>}
          <button
            onClick={handleSave}
            disabled={saving || local === '' || visitante === ''}
            className="text-sm bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg transition-colors"
          >
            {saved ? '✓ Guardado' : saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}

      {bloqueado && !partido.prediccion && partido.estado === 'pendiente' && (
        <p className="text-xs text-center text-amber-500/70">Cierra en menos de 1h — ya no puedes predecir</p>
      )}
    </div>
  )
}
