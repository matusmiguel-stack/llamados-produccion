import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiUser } from "../../../../lib/api-auth"
import { ROLES_EDITAN_RODAJE } from "../../../../lib/rodaje/tipos"

const BUCKET = "guiones"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// DELETE ?plan=<plan> → borra TODO el plan de rodaje, de todas las unidades:
// los guiones con sus escenas y tomas, los días con sus separadores, las
// unidades con su plan de trabajo, y los archivos subidos (sus filas y los
// archivos de Storage). El proyecto queda como si nunca hubiera tenido plan. No se puede deshacer; en el Historial queda quién lo borró y
// cuánto había.
export async function DELETE(req: Request) {
  const user = await verifyApiUser(req)
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const admin = createAdminClient(user.id)
  const { data: perfil } = await admin
    .from("profiles").select("role, full_name, email").eq("id", user.id).single()
  if (!perfil?.role || !ROLES_EDITAN_RODAJE.includes(perfil.role)) {
    return NextResponse.json({ error: "Tu usuario no puede borrar el plan de rodaje" }, { status: 403 })
  }

  // Se borra el plan que la persona tiene en pantalla, no "el del proyecto":
  // si alguien más ya lo borró y generó otro, ese otro no se toca.
  const planId = new URL(req.url).searchParams.get("plan") || ""
  if (!UUID.test(planId)) return NextResponse.json({ error: "Falta el plan" }, { status: 400 })

  const { data: plan, error: errPlan } = await admin
    .from("rodaje_planes").select("id, project_id").eq("id", planId).maybeSingle()
  if (errPlan) return NextResponse.json({ error: errPlan.message }, { status: 500 })
  if (!plan) return NextResponse.json({ ok: true })

  // Las rutas se anotan antes: al borrar el plan desaparecen sus filas.
  const { data: archivos, error: errArchivos } = await admin
    .from("rodaje_archivos").select("ruta, nombre").eq("plan_id", planId)
  if (errArchivos) return NextResponse.json({ error: errArchivos.message }, { status: 500 })

  // Foto de lo que había, para el Historial. Si algo de esto falla no importa:
  // el borrado sigue.
  const contar = async (tabla: string) => {
    const { count } = await admin.from(tabla).select("id", { count: "exact", head: true }).eq("plan_id", planId)
    return count ?? 0
  }
  // "Hecha" = que alguna unidad ya la marcó (cada unidad lleva su avance).
  const contarHechas = async () => {
    const { data } = await admin
      .from("rodaje_asignaciones").select("escena_id").eq("plan_id", planId).eq("filmada", true)
    return new Set((data || []).map((a) => a.escena_id as string)).size
  }
  const [proyecto, unidades, guiones, escenas, hechas, tomas, dias] = await Promise.all([
    admin.from("projects").select("name, code").eq("id", plan.project_id).maybeSingle().then((r) => r.data),
    admin.from("rodaje_unidades").select("nombre").eq("plan_id", planId).order("orden").then((r) => r.data),
    contar("rodaje_guiones"),
    contar("rodaje_escenas"),
    contarHechas(),
    contar("rodaje_tomas"),
    contar("rodaje_dias"),
  ])

  // Una sola operación: en cascada se van archivos, guiones, días, escenas,
  // separadores y tomas. O se borra todo o no se borra nada.
  const { error } = await admin.from("rodaje_planes").delete().eq("id", planId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Los archivos van al final: si esto fallara, lo que queda es un archivo
  // suelto en un bucket privado, no un plan que apunta a un archivo borrado.
  const rutas = new Set((archivos || []).map((a) => a.ruta as string).filter(Boolean))
  // También lo que haya quedado en la carpeta del plan sin fila (subidas a medias).
  const { data: sueltos } = await admin.storage.from(BUCKET).list(planId, { limit: 1000 })
  for (const o of sueltos || []) rutas.add(`${planId}/${o.name}`)

  const lista = [...rutas]
  let sinBorrar = 0
  for (let i = 0; i < lista.length; i += 100) {
    const tanda = lista.slice(i, i + 100)
    const { error: errStorage } = await admin.storage.from(BUCKET).remove(tanda)
    if (errStorage) {
      sinBorrar += tanda.length
      console.error(`[rodaje] plan ${planId}: no se pudieron borrar ${tanda.length} archivos de Storage: ${errStorage.message}`)
    }
  }

  const nombreProyecto = [proyecto?.code, proyecto?.name].filter(Boolean).join(" ")
  const { error: errHistorial } = await admin.from("activity_log").insert({
    actor_id: user.id,
    actor_email: perfil.email || user.email || null,
    actor_name: perfil.full_name || null,
    action: "DELETE",
    table_name: "rodaje_planes",
    record_id: planId,
    summary: nombreProyecto ? `Plan de rodaje completo · ${nombreProyecto}` : "Plan de rodaje completo",
    old_data: {
      proyecto: nombreProyecto,
      project_id: plan.project_id,
      unidades: (unidades || []).map((u) => u.nombre),
      guiones,
      escenas,
      escenas_hechas: hechas,
      tomas,
      dias,
      archivos: (archivos || []).map((a) => a.nombre),
    },
  })
  if (errHistorial) console.error(`[rodaje] plan ${planId}: no se anotó en el historial: ${errHistorial.message}`)

  return NextResponse.json({ ok: true, archivosSinBorrar: sinBorrar })
}
