import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createAdminClient } from "../../../../lib/supabase-admin"

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization")

    if (!authHeader) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !anonKey) {
      return NextResponse.json(
        { error: "Configuración de Supabase incompleta" },
        { status: 500 }
      )
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const { data: profiles, error: profilesError } = await userClient
      .from("profiles")
      .select("*")

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 400 })
    }

    const myProfile = profiles?.find(
      (profile) =>
        profile.email?.trim().toLowerCase() ===
        user.email?.trim().toLowerCase()
    )

    if (!myProfile || (myProfile.role !== "admin" && myProfile.role !== "editor_premium")) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 })
    }

    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: "Falta el id del usuario" }, { status: 400 })
    }

    if (userId === myProfile.id || userId === user.id) {
      return NextResponse.json(
        { error: "No puedes eliminar tu propia cuenta" },
        { status: 400 }
      )
    }

    const targetUser = profiles?.find((profile) => profile.id === userId)

    if (!targetUser) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    }

    // Editor Premium no puede eliminar administradores.
    if (myProfile.role === "editor_premium" && targetUser.role === "admin") {
      return NextResponse.json({ error: "No puedes eliminar a un administrador" }, { status: 403 })
    }

    if (targetUser.role === "admin") {
      const adminCount =
        profiles?.filter((profile) => profile.role === "admin").length || 0

      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "No puedes eliminar al último administrador" },
          { status: 400 }
        )
      }
    }

    const adminClient = createAdminClient()

    const { error: profileDeleteError } = await adminClient
      .from("profiles")
      .delete()
      .eq("id", userId)

    if (profileDeleteError) {
      return NextResponse.json({ error: profileDeleteError.message }, { status: 400 })
    }

    const { error: authDeleteError } =
      await adminClient.auth.admin.deleteUser(userId)

    if (authDeleteError) {
      return NextResponse.json({ error: authDeleteError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al eliminar usuario"

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
