import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiUser } from "../../../../lib/api-auth"
import { puedeCalificar } from "../../../../lib/referencias-semaforo"

// POST { referenciaId, semaforo: "verde" | "amarillo" | "rojo" | null }
// Solo los usuarios de REFERENCIA_RATERS pueden calificar.
export async function POST(req: Request) {
  const user = await verifyApiUser(req)
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (!puedeCalificar(user.email)) {
    return NextResponse.json({ error: "Solo Miguel y Regina pueden calificar referencias" }, { status: 403 })
  }

  const { referenciaId, semaforo } = await req.json()
  if (!referenciaId) return NextResponse.json({ error: "Falta referenciaId" }, { status: 400 })
  if (semaforo != null && !["verde", "amarillo", "rojo"].includes(semaforo)) {
    return NextResponse.json({ error: "Semáforo inválido" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("referencias")
    .update({ semaforo: semaforo ?? null })
    .eq("id", referenciaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
