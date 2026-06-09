import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// POST /api/auth/registro — vincula usuario auth con jugador+grupo
export async function POST(req: NextRequest) {
  const { user_id, nombre, grupo_id } = await req.json()
  if (!user_id || !nombre || !grupo_id)
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const db = supabaseAdmin()

  // verificar que el grupo existe
  const { data: grupo } = await db.from('grupos').select('id').eq('id', grupo_id).single()
  if (!grupo) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })

  // verificar que este user_id no está ya en otro grupo
  const { data: existing } = await db.from('jugadores').select('id').eq('user_id', user_id).single()
  if (existing) return NextResponse.json({ error: 'Ya estás registrado en un grupo' }, { status: 400 })

  const { data, error } = await db
    .from('jugadores')
    .insert({ user_id, nombre: nombre.trim(), grupo_id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
