import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { sendPushToUser, markNotificationSent } from "../../../../lib/web-push"

function isAuthorized(req: Request): boolean {
  const secret = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET || "retro-cron-secret"
  return secret === `Bearer ${cronSecret}`
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const admin = createAdminClient()

  // Hora actual en CDMX
  const nowMx = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }))
  const todayMx = new Date().toLocaleDateString("sv", { timeZone: "America/Mexico_City" })

  // Buscar juntas de hoy
  const { data: juntas } = await admin
    .from("juntas")
    .select("id, tipo, titulo, hora_inicio, hora_fin, link")
    .eq("fecha", todayMx)

  const results: string[] = []

  for (const junta of juntas || []) {
    if (!junta.hora_inicio) continue

    const [h, m] = junta.hora_inicio.split(":").map(Number)
    const juntaTime = new Date(nowMx)
    juntaTime.setHours(h, m, 0, 0)

    const diffMin = (juntaTime.getTime() - nowMx.getTime()) / 60000

    // Notificar si faltan entre 25 y 35 minutos (~30 min)
    if (diffMin < 25 || diffMin > 35) continue

    const { data: attendees } = await admin
      .from("junta_attendees")
      .select("employee_id, employees(profiles(id))")
      .eq("junta_id", junta.id)

    const label = junta.titulo || junta.tipo
    const refId = `junta-30min-${junta.id}-${todayMx}`

    for (const att of attendees || []) {
      const profileId = (att.employees as any)?.profiles?.id
      if (!profileId) continue

      const isNew = await markNotificationSent("junta_30min", refId, profileId)
      if (!isNew) continue

      await sendPushToUser(profileId, {
        title: `⏰ Junta en 30 minutos`,
        body: `${label} · ${junta.hora_inicio} hrs${junta.link ? " — tienes un link disponible" : ""}`,
        url: "/",
      })
      results.push(`${label} → ${profileId}`)
    }
  }

  return NextResponse.json({ ok: true, sent: results.length, details: results })
}
