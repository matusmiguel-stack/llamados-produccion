import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// POST /api/grupo/jugador — unirse a un grupo
export async function POST(req: NextRequest) {
  const { nombre, grupo_id } = await req.json()
  if (!nombre || !grupo_id) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })

  const db = supabaseAdmin()

  // si ya existe ese nombre en el grupo, devolver el existente
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
