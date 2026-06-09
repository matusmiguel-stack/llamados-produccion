import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function randomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

// POST /api/grupo — crear grupo
export async function POST(req: NextRequest) {
  const { nombre, pts_exacto = 3, pts_ganador = 1 } = await req.json()
  if (!nombre) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  const db = supabaseAdmin()
  let codigo = randomCode()

  // garantizar unicidad
  for (let i = 0; i < 5; i++) {
    const { data } = await db.from('grupos').select('id').eq('codigo', codigo).single()
    if (!data) break
    codigo = randomCode()
  }

  const { data, error } = await db
    .from('grupos')
    .insert({ nombre, codigo, pts_exacto, pts_ganador })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// GET /api/grupo?codigo=XXX — buscar grupo por código
export async function GET(req: NextRequest) {
  const codigo = req.nextUrl.searchParams.get('codigo')
  if (!codigo) return NextResponse.json({ error: 'Código requerido' }, { status: 400 })

  const db = supabaseAdmin()
  const { data, error } = await db
    .from('grupos')
    .select('*')
    .eq('codigo', codigo.toUpperCase())
    .single()

  if (error || !data) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 })
  return NextResponse.json(data)
}
