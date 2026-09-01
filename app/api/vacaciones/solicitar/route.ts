import { NextResponse } from "next/server"
import { Resend } from "resend"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiUser } from "../../../../lib/api-auth"
import {
  VACACIONES_APROBADORES,
  agruparDiasEnRangos,
  contarDiasHabiles,
} from "../../../../lib/vacaciones"
import {
  buscarEmpleadoPorEmail,
  calcularSaldo,
  diasEnPeriodo,
  diasYaBloqueados,
  validarDias,
} from "../../../../lib/vacaciones-server"
import { VACACIONES_FROM, htmlNuevaSolicitud } from "../../../../lib/vacaciones-email"
import { sendPushToUser } from "../../../../lib/web-push"

// POST → registra una solicitud de vacaciones y avisa a los aprobadores.
// Abierta a cualquier usuario autenticado, sin importar su rol.
export async function POST(req: Request) {
  try {
    const user = await verifyApiUser(req)
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const validacion = validarDias(body.dias)
    if ("error" in validacion) {
      return NextResponse.json({ error: validacion.error }, { status: 400 })
    }
    const dias = validacion.dias
    const nota = typeof body.nota === "string" ? body.nota.trim().slice(0, 500) : ""

    const admin = createAdminClient(user.id)

    const { data: profile } = await admin
      .from("profiles").select("full_name, email").eq("id", user.id).single()
    const email = (profile?.email || user.email || "").toLowerCase()
    const solicitante = profile?.full_name || email.split("@")[0] || "Usuario"

    const emp = await buscarEmpleadoPorEmail(admin, email)
    if (!emp) {
      return NextResponse.json({
        error: "Tu usuario no está vinculado a un empleado. Pide a Adriana o Miguel que registren tu correo en Empleados.",
      }, { status: 400 })
    }
    if (emp.vac_mes_reseteo == null || emp.vac_anios == null) {
      return NextResponse.json({
        error: "Tus vacaciones aún no están configuradas. Pide a Adriana o Miguel que capturen tus años y mes de reseteo.",
      }, { status: 400 })
    }

    const saldo = await calcularSaldo(admin, emp)

    const yaBloqueados = diasYaBloqueados(dias, saldo.rangos)
    if (yaBloqueados.length > 0) {
      return NextResponse.json({
        error: `Ya tienes vacaciones aprobadas en: ${yaBloqueados.join(", ")}`,
      }, { status: 400 })
    }

    const { data: pendientesPropias } = await admin
      .from("vacation_requests").select("dias").eq("employee_id", emp.id).eq("status", "pendiente")
    const diasEnEspera = new Set(((pendientesPropias as any[]) || []).flatMap((r) => r.dias || []))
    const repetidos = dias.filter((d) => diasEnEspera.has(d))
    if (repetidos.length > 0) {
      return NextResponse.json({
        error: `Ya tienes una solicitud pendiente para: ${repetidos.join(", ")}`,
      }, { status: 400 })
    }

    const totalHabiles = contarDiasHabiles(dias)
    const consumenSaldo = diasEnPeriodo(dias, saldo.startISO, saldo.endISO)
    if (consumenSaldo > saldo.disponibles) {
      const enEspera = saldo.pendientesEnPeriodo > 0
        ? ` (${saldo.pendientesEnPeriodo} ya están en una solicitud pendiente)`
        : ""
      return NextResponse.json({
        error: `Solo te quedan ${Math.max(0, saldo.disponibles)} días disponibles${enEspera} y estás pidiendo ${consumenSaldo}.`,
      }, { status: 400 })
    }

    const { data: solicitud, error: insertError } = await admin
      .from("vacation_requests")
      .insert({
        requester_id: user.id,
        requester_name: solicitante,
        requester_email: email,
        employee_id: emp.id,
        dias,
        dias_habiles: totalHabiles,
        nota: nota || null,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Aviso a los aprobadores. Si falla el correo la solicitud igual queda
    // registrada: se reporta como advertencia en vez de tumbar la operación.
    let emailWarning: string | null = null
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { error: sendErr } = await resend.emails.send({
        from: VACACIONES_FROM,
        to: VACACIONES_APROBADORES,
        subject: `Solicitud de vacaciones — ${solicitante}`,
        html: htmlNuevaSolicitud({
          solicitante,
          dias: totalHabiles,
          rangos: agruparDiasEnRangos(dias),
          restantes: saldo.disponibles - consumenSaldo,
          nota: nota || null,
        }),
      })
      if (sendErr) emailWarning = sendErr.message
    } catch (err: any) {
      emailWarning = err?.message || "No se pudo enviar el correo"
    }

    // Push a los aprobadores que tengan la app instalada
    try {
      const { data: aprobadores } = await admin
        .from("profiles").select("id").in("email", VACACIONES_APROBADORES)
      await Promise.allSettled(
        ((aprobadores as any[]) || []).map((p) =>
          sendPushToUser(p.id, {
            title: "Solicitud de vacaciones",
            body: `${solicitante} pidió ${totalHabiles} día${totalHabiles !== 1 ? "s" : ""}`,
            url: "/solicitudes-vacaciones",
          }),
        ),
      )
    } catch {
      // el push es best-effort
    }

    return NextResponse.json({ ok: true, solicitud, emailWarning })
  } catch (err: any) {
    console.error("[vacaciones/solicitar] error:", err?.message)
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 })
  }
}
