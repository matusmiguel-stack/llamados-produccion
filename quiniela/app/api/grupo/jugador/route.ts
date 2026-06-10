import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// DELETE /api/grupo/jugador?jugador_id=X — salirse de un grupo
export async function DELETE(req: NextRequest) {
  const jugador_id = req.nextUrl.searchParams.get('jugador_id')
  if (!jugador_id) return NextResponse.json({ error: 'jugador_id requerido' }, { status: 400 })

  const db = supabaseAdmin()
  // Borrar predicciones del jugador en este grupo
  await db.from('predicciones').delete().eq('jugador_id', jugador_id)
  // Borrar el jugador
  const { error } = await db.from('jugadores').delete().eq('id', jugador_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// POST /api/grupo/jugador — unirse a un grupo
// Acepta dos formas:
//   1. { nombre, grupo_id } — registro inicial
//   2. { codigo, jugador_id } — unirse a otro grupo con cuenta existente
export async function POST(req: NextRequest) {
  const body = await req.json()
  const db = supabaseAdmin()

  // Flujo 2: usuario ya registrado uniéndose a otro grupo por código
  if (body.codigo && body.jugador_id) {
    const { codigo, jugador_id } = body

    // Buscar el grupo por código
    const { data: grupo } = await db
      .from('grupos')
      .select('id, nombre')
      .eq('codigo', codigo.toUpperCase())
      .single()

    if (!grupo) return NextResponse.json({ error: 'Código de grupo inválido' }, { status: 404 })

    // Obtener el nombre del jugador
    const { data: jugador } = await db
      .from('jugadores')
      .select('nombre')
      .eq('id', jugador_id)
      .single()

    if (!jugador) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 })

    // Verificar si ya está en ese grupo
    const { data: existing } = await db
      .from('jugadores')
      .select('id')
      .eq('user_id', (await db.from('jugadores').select('user_id').eq('id', jugador_id).single()).data?.user_id)
      .eq('grupo_id', grupo.id)
      .single()

    if (existing) return NextResponse.json({ error: 'Ya eres parte de este grupo' }, { status: 409 })

    // Obtener user_id del jugador original
    const { data: jugadorCompleto } = await db
      .from('jugadores')
      .select('user_id, nombre')
      .eq('id', jugador_id)
      .single()

    if (!jugadorCompleto) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 })

    const { data, error } = await db
      .from('jugadores')
      .insert({ nombre: jugadorCompleto.nombre, grupo_id: grupo.id, user_id: jugadorCompleto.user_id })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Flujo 1: registro inicial con nombre y grupo_id
  const { nombre, grupo_id } = body
  if (!nombre || !grupo_id) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const { data: existing } = await db
    .from('jugadores')
    .select('*')
    .eq('nombre', nombre.trim())
    .eq('grupo_id', grupo_id)
    .single()

  if (existing) return NextResponse.json(existing)

  const { data, error } = await db
    .from('jugadores')
    .insert({ nombre: nombre.trim(), grupo_id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
