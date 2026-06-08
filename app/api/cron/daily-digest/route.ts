import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"

// ── Auth: acepta cron de Vercel O sesión de admin ─────────────────────────────

async function isAuthorized(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("authorization")

  // 1. Vercel cron — envía Bearer <CRON_SECRET> automáticamente
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true

  // 2. Fallback legacy secret
  if (authHeader === "Bearer retro-cron-secret") return true

  // 3. Supabase admin session desde browser
  if (!authHeader) return false
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return false
  const admin = createAdminClient()
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single()
  return profile?.role === "admin"
}

// ── Resend lazy init ──────────────────────────────────────────────────────────

let _resend: Resend | null = null
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

const FROM = "Retro <news@retrocasaproductora.com>"
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://llamados-produccion-51t3.vercel.app"

// ── Modo prueba: solo se manda a este mail ────────────────────────────────────
const TEST_MODE = false
const TEST_EMAIL = "miguel@retrocasaproductora.com" // unused in production

// ── Helpers ───────────────────────────────────────────────────────────────────

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"]

function formatFecha(dateStr: string) {
  const [y, m, d] = dateStr.split("-")
  const dow = new Date(dateStr + "T12:00:00").toLocaleDateString("es-MX", { weekday: "long" })
  return `${dow.charAt(0).toUpperCase() + dow.slice(1)}, ${parseInt(d)} de ${MESES[parseInt(m) - 1]} de ${y}`
}

function card(color: string, content: string) {
  return `
    <div style="padding:14px 16px;border-radius:10px;background:rgba(255,255,255,0.05);border-left:3px solid ${color};margin-bottom:10px;border-top:1px solid rgba(255,255,255,0.06);border-right:1px solid rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.03);">
      ${content}
    </div>`
}

function sectionHeader(emoji: string, title: string, count: number, color: string) {
  return `
    <div style="display:flex;align-items:center;gap:8px;margin:24px 0 10px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.06);">
      <span style="font-size:18px;">${emoji}</span>
      <span style="color:${color};font-size:14px;font-weight:700;letter-spacing:0.3px;">${title}</span>
      <span style="background:${color}25;color:${color};border:1px solid ${color}50;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:700;">${count}</span>
    </div>`
}

// ── HTML builder ──────────────────────────────────────────────────────────────

