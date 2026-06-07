import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { sendPushToUser } from "../../../../lib/web-push"

export async function POST(req: Request) {
  try {
    const { juntaId, tipo, titulo, fecha, horaInicio, attendeeEmployeeIds } = await req.json()
    if (!juntaId) return NextResponse.json({ ok: true, skipped: true })

    const admin = createAdminClient()

    // Obtener todos los profiles (para notificar a todos)
    const { data: allProfiles } = await admin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "editor", "productor", "viewer"])

    const label = titulo || tipo || "Junta"
    const [y, m, d] = fecha.split("-")
    const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]
    const fechaLabel = `${parseInt(d)} ${meses[parseInt(m)-1]}`

    for (const profile of allProfiles || []) {
      try {
        await sendPushToUser(profile.id, {
          title: `📋 Nueva junta programada`,
          body: `${label} · ${fechaLabel}${horaInicio ? ` a las ${horaInicio}` : ""}`,
          url: "/",
        })
      } catch { /* continuar */ }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
