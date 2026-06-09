import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

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
