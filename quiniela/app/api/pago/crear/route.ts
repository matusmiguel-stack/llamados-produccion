import { NextRequest, NextResponse } from 'next/server'
import MercadoPagoConfig, { Preference } from 'mercadopago'

export async function POST(req: NextRequest) {
  const { nombre, pts_exacto, pts_ganador } = await req.json()
  if (!nombre) return NextResponse.json({ error: 'Falta el nombre' }, { status: 400 })

  const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! })
  const preference = new Preference(client)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://quiniela-mundial.vercel.app'

  // Codificamos la config del grupo en external_reference para recuperarla en el éxito
  const externalRef = Buffer.from(JSON.stringify({ nombre, pts_exacto, pts_ganador })).toString('base64url')

  const result = await preference.create({
    body: {
      items: [
        {
          id: 'quiniela-mundial-2026',
          title: `Quiniela: ${nombre}`,
          description: 'Grupo para la Quiniela del Mundial 2026',
          quantity: 1,
          unit_price: 99,
          currency_id: 'MXN',
        },
      ],
      external_reference: externalRef,
      back_urls: {
        success: `${baseUrl}/crear/exito`,
        failure: `${baseUrl}/crear`,
        pending: `${baseUrl}/crear/exito`,
      },
      auto_return: 'approved',
    },
  })

  return NextResponse.json({ init_point: result.init_point })
}
