import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { calcularPuntos } from '@/lib/puntos'

const ADMIN_PASSWORD = 'Retro2026'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('password') !== ADMIN_PASSWORD)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = supabaseAdmin()
  const { data } = await db
    .from('partidos')
    .select('*')
    .order('fecha', { ascending: true })

  return NextResponse.json(data ?? [])
}

// PATCH /api/admin/partidos — actualiza resultado y recalcula puntos
export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { password, id, goles_local, goles_visitante, estado } = body

  if (password !== ADMIN_PASSWORD)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = supabaseAdmin()

  await db
    .from('partidos')
    .update({ goles_local, goles_visitante, estado })
    .eq('id', id)

  // Recalcular puntos si el partido está finalizado
  if (estado === 'finalizado' && goles_local != null && goles_visitante != null) {
    const { data: grupos } = await db.from('grupos').select('id, pts_exacto, pts_ganador')
    const grupoMap = new Map(grupos?.map((g) => [g.id, g]) ?? [])

    const { data: preds } = await db
      .from('predicciones')
      .select('id, jugador_id, goles_local, goles_visitante')
      .eq('partido_id', id)

    for (const pred of preds ?? []) {
      const { data: jugador } = await db
        .from('jugadores')
        .select('grupo_id')
        .eq('id', pred.jugador_id)
        .single()

      const grupo = jugador ? grupoMap.get(jugador.grupo_id) : null
      const ptsExacto = grupo?.pts_exacto ?? 3
      const ptsGanador = grupo?.pts_ganador ?? 1

      const puntos = calcularPuntos(
        pred.goles_local,
        pred.goles_visitante,
        goles_local,
        goles_visitante,
        ptsExacto,
        ptsGanador
      )

      await db.from('predicciones').update({ puntos }).eq('id', pred.id)
    }
  }

  return NextResponse.json({ ok: true })
}
