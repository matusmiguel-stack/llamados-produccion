import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// POST /api/prediccion — guardar o actualizar predicción
export async function POST(req: NextRequest) {
  const { jugador_id, partido_id, goles_local, goles_visitante } = await req.json()

  if (!jugador_id || !partido_id || goles_local == null || goles_visitante == null)
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const db = supabaseAdmin()

  // verificar que el partido no haya empezado
  const { data: partido } = await db
    .from('partidos')
    .select('fecha, estado')
    .eq('id', partido_id)
    .single()

  if (!partido) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 })

  const fechaPartido = new Date(partido.fecha)
  const ahora = new Date()
  const minutosRestantes = (fechaPartido.getTime() - ahora.getTime()) / 60000

  if (partido.estado !== 'pendiente' || minutosRestantes < 60)
    return NextResponse.json({ error: 'Ya no se pueden modificar predicciones para este partido' }, { status: 400 })

  const { data, error } = await db
    .from('predicciones')
    .upsert(
      { jugador_id, partido_id, goles_local, goles_visitante },
      { onConflict: 'jugador_id,partido_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
