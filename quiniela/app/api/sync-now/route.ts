import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getMatches, mapMatchToPartido } from '@/lib/football-api'
import { calcularPuntos } from '@/lib/puntos'

export async function GET() {
  const db = supabaseAdmin()

  const matches = await getMatches()
  const partidos = matches.map(mapMatchToPartido)

  for (const p of partidos) {
    await db.from('partidos').upsert(p, { onConflict: 'api_id' })
  }

  const { data: finalizados } = await db
    .from('partidos')
    .select('*')
    .eq('estado', 'finalizado')

  if (!finalizados?.length) return NextResponse.json({ ok: true, synced: partidos.length, puntos: 0 })

  const { data: grupos } = await db.from('grupos').select('id, pts_exacto, pts_ganador')
  const grupoMap = new Map(grupos?.map((g) => [g.id, g]) ?? [])

  let puntosActualizados = 0
  for (const partido of finalizados) {
    if (partido.goles_local == null || partido.goles_visitante == null) continue

    const { data: preds } = await db
      .from('predicciones')
      .select('id, jugador_id, goles_local, goles_visitante')
      .eq('partido_id', partido.id)
      .is('puntos', null)

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
        partido.goles_local,
        partido.goles_visitante,
        ptsExacto,
        ptsGanador
      )

      await db.from('predicciones').update({ puntos }).eq('id', pred.id)
      puntosActualizados++
    }
  }

  return NextResponse.json({ ok: true, synced: partidos.length, puntos: puntosActualizados })
}

