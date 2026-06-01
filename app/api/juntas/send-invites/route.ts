import { NextResponse } from "next/server"
import { sendJuntaInvites } from "../../../../lib/junta-email"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    console.log("[send-invites] body:", JSON.stringify(body))
    const result = await sendJuntaInvites(body)
    console.log("[send-invites] result:", JSON.stringify(result))
    return NextResponse.json(result)
  } catch (err: any) {
    console.error("[send-invites] error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
