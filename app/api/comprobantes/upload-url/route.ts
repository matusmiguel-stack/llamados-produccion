import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiUser } from "../../../../lib/api-auth"

// Roles que registran pagos: Finanzas (marcar pagada) y staff (anticipos/comprobaciones)
const ALLOWED_ROLES = ["admin", "finanzas", "editor", "editor_premium"]
const TIPOS_VALIDOS = ["application/pdf", "image/jpeg", "image/jpg", "image/png"]

// POST { fileName, contentType, folder? } → URL firmada para subir el
// comprobante de pago directo a Storage (los requests a Vercel truenan
// arriba de 4.5 MB, por eso el archivo no viaja por la API).
export async function POST(req: Request) {
  const user = await verifyApiUser(req)
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles").select("role").eq("id", user.id).single()
  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { fileName, contentType, folder } = await req.json()
  if (!fileName || !TIPOS_VALIDOS.includes(contentType)) {
    return NextResponse.json({ error: "El comprobante debe ser PDF, JPG o PNG" }, { status: 400 })
  }

  const safe = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_")
  const dir = folder ? safe(String(folder)) : "sin-codigo"
  const path = `${dir}/comprobante-${Date.now()}-${safe(String(fileName))}`

  const { data, error } = await admin.storage.from("facturas").createSignedUploadUrl(path)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ path: data.path, token: data.token })
}
