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
      // 1. Verificar que el grupo existe
      const grupoRes = await fetch(`/api/grupo?codigo=${codigoGrupo.trim().toUpperCase()}`)
      if (!grupoRes.ok) { setError('Código de grupo no encontrado'); return }
      const grupo = await grupoRes.json()

      // 2. Crear usuario en Supabase Auth
      const supabase = createSupabaseBrowserClient()
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nombre } },
      })

      if (authError) {
        if (authError.message.includes('already registered')) {
          setError('Este email ya está registrado. Inicia sesión.')
        } else {
          setError(authError.message)
        }
        return
      }

      if (!authData.user) { setError('Error al crear la cuenta'); return }

      // 3. Crear jugador vinculado al usuario
      const jugadorRes = await fetch('/api/auth/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: authData.user.id,
          nombre: nombre.trim(),
          grupo_id: grupo.id,
        }),
      })

      if (!jugadorRes.ok) { setError('Error al unirse al grupo'); return }

      router.push(`/grupo/${grupo.codigo}`)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-violet-500/60 transition-colors"

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3">
          <Image src="/logo-retro.png" alt="Retro" width={120} height={40} className="object-contain" priority />
          <div className="flex items-center gap-2 text-white/50 text-sm">
            <span>⚽</span>
            <span>Quiniela Mundial 2026</span>
          </div>
        </div>

        <div className="w-full bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm p-6">
          <h2 className="text-white font-semibold text-lg mb-5">Crear cuenta</h2>

          <form onSubmit={handleRegistro} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium text-white/50 block mb-1.5">Tu nombre</label>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="¿Cómo te llamas?"
                className={inputClass}
                required
              />
            </div>
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
                placeholder="Mínimo 6 caracteres"
                minLength={6}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-white/50 block mb-1.5">Código del grupo</label>
              <input
                value={codigoGrupo}
                onChange={(e) => setCodigoGrupo(e.target.value.toUpperCase())}
                placeholder="ej. AB12CD"
                maxLength={6}
                className={`${inputClass} font-mono tracking-widest text-center text-lg`}
                required
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading || !nombre || !email || !password || !codigoGrupo}
              className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors"
            >
              {loading ? 'Creando cuenta…' : 'Registrarme'}
            </button>
          </form>

          <p className="text-center text-white/30 text-sm mt-4">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="text-violet-400 hover:text-violet-300">
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
