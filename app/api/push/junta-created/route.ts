import { NextResponse } from "next/server"
import { sendPushToUser, markNotificationSent } from "../../../../lib/web-push"
import { getProfileIdsForEmployees } from "../../../../lib/employee-profile"
import { verifyApiRole } from "../../../../lib/api-auth"

export async function POST(req: Request) {
  try {
    // Mismos roles que pueden crear juntas en la app
    const user = await verifyApiRole(req, ["admin", "editor", "editor_premium", "productor"])
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { juntaId, tipo, titulo, fecha, horaInicio, attendeeEmployeeIds } = await req.json()
    if (!juntaId || !attendeeEmployeeIds?.length) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const label = titulo || tipo || "Junta"
    const [, m, d] = fecha.split("-")
    const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]
    const fechaLabel = `${parseInt(d)} ${meses[parseInt(m)-1]}`

    const profileMap = await getProfileIdsForEmployees(attendeeEmployeeIds)

    for (const employeeId of attendeeEmployeeIds) {
      const profileId = profileMap[employeeId]
      if (!profileId) continue

      const refId = `junta-creada-${juntaId}-${employeeId}`
      const isNew = await markNotificationSent("junta_creada", refId, profileId)
      if (!isNew) continue

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
