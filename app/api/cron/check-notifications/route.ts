import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { sendPushToUser, markNotificationSent } from "../../../../lib/web-push"

// Protección básica: solo Vercel puede llamar este endpoint
function isAuthorized(req: Request): boolean {
  const secret = req.headers.get("authorization")
  const expected = `Bearer ${process.env.CRON_SECRET || "retro-cron-secret"}`
  return secret === expected
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const admin = createAdminClient()
  const results: string[] = []

  // ── 1. Pagos vencidos ─────────────────────────────────────────────────────
  const today = new Date().toISOString().split("T")[0]

  const { data: overduePayments } = await admin
    .from("ingresos")
    .select("id, proyecto, cliente_agencia, fecha_pago, fecha_aprox_pago")
    .neq("estatus", "pagado")

  const vencidos = (overduePayments || []).filter((r) => {
    const ref = r.fecha_pago || r.fecha_aprox_pago
    return ref && ref < today
  })

  // Obtener todos los admins para notificar
  const { data: admins } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "admin")

  for (const pago of vencidos) {
    for (const adminUser of admins || []) {
      const refId = `pago-vencido-${pago.id}-${today}`
      const isNew = await markNotificationSent("pago_vencido", refId, adminUser.id)
      if (!isNew) continue

      await sendPushToUser(adminUser.id, {
        title: "💸 Pago vencido",
        body: `${pago.proyecto} · ${pago.cliente_agencia} — sin cobrar después de la fecha límite`,
        url: "/ingresos",
      })
      results.push(`pago_vencido: ${pago.proyecto} → ${adminUser.id}`)
    }
  }

  // ── 2. Juntas próximas (siguiente 30 min) ─────────────────────────────────
  const now = new Date()
  const in30 = new Date(now.getTime() + 30 * 60 * 1000)

  const todayDate = now.toISOString().split("T")[0]
  const nowTime   = now.toTimeString().slice(0, 5)   // "HH:MM"
  const in30Time  = in30.toTimeString().slice(0, 5)

  const { data: juntas } = await admin
    .from("juntas")
    .select("id, tipo, hora_inicio")
    .eq("fecha", todayDate)
    .gte("hora_inicio", nowTime)
    .lte("hora_inicio", in30Time)

  for (const junta of juntas || []) {
    const { data: attendees } = await admin
      .from("junta_attendees")
      .select("employee_id, employees(profiles(id))")
      .eq("junta_id", junta.id)

    for (const att of attendees || []) {
      const profileId = (att.employees as any)?.profiles?.id
      if (!profileId) continue

      const refId = `junta-proxima-${junta.id}`
      const isNew = await markNotificationSent("junta_proxima", refId, profileId)
      if (!isNew) continue

      await sendPushToUser(profileId, {
        title: `📋 Junta en ~30 min`,
        body: `${junta.tipo} · ${junta.hora_inicio} — ¡prepárate!`,
        url: "/",
      })
      results.push(`junta_proxima: ${junta.tipo} ${junta.hora_inicio} → ${profileId}`)
    }
  }

  return NextResponse.json({ ok: true, sent: results.length, details: results })
}
