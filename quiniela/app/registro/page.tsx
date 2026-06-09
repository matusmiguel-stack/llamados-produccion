'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createSupabaseBrowserClient } from '@/lib/supabase-browser'

export default function RegistroPage() {
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [codigoGrupo, setCodigoGrupo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleRegistro = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const grupoRes = await fetch(`/api/grupo?codigo=${codigoGrupo.trim().toUpperCase()}`)
      if (!grupoRes.ok) { setError('Código de grupo no encontrado'); return }
      const grupo = await grupoRes.json()

      const supabase = createSupabaseBrowserClient()
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nombre: nombre.trim() } },
      })

      if (authError) {
        setError(authError.message.includes('already registered') ? 'Este email ya está registrado. Inicia sesión.' : authError.message)
        return
      }

      if (!authData.user) { setError('Error al crear la cuenta'); return }

      const jugadorRes = await fetch('/api/auth/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: authData.user.id, nombre: nombre.trim(), grupo_id: grupo.id }),
      })
      if (!jugadorRes.ok) {
        const jugadorErr = await jugadorRes.json()
        setError(jugadorErr.error || 'Error al unirse al grupo')
        return
      }

      router.push(`/grupo/${grupo.codigo}`)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-amber-400/50 focus:bg-white/7 transition-all text-sm"

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="fixed top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

      <div className="w-full max-w-sm flex flex-col items-center gap-10">
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

        <div className="w-full relative">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-amber-400/5 to-transparent pointer-events-none" />
          <div className="relative bg-white/4 border border-white/10 rounded-2xl p-6 backdrop-blur-md shadow-2xl">
            <h2 className="text-white font-semibold text-base mb-5 tracking-tight">Crear cuenta</h2>

            <form onSubmit={handleRegistro} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-medium text-white/40 block mb-1.5 uppercase tracking-wider">Tu nombre</label>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="¿Cómo te llamas?" className={inputClass} required />
              </div>
              <div>
                <label className="text-xs font-medium text-white/40 block mb-1.5 uppercase tracking-wider">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" className={inputClass} required />
              </div>
              <div>
                <label className="text-xs font-medium text-white/40 block mb-1.5 uppercase tracking-wider">Contraseña</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" minLength={6} className={inputClass} required />
              </div>
              <div>
                <label className="text-xs font-medium text-white/40 block mb-1.5 uppercase tracking-wider">Código del grupo</label>
                <input
                  value={codigoGrupo}
                  onChange={(e) => setCodigoGrupo(e.target.value.toUpperCase())}
                  placeholder="AB12CD"
                  maxLength={6}
                  className={`${inputClass} font-mono tracking-[0.3em] text-center text-lg`}
                  required
                />
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading || !nombre || !email || !password || !codigoGrupo}
                className="w-full bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-amber-900/30 mt-1"
              >
                {loading ? 'Creando cuenta…' : 'Registrarme'}
              </button>
            </form>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-white/8" />
              <span className="text-white/20 text-xs">o</span>
              <div className="flex-1 h-px bg-white/8" />
            </div>

            <p className="text-center text-white/30 text-sm">
              ¿Ya tienes cuenta?{' '}
              <Link href="/login" className="text-amber-400 hover:text-amber-300 font-medium transition-colors">
                Inicia sesión
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
