import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) return NextResponse.json({ error: 'ADMIN_PASSWORD no configurado en Vercel' }, { status: 500 })
  if (password !== expected)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ ok: true })
}
