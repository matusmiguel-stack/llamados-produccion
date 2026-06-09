'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export default function CrearPage() {
  const [nombre, setNombre] = useState('')
  const [ptsExacto, setPtsExacto] = useState(3)
  const [ptsGanador, setPtsGanador] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handlePagar = async () => {
    if (!nombre.trim()) { setError('Ponle un nombre a tu quiniela'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/pago/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim(), pts_exacto: ptsExacto, pts_ganador: ptsGanador }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al iniciar el pago'); return }
      window.location.href = data.url
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col px-5 py-10 max-w-sm mx-auto">
      <div className="h-px fixed top-0 left-0 right-0 bg-gradient-to-r from-transparent via-amber-400/60 to-transparent z-10" />

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/" className="text-white/30 hover:text-white transition-colors">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M12 15L7 10L12 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </Link>
        <Image src="/logo-quiniela.png" alt="" width={28} height={28} className="object-contain opacity-80" />
        <h1 className="text-white font-semibold text-sm">Crear mi quiniela</h1>
      </div>

      <div className="flex flex-col gap-5 flex-1">
        {/* Nombre */}
        <div>
          <label className="text-xs font-semibold text-white/40 uppercase tracking-widest block mb-2">Nombre del grupo</label>
          <input
            type="text"
            placeholder="Ej: Quiniela de la oficina"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={40}
            className="w-full bg-white/6 border border-white/12 rounded-2xl px-4 py-3.5 text-white placeholder-white/20 focus:outline-none focus:border-amber-400/50 text-sm transition-colors"
          />
        </div>

        {/* Sistema de puntos */}
        <div className="relative bg-white/4 border border-white/8 rounded-2xl p-5 overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/20 to-transparent" />
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Sistema de puntos</h2>

          <div className="flex flex-col gap-4">
            {/* Exacto */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-white text-sm font-medium">Resultado exacto</p>
                  <p className="text-white/30 text-xs">Adivinas el marcador exacto</p>
                </div>
                <span className="text-amber-300 font-bold text-xl">{ptsExacto} pts</span>
              </div>
              <input
                type="range" min={1} max={10} value={ptsExacto}
                onChange={(e) => setPtsExacto(Number(e.target.value))}
                className="w-full accent-amber-400 h-1.5 rounded-full"
              />
              <div className="flex justify-between text-xs text-white/20 mt-1"><span>1</span><span>10</span></div>
            </div>

            <div className="h-px bg-white/6" />

            {/* Ganador */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-white text-sm font-medium">Ganador o empate</p>
                  <p className="text-white/30 text-xs">Aciertas el resultado, no el marcador</p>
                </div>
                <span className="text-amber-200/80 font-bold text-xl">{ptsGanador} pts</span>
              </div>
              <input
                type="range" min={0} max={5} value={ptsGanador}
                onChange={(e) => setPtsGanador(Number(e.target.value))}
                className="w-full accent-amber-400 h-1.5 rounded-full"
              />
              <div className="flex justify-between text-xs text-white/20 mt-1"><span>0</span><span>5</span></div>
            </div>
          </div>
        </div>

        {/* Resumen */}
        <div className="relative bg-amber-500/6 border border-amber-400/15 rounded-2xl p-4 overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/30 to-transparent" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-amber-200/80 font-semibold text-sm">{nombre.trim() || 'Tu quiniela'}</p>
              <p className="text-white/30 text-xs mt-0.5">Exacto {ptsExacto}pts · Ganador {ptsGanador}pts · 104 partidos</p>
            </div>
            <div className="text-right">
              <p className="text-amber-300 font-bold text-2xl">$99</p>
              <p className="text-white/25 text-xs">MXN</p>
            </div>
          </div>
        </div>

        {/* Qué incluye */}
        <div className="flex flex-col gap-2 px-1">
          {[
            'Código único para invitar a tus amigos',
            'Tabla de posiciones en tiempo real',
            'Predicciones para los 104 partidos',
            'Resultados actualizados automáticamente',
          ].map((item) => (
            <div key={item} className="flex items-start gap-2 text-xs text-white/35">
              <span className="text-amber-400/70 mt-0.5">✦</span>
              <span>{item}</span>
            </div>
          ))}
        </div>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        {/* Botón pagar */}
        <button
          onClick={handlePagar}
          disabled={loading}
          className="relative overflow-hidden bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-50 text-white font-bold py-4 px-6 rounded-2xl shadow-xl shadow-amber-900/30 transition-all active:scale-95 text-base"
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-white/20" />
          {loading ? 'Preparando pago…' : 'Pagar $99 MXN →'}
        </button>

        <p className="text-white/15 text-xs text-center">Pago seguro con MercadoPago · Recibes tu código al instante</p>
      </div>
    </div>
  )
}
