import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createAdminClient } from "../../../../lib/supabase-admin"

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error } = await userClient.auth.getUser()
    if (error || !user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { endpoint, p256dh, auth } = await req.json()
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: "Datos de suscripción inválidos" }, { status: 400 })
    }

    const admin = createAdminClient()
    await admin.from("push_subscriptions").upsert(
      { user_id: user.id, endpoint, p256dh, auth },
      { onConflict: "user_id,endpoint" },
    )

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user }, error } = await userClient.auth.getUser()
    if (error || !user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { endpoint } = await req.json()
    const admin = createAdminClient()
    await admin.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
