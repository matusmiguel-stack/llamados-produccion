import { NextResponse } from "next/server"
import { sendJuntaInvites } from "../../../../lib/junta-email"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const result = await sendJuntaInvites(body)
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
