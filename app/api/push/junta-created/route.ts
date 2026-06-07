import { NextResponse } from "next/server"
import { sendPushToUser } from "../../../../lib/web-push"
import { getProfileIdsForEmployees } from "../../../../lib/employee-profile"

export async function POST(req: Request) {
  try {
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
