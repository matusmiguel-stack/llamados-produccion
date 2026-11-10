import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiUser } from "../../../../lib/api-auth"
import {
  MAX_BYTES_GUION,
  ROLES_EDITAN_RODAJE,
  TIPOS_ARCHIVO_GUION,
} from "../../../../lib/rodaje/tipos"

const BUCKET = "guiones"

const MIME_POR_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
}

/** El navegador a veces no manda el tipo (sobre todo en .docx): se deduce del nombre. */
function tipoDeArchivo(fileName: string, contentType: string): string | null {
  if (TIPOS_ARCHIVO_GUION[contentType]) return contentType
  const ext = fileName.toLowerCase().split(".").pop() || ""
  return MIME_POR_EXTENSION[ext] || null
}

async function rolDe(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin.from("profiles").select("role").eq("id", userId).single()
  return data?.role || null
}

// POST { planId, fileName, contentType, size } → registra el archivo y devuelve
// una URL firmada para subirlo directo a Storage (los requests a Vercel truenan
// arriba de 4.5 MB, por eso el archivo no viaja por la API).
export async function POST(req: Request) {
  const user = await verifyApiUser(req)
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const rol = await rolDe(user.id)
  if (!rol || !ROLES_EDITAN_RODAJE.includes(rol)) {
    return NextResponse.json({ error: "Tu usuario no puede subir guiones" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const planId = String(body.planId || "")
  const fileName = String(body.fileName || "").trim()
  const size = Number(body.size) || 0
  const mime = tipoDeArchivo(fileName, String(body.contentType || ""))

  if (!planId || !fileName) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 })
  }
  if (!mime) {
    return NextResponse.json({ error: "El guion debe ser PDF, Word (.docx) o texto (.txt)" }, { status: 400 })
  }
  if (size > MAX_BYTES_GUION) {
    return NextResponse.json(
      { error: `El archivo pesa más de ${Math.round(MAX_BYTES_GUION / 1024 / 1024)} MB; comprímelo o divídelo` },
      { status: 400 }
    )
  }

  const admin = createAdminClient(user.id)
  const { data: plan } = await admin.from("rodaje_planes").select("id").eq("id", planId).maybeSingle()
  if (!plan) return NextResponse.json({ error: "El plan de rodaje no existe" }, { status: 404 })

  const seguro = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120)
  const ruta = `${planId}/${Date.now()}-${seguro}`

  const { data: firmada, error: errFirma } = await admin.storage.from(BUCKET).createSignedUploadUrl(ruta)
  if (errFirma || !firmada) {
    return NextResponse.json(
      { error: `No se pudo preparar la subida: ${errFirma?.message || "sin respuesta de Storage"}` },
      { status: 500 }
    )
  }

  const { data: archivo, error } = await admin
    .from("rodaje_archivos")
    .insert({
      plan_id: planId,
      nombre: fileName.slice(0, 200),
      ruta,
      mime,
      tamano: size || null,
      subido_por: user.id,
    })
    .select("*")
    .single()
  if (error || !archivo) {
    return NextResponse.json({ error: error?.message || "No se pudo registrar el archivo" }, { status: 500 })
  }

  return NextResponse.json({ archivo, path: firmada.path, token: firmada.token, mime })
}

// GET ?id=<archivo> → liga temporal (10 min) para abrir el archivo original.
// Cualquier usuario con sesión puede verlo, igual que el plan.
export async function GET(req: Request) {
  const user = await verifyApiUser(req)
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (!(await rolDe(user.id))) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const id = new URL(req.url).searchParams.get("id") || ""
  if (!id) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 })

  const admin = createAdminClient()
  const { data: archivo } = await admin.from("rodaje_archivos").select("ruta").eq("id", id).maybeSingle()
  if (!archivo) return NextResponse.json({ error: "El archivo ya no existe" }, { status: 404 })

  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(archivo.ruta, 600)
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "No se pudo abrir el archivo" }, { status: 500 })
  }
  return NextResponse.json({ url: data.signedUrl })
}

// DELETE ?id=<archivo> → descarta un archivo que todavía no se convirtió en
// guiones (y borra el archivo de Storage). Los ya aplicados no se borran aquí.
export async function DELETE(req: Request) {
  const user = await verifyApiUser(req)
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const rol = await rolDe(user.id)
  if (!rol || !ROLES_EDITAN_RODAJE.includes(rol)) {
    return NextResponse.json({ error: "Tu usuario no puede borrar guiones" }, { status: 403 })
  }

  const id = new URL(req.url).searchParams.get("id") || ""
  if (!id) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 })

  const admin = createAdminClient(user.id)
  const { data: archivo } = await admin
    .from("rodaje_archivos").select("id, ruta, estado").eq("id", id).maybeSingle()
  if (!archivo) return NextResponse.json({ ok: true })
  if (archivo.estado === "aplicado") {
    return NextResponse.json({ error: "Este archivo ya está en el plan; borra sus guiones desde el plan" }, { status: 409 })
  }

  const { error } = await admin.from("rodaje_archivos").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await admin.storage.from(BUCKET).remove([archivo.ruta])
  return NextResponse.json({ ok: true })
}
