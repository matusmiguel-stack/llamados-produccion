'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'
import { Partido } from '@/types'

interface Dia {
  fecha: string
  label: string
  partidos: Partido[]
}

interface PredRow {
  goles_local: number
  goles_visitante: number
  puntos: number | null
  jugador: { id: string; nombre: string }
}

const TZ = 'America/Mexico_City'

function fechaLocalKey(fecha: string) {
  return new Date(fecha).toLocaleDateString('en-CA', { timeZone: TZ })
}

function agruparPorDia(partidos: Partido[]): Dia[] {
  const map = new Map<string, Partido[]>()
  for (const p of partidos) {
    const key = fechaLocalKey(p.fecha)
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
        partidos: ps.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()),
      }
    })
}

const FASES: Record<string, string> = {
  GROUP_STAGE:    'Fase de grupos',
  ROUND_OF_16:   'Octavos de final',
  QUARTER_FINALS:'Cuartos de final',
  SEMI_FINALS:   'Semifinales',
  THIRD_PLACE:   'Tercer lugar',
  FINAL:         'Final',
}

export default function CalendarioPage() {
  const params = useParams()
  const router = useRouter()
  const codigo = params.codigo as string

  const [dias, setDias]                     = useState<Dia[]>([])
  const [loading, setLoading]               = useState(true)
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null)
  const [grupoId, setGrupoId]               = useState<string | null>(null)

  // Modal de predicciones
  const [modalPartido, setModalPartido]     = useState<Partido | null>(null)
  const [preds, setPreds]                   = useState<PredRow[]>([])
  const [loadingPreds, setLoadingPreds]     = useState(false)

  useEffect(() => {
    const init = async () => {
      const supabase = createSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const grupoRes = await fetch(`/api/grupo?codigo=${codigo}`)
      if (!grupoRes.ok) { router.replace('/login'); return }
      const g = await grupoRes.json()
      setGrupoId(g.id)

      const res = await fetch('/api/partidos')
      const partidos: Partido[] = await res.json()
      const agrupados = agruparPorDia(partidos)
      setDias(agrupados)

      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
      const diaHoy = agrupados.find((d) => d.fecha >= hoy)
      setDiaSeleccionado(diaHoy?.fecha ?? agrupados[0]?.fecha ?? null)
      setLoading(false)
    }
    init()
  }, [router, codigo])

  function estaBloquado(partido: Partido): boolean {
    const lockTime = new Date(partido.fecha).getTime() - 60 * 60 * 1000
    return Date.now() >= lockTime
  }

  async function abrirPredicciones(partido: Partido) {
    if (!estaBloquado(partido) || !grupoId) return
    setModalPartido(partido)
    setPreds([])
    setLoadingPreds(true)
    const res = await fetch(`/api/prediccion/partido?partido_id=${partido.id}&grupo_id=${grupoId}`)
    if (res.ok) setPreds(await res.json())
    setLoadingPreds(false)
  }

  const diaActivo = dias.find((d) => d.fecha === diaSeleccionado)

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
              <h1 className="text-white font-semibold text-sm">Calendario de juegos</h1>
              <p className="text-white/30 text-xs">{dias.length} jornadas · {dias.reduce((s, d) => s + d.partidos.length, 0)} partidos</p>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-white/20 py-16 animate-pulse">Cargando calendario…</div>
      ) : (
        <div className="max-w-lg mx-auto">
          {/* Selector de días */}
          <div className="border-b border-white/8 bg-black/10">
            <div className="flex overflow-x-auto scrollbar-hide px-4 py-2 gap-2">
              {dias.map((dia) => {
                const esHoy = dia.fecha === new Date().toLocaleDateString('en-CA', { timeZone: TZ })
                const activo = diaSeleccionado === dia.fecha
                return (
                  <button
                    key={dia.fecha}
                    onClick={() => setDiaSeleccionado(dia.fecha)}
                    className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                      activo
                        ? 'bg-amber-500/15 border-amber-400/30 text-amber-300'
                        : 'bg-white/4 border-white/8 text-white/35 hover:text-white/60'
                    }`}
                  >
                    <span className={`text-xs font-semibold ${activo ? 'text-amber-300' : 'text-white/25'}`}>
                      {new Date(dia.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                    </span>
                    <span className="text-xs mt-0.5">
                      {new Date(dia.fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short' })}
                    </span>
                    {esHoy && <span className="w-1 h-1 rounded-full bg-amber-400 mt-1" />}
                    <span className={`text-xs mt-0.5 ${activo ? 'text-amber-400/60' : 'text-white/20'}`}>{dia.partidos.length}p</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Partidos del día */}
          {diaActivo && (
            <div className="px-4 py-5">
              <h2 className="text-white font-bold text-base mb-4">{diaActivo.label}</h2>
              <div className="flex flex-col gap-3">
                {diaActivo.partidos.map((p) => {
                  const fecha = new Date(p.fecha)
                  const hora  = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                  const finalizado  = p.estado === 'finalizado'
                  const bloqueado   = estaBloquado(p)
                  const estadoColor = {
                    pendiente:  'text-white/25',
                    en_curso:   'text-green-400',
                    finalizado: 'text-white/20',
                  }[p.estado]

                  return (
                    <div
                      key={p.id}
                      onClick={() => abrirPredicciones(p)}
                      className={`relative bg-white/4 border rounded-2xl overflow-hidden transition-all ${
                        bloqueado
                          ? 'border-white/12 cursor-pointer hover:bg-white/7 hover:border-amber-400/20 active:scale-[0.99]'
                          : 'border-white/8'
                      }`}
                    >
                      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

                      {/* Hora + fase */}
                      <div className="flex items-center justify-between px-4 pt-3 pb-2">
                        <span className={`text-xs font-mono font-semibold ${estadoColor}`}>
                          {p.estado === 'en_curso' ? '⚽ En vivo' : finalizado ? 'Final' : hora}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-white/15 text-xs">{FASES[p.fase] ?? p.fase.replace(/_/g, ' ')}</span>
                          {bloqueado && (
                            <span className="text-amber-400/50 text-xs flex items-center gap-1">
                              Ver predicciones
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M5 2.5L8.5 6L5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Equipos + marcador */}
                      <div className="flex items-center gap-3 px-4 pb-4">
                        <div className="flex-1 flex items-center gap-2">
                          {p.bandera_local && <img src={p.bandera_local} alt="" className="w-8 h-8 object-contain rounded" />}
                          <span className="font-semibold text-white text-sm leading-tight">{p.equipo_local}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {p.estado === 'finalizado' && p.goles_local != null ? (
                            <span className="text-xl font-bold text-white/70 bg-white/6 border border-white/8 px-3 py-1 rounded-xl">
                              {p.goles_local} · {p.goles_visitante}
                            </span>
                          ) : p.estado === 'en_curso' && p.goles_local != null ? (
                            <span className="text-xl font-bold text-green-300 bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-xl">
                              {p.goles_local} · {p.goles_visitante}
                            </span>
                          ) : (
                            <span className="text-white/15 text-sm font-medium px-2">vs</span>
                          )}
                        </div>
                        <div className="flex-1 flex items-center gap-2 justify-end">
                          <span className="font-semibold text-white text-sm leading-tight text-right">{p.equipo_visitante}</span>
                          {p.bandera_visitante && <img src={p.bandera_visitante} alt="" className="w-8 h-8 object-contain rounded" />}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modal de predicciones ── */}
      {modalPartido && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
          onClick={() => setModalPartido(null)}
        >
          <div
            className="w-full sm:max-w-sm bg-[#0f0f13] border border-white/12 rounded-t-3xl sm:rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle bar móvil */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Encabezado del partido */}
            <div className="px-5 pt-4 pb-4 border-b border-white/8">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/30 text-xs">Predicciones del grupo</span>
                <button onClick={() => setModalPartido(null)} className="text-white/25 hover:text-white/60 transition-colors">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 flex items-center gap-2">
                  {modalPartido.bandera_local && <img src={modalPartido.bandera_local} alt="" className="w-7 h-7 object-contain rounded-sm" />}
                  <span className="font-semibold text-white text-sm">{modalPartido.equipo_local}</span>
                </div>
                {modalPartido.estado === 'finalizado' && modalPartido.goles_local != null ? (
                  <span className="text-lg font-bold text-white/60 bg-white/6 border border-white/10 px-3 py-1 rounded-xl">
                    {modalPartido.goles_local} · {modalPartido.goles_visitante}
                  </span>
                ) : modalPartido.estado === 'en_curso' && modalPartido.goles_local != null ? (
                  <span className="text-lg font-bold text-green-300 bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-xl">
                    {modalPartido.goles_local} · {modalPartido.goles_visitante}
                  </span>
                ) : (
                  <span className="text-sm font-mono text-white/30 bg-white/4 border border-white/8 px-3 py-1.5 rounded-xl">
                    {new Date(modalPartido.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                <div className="flex-1 flex items-center gap-2 justify-end">
                  <span className="font-semibold text-white text-sm text-right">{modalPartido.equipo_visitante}</span>
                  {modalPartido.bandera_visitante && <img src={modalPartido.bandera_visitante} alt="" className="w-7 h-7 object-contain rounded-sm" />}
                </div>
              </div>
            </div>

            {/* Lista de predicciones */}
            <div className="overflow-y-auto max-h-80 px-4 py-3 flex flex-col gap-2">
              {loadingPreds ? (
                <div className="text-center text-white/20 py-8 text-sm animate-pulse">Cargando predicciones…</div>
              ) : preds.length === 0 ? (
                <div className="text-center text-white/20 py-8 text-sm">Nadie predijo este partido</div>
              ) : (
                preds.map((pred, i) => {
                  const exacto   = pred.puntos != null && pred.puntos >= 3
                  const acerto   = pred.puntos != null && pred.puntos > 0 && !exacto
                  const sinPuntos = pred.puntos === 0 || pred.puntos == null

                  return (
                    <div
                      key={pred.jugador.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                        exacto
                          ? 'bg-amber-500/10 border-amber-400/25'
                          : acerto
                          ? 'bg-white/5 border-white/10'
                          : 'bg-white/3 border-white/6'
                      }`}
                    >
                      {/* Posición */}
                      <span className="text-white/20 text-xs font-mono w-4 text-right">{i + 1}</span>

                      {/* Nombre */}
                      <span className={`flex-1 text-sm font-medium truncate ${exacto ? 'text-amber-200' : 'text-white/70'}`}>
                        {pred.jugador.nombre}
                      </span>

                      {/* Predicción */}
                      <span className={`text-sm font-bold px-2.5 py-1 rounded-lg border ${
                        exacto
                          ? 'text-amber-300 bg-amber-500/15 border-amber-400/25'
                          : acerto
                          ? 'text-white/60 bg-white/6 border-white/10'
                          : 'text-white/30 bg-white/4 border-white/8'
                      }`}>
                        {pred.goles_local}–{pred.goles_visitante}
                      </span>

                      {/* Puntos */}
                      <span className={`text-xs font-bold w-12 text-right ${
                        exacto ? 'text-amber-300' : acerto ? 'text-white/40' : 'text-white/20'
                      }`}>
                        {pred.puntos != null ? `+${pred.puntos}` : sinPuntos ? '0 pts' : '—'}
                      </span>
                    </div>
                  )
                })
              )}
            </div>

            <div className="px-4 pb-5 pt-1">
              <p className="text-center text-white/15 text-xs">
                {preds.length} predicción{preds.length !== 1 ? 'es' : ''} en este grupo
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
