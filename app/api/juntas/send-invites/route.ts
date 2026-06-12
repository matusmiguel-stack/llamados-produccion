import { NextResponse } from "next/server"
import { sendJuntaInvites } from "../../../../lib/junta-email"
import { verifyApiRole } from "../../../../lib/api-auth"

export async function POST(req: Request) {
  try {
    // Mismos roles que pueden crear juntas en la app
    const user = await verifyApiRole(req, ["admin", "editor", "editor_premium", "productor"])
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const body = await req.json()
    const result = await sendJuntaInvites(body)
    return NextResponse.json(result)
  } catch (err: any) {
    console.error("[send-invites] error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
