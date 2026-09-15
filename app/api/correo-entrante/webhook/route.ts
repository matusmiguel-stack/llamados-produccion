import { NextResponse } from "next/server"
import { Webhook } from "svix"
import ical, { VEvent } from "node-ical"
import { Resend } from "resend"
import { createAdminClient } from "../../../../lib/supabase-admin"

// Webhook de correo entrante (Resend → email.received).
//
// Alguien copia a calendario@calendario.retrocasaproductora.com en un invite
// y esto crea una junta (sin proyecto, se asigna a mano después). Si el
// correo trae un .ics se usa la fecha/hora real del evento; si no, se usa
// hoy y se marca para que se revise. Los asistentes salen de a quién iban
// dirigidos To/Cc, cruzando contra empleados por correo; el resto queda
// como invitado externo (external_emails), igual que una junta normal.

export const runtime = "nodejs"

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

const MX_TZ = "America/Mexico_City"

function fechaHoraMexico(d: Date): { fecha: string; hora: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: MX_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]))
  return { fecha: `${parts.year}-${parts.month}-${parts.day}`, hora: `${parts.hour}:${parts.minute}` }
}

function extraerPrimerVevento(icsTexto: string): VEvent | null {
  const parsed = ical.sync.parseICS(icsTexto)
  for (const item of Object.values(parsed)) {
    if (item?.type === "VEVENT") return item
  }
  return null
}

// summary/location/description vienen como string o como {val, params}
function textoDe(valor: unknown): string | null {
  if (!valor) return null
  if (typeof valor === "string") return valor
  if (typeof valor === "object" && "val" in valor) return String((valor as { val: unknown }).val)
  return null
}

export async function POST(req: Request) {
  const payloadTexto = await req.text()

  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    console.error("[correo-entrante] falta RESEND_WEBHOOK_SECRET")
    return NextResponse.json({ error: "config" }, { status: 500 })
  }

  try {
    const wh = new Webhook(secret)
    wh.verify(payloadTexto, {
      "svix-id": req.headers.get("svix-id") || "",
      "svix-timestamp": req.headers.get("svix-timestamp") || "",
      "svix-signature": req.headers.get("svix-signature") || "",
    })
  } catch {
    return NextResponse.json({ error: "firma inválida" }, { status: 401 })
  }

  const evento = JSON.parse(payloadTexto)
  // Log de diagnóstico: con "All events" activado en Resend, aquí llega de
  // todo (sent, delivered, etc.) además de email.received — así se ve en
  // los logs de Vercel qué tipo de evento fue cada llamada y a quién iba.
  console.log("[correo-entrante] evento:", evento.type, "to:", JSON.stringify(evento.data?.to), "subject:", evento.data?.subject)
  if (evento.type !== "email.received") return NextResponse.json({ ok: true })

  const { email_id, from, subject, to, cc, attachments } = evento.data as {
    email_id: string
    from: string
    subject: string | null
    to: string[]
    cc: string[]
    attachments: { id: string; filename: string | null; content_type: string | null }[]
  }

  const admin = createAdminClient()
  const resend = getResend()

  try {
    // ── Fecha y hora: del .ics si viene, si no hoy + aviso ────────────────────
    let fecha: string = fechaHoraMexico(new Date()).fecha
    // hora_inicio es NOT NULL en la tabla; "09:00" es el mismo default que usa
    // el resto de la app cuando no se conoce la hora real.
    let hora_inicio = "09:00"
    let hora_fin: string | null = null
    let lugarIcs: string | null = null
    let descripcionIcs: string | null = null
    let sinIcs = true
    let eraTodoElDia = false

    const icsAdjunto = (attachments || []).find(
      (a) => a.content_type === "text/calendar" || (a.filename || "").toLowerCase().endsWith(".ics"),
    )

    if (icsAdjunto) {
      const { data: lista } = await resend.emails.receiving.attachments.list({ emailId: email_id })
      const meta = (lista?.data || []).find((a) => a.id === icsAdjunto.id)
      if (meta?.download_url) {
        const res = await fetch(meta.download_url)
        const icsTexto = await res.text()
        const vevento = extraerPrimerVevento(icsTexto)
        if (vevento?.start) {
          sinIcs = false
          const inicio = fechaHoraMexico(vevento.start)
          fecha = inicio.fecha
          eraTodoElDia = !!vevento.start.dateOnly
          hora_inicio = eraTodoElDia ? "09:00" : inicio.hora
          if (vevento.end) hora_fin = vevento.end.dateOnly ? null : fechaHoraMexico(vevento.end).hora
          lugarIcs = textoDe(vevento.location)
          descripcionIcs = textoDe(vevento.description)
        }
      }
    }

    // ── Cuerpo del correo, por si no hay .ics o para dar contexto ─────────────
    let cuerpoTexto = ""
    try {
      const { data: contenido } = await resend.emails.receiving.get(email_id)
      cuerpoTexto = (contenido?.text || "").trim().slice(0, 800)
    } catch {
      // si falla, seguimos sin cuerpo — no es crítico
    }

    const notasPartes = [`📧 Creada automáticamente desde un correo de ${from}.`]
    if (sinIcs) notasPartes.push("⚠️ El correo no traía una invitación de calendario adjunta: revisa fecha y hora.")
    else if (eraTodoElDia) notasPartes.push("⚠️ La invitación era de todo el día: la hora (09:00) es solo un placeholder, revísala.")
    if (descripcionIcs) notasPartes.push(descripcionIcs)
    else if (cuerpoTexto) notasPartes.push(cuerpoTexto)

    // ── Asistentes: cruzar To/Cc contra empleados por correo ──────────────────
    const inboxAddr = (to || []).find((a) => a.includes("@calendario.retrocasaproductora.com"))
    const correosInvolucrados = Array.from(
      new Set([...(to || []), ...(cc || [])].map((e) => e.trim().toLowerCase()).filter((e) => e && e !== inboxAddr)),
    )

    const { data: empleados } = await admin.from("employees").select("id, email")
    const empleadoPorCorreo = new Map(
      (empleados || []).map((e: { id: string; email: string }) => [e.email.toLowerCase(), e.id]),
    )

    const attendeeIds: string[] = []
    const externosNoEmpleados: string[] = []
    for (const correo of correosInvolucrados) {
      const empId = empleadoPorCorreo.get(correo)
      if (empId) attendeeIds.push(empId)
      else externosNoEmpleados.push(correo)
    }

    const { data: junta, error } = await admin
      .from("juntas")
      .insert({
        tipo: "Invitación por correo",
        titulo: subject || "Sin asunto",
        fecha,
        hora_inicio,
        hora_fin,
        direccion: lugarIcs,
        notas: notasPartes.join("\n\n"),
        external_emails: externosNoEmpleados.length > 0 ? externosNoEmpleados : null,
        email_id,
      })
      .select("id")
      .single()

    if (error) {
      // Reintento del mismo correo: ya existe, no es un error real.
      if (error.code === "23505") return NextResponse.json({ ok: true, duplicado: true })
      throw error
    }

    if (attendeeIds.length > 0) {
      await admin
        .from("junta_attendees")
        .insert(attendeeIds.map((employee_id) => ({ junta_id: junta.id, employee_id })))
    }

    return NextResponse.json({ ok: true, junta_id: junta.id })
  } catch (err) {
    console.error("[correo-entrante] error procesando correo", email_id, err)
    return NextResponse.json({ error: "no se pudo procesar el correo" }, { status: 500 })
  }
}
