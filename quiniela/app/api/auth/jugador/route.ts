import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/auth/jugador?user_id=X
export async function GET(req: NextRequest) {
  const user_id = req.nextUrl.searchParams.get('user_id')
  if (!user_id) return NextResponse.json({ error: 'user_id requerido' }, { status: 400 })

  const db = supabaseAdmin()
  const { data, error } = await db
    .from('jugadores')
    .select('id, nombre, grupo_id')
    .eq('user_id', user_id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 })
  return NextResponse.json(data)
}
