import { NextResponse } from "next/server"
import { sendPushToUser, markNotificationSent } from "../../../../lib/web-push"
import { getProfileIdsForEmployees } from "../../../../lib/employee-profile"

export async function POST(req: Request) {
  try {
    const { shootId, shootTitle, shootDate, employeeIds } = await req.json()
    if (!shootId || !employeeIds?.length) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const profileMap = await getProfileIdsForEmployees(employeeIds)

    for (const employeeId of employeeIds) {
      const profileId = profileMap[employeeId]
      if (!profileId) continue

      const refId = `shoot-asignado-${shootId}-${employeeId}`
      const isNew = await markNotificationSent("shoot_asignado", refId, profileId)
      if (!isNew) continue

      await sendPushToUser(profileId, {
        title: "🎬 Nuevo llamado asignado",
        body: `${shootTitle || "Llamado"} · ${shootDate || ""}`,
        url: "/",
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
