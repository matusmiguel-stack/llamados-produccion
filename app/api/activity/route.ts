import { NextResponse } from "next/server"
import { createAdminClient } from "../../../lib/supabase-admin"
import { verifyApiUser } from "../../../lib/api-auth"

async function requireAdmin(req: Request) {
  const user = await verifyApiUser(req)
  if (!user) return null
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles").select("role").eq("id", user.id).single()
  if (!profile || profile.role !== "admin") return null
  return { user, admin }
}

// GET → historial de movimientos con filtros y paginación (solo admin)
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200)
  const offset = Math.max(Number(url.searchParams.get("offset") || 0), 0)
  const table = url.searchParams.get("table") || ""
  const action = url.searchParams.get("action") || ""
  const actor = url.searchParams.get("actor") || ""
  const from = url.searchParams.get("from") || ""
  const to = url.searchParams.get("to") || ""
  const q = (url.searchParams.get("q") || "").trim()

  let query = auth.admin
    .from("activity_log")
    .select("id, occurred_at, actor_id, actor_email, actor_name, action, table_name, record_id, summary", { count: "exact" })
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (table) query = query.eq("table_name", table)
  if (action) query = query.eq("action", action)
  if (actor) query = actor === "sistema" ? query.is("actor_id", null) : query.eq("actor_id", actor)
  if (from) query = query.gte("occurred_at", `${from}T00:00:00`)
  if (to) query = query.lte("occurred_at", `${to}T23:59:59`)
  if (q) query = query.or(`summary.ilike.%${q}%,actor_email.ilike.%${q}%,actor_name.ilike.%${q}%,record_id.ilike.%${q}%`)

  const { data: rows, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ rows: rows || [], total: count ?? 0 })
}

// POST → detalle de un movimiento (incluye old_data / new_data)
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  if (body.action === "detail" && body.id) {
    const { data, error } = await auth.admin
      .from("activity_log")
      .select("*")
      .eq("id", body.id)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ row: data })
  }

  if (body.action === "facets") {
    // Tablas y actores distintos para poblar los filtros
    const { data: tables } = await auth.admin
      .from("activity_log").select("table_name").order("table_name")
    const { data: actors } = await auth.admin
      .from("activity_log").select("actor_id, actor_name, actor_email")
    const tableSet = [...new Set((tables || []).map((r: any) => r.table_name))].sort()
    const actorMap = new Map<string, { id: string | null; name: string | null; email: string | null }>()
    for (const a of actors || []) {
      const key = a.actor_id || "sistema"
      if (!actorMap.has(key)) actorMap.set(key, { id: a.actor_id, name: a.actor_name, email: a.actor_email })
    }
    return NextResponse.json({ tables: tableSet, actors: [...actorMap.values()] })
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 })
}
