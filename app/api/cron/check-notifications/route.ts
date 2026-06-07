import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { sendPushToUser, markNotificationSent } from "../../../../lib/web-push"
import { getProfileIdsForEmployees } from "../../../../lib/employee-profile"

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

  // ── 2. Juntas de hoy (recordatorio matutino) ──────────────────────────────
  // El cron corre a las 8am — notifica todas las juntas del día a sus asistentes
  const now = new Date()
  const todayDate = new Date(now.toLocaleString("sv", { timeZone: "America/Mexico_City" }))
    .toISOString().split("T")[0]

  const { data: juntas } = await admin
    .from("juntas")
    .select("id, tipo, hora_inicio")
    .eq("fecha", todayDate)

  for (const junta of juntas || []) {
    const { data: attendees } = await admin
      .from("junta_attendees")
      .select("employee_id")
      .eq("junta_id", junta.id)

    const employeeIds = (attendees || []).map((a: any) => a.employee_id)
    if (!employeeIds.length) continue

    const profileMap = await getProfileIdsForEmployees(employeeIds)

    for (const profileId of Object.values(profileMap)) {
      const refId = `junta-proxima-${junta.id}`
      const isNew = await markNotificationSent("junta_proxima", refId, profileId)
      if (!isNew) continue

      const label = (junta as any).titulo || junta.tipo
      await sendPushToUser(profileId, {
        title: `📋 Junta hoy`,
        body: `${label} · ${junta.hora_inicio} hrs`,
        url: "/",
      })
      results.push(`junta_proxima: ${label} → ${profileId}`)
    }
  }

  // ── 3. Entregas de post producción hoy ────────────────────────────────────
  const { data: entregas } = await admin
    .from("entregas")
    .select("id, titulo, tipo, hora")
    .eq("fecha", todayDate)

  if ((entregas || []).length > 0) {
    const { data: allProfiles } = await admin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "editor", "productor"])

    for (const entrega of entregas || []) {
      for (const profile of allProfiles || []) {
        const refId = `entrega-hoy-${entrega.id}-${todayDate}`
        const isNew = await markNotificationSent("entrega_hoy", refId, profile.id)
        if (!isNew) continue

        await sendPushToUser(profile.id, {
          title: `🎞️ Entrega hoy`,
          body: `${entrega.titulo}${entrega.tipo ? ` · ${entrega.tipo}` : ""}${entrega.hora ? ` · ${entrega.hora} hrs` : ""}`,
          url: "/postproduccion",
        })
        results.push(`entrega_hoy: ${entrega.titulo} → ${profile.id}`)
      }
    }
  }

  return NextResponse.json({ ok: true, sent: results.length, details: results })
}
