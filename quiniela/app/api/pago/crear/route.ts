import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

export async function POST(req: NextRequest) {
  const { nombre, pts_exacto, pts_ganador } = await req.json()
  if (!nombre) return NextResponse.json({ error: 'Falta el nombre' }, { status: 400 })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://quiniela-mundial.vercel.app'

  const externalRef = Buffer.from(JSON.stringify({ nombre, pts_exacto, pts_ganador })).toString('base64url')

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'mxn',
          unit_amount: 9900, // $99.00 MXN en centavos
          product_data: {
            name: `Quiniela: ${nombre}`,
            description: 'Grupo para la Quiniela del Mundial 2026 · 104 partidos',
          },
        },
        quantity: 1,
      },
    ],
    metadata: { external_reference: externalRef },
    success_url: `${baseUrl}/crear/exito?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/crear`,
  })

  return NextResponse.json({ url: session.url })
}
