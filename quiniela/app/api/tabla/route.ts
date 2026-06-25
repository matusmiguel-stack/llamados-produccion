import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const grupo_id = req.nextUrl.searchParams.get('grupo_id')
  if (!grupo_id) return NextResponse.json({ error: 'grupo_id requerido' }, { status: 400 })

  const db = supabaseAdmin()

  const { data: grupos } = await db.from('grupos').select('pts_exacto').eq('id', grupo_id).single()
  const ptsExacto = grupos?.pts_exacto ?? 3

  // Sumar puntos directo en SQL para evitar el límite de 1000 filas
  const { data, error } = await db.rpc('tabla_grupo', { p_grupo_id: grupo_id, p_pts_exacto: ptsExacto })

  if (error) {
    // fallback: calcular en JS con paginación
    const { data: jugadores } = await db
      .from('jugadores')
      .select('id, nombre, pagado')
      .eq('grupo_id', grupo_id)

    if (!jugadores?.length) return NextResponse.json([])

    const tabla = await Promise.all(jugadores.map(async (j) => {
      const { data: agg } = await db
        .from('predicciones')
        .select('puntos')
        .eq('jugador_id', j.id)
        .not('puntos', 'is', null)

      const puntos_total = agg?.reduce((s, p) => s + (p.puntos ?? 0), 0) ?? 0
      const exactos = agg?.filter((p) => p.puntos === ptsExacto).length ?? 0
      return {
        jugador_id: j.id,
        nombre: j.nombre,
        puntos_total,
        exactos,
        predicciones: agg?.length ?? 0,
        pagado: j.pagado ?? false,
      }
    }))

    tabla.sort((a, b) => b.puntos_total - a.puntos_total || b.exactos - a.exactos)
    return NextResponse.json(tabla)
  }

  return NextResponse.json(data)
}
