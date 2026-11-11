import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiUser } from "../../../../lib/api-auth"

// POST JSON { userId } → elimina la cuenta de un usuario. Solo admin.
//
// Se borra la cuenta de auth y, en la misma operación de la BD, su perfil
// (profiles.id ON DELETE CASCADE); lo que creó (cotizaciones, entregas,
// juntas…) se conserva sin autor (created_by ON DELETE SET NULL). Es todo o
// nada: si algo lo impide, el usuario queda intacto.
export async function POST(request: Request) {
  try {
    const user = await verifyApiUser(request)
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const admin = createAdminClient(user.id)
    const { data: me } = await admin.from("profiles").select("id, role").eq("id", user.id).maybeSingle()
    if (me?.role !== "admin") {
      return NextResponse.json({ error: "Solo un administrador puede borrar usuarios" }, { status: 403 })
    }

    const { userId } = await request.json()
    if (!userId) return NextResponse.json({ error: "Falta el id del usuario" }, { status: 400 })
    if (userId === user.id) {
      return NextResponse.json({ error: "No puedes eliminar tu propia cuenta" }, { status: 400 })
    }

    const { data: target } = await admin.from("profiles").select("id, email, role").eq("id", userId).maybeSingle()
    if (!target) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })

    if (target.role === "admin") {
      const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin")
      if ((count || 0) <= 1) {
        return NextResponse.json({ error: "No puedes eliminar al último administrador" }, { status: 400 })
      }
    }

    const { error: authError } = await admin.auth.admin.deleteUser(userId)
    if (authError) {
      // La cuenta ya no existía: solo queda limpiar el perfil suelto
      const yaNoExiste = authError.status === 404 || /not.?found/i.test(authError.message)
      if (!yaNoExiste) {
        console.error("[admin/delete-user]", target.email, authError.message)
        return NextResponse.json(
          { error: `No se pudo eliminar a ${target.email}: ${authError.message}` },
          { status: 400 },
        )
      }
    }

    // Normalmente ya se fue con la cuenta (cascada); por si acaso
    const { error: profileError } = await admin.from("profiles").delete().eq("id", userId)
    if (profileError) {
      console.error("[admin/delete-user] perfil", target.email, profileError.message)
      return NextResponse.json(
        { error: `La cuenta de ${target.email} se eliminó, pero su perfil no: ${profileError.message}` },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al eliminar usuario"
    console.error("[admin/delete-user]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
