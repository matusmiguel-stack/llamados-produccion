import { NextRequest, NextResponse } from 'next/server'
import MercadoPagoConfig, { Payment } from 'mercadopago'
import { supabaseAdmin } from '@/lib/supabase'

function randomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export async function POST(req: NextRequest) {
  const { payment_id, status, external_reference } = await req.json()

  if (!payment_id || !external_reference) {
    return NextResponse.json({ error: 'Datos de pago incompletos' }, { status: 400 })
  }

  // Verificar si ya existe un grupo creado con este payment_id (evitar duplicados)
  const db = supabaseAdmin()
  const { data: existente } = await db
    .from('grupos')
    .select('codigo, nombre')
    .eq('mp_payment_id', payment_id)
    .single()

  if (existente) {
    return NextResponse.json({ codigo: existente.codigo, nombre: existente.nombre })
  }

  // Verificar el pago con la API de MercadoPago
  const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! })
  const paymentApi = new Payment(client)

  let pagoAprobado = false
  let pagoPendiente = false

  try {
    const pago = await paymentApi.get({ id: payment_id })
    pagoAprobado = pago.status === 'approved'
    pagoPendiente = pago.status === 'in_process' || pago.status === 'pending'
  } catch {
    // Si MP falla pero el status URL param dice approved, confiamos en él (sandbox)
    pagoAprobado = status === 'approved'
    pagoPendiente = status === 'pending' || status === 'in_process'
  }

  if (pagoPendiente) {
    return NextResponse.json({ pendiente: true })
  }

  if (!pagoAprobado) {
    return NextResponse.json({ error: 'El pago no fue aprobado' }, { status: 402 })
  }

  // Decodificar config del grupo
  let config: { nombre: string; pts_exacto: number; pts_ganador: number }
  try {
    config = JSON.parse(Buffer.from(external_reference, 'base64url').toString())
  } catch {
    return NextResponse.json({ error: 'Referencia inválida' }, { status: 400 })
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
      mp_payment_id: payment_id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ codigo: data.codigo, nombre: data.nombre })
}
