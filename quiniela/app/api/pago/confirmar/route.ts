import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabase'

function randomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export async function POST(req: NextRequest) {
  const { session_id } = await req.json()
  if (!session_id) return NextResponse.json({ error: 'Falta session_id' }, { status: 400 })

  // Evitar duplicados: si ya existe un grupo con este session_id, devolverlo
  const db = supabaseAdmin()
  const { data: existente } = await db
    .from('grupos')
    .select('codigo, nombre')
    .eq('mp_payment_id', session_id)
    .single()

  if (existente) return NextResponse.json({ codigo: existente.codigo, nombre: existente.nombre })

  // Verificar el pago con Stripe
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(session_id)
  } catch {
    return NextResponse.json({ error: 'Sesión de pago no encontrada' }, { status: 404 })
  }

  if (session.payment_status === 'unpaid') {
    return NextResponse.json({ pendiente: true })
  }

  if (session.payment_status !== 'paid') {
    return NextResponse.json({ error: 'El pago no fue aprobado' }, { status: 402 })
  }

  // Decodificar config del grupo desde metadata
  let config: { nombre: string; pts_exacto: number; pts_ganador: number; entrada?: number }
  try {
    config = JSON.parse(Buffer.from(session.metadata!.external_reference, 'base64url').toString())
  } catch {
    return NextResponse.json({ error: 'Metadata inválida' }, { status: 400 })
  }

  // Generar código único
  let codigo = randomCode()
  for (let i = 0; i < 5; i++) {
    const { data } = await db.from('grupos').select('id').eq('codigo', codigo).single()
    if (!data) break
    codigo = randomCode()
  }

  const { data, error } = await db
    .from('grupos')
    .insert({
      nombre: config.nombre,
      codigo,
      pts_exacto: config.pts_exacto,
      pts_ganador: config.pts_ganador,
      entrada: config.entrada ?? 0,
      mp_payment_id: session_id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ codigo: data.codigo, nombre: data.nombre })
}