function buildDigestHtml(data: {
  fecha: string
  shoots: any[]
  juntas: any[]
  entregas: any[]
  shootEmployees: any[]
  juntaAttendees: any[]
  employees: any[]
  vacationEmployeeIds: Set<string>
}) {
  const { fecha, shoots, juntas, entregas, shootEmployees, juntaAttendees, employees, vacationEmployeeIds } = data

  // Vacaciones: employees que están de vacaciones hoy
  const onVacation = employees.filter((e: any) => vacationEmployeeIds.has(e.id))

  // Cumpleaños: employees cuyo cumpleanos sea MM-DD de hoy
  const [, mm, dd] = fecha.split("-")
  const birthdays = employees.filter((e: any) => {
    if (!e.cumpleanos) return false
    const [, em, ed] = (e.cumpleanos as string).split("-")
    return em === mm && ed === dd
  })

  // Aniversarios: employees cuya fecha_ingreso sea MM-DD de hoy (y año distinto)
  const anniversaries = employees.filter((e: any) => {
    if (!e.fecha_ingreso) return false
    const [ey, em, ed] = (e.fecha_ingreso as string).split("-")
    if (ey === fecha.split("-")[0]) return false // mismo año = no es aniversario
    return em === mm && ed === dd
  }).map((e: any) => {
    const years = parseInt(fecha.split("-")[0]) - parseInt(e.fecha_ingreso.split("-")[0])
    return { ...e, years }
  })

  const total = shoots.length + juntas.length + entregas.length
  const fechaLabel = formatFecha(fecha)

  // ── Llamados ────────────────────────────────────────────────────────────────
  let llamadosHtml = ""
  if (shoots.length > 0) {
    llamadosHtml = sectionHeader("🎬", "Llamados", shoots.length, "#a78bfa")
    for (const s of shoots) {
      const crew = shootEmployees
        .filter((se: any) => se.shoot_id === s.id)
        .map((se: any) => employees.find((e: any) => e.id === se.employee_id))
        .filter(Boolean)
        .map((e: any) => `${e.nombre} ${e.apellido_paterno}`)
      const hora = s.all_day ? "Todo el día" : `${s.start_time?.slice(11,16) || ""} – ${s.end_time?.slice(11,16) || ""} hrs`
      llamadosHtml += card("#a78bfa", `
        <p style="margin:0 0 4px;color:#f8fafc;font-size:14px;font-weight:700;">${s.title || "Sin título"}</p>
        <p style="margin:0 0 4px;color:#94a3b8;font-size:12px;">🕐 ${hora}${s.location ? ` · 📍 ${s.location}` : ""}</p>
        ${crew.length > 0 ? `<p style="margin:0;color:#64748b;font-size:12px;">👥 ${crew.join(" · ")}</p>` : ""}
      `)
    }
  }

  // ── Juntas ──────────────────────────────────────────────────────────────────
  let juntasHtml = ""
  if (juntas.length > 0) {
    juntasHtml = sectionHeader("📋", "Juntas", juntas.length, "#67e8f9")
    for (const j of juntas) {
      const emoji = j.tipo === "Brief" ? "📋" : j.tipo === "PPM" ? "🎬" : "🤝"
      const asistentes = juntaAttendees
        .filter((a: any) => a.junta_id === j.id)
        .map((a: any) => employees.find((e: any) => e.id === a.employee_id))
        .filter(Boolean)
        .map((e: any) => `${e.nombre} ${e.apellido_paterno}`)
      juntasHtml += card("#67e8f9", `
        <p style="margin:0 0 4px;color:#f8fafc;font-size:14px;font-weight:700;">${emoji} ${j.titulo || j.tipo}</p>
        <p style="margin:0 0 4px;color:#94a3b8;font-size:12px;">🕐 ${j.hora_inicio}${j.hora_fin ? ` – ${j.hora_fin}` : ""} hrs · <span style="color:#67e8f9;">${j.tipo}</span></p>
        ${j.link ? `<p style="margin:4px 0 4px;"><a href="${j.link}" style="color:#38bdf8;font-size:12px;">🔗 Unirse a la reunión</a></p>` : ""}
        ${asistentes.length > 0 ? `<p style="margin:0;color:#64748b;font-size:12px;">👥 ${asistentes.join(" · ")}</p>` : ""}
        ${j.notas ? `<p style="margin:4px 0 0;color:#64748b;font-size:12px;">${j.notas}</p>` : ""}
      `)
    }
  }

  // ── Post Producción ─────────────────────────────────────────────────────────
  let postHtml = ""
  if (entregas.length > 0) {
    postHtml = sectionHeader("🎞️", "Post Producción", entregas.length, "#f472b6")
    const TIPO_COLORS: Record<string, string> = {
      "CDT Interna": "#6366f1", "CDT Cliente": "#0891b2",
      "Entrega final": "#16a34a", "Ronda Ajustes": "#ea580c",
      "Edición y Post": "#7c3aed", "Online CC y Audio": "#db2777",
    }
    for (const e of entregas) {
      const color = TIPO_COLORS[e.tipo] || "#6366f1"
      const editores = Array.isArray(e.editores) ? e.editores : (e.editor ? [e.editor] : [])
      postHtml += card(color, `
        <p style="margin:0 0 4px;color:#f8fafc;font-size:14px;font-weight:700;">${e.titulo}</p>
        ${e.tipo ? `<span style="display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:700;background:${color}22;color:${color};border:1px solid ${color}44;">${e.tipo}</span>` : ""}
        ${e.hora ? `<p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">🕐 ${e.hora} hrs</p>` : ""}
        ${e.proyecto ? `<p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">📁 ${e.proyecto}${e.cliente ? ` · ${e.cliente}` : ""}</p>` : ""}
        ${editores.length > 0 ? `<p style="margin:4px 0 0;color:#64748b;font-size:12px;">✂️ ${editores.join(" · ")}</p>` : ""}
      `)
    }
  }

  // ── Vacaciones ───────────────────────────────────────────────────────────────
  let vacacionesHtml = ""
  if (onVacation.length > 0) {
    vacacionesHtml = sectionHeader("🏖️", "De vacaciones", onVacation.length, "#fb923c")
    for (const e of onVacation) {
      vacacionesHtml += card("#fb923c", `
        <p style="margin:0;color:#f8fafc;font-size:14px;font-weight:700;">🏖️ ${e.nombre} ${e.apellido_paterno}</p>
        ${e.puesto ? `<p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">${e.puesto}</p>` : ""}
      `)
    }
  }

  // ── Cumpleaños ──────────────────────────────────────────────────────────────
  let cumpleHtml = ""
  if (birthdays.length > 0) {
    cumpleHtml = sectionHeader("🎂", "Cumpleaños", birthdays.length, "#f59e0b")
    for (const e of birthdays) {
      cumpleHtml += card("#f59e0b", `
        <p style="margin:0;color:#f8fafc;font-size:14px;font-weight:700;">🎂 ${e.nombre} ${e.apellido_paterno}</p>
        ${e.puesto ? `<p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">${e.puesto}</p>` : ""}
      `)
    }
  }

  // ── Aniversarios ─────────────────────────────────────────────────────────────
  let anivHtml = ""
  if (anniversaries.length > 0) {
    anivHtml = sectionHeader("🎉", "Aniversarios", anniversaries.length, "#14b8a6")
    for (const e of anniversaries) {
      anivHtml += card("#14b8a6", `
        <p style="margin:0;color:#f8fafc;font-size:14px;font-weight:700;">🎉 ${e.nombre} ${e.apellido_paterno}</p>
        <p style="margin:4px 0 0;color:#2dd4bf;font-size:12px;font-weight:600;">${e.years} año${e.years !== 1 ? "s" : ""} en Retro Casa</p>
        ${e.puesto ? `<p style="margin:2px 0 0;color:#94a3b8;font-size:12px;">${e.puesto}</p>` : ""}
      `)
    }
  }

  const emptyMsg = total === 0 && birthdays.length === 0 && anniversaries.length === 0 && onVacation.length === 0 ? `
    <div style="text-align:center;padding:32px 0;color:#475569;">
      <p style="font-size:32px;margin:0">😴</p>
      <p style="margin:8px 0 0;font-size:14px;">Sin actividad registrada para hoy.</p>
    </div>` : ""

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#05070d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#05070d;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#0d0f1f;border:1px solid rgba(124,58,237,0.25);border-radius:16px;overflow:hidden;max-width:560px;width:100%;box-shadow:0 0 60px rgba(124,58,237,0.15);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e1b4b 0%,#0f0c2e 50%,#050714 100%);padding:32px 32px 28px;text-align:center;border-bottom:1px solid rgba(124,58,237,0.2);">
            <img src="${APP_URL}/logo-retro.png" alt="Retro" width="80" style="display:block;margin:0 auto 14px;max-width:80px;" />
            <h1 style="margin:0 0 6px;color:#f8fafc;font-size:24px;font-weight:800;letter-spacing:-0.3px;">📅 Resumen del día</h1>
            <p style="margin:0;color:#94a3b8;font-size:14px;font-weight:500;">${fechaLabel}</p>
            ${total > 0 ? `<div style="margin-top:12px;display:inline-block;background:rgba(124,58,237,0.2);border:1px solid rgba(124,58,237,0.35);border-radius:999px;padding:3px 14px;"><span style="color:#a78bfa;font-size:12px;font-weight:600;">${total} evento${total !== 1 ? "s" : ""} hoy</span></div>` : ""}
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:24px 28px;background:#0d0f1f;">
            ${emptyMsg}
            ${llamadosHtml}
            ${juntasHtml}
            ${postHtml}
            ${vacacionesHtml}
            ${cumpleHtml}
            ${anivHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:14px 32px;border-top:1px solid rgba(124,58,237,0.15);text-align:center;background:#080a18;">
            <p style="margin:0;color:#334155;font-size:11px;">Retro Casa Productora · Sistema de Producción · Resumen automático diario</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  if (!await isAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const admin = createAdminClient()

  // Fecha hoy en Mexico City
  const todayMx = new Date().toLocaleDateString("sv", { timeZone: "America/Mexico_City" })

  // ── Cargar datos del día ───────────────────────────────────────────────────
  const [
    { data: shoots },
    { data: juntas },
    { data: entregas },
    { data: shootEmployees },
    { data: juntaAttendees },
    { data: employees },
    { data: vacations },
    { data: vacationEmployees },
  ] = await Promise.all([
    admin.from("shoots").select("id,title,start_time,end_time,all_day,location,color,status").gte("start_time", todayMx + "T00:00:00").lte("start_time", todayMx + "T23:59:59"),
    admin.from("juntas").select("id,tipo,titulo,fecha,hora_inicio,hora_fin,notas,link").eq("fecha", todayMx),
    admin.from("entregas").select("id,titulo,tipo,fecha,hora,proyecto,cliente,editor,editores").eq("fecha", todayMx),
    admin.from("shoot_employees").select("shoot_id,employee_id"),
    admin.from("junta_attendees").select("junta_id,employee_id"),
    admin.from("employees").select("id,nombre,apellido_paterno,email,puesto,cumpleanos,fecha_ingreso"),
    admin.from("vacations").select("id,start_date,end_date").lte("start_date", todayMx).gte("end_date", todayMx),
    admin.from("vacation_employees").select("vacation_id,employee_id"),
  ])

  const vacationIds = new Set((vacations || []).map((v: any) => v.id))
  const vacationEmployeeIds = new Set(
    (vacationEmployees || [])
      .filter((ve: any) => vacationIds.has(ve.vacation_id))
      .map((ve: any) => ve.employee_id)
  )

  const html = buildDigestHtml({
    fecha: todayMx,
    shoots: (shoots || []).filter((s: any) => s.status !== "cancelled"),
    juntas: juntas || [],
    entregas: entregas || [],
    shootEmployees: shootEmployees || [],
    juntaAttendees: juntaAttendees || [],
    employees: employees || [],
    vacationEmployeeIds,
  })

  // ── Destinatarios ─────────────────────────────────────────────────────────
  let recipients: string[]
  if (TEST_MODE) {
    recipients = [TEST_EMAIL]
  } else {
    recipients = (employees || [])
      .map((e: any) => e.email)
      .filter((email: string) => email && email.includes("@"))
  }

  if (!recipients.length) {
    return NextResponse.json({ ok: true, sent: 0, note: "No recipients" })
  }

  const total = (shoots || []).filter((s: any) => s.status !== "cancelled").length
    + (juntas || []).length
    + (entregas || []).length

  const [y, m, d] = todayMx.split("-")
  const subject = `📅 Retro · ${parseInt(d)} ${MESES[parseInt(m)-1]} ${y} — ${total > 0 ? `${total} evento${total !== 1 ? "s" : ""} hoy` : "Sin actividad hoy"}`

  // Versión texto plano (reduce spam score)
  const textLines: string[] = [`RETRO · Resumen del día — ${formatFecha(todayMx)}`, ""]
  const shootsFiltered = (shoots || []).filter((s: any) => s.status !== "cancelled")
  if (shootsFiltered.length > 0) {
    textLines.push("── LLAMADOS ──")
    for (const s of shootsFiltered) {
      const hora = s.all_day ? "Todo el día" : `${s.start_time?.slice(11,16) || ""} – ${s.end_time?.slice(11,16) || ""}`
      textLines.push(`• ${s.title || "Sin título"} · ${hora}${s.location ? ` · ${s.location}` : ""}`)
    }
    textLines.push("")
  }
  if ((juntas || []).length > 0) {
    textLines.push("── JUNTAS ──")
    for (const j of (juntas || [])) {
      textLines.push(`• ${j.titulo || j.tipo} · ${j.hora_inicio}${j.hora_fin ? ` – ${j.hora_fin}` : ""} hrs`)
      if (j.link) textLines.push(`  → ${j.link}`)
    }
    textLines.push("")
  }
  if ((entregas || []).length > 0) {
    textLines.push("── POST PRODUCCIÓN ──")
    for (const e of (entregas || [])) {
      textLines.push(`• ${e.titulo}${e.tipo ? ` [${e.tipo}]` : ""}${e.hora ? ` · ${e.hora} hrs` : ""}`)
    }
    textLines.push("")
  }
  // Vacaciones en texto plano
  const onVacationPlain = (employees || []).filter((e: any) => vacationEmployeeIds.has(e.id))
  if (onVacationPlain.length > 0) {
    textLines.push("── DE VACACIONES ──")
    for (const e of onVacationPlain) textLines.push(`🏖️ ${e.nombre} ${e.apellido_paterno}`)
    textLines.push("")
  }

  // Cumpleaños y aniversarios en texto plano
  const birthdaysPlain = (employees || []).filter((e: any) => {
    if (!e.cumpleanos) return false
    const [, em, ed] = (e.cumpleanos as string).split("-")
    return em === todayMx.split("-")[1] && ed === todayMx.split("-")[2]
  })
  const anniversariesPlain = (employees || []).filter((e: any) => {
    if (!e.fecha_ingreso) return false
    const [ey, em, ed] = (e.fecha_ingreso as string).split("-")
    if (ey === todayMx.split("-")[0]) return false
    return em === todayMx.split("-")[1] && ed === todayMx.split("-")[2]
  })
  if (birthdaysPlain.length > 0) {
    textLines.push("── CUMPLEAÑOS ──")
    for (const e of birthdaysPlain) textLines.push(`🎂 ${e.nombre} ${e.apellido_paterno}`)
    textLines.push("")
  }
  if (anniversariesPlain.length > 0) {
    textLines.push("── ANIVERSARIOS ──")
    for (const e of anniversariesPlain) {
      const years = parseInt(todayMx.split("-")[0]) - parseInt(e.fecha_ingreso.split("-")[0])
      textLines.push(`🎉 ${e.nombre} ${e.apellido_paterno} · ${years} año${years !== 1 ? "s" : ""} en Retro`)
    }
    textLines.push("")
  }
  if (total === 0 && birthdaysPlain.length === 0 && anniversariesPlain.length === 0 && onVacationPlain.length === 0) textLines.push("Sin actividad registrada para hoy.")
  textLines.push("--\nRetro Casa Productora · Sistema de Producción")
  const text = textLines.join("\n")

  let sent = 0
  const errors: string[] = []
  for (const email of recipients) {
    try {
      const result = await getResend().emails.send({
        from: FROM,
        to: email,
        subject,
        html,
        text,
        headers: {
          "List-Unsubscribe": `<mailto:news@retrocasaproductora.com?subject=unsubscribe>`,
          "Precedence": "bulk",
        },
      })
      if ((result as any).error) {
        errors.push(`${email}: ${JSON.stringify((result as any).error)}`)
      } else {
        sent++
      }
    } catch (e: any) {
      errors.push(`${email}: ${e.message}`)
    }
  }

  return NextResponse.json({ ok: true, sent, errors, date: todayMx, testMode: TEST_MODE })
}
