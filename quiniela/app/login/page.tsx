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

    if (error) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
      return
    }

    router.push('/mi-grupo')
    router.refresh()
  }

  const inputClass = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-amber-500/60 transition-colors"

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3">
          <Image src="/logo-quiniela.png" alt="Quiniela" width={56} height={56} className="object-contain" priority />
          <div className="flex items-center gap-2 text-white/50 text-sm">
            <span>⚽</span>
            <span>Quiniela Mundial 2026</span>
          </div>
        </div>

        <div className="w-full bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm p-6">
          <h2 className="text-white font-semibold text-lg mb-5">Iniciar sesión</h2>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium text-white/50 block mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-white/50 block mb-1.5">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
                required
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors"
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-white/30 text-sm mt-4">
            ¿Primera vez?{' '}
            <Link href="/registro" className="text-amber-400 hover:text-amber-300">
              Regístrate aquí
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
