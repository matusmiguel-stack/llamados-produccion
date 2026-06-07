import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { sendPushToUser } from "../../../../lib/web-push"

export async function POST(req: Request) {
  try {
    const { juntaId, tipo, titulo, fecha, horaInicio, attendeeEmployeeIds } = await req.json()
    if (!juntaId) return NextResponse.json({ ok: true, skipped: true })

    const admin = createAdminClient()

    const label = titulo || tipo || "Junta"
    const [y, m, d] = fecha.split("-")
    const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]
    const fechaLabel = `${parseInt(d)} ${meses[parseInt(m)-1]}`

    // Solo notificar a los asistentes seleccionados
    for (const employeeId of attendeeEmployeeIds || []) {
      const { data: emp } = await admin
        .from("employees")
        .select("id, profiles(id)")
        .eq("id", employeeId)
        .single()

      const profileId = (emp?.profiles as any)?.id
      if (!profileId) continue

      try {
        await sendPushToUser(profileId, {
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
