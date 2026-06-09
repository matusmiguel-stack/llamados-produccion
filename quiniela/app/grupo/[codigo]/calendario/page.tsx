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
  labelCorto: string
  partidos: Partido[]
}

const TZ = 'America/Mexico_City'

function fechaLocalKey(fecha: string) {
  return new Date(fecha).toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD
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
      const labelCorto = new Date(fecha + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
      return {
        fecha,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        labelCorto: labelCorto.charAt(0).toUpperCase() + labelCorto.slice(1),
        partidos: ps.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()),
      }
    })
}

const FASES: Record<string, string> = {
  GROUP_STAGE: 'Fase de grupos',
  ROUND_OF_16: 'Octavos de final',
  QUARTER_FINALS: 'Cuartos de final',
  SEMI_FINALS: 'Semifinales',
  THIRD_PLACE: 'Tercer lugar',
  FINAL: 'Final',
}

export default function CalendarioPage() {
  const params = useParams()
  const router = useRouter()
  const codigo = params.codigo as string

  const [dias, setDias] = useState<Dia[]>([])
  const [loading, setLoading] = useState(true)
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const supabase = createSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const res = await fetch('/api/partidos')
      const partidos: Partido[] = await res.json()
      const agrupados = agruparPorDia(partidos)
      setDias(agrupados)

      // seleccionar el día más próximo con partidos
      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
      const diaHoy = agrupados.find((d) => d.fecha >= hoy)
      setDiaSeleccionado(diaHoy?.fecha ?? agrupados[0]?.fecha ?? null)
      setLoading(false)
    }
    init()
  }, [router])

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
          {/* Selector de días — scroll horizontal */}
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

          {/* Partidos del día seleccionado */}
          {diaActivo && (
            <div className="px-4 py-5">
              <h2 className="text-white font-bold text-base mb-4">{diaActivo.label}</h2>
              <div className="flex flex-col gap-3">
                {diaActivo.partidos.map((p) => {
                  const fecha = new Date(p.fecha)
                  const hora = fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
                  const estadoColor = {
                    pendiente: 'text-white/25',
                    en_curso: 'text-green-400',
                    finalizado: 'text-white/20',
                  }[p.estado]

                  return (
                    <div key={p.id} className="relative bg-white/4 border border-white/8 rounded-2xl overflow-hidden">
                      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

                      {/* Hora + fase */}
                      <div className="flex items-center justify-between px-4 pt-3 pb-2">
                        <span className={`text-xs font-mono font-semibold ${estadoColor}`}>
                          {p.estado === 'en_curso' ? '⚽ En vivo' : p.estado === 'finalizado' ? 'Final' : hora}
                        </span>
                        <span className="text-white/15 text-xs">{FASES[p.fase] ?? p.fase.replace(/_/g, ' ')}</span>
                      </div>

                      {/* Equipos */}
                      <div className="flex items-center gap-3 px-4 pb-4">
                        {/* Local */}
                        <div className="flex-1 flex items-center gap-2">
                          {p.bandera_local && <img src={p.bandera_local} alt="" className="w-8 h-8 object-contain rounded" />}
                          <span className="font-semibold text-white text-sm leading-tight">{p.equipo_local}</span>
                        </div>

                        {/* Score o VS */}
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

                        {/* Visitante */}
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
    </div>
  )
}
