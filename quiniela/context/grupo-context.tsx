'use client'

import { createContext, useContext } from 'react'

export interface GrupoInfo {
  id: string
  nombre: string
  codigo: string
  pts_exacto: number
  pts_ganador: number
  entrada: number
  num_jugadores: number
}

export interface GrupoContextValue {
  grupoId: string
  jugadorId: string
  jugadorNombre: string
  grupoCodigo: string
  grupoNombre: string
  grupo: GrupoInfo
  misGrupos: { codigo: string; nombre: string }[]
  sinPrediccion: number
  setSinPrediccion: (n: number) => void
  openUnirse: () => void
}

export const GrupoContext = createContext<GrupoContextValue | null>(null)

export function useGrupo(): GrupoContextValue {
  const ctx = useContext(GrupoContext)
  if (!ctx) throw new Error('useGrupo must be used within GrupoLayout')
  return ctx
}
