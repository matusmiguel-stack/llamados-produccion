import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"

// Vista pública de una matriz (solo lectura, sin sesión).
//
// Es la ÚNICA ruta sin autenticar de la app, así que se limita a lo mínimo:
// busca por token y devuelve los campos de esa matriz más el nombre del
// proyecto y del cliente para el encabezado. Nada de ids, nada de otras
// matrices, nada de egresos ni cotizaciones.

// Campos de la matriz que se muestran. Lista explícita: si mañana se agrega
// una columna interna a la tabla, no se filtra sola a la vista pública.
const CAMPOS = [
  "nombre",
  "nombre_proyecto", "cliente", "director", "productor", "lider_post", "nomenclatura",
  "time_table",
  "material", "calificacion", "entregables", "asignacion_capsulas", "guion_ppm",
  "legales", "referencia_musica", "paqueteria_grafica", "assets",
  "liga_masters", "liga_copia_trabajo", "backup_produccion", "backup_post",
  "minuta", "indicaciones_extra",
] as const

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  // Los tokens que generamos son 64 caracteres hex; descartamos cualquier otra
  // cosa antes de tocar la base.
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return NextResponse.json({ error: "Liga no válida" }, { status: 404 })
  }

  const admin = createAdminClient()
  const { data: matriz, error } = await admin
    .from("project_matrices")
    .select(`${CAMPOS.join(",")}, project_id, updated_at`)
    .eq("share_token", token)
    .maybeSingle()

  if (error || !matriz) {
    return NextResponse.json({ error: "Esta liga ya no está disponible" }, { status: 404 })
  }

  // Encabezado: código y nombre del proyecto, y su cliente
  let proyecto: string | null = null
  let cliente: string | null = null
  if ((matriz as any).project_id) {
    const { data: proj } = await admin
      .from("projects").select("name, code, client_id").eq("id", (matriz as any).project_id).single()
    if (proj) {
      proyecto = proj.code ? `${proj.code} ${proj.name}` : proj.name
      if (proj.client_id) {
        const { data: cli } = await admin
          .from("clients").select("name").eq("id", proj.client_id).single()
        cliente = cli?.name ?? null
      }
    }
  }

  // No se devuelve project_id: quien abre la liga no necesita ids internos.
  const campos: Record<string, string> = {}
  for (const k of CAMPOS) campos[k] = ((matriz as any)[k] ?? "") as string

  return NextResponse.json(
    { matriz: campos, proyecto, cliente, actualizada: (matriz as any).updated_at },
    // Sin caché: si editan la matriz, la liga debe mostrar lo nuevo.
    { headers: { "Cache-Control": "no-store" } },
  )
}
