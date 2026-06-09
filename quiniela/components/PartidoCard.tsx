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

  const estadoBadge = {
    pendiente: null,
    en_curso: <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">En curso</span>,
    finalizado: <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Finalizado</span>,
  }[partido.estado]

  return (
    <div className={`bg-white rounded-xl border p-4 flex flex-col gap-3 ${bloqueado ? 'opacity-75' : ''}`}>
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{fecha.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })} · {fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
        <div className="flex items-center gap-2">
          <span className="text-gray-300">{partido.fase.replace(/_/g, ' ')}</span>
          {estadoBadge}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Local */}
        <div className="flex-1 flex items-center gap-2">
          {partido.bandera_local && (
            <img src={partido.bandera_local} alt="" className="w-6 h-6 object-contain" />
          )}
          <span className="font-medium text-sm truncate">{partido.equipo_local}</span>
        </div>

        {/* Score */}
        <div className="flex items-center gap-1">
          {partido.estado === 'finalizado' ? (
            <span className="text-lg font-bold text-gray-700">
              {partido.goles_local} - {partido.goles_visitante}
            </span>
          ) : (
            <>
              <input
                type="number"
                min="0"
                max="20"
                value={local}
                disabled={bloqueado}
                onChange={(e) => setLocal(e.target.value)}
                className="w-10 h-10 text-center border rounded-lg font-bold text-lg disabled:bg-gray-50 disabled:text-gray-400"
              />
              <span className="text-gray-300 font-bold">-</span>
              <input
                type="number"
                min="0"
                max="20"
                value={visitante}
                disabled={bloqueado}
                onChange={(e) => setVisitante(e.target.value)}
                className="w-10 h-10 text-center border rounded-lg font-bold text-lg disabled:bg-gray-50 disabled:text-gray-400"
              />
            </>
          )}
        </div>

        {/* Visitante */}
        <div className="flex-1 flex items-center gap-2 justify-end">
          <span className="font-medium text-sm truncate text-right">{partido.equipo_visitante}</span>
          {partido.bandera_visitante && (
            <img src={partido.bandera_visitante} alt="" className="w-6 h-6 object-contain" />
          )}
        </div>
      </div>

      {/* Predicción guardada vs puntos */}
      {partido.prediccion && partido.estado === 'finalizado' && (
        <div className="text-xs text-center text-gray-500">
          Tu pred: {partido.prediccion.goles_local} - {partido.prediccion.goles_visitante}
          {partido.prediccion.puntos != null && (
            <span className={`ml-2 font-bold ${partido.prediccion.puntos > 0 ? 'text-green-600' : 'text-red-500'}`}>
              +{partido.prediccion.puntos} pts
            </span>
          )}
        </div>
      )}

      {!bloqueado && (
        <div className="flex justify-end items-center gap-2">
          {error && <span className="text-xs text-red-500">{error}</span>}
          <button
            onClick={handleSave}
            disabled={saving || local === '' || visitante === ''}
            className="text-sm bg-emerald-600 text-white px-4 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {saved ? '✓ Guardado' : saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}

      {bloqueado && !partido.prediccion && partido.estado === 'pendiente' && (
        <p className="text-xs text-center text-amber-600">Cierra en menos de 1h — ya no puedes predecir</p>
      )}
    </div>
  )
}
