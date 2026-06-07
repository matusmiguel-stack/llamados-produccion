import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendPushToUser } from "../../../../lib/web-push"

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    await sendPushToUser(user.id, {
      title: "🔔 Push funcionando",
      body: "Las notificaciones en background están activas",
      url: "/",
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
