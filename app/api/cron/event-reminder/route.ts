import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { sendPushToUser, markNotificationSent } from "../../../../lib/web-push"
import { getProfileIdsForEmployees } from "../../../../lib/employee-profile"

// Recordatorio 10 minutos antes de cada junta y cada llamado.
// Solo se notifica a los participantes registrados en cada evento.
//
// Diseñado para que NUNCA se pierda un aviso:
//  - Se llama cada 5 minutos (ver vercel.json).
//  - La ventana de disparo es amplia (LEAD_MAX), así que si un tick se retrasa
//    o se pierde, el siguiente lo recupera en vez de saltárselo para siempre.
//  - `markNotificationSent` (constraint unique en notification_log) garantiza
//    que cada persona reciba el aviso UNA sola vez por evento.

function isAuthorized(req: Request): boolean {
  const secret = req.headers.get("authorization")
  const expected = `Bearer ${process.env.CRON_SECRET || "retro-cron-secret"}`
  return secret === expected
}

// Objetivo: avisar 10 min antes. La ventana llega hasta 14 min para que, con
// ticks cada 5 min, siempre caiga uno dentro (y si se pierde, el siguiente
// alcanza a notificar antes de que empiece el evento).
const LEAD_TARGET = 10
const LEAD_MAX = 14

// "2026-08-03 17:08:12" en hora CDMX — comparamos por reloj de pared para no
// pelearnos con zonas horarias.
function nowInMexico() {
  const s = new Date().toLocaleString("sv", { timeZone: "America/Mexico_City" })
  const [fecha, hora] = s.split(" ")
  const [hh, mm] = hora.split(":").map(Number)
  return { fecha, minutos: hh * 60 + mm }
}

function addDays(fecha: string, days: number): string {
  const [y, m, d] = fecha.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const admin = createAdminClient()
  const { fecha: hoy, minutos: ahora } = nowInMexico()
  const manana = addDays(hoy, 1)
  const results: string[] = []
  // ?dry=1 → reporta a quién le tocaría el aviso sin enviarlo ni registrarlo.
  // Sirve para probar sin molestar al equipo.
  const dryRun = new URL(req.url).searchParams.get("dry") === "1"

  // Minutos que faltan para un evento de `fecha` a `hh:mm`. Incluimos mañana
  // para cubrir eventos justo después de medianoche.
  function minutosFaltantes(fecha: string, hh: number, mm: number): number | null {
    const offset = fecha === hoy ? 0 : fecha === manana ? 1440 : null
    if (offset === null) return null
    return offset + hh * 60 + mm - ahora
  }

  function enVentana(diff: number | null): boolean {
    // Solo antes de que empiece, y dentro de la ventana de recuperación.
    return diff !== null && diff > 0 && diff <= LEAD_MAX
  }

  async function notificar(
    tipo: string,
    refId: string,
    employeeIds: string[],
    payload: { title: string; body: string; url?: string }
  ) {
    if (!employeeIds.length) return
    const profileMap = await getProfileIdsForEmployees(employeeIds)
    for (const profileId of Object.values(profileMap)) {
      if (dryRun) {
        results.push(`[DRY] ${tipo}: ${refId} → ${profileId} · ${payload.title}`)
        continue
      }
      // Anti-duplicado: si ya se envió, no se repite.
      const isNew = await markNotificationSent(tipo, refId, profileId)
      if (!isNew) continue
      await sendPushToUser(profileId, payload)
      results.push(`${tipo}: ${refId} → ${profileId}`)
    }
  }

  // ── Juntas ────────────────────────────────────────────────────────────────
  const { data: juntas } = await admin
    .from("juntas")
    .select("id, tipo, titulo, fecha, hora_inicio, link")
    .in("fecha", [hoy, manana])

  for (const junta of juntas || []) {
    if (!junta.hora_inicio) continue
    const [h, m] = String(junta.hora_inicio).split(":").map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) continue

    const diff = minutosFaltantes(junta.fecha, h, m)
    if (!enVentana(diff)) continue

    const { data: attendees } = await admin
      .from("junta_attendees")
      .select("employee_id")
      .eq("junta_id", junta.id)

    const label = junta.titulo || junta.tipo
    await notificar(
      "junta_10min",
      `junta-10min-${junta.id}-${junta.fecha}`,
      (attendees || []).map((a: any) => a.employee_id),
      {
        title: `⏰ Junta en ${Math.round(diff as number)} min`,
        body: `${label} · ${String(junta.hora_inicio).slice(0, 5)} hrs${junta.link ? " — con link" : ""}`,
        url: "/",
      }
    )
  }

  // ── Llamados (shoots) ─────────────────────────────────────────────────────
  // start_time es timestamp sin zona: se lee como reloj de pared CDMX.
  const { data: shoots } = await admin
    .from("shoots")
    .select("id, title, start_time, all_day")
    .gte("start_time", `${hoy}T00:00:00`)
    .lte("start_time", `${manana}T23:59:59`)

  for (const shoot of shoots || []) {
    if (shoot.all_day || !shoot.start_time) continue
    const raw = String(shoot.start_time).replace("T", " ")
    const fecha = raw.slice(0, 10)
    const [h, m] = raw.slice(11, 16).split(":").map(Number)
    if (Number.isNaN(h) || Number.isNaN(m)) continue

    const diff = minutosFaltantes(fecha, h, m)
    if (!enVentana(diff)) continue

    const { data: crew } = await admin
      .from("shoot_employees")
      .select("employee_id")
      .eq("shoot_id", shoot.id)

    await notificar(
      "shoot_10min",
      `shoot-10min-${shoot.id}-${fecha}`,
      (crew || []).map((a: any) => a.employee_id),
      {
        title: `⏰ Llamado en ${Math.round(diff as number)} min`,
        body: `${shoot.title || "Llamado"} · ${raw.slice(11, 16)} hrs`,
        url: "/",
      }
    )
  }

  return NextResponse.json({
    ok: true,
    now: `${hoy} ${String(Math.floor(ahora / 60)).padStart(2, "0")}:${String(ahora % 60).padStart(2, "0")} CDMX`,
    lead: { target: LEAD_TARGET, max: LEAD_MAX },
    sent: results.length,
    details: results,
  })
}
