import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/tabla?grupo_id=X
export async function GET(req: NextRequest) {
  const grupo_id = req.nextUrl.searchParams.get('grupo_id')
  if (!grupo_id) return NextResponse.json({ error: 'grupo_id requerido' }, { status: 400 })

  const db = supabaseAdmin()

  const { data: jugadores } = await db
    .from('jugadores')
    .select('id, nombre')
    .eq('grupo_id', grupo_id)

  if (!jugadores?.length) return NextResponse.json([])

  const jugadorIds = jugadores.map((j) => j.id)

  const { data: predicciones } = await db
    .from('predicciones')
    .select('jugador_id, puntos')
    .in('jugador_id', jugadorIds)
    .not('puntos', 'is', null)

  const tabla = jugadores.map((j) => {
    const preds = predicciones?.filter((p) => p.jugador_id === j.id) ?? []
    const puntos_total = preds.reduce((sum, p) => sum + (p.puntos ?? 0), 0)
    return {
      jugador_id: j.id,
      nombre: j.nombre,
      puntos_total,
      predicciones: preds.length,
    }
  })

  tabla.sort((a, b) => b.puntos_total - a.puntos_total)
  return NextResponse.json(tabla)
}
