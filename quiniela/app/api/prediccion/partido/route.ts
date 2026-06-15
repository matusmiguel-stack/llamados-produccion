import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/prediccion/partido?partido_id=X&grupo_id=Y
// Devuelve todas las predicciones de los jugadores de un grupo para un partido cerrado
export async function GET(req: NextRequest) {
  const partido_id = req.nextUrl.searchParams.get('partido_id')
  const grupo_id   = req.nextUrl.searchParams.get('grupo_id')
  if (!partido_id || !grupo_id) {
    return NextResponse.json({ error: 'partido_id y grupo_id son requeridos' }, { status: 400 })
  }

  const db = supabaseAdmin()

  const { data: partido } = await db
    .from('partidos')
    .select('fecha, estado')
    .eq('id', partido_id)
    .single()

  if (partido) {
    const minutosRestantes = (new Date(partido.fecha).getTime() - Date.now()) / 60000
    if (partido.estado === 'pendiente' && minutosRestantes > 15) {
      return NextResponse.json({ error: 'Predicciones ocultas hasta que empiece el partido' }, { status: 403 })
    }
  }

  const { data, error } = await db
    .from('predicciones')
    .select('goles_local, goles_visitante, puntos, jugador:jugadores!inner(id, nombre, grupo_id)')
    .eq('partido_id', partido_id)
    .eq('jugadores.grupo_id', grupo_id)
    .order('puntos', { ascending: false, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
