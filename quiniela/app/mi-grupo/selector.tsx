'use client'

import Link from 'next/link'
import Image from 'next/image'

interface Props {
  grupos: { codigo: string; nombre: string }[]
}

export default function MiGrupoSelector({ grupos }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 max-w-sm mx-auto">
      <div className="h-px fixed top-0 left-0 right-0 bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

      <div className="relative mb-6">
        <div className="absolute inset-0 blur-3xl bg-amber-400/15 rounded-full scale-150" />
        <Image src="/logo-quiniela.png" alt="" width={72} height={72} className="relative object-contain drop-shadow-2xl" />
      </div>

      <h1 className="text-white font-bold text-lg mb-1">¿A cuál grupo entras?</h1>
      <p className="text-white/30 text-sm mb-8">Estás en {grupos.length} quinielas</p>

      <div className="flex flex-col gap-3 w-full">
        {grupos.map((g) => (
          <Link
            key={g.codigo}
            href={`/grupo/${g.codigo}`}
            className="relative overflow-hidden flex items-center justify-between bg-white/4 border border-white/8 hover:border-amber-400/20 hover:bg-amber-500/6 rounded-2xl px-5 py-4 transition-all group"
          >
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/6 to-transparent" />
            <div>
              <p className="text-white font-semibold text-sm group-hover:text-amber-200 transition-colors">{g.nombre}</p>
              <p className="text-white/25 text-xs font-mono mt-0.5">{g.codigo}</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white/20 group-hover:text-amber-400/60 transition-colors flex-shrink-0">
              <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        ))}

        <Link
          href="/crear"
          className="text-center text-white/25 hover:text-amber-400/70 text-sm py-3 transition-colors"
        >
          ✦ Crear otra quiniela
        </Link>
      </div>
    </div>
  )
}
