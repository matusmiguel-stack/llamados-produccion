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
  const [tienePred, setTienePred] = useState(!!partido.prediccion)
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
        setTienePred(true)
        onSave?.()
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  const estadoBadge = {
    pendiente: null,
    en_curso: <span className="text-xs bg-green-500/15 text-green-400 px-2 py-0.5 rounded-full border border-green-500/15">En vivo</span>,
    finalizado: <span className="text-xs bg-white/6 text-white/25 px-2 py-0.5 rounded-full">Final</span>,
  }[partido.estado]

  return (
    <div className={`relative bg-white/4 border border-white/8 rounded-2xl p-4 flex flex-col gap-3 overflow-hidden transition-opacity ${bloqueado ? 'opacity-70' : ''}`}>
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

      <div className="flex items-center justify-between text-xs text-white/25">
        <span>{fecha.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })} · {fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
        <div className="flex items-center gap-2">
          <span className="text-white/15 text-xs">{partido.fase.replace(/_/g, ' ')}</span>
          {estadoBadge}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Local */}
        <div className="flex-1 flex items-center gap-2">
          {partido.bandera_local && <img src={partido.bandera_local} alt="" className="w-7 h-7 object-contain rounded-sm" />}
          <span className="font-semibold text-sm text-white truncate">{partido.equipo_local}</span>
        </div>

        {/* Score */}
        <div className="flex items-center gap-2">
          {partido.estado === 'finalizado' ? (
            <span className="text-lg font-bold text-white/60 px-3 py-1 bg-white/5 rounded-xl border border-white/8">
              {partido.goles_local} · {partido.goles_visitante}
            </span>
          ) : (
            <>
              <input
                type="number" min="0" max="20" value={local} disabled={bloqueado}
                onChange={(e) => setLocal(e.target.value)}
                className="w-11 h-11 text-center bg-white/6 border border-white/12 rounded-xl font-bold text-lg text-white focus:outline-none focus:border-amber-400/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              />
              <span className="text-white/20 font-bold text-lg">—</span>
              <input
                type="number" min="0" max="20" value={visitante} disabled={bloqueado}
                onChange={(e) => setVisitante(e.target.value)}
                className="w-11 h-11 text-center bg-white/6 border border-white/12 rounded-xl font-bold text-lg text-white focus:outline-none focus:border-amber-400/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              />
            </>
          )}
        </div>

        {/* Visitante */}
        <div className="flex-1 flex items-center gap-2 justify-end">
          <span className="font-semibold text-sm text-white truncate text-right">{partido.equipo_visitante}</span>
          {partido.bandera_visitante && <img src={partido.bandera_visitante} alt="" className="w-7 h-7 object-contain rounded-sm" />}
        </div>
      </div>

      {/* Resultado de predicción */}
      {partido.prediccion && partido.estado === 'finalizado' && (
        <div className="flex items-center justify-center gap-2 text-xs bg-white/4 rounded-xl py-1.5 border border-white/6">
          <span className="text-white/30">Tu pred:</span>
          <span className="text-white/50 font-medium">{partido.prediccion.goles_local} - {partido.prediccion.goles_visitante}</span>
          {partido.prediccion.puntos != null && (
            <span className={`font-bold ml-1 ${partido.prediccion.puntos > 0 ? 'text-amber-300' : 'text-white/25'}`}>
              {partido.prediccion.puntos > 0 ? `+${partido.prediccion.puntos} pts` : '0 pts'}
            </span>
          )}
        </div>
      )}

      {/* Botón guardar */}
      {!bloqueado && (
        <div className="flex justify-end items-center gap-2 mt-1">
          {error && <span className="text-xs text-red-400">{error}</span>}
          <button
            onClick={handleSave}
            disabled={saving || local === '' || visitante === ''}
            className="text-sm bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-30 text-white px-5 py-2 rounded-xl font-medium transition-all shadow-md shadow-amber-900/20"
          >
            {saved ? '✓ Guardado' : saving ? 'Guardando…' : tienePred ? 'Modificar' : 'Guardar'}
          </button>
        </div>
      )}

      {bloqueado && !partido.prediccion && partido.estado === 'pendiente' && (
        <p className="text-xs text-center text-amber-500/50">Cierra en menos de 1h</p>
      )}
    </div>
  )
}
