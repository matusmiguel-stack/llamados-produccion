import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiUser } from "../../../../lib/api-auth"
import {
  googleDriveConfigured,
  referenciasSpreadsheetId,
  getGoogleAccessToken,
  sanitizeTabTitle,
  getTabs,
  addTab,
  renameTab,
  overwriteTab,
  tabUrl,
} from "../../../../lib/google-sheets"

const FUENTE_LABELS: Record<string, string> = {
  instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", vimeo: "Vimeo",
  pinterest: "Pinterest", behance: "Behance", drive: "Drive", x: "X", web: "Web",
}

// POST { proyectoId } → sincroniza el proyecto de referencias a su pestaña en
// la hoja compartida del Drive (la crea si no existe). Cada proyecto es una
// pestaña de la misma hoja de cálculo (env GOOGLE_REFERENCIAS_SPREADSHEET_ID).
export async function POST(req: Request) {
  const user = await verifyApiUser(req)
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  if (!googleDriveConfigured()) {
    return NextResponse.json(
      { error: "El Drive no está configurado todavía. Faltan las variables GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_KEY y GOOGLE_REFERENCIAS_SPREADSHEET_ID." },
      { status: 501 }
    )
  }

  try {
    const { proyectoId } = await req.json()
    if (!proyectoId) return NextResponse.json({ error: "Falta proyectoId" }, { status: 400 })

    const admin = createAdminClient()
    const { data: proyecto } = await admin
      .from("referencia_proyectos")
      .select("id,nombre,drive_sheet_id,drive_url")
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

    const spreadsheetId = referenciasSpreadsheetId()
    const token = await getGoogleAccessToken()
    const titulo = sanitizeTabTitle(proyecto.nombre)

    // Buscar la pestaña del proyecto por su gid guardado; crearla si no está.
    const tabs = await getTabs(token, spreadsheetId)
    const gidGuardado = proyecto.drive_sheet_id != null ? Number(proyecto.drive_sheet_id) : null
    let tab = tabs.find(t => t.sheetId === gidGuardado) || null
    if (!tab) {
      tab = await addTab(token, spreadsheetId, titulo, tabs)
    } else if (tab.title !== titulo) {
      tab = await renameTab(token, spreadsheetId, tab, titulo, tabs)
    }

    await overwriteTab(token, spreadsheetId, tab, rows)

    const url = tabUrl(spreadsheetId, tab.sheetId)
    if (String(tab.sheetId) !== proyecto.drive_sheet_id || url !== proyecto.drive_url) {
      await admin.from("referencia_proyectos")
        .update({ drive_sheet_id: String(tab.sheetId), drive_url: url })
        .eq("id", proyectoId)
    }

    return NextResponse.json({ ok: true, url })
  } catch (err: any) {
    console.error("[referencias-sync] error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
