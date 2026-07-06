import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiUser } from "../../../../lib/api-auth"
import {
  googleDriveConfigured,
  getGoogleAccessToken,
  createSpreadsheetInFolder,
  renameDriveFile,
  overwriteSheet,
  spreadsheetUrl,
} from "../../../../lib/google-sheets"

const FUENTE_LABELS: Record<string, string> = {
  instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", vimeo: "Vimeo",
  pinterest: "Pinterest", behance: "Behance", drive: "Drive", x: "X", web: "Web",
}

// POST { proyectoId } → sincroniza el proyecto de referencias a su hoja de
// Google Sheets en el Drive compartido (la crea si no existe).
export async function POST(req: Request) {
  const user = await verifyApiUser(req)
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  if (!googleDriveConfigured()) {
    return NextResponse.json(
      { error: "El Drive no está configurado todavía. Faltan las variables GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_KEY y GOOGLE_DRIVE_REFERENCIAS_FOLDER_ID." },
      { status: 501 }
    )
  }

  try {
    const { proyectoId } = await req.json()
    if (!proyectoId) return NextResponse.json({ error: "Falta proyectoId" }, { status: 400 })

    const admin = createAdminClient()
    const { data: proyecto } = await admin
      .from("referencia_proyectos")
      .select("id,nombre,descripcion,drive_sheet_id")
      .eq("id", proyectoId)
      .maybeSingle()
    if (!proyecto) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 })

    const { data: refs } = await admin
      .from("referencias")
      .select("url,titulo,nota,fuente,created_at,profiles(full_name)")
      .eq("proyecto_id", proyectoId)
      .order("created_at", { ascending: false })

    const rows: (string | number)[][] = [
      ["Fecha", "Fuente", "Título", "Link", "Nota", "Subida por"],
      ...(refs || []).map((r: any) => [
        new Date(r.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Mexico_City" }),
        FUENTE_LABELS[r.fuente] || "Web",
        r.titulo || "",
        r.url,
        r.nota || "",
        r.profiles?.full_name || "",
      ]),
    ]

    const token = await getGoogleAccessToken()
    const nombreArchivo = `Referencias — ${proyecto.nombre}`
    let sheetId: string | null = proyecto.drive_sheet_id

    // Escribir; si la hoja fue borrada del Drive, crear una nueva y reintentar.
    let escrito = false
    if (sheetId) {
      escrito = await overwriteSheet(token, sheetId, rows)
      if (escrito) await renameDriveFile(token, sheetId, nombreArchivo)
    }
    if (!escrito) {
      sheetId = await createSpreadsheetInFolder(token, nombreArchivo)
      await overwriteSheet(token, sheetId, rows)
    }

    if (sheetId !== proyecto.drive_sheet_id) {
      await admin.from("referencia_proyectos").update({ drive_sheet_id: sheetId }).eq("id", proyectoId)
    }

    return NextResponse.json({ ok: true, sheetId, url: spreadsheetUrl(sheetId!) })
  } catch (err: any) {
    console.error("[referencias-sync] error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
