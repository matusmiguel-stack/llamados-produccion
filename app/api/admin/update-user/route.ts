import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createAdminClient } from "../../../../lib/supabase-admin"

const VALID_ROLES = ["viewer", "productor", "editor", "editor_premium", "finanzas", "admin"]

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization")
    if (!authHeader) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    // Verify caller is admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const adminClient = createAdminClient()
    const { data: callerProfile, error: callerErr } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const callerRole = callerProfile?.role
    if (callerErr || (callerRole !== "admin" && callerRole !== "editor_premium")) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 })
    }

    const { userId, role, full_name } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: "Falta userId" }, { status: 400 })
    }
    if (role !== undefined && !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 })
    }

    // Editor Premium puede gestionar usuarios, pero no el tier admin: no puede
    // otorgar el rol Admin ni modificar a un administrador existente.
    if (callerRole === "editor_premium") {
      if (role === "admin") {
        return NextResponse.json({ error: "No puedes asignar el rol Admin" }, { status: 403 })
      }
      const { data: target } = await adminClient
        .from("profiles").select("role").eq("id", userId).single()
      if (target?.role === "admin") {
        return NextResponse.json({ error: "No puedes modificar a un administrador" }, { status: 403 })
      }
    }

    const updates: Record<string, string> = {}
    if (role      !== undefined) updates.role      = role
    if (full_name !== undefined) updates.full_name = full_name

    const { error } = await adminClient
      .from("profiles")
      .update(updates)
      .eq("id", userId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al actualizar"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
