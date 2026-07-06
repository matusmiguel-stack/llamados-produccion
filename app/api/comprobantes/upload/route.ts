import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiUser } from "../../../../lib/api-auth"

// Roles que registran pagos: Finanzas (marcar pagada) y staff (anticipos/comprobaciones)
const ALLOWED_ROLES = ["admin", "finanzas", "editor", "editor_premium"]
const TIPOS_VALIDOS = ["application/pdf", "image/jpeg", "image/jpg", "image/png"]

// POST (multipart) { file, folder? } → sube el comprobante server-side con el
// cliente admin y devuelve su ruta. Ruta confiable para archivos chicos: el
// archivo no toca el storage desde el navegador (algunas redes lo bloquean).
export async function POST(req: Request) {
  const user = await verifyApiUser(req)
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles").select("role").eq("id", user.id).single()
  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const fd = await req.formData()
  const file = fd.get("file")
  const folder = fd.get("folder") ? String(fd.get("folder")) : null
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Falta el archivo del comprobante" }, { status: 400 })
  }
  if (!TIPOS_VALIDOS.includes(file.type)) {
    return NextResponse.json({ error: "El comprobante debe ser PDF, JPG o PNG" }, { status: 400 })
  }

  const safe = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_")
  const dir = folder ? safe(String(folder)) : "sin-codigo"
  const path = `${dir}/comprobante-${Date.now()}-${safe(file.name)}`

  const up = await admin.storage
    .from("facturas")
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type })
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 })

  return NextResponse.json({ path: up.data.path })
}
