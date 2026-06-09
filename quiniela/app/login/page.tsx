'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Email o contraseña incorrectos'); setLoading(false); return }
    router.push('/mi-grupo')
    router.refresh()
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      {/* Línea dorada top */}
      <div className="fixed top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

      <div className="w-full max-w-sm flex flex-col items-center gap-10">
        {/* Logo centrado grande */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 blur-2xl bg-amber-400/20 rounded-full scale-150" />
            <Image src="/logo-quiniela.png" alt="Quiniela" width={96} height={96} className="relative object-contain drop-shadow-2xl" priority />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white tracking-tight">Quiniela Mundial</h1>
            <p className="text-amber-400/70 text-sm tracking-widest uppercase mt-1">2026</p>
          </div>
        </div>

        {/* Card */}
        <div className="w-full relative">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-amber-400/5 to-transparent pointer-events-none" />
          <div className="relative bg-white/4 border border-white/10 rounded-2xl p-6 backdrop-blur-md shadow-2xl">
            <h2 className="text-white font-semibold text-base mb-5 tracking-tight">Iniciar sesión</h2>

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-medium text-white/40 block mb-1.5 uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-amber-400/50 focus:bg-white/7 transition-all text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-medium text-white/40 block mb-1.5 uppercase tracking-wider">Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-amber-400/50 focus:bg-white/7 transition-all text-sm"
                  required
                />
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full relative overflow-hidden bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-amber-900/30 mt-1"
              >
                {loading ? 'Entrando…' : 'Entrar'}
              </button>
            </form>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-white/8" />
              <span className="text-white/20 text-xs">o</span>
              <div className="flex-1 h-px bg-white/8" />
            </div>

            <p className="text-center text-white/30 text-sm">
              ¿Primera vez?{' '}
              <Link href="/registro" className="text-amber-400 hover:text-amber-300 font-medium transition-colors">
                Crear cuenta
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
