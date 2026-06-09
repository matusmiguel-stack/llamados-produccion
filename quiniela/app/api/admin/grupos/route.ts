import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const ADMIN_PASSWORD = 'Retro2026'

function checkAuth(password: string | null) {
  return password === ADMIN_PASSWORD
}

function randomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

// GET /api/admin/grupos?password=X — listar todos los grupos
export async function GET(req: NextRequest) {
  const password = req.nextUrl.searchParams.get('password')
  if (!checkAuth(password)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = supabaseAdmin()
  const { data, error } = await db
    .from('grupos')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/admin/grupos — crear grupo
export async function POST(req: NextRequest) {
  const { password, nombre, pts_exacto = 3, pts_ganador = 1 } = await req.json()
  if (!checkAuth(password)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!nombre) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  const db = supabaseAdmin()
  let codigo = randomCode()
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

// DELETE /api/admin/grupos?password=X&id=Y — eliminar grupo
export async function DELETE(req: NextRequest) {
  const password = req.nextUrl.searchParams.get('password')
  const id = req.nextUrl.searchParams.get('id')
  if (!checkAuth(password)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const db = supabaseAdmin()
  const { error } = await db.from('grupos').delete().eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
