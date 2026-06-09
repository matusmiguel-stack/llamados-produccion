'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

type Estado = 'verificando' | 'ok' | 'pendiente' | 'error'

export default function ExitoPage() {
  return (
    <Suspense>
      <ExitoContent />
    </Suspense>
  )
}

function ExitoContent() {
  const searchParams = useSearchParams()
  const [estado, setEstado] = useState<Estado>('verificando')
  const [codigo, setCodigo] = useState('')
  const [nombreGrupo, setNombreGrupo] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const sessionId = searchParams.get('session_id')
    if (!sessionId) {
      setEstado('error')
      setError('No se encontró información del pago.')
      return
    }

    const crear = async () => {
      const res = await fetch('/api/pago/confirmar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      })
      const data = await res.json()

      if (res.ok && data.codigo) {
        setCodigo(data.codigo)
        setNombreGrupo(data.nombre)
        setEstado('ok')
      } else if (data.pendiente) {
        setEstado('pendiente')
      } else {
        setEstado('error')
        setError(data.error ?? 'Error al crear el grupo')
      }
    }

    crear()
  }, [searchParams])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 max-w-sm mx-auto">
      <div className="h-px fixed top-0 left-0 right-0 bg-gradient-to-r from-transparent via-amber-400/60 to-transparent z-10" />

      {estado === 'verificando' && (
        <div className="flex flex-col items-center gap-4 text-center">
          <Image src="/logo-quiniela.png" alt="" width={64} height={64} className="object-contain opacity-40 animate-pulse" />
          <p className="text-white/40 text-sm">Verificando pago y creando tu grupo…</p>
        </div>
      )}

      {estado === 'ok' && (
        <div className="flex flex-col items-center gap-6 text-center w-full">
          <div className="relative">
            <div className="absolute inset-0 blur-3xl bg-amber-400/20 rounded-full scale-150" />
            <Image src="/logo-quiniela.png" alt="" width={80} height={80} className="relative object-contain drop-shadow-2xl" />
          </div>

          <div>
            <p className="text-amber-300 font-bold text-lg">¡Quiniela creada!</p>
            <p className="text-white/40 text-sm mt-1">{nombreGrupo}</p>
          </div>

          <div className="relative bg-amber-500/8 border border-amber-400/20 rounded-2xl p-6 w-full overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
            <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Tu código de grupo</p>
            <p className="text-amber-300 font-bold text-4xl tracking-[0.3em] font-mono">{codigo}</p>
            <p className="text-white/25 text-xs mt-3">Comparte este código con tus amigos para que se unan</p>
          </div>

          <div className="flex flex-col gap-3 w-full">
            <Link
              href="/registro"
              className="relative overflow-hidden bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold text-center py-4 px-6 rounded-2xl shadow-xl shadow-amber-900/30 transition-all"
            >
              <div className="absolute top-0 left-0 right-0 h-px bg-white/20" />
              Registrarme y entrar →
            </Link>
            <Link
              href="/login"
              className="text-white/35 hover:text-white/60 font-medium text-center py-3 text-sm transition-colors"
            >
              Ya tengo cuenta → Iniciar sesión
            </Link>
          </div>

          <p className="text-white/15 text-xs">Guarda el código antes de salir</p>
        </div>
      )}

      {estado === 'pendiente' && (
        <div className="flex flex-col items-center gap-5 text-center">
          <Image src="/logo-quiniela.png" alt="" width={64} height={64} className="object-contain opacity-60" />
          <div>
            <p className="text-white font-bold text-lg">Pago en proceso</p>
            <p className="text-white/40 text-sm mt-2 leading-relaxed">Tu pago está siendo procesado. Cuando se confirme recibirás tu código.</p>
          </div>
          <Link href="/" className="text-amber-400/70 hover:text-amber-300 text-sm transition-colors">← Volver al inicio</Link>
        </div>
      )}

      {estado === 'error' && (
        <div className="flex flex-col items-center gap-5 text-center">
          <Image src="/logo-quiniela.png" alt="" width={64} height={64} className="object-contain opacity-30" />
          <div>
            <p className="text-white font-bold text-lg">Algo salió mal</p>
            <p className="text-white/40 text-sm mt-2 leading-relaxed">{error}</p>
          </div>
          <Link href="/crear" className="text-amber-400/70 hover:text-amber-300 text-sm transition-colors">← Intentar de nuevo</Link>
        </div>
      )}
    </div>
  )
}
