import Link from 'next/link'
import Image from 'next/image'

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="h-px absolute top-0 left-0 right-0 bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

      {/* Logo */}
      <div className="relative mb-8">
        <div className="absolute inset-0 blur-3xl bg-amber-400/20 rounded-full scale-150" />
        <Image src="/logo-quiniela.png" alt="Quiniela Mundial 2026" width={120} height={120} className="relative object-contain drop-shadow-2xl" />
      </div>

      <div className="text-center mb-10 max-w-xs">
        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Quiniela<br/>Mundial 2026</h1>
        <p className="text-white/35 text-sm leading-relaxed">Crea tu grupo, predice los resultados y compite con tus amigos en el mejor mundial de la historia.</p>
      </div>

      {/* CTAs */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Link
          href="/crear"
          className="relative overflow-hidden bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-semibold text-center py-4 px-6 rounded-2xl shadow-xl shadow-amber-900/30 transition-all active:scale-95"
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-white/20" />
          ✦ Crear mi quiniela
        </Link>

        <Link
          href="/login"
          className="text-white/40 hover:text-white/70 font-medium text-center py-3 px-6 rounded-2xl border border-white/8 bg-white/4 transition-all text-sm"
        >
          Ya tengo un grupo → Entrar
        </Link>
      </div>

      <p className="text-white/15 text-xs mt-10">Mundial 2026 · México, USA & Canadá</p>

      <Link href="/admin" className="absolute bottom-4 right-4 text-white/10 hover:text-white/30 text-xs transition-colors">
        admin
      </Link>
    </div>
  )
}
