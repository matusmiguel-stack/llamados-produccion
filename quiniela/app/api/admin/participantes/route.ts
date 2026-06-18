import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const ADMIN_PASSWORD = 'Retro2026'

export async function GET(req: NextRequest) {
  const password = req.nextUrl.searchParams.get('password')
  const grupo_id = req.nextUrl.searchParams.get('grupo_id')
  if (password !== ADMIN_PASSWORD) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!grupo_id) return NextResponse.json({ error: 'grupo_id requerido' }, { status: 400 })

  const db = supabaseAdmin()
  const { data, error } = await db
    .from('jugadores')
    .select('id, nombre, created_at, user_id, pagado')
    .eq('grupo_id', grupo_id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const userIds = data?.map((j) => j.user_id).filter(Boolean) ?? []
  const emailMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: { users } } = await db.auth.admin.listUsers()
    users?.forEach((u) => { if (u.email) emailMap[u.id] = u.email })
  }

  const result = data?.map((j) => ({
    id: j.id,
    nombre: j.nombre,
    email: emailMap[j.user_id] ?? '—',
    created_at: j.created_at,
    pagado: j.pagado ?? false,
  }))

  return NextResponse.json(result)
}

// PATCH — marcar/desmarcar pagado
export async function PATCH(req: NextRequest) {
  const { password, jugador_id, pagado } = await req.json()
  if (password !== ADMIN_PASSWORD) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = supabaseAdmin()
  const { error } = await db.from('jugadores').update({ pagado }).eq('id', jugador_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
