import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/tabla?grupo_id=X
export async function GET(req: NextRequest) {
  const grupo_id = req.nextUrl.searchParams.get('grupo_id')
  if (!grupo_id) return NextResponse.json({ error: 'grupo_id requerido' }, { status: 400 })

  const db = supabaseAdmin()

  const { data: jugadores } = await db
    .from('jugadores')
    .select('id, nombre, pagado')
    .eq('grupo_id', grupo_id)

  if (!jugadores?.length) return NextResponse.json([])

  const jugadorIds = jugadores.map((j) => j.id)

  const { data: predicciones } = await db
    .from('predicciones')
    .select('jugador_id, puntos')
    .in('jugador_id', jugadorIds)
    .not('puntos', 'is', null)

  const { data: grupos } = await db.from('grupos').select('pts_exacto').eq('id', grupo_id).single()
  const ptsExacto = grupos?.pts_exacto ?? 3

  const tabla = jugadores.map((j) => {
    const preds = predicciones?.filter((p) => p.jugador_id === j.id) ?? []
    const puntos_total = preds.reduce((sum, p) => sum + (p.puntos ?? 0), 0)
    const exactos = preds.filter((p) => p.puntos === ptsExacto).length
    return {
      jugador_id: j.id,
      nombre: j.nombre,
      puntos_total,
      exactos,
      predicciones: preds.length,
      pagado: j.pagado ?? false,
    }
  })

  tabla.sort((a, b) => b.puntos_total - a.puntos_total || b.exactos - a.exactos)
  return NextResponse.json(tabla)
}
