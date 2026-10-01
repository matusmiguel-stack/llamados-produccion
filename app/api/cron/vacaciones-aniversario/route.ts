import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { resumenVacaciones, antiguedadDesdeIngreso } from "../../../../lib/vacaciones"

export const dynamic = "force-dynamic"

// Disparado diario por pg_cron (ver supabase/migrations) — Vercel Hobby ya usa
// sus 2 crons disponibles (daily-digest, tasks-reminder).
function isAuthorized(req: Request): boolean {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const admin = createAdminClient()
  const todayMx = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }))

  const { data: employees, error } = await admin
    .from("employees")
    .select("id, fecha_ingreso, vac_anios, vac_mes_reseteo, vac_dias_base, vac_ultimo_reset_anio")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let updated = 0
  for (const emp of employees || []) {
    if (!emp.fecha_ingreso) continue

    // El mes de reseteo siempre se deriva de la fecha de ingreso — nunca se
    // vuelve a capturar a mano, así no puede desalinearse otra vez.
    const { mesReseteo: correctMes } = antiguedadDesdeIngreso(emp.fecha_ingreso, todayMx)
    const r = resumenVacaciones({ ...emp, vac_mes_reseteo: correctMes }, [], todayMx)
    const mesDesalineado = emp.vac_mes_reseteo !== correctMes

    if (!r.needsReset && !mesDesalineado) continue

    const payload: Record<string, unknown> = { vac_mes_reseteo: correctMes }
    if (r.needsReset) {
      // Cruzó su aniversario laboral: sube los años y arranca el período nuevo.
      payload.vac_anios = r.newAnios
      payload.vac_dias_base = 0
      payload.vac_ultimo_reset_anio = parseInt(r.startISO.slice(0, 4))
    } else {
      // Solo el mes estaba mal capturado (p.ej. se corrigió la fecha de ingreso) —
      // no es un aniversario real, no se tocan los días ya tomados.
      payload.vac_anios = r.anios
    }

    const { error: updError } = await admin.from("employees").update(payload).eq("id", emp.id)
    if (!updError) updated++
  }

  return NextResponse.json({ ok: true, checked: (employees || []).length, updated })
}
