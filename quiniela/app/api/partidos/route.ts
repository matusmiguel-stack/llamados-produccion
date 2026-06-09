import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/partidos?grupo_id=X&jugador_id=Y
export async function GET(req: NextRequest) {
  const grupo_id = req.nextUrl.searchParams.get('grupo_id')
  const jugador_id = req.nextUrl.searchParams.get('jugador_id')

  const db = supabaseAdmin()

  const { data: partidos, error } = await db
    .from('partidos')
    .select('*')
    .order('fecha', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!jugador_id) return NextResponse.json(partidos)

  // incluir predicciones del jugador
  const { data: predicciones } = await db
    .from('predicciones')
    .select('*')
    .eq('jugador_id', jugador_id)

  const predMap = new Map(predicciones?.map((p) => [p.partido_id, p]) ?? [])

  const result = partidos?.map((p) => ({
    ...p,
    prediccion: predMap.get(p.id) ?? null,
  }))

  return NextResponse.json(result)
}
