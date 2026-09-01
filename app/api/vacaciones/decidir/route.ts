import { NextResponse } from "next/server"
import { Resend } from "resend"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiUser } from "../../../../lib/api-auth"
import {
  agruparDiasEnRangos,
  esAprobadorVacaciones,
  proximoReseteoISO,
} from "../../../../lib/vacaciones"
import {
  calcularSaldo,
  diasEnPeriodo,
  diasYaBloqueados,
} from "../../../../lib/vacaciones-server"
import { VACACIONES_FROM, htmlResolucion } from "../../../../lib/vacaciones-email"
import { sendPushToUser } from "../../../../lib/web-push"

// POST → aprueba o declina una solicitud. Solo Adriana y Miguel.
// Al aprobar se crean los bloques de vacaciones en el calendario.
export async function POST(req: Request) {
  try {
    const user = await verifyApiUser(req)
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const admin = createAdminClient(user.id)

    const { data: profile } = await admin
      .from("profiles").select("full_name, email").eq("id", user.id).single()
    const email = (profile?.email || user.email || "").toLowerCase()
    if (!esAprobadorVacaciones(email)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }
    const resueltoPor = profile?.full_name || email

    const body = await req.json().catch(() => ({}))
    const requestId = body.requestId
    const aprobar = body.decision === "aprobar"
    const motivo = typeof body.motivo === "string" ? body.motivo.trim().slice(0, 500) : ""

    if (!requestId) return NextResponse.json({ error: "Falta requestId" }, { status: 400 })
    if (body.decision !== "aprobar" && body.decision !== "rechazar") {
      return NextResponse.json({ error: "Decisión inválida" }, { status: 400 })
    }
    if (!aprobar && !motivo) {
      return NextResponse.json({ error: "Escribe el motivo por el que declinas la solicitud" }, { status: 400 })
    }

    const { data: solicitud, error: reqError } = await admin
      .from("vacation_requests").select("*").eq("id", requestId).single()
    if (reqError || !solicitud) {
      return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 })
    }
    if (solicitud.status !== "pendiente") {
      return NextResponse.json({ error: "Esa solicitud ya fue resuelta" }, { status: 400 })
    }

    const dias: string[] = solicitud.dias || []
    const rangos = agruparDiasEnRangos(dias)
    let restantes: number | null = null
    let reseteoISO: string | null = null
    const vacationIds: string[] = []

    if (aprobar) {
      const { data: emp } = await admin
        .from("employees")
        .select("id, nombre, apellido_paterno, nickname, email, vac_anios, vac_mes_reseteo, vac_dias_base, vac_ultimo_reset_anio")
        .eq("id", solicitud.employee_id)
        .maybeSingle()
      if (!emp) {
        return NextResponse.json({ error: "El empleado de esta solicitud ya no existe" }, { status: 400 })
      }

      // Revalidar contra el estado actual: pudo aprobarse otra solicitud entre tanto
      const saldo = await calcularSaldo(admin, emp as any, requestId)

      const yaBloqueados = diasYaBloqueados(dias, saldo.rangos)
      if (yaBloqueados.length > 0) {
        return NextResponse.json({
          error: `Estos días ya están bloqueados en el calendario: ${yaBloqueados.join(", ")}`,
        }, { status: 400 })
      }

      const consumenSaldo = diasEnPeriodo(dias, saldo.startISO, saldo.endISO)
      if (consumenSaldo > saldo.disponibles) {
        return NextResponse.json({
          error: `Ya no alcanza el saldo: quedan ${Math.max(0, saldo.disponibles)} días y la solicitud pide ${consumenSaldo}.`,
        }, { status: 400 })
      }

      // Bloquear el calendario: un registro por rango continuo
      for (const rango of rangos) {
        const { data: vac, error: vacError } = await admin
          .from("vacations")
          .insert({ start_date: rango.start_date, end_date: rango.end_date })
          .select("id")
          .single()
        if (vacError) {
          // Deshacer lo insertado para no dejar el calendario a medias
          if (vacationIds.length) await admin.from("vacations").delete().in("id", vacationIds)
          return NextResponse.json({ error: vacError.message }, { status: 500 })
        }
        vacationIds.push(vac.id)

        const { error: asignError } = await admin
          .from("vacation_employees")
          .insert({ vacation_id: vac.id, employee_id: emp.id })
        if (asignError) {
          await admin.from("vacations").delete().in("id", vacationIds)
          return NextResponse.json({ error: asignError.message }, { status: 500 })
        }
      }

      restantes = saldo.disponibles - consumenSaldo
      reseteoISO = proximoReseteoISO(emp.vac_mes_reseteo || 1)
    }

    const { error: updateError } = await admin
      .from("vacation_requests")
      .update({
        status: aprobar ? "aprobada" : "rechazada",
        motivo_rechazo: aprobar ? null : motivo,
        decided_by: user.id,
        decided_by_name: resueltoPor,
        decided_at: new Date().toISOString(),
        vacation_ids: vacationIds,
      })
      .eq("id", requestId)
      .eq("status", "pendiente")

    if (updateError) {
      if (vacationIds.length) await admin.from("vacations").delete().in("id", vacationIds)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Aviso al solicitante con el estatus de su solicitud
    let emailWarning: string | null = null
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { error: sendErr } = await resend.emails.send({
        from: VACACIONES_FROM,
        to: [solicitud.requester_email],
        subject: aprobar
          ? "Tus vacaciones fueron aprobadas ✓"
          : "Tu solicitud de vacaciones fue declinada",
        html: htmlResolucion({
          solicitante: solicitud.requester_name,
          aprobada: aprobar,
          dias: Number(solicitud.dias_habiles || 0),
          rangos,
          motivo: motivo || null,
          resueltoPor,
          restantes,
          reseteoISO,
        }),
      })
      if (sendErr) emailWarning = sendErr.message
    } catch (err: any) {
      emailWarning = err?.message || "No se pudo enviar el correo"
    }

    try {
      await sendPushToUser(solicitud.requester_id, {
        title: aprobar ? "Vacaciones aprobadas ✓" : "Vacaciones declinadas",
        body: aprobar
          ? `${solicitud.dias_habiles} día(s) ya quedaron en el calendario`
          : motivo,
        url: "/perfil",
      })
    } catch {
      // el push es best-effort
    }

    return NextResponse.json({ ok: true, emailWarning })
  } catch (err: any) {
    console.error("[vacaciones/decidir] error:", err?.message)
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 })
  }
}
