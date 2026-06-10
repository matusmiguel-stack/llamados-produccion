import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/auth/mis-grupos?user_id=X
export async function GET(req: NextRequest) {
  const user_id = req.nextUrl.searchParams.get('user_id')
  if (!user_id) return NextResponse.json({ error: 'user_id requerido' }, { status: 400 })

  const db = supabaseAdmin()
  const { data, error } = await db
    .from('jugadores')
    .select('grupos(codigo, nombre)')
    .eq('user_id', user_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const grupos = data
    ?.map((j) => j.grupos as unknown as { codigo: string; nombre: string } | null)
    .filter(Boolean) as { codigo: string; nombre: string }[]

  return NextResponse.json(grupos ?? [])
}
