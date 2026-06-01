import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { sendPushToUser, markNotificationSent } from "../../../../lib/web-push"

// Llamado internamente desde saveShoot cuando se asigna a alguien al llamado
export async function POST(req: Request) {
  try {
    const { shootId, shootTitle, shootDate, employeeIds } = await req.json()
    if (!shootId || !employeeIds?.length) {
      return NextResponse.json({ ok: true, skipped: true })
    }

    const admin = createAdminClient()

    // Obtener el profile_id de cada empleado asignado
    for (const employeeId of employeeIds) {
      const { data: emp } = await admin
        .from("employees")
        .select("id, nombre, apellido_paterno, profiles(id)")
        .eq("id", employeeId)
        .single()

      const profileId = (emp?.profiles as any)?.id
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
