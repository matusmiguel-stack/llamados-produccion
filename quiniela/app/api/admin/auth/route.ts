import { NextRequest, NextResponse } from 'next/server'

// Cambia este valor por tu contraseña
const ADMIN_PASSWORD = 'Retro2026'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  if (password !== ADMIN_PASSWORD)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ ok: true })
}
