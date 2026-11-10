import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiUser } from "../../../../lib/api-auth"
import { ROLES_EDITAN_RODAJE } from "../../../../lib/rodaje/tipos"
import { ErrorIA, leerIndice, leerTexto, type EscenaPedida } from "../../../../lib/rodaje/ia"

// Leer un guion completo puede tardar un par de minutos.
export const maxDuration = 300

const BUCKET = "guiones"
const MAX_ESCENAS_POR_TANDA = 40

function fallo(err: unknown) {
  const e = err instanceof ErrorIA ? err : new ErrorIA((err as Error)?.message || "Error al leer el guion")
  return { mensaje: e.message, codigo: e.codigo, status: e.status }
}

// POST { archivoId, modo: "indice" }
//   → la IA lee el archivo y devuelve sus piezas y escenas. Queda guardado en
//     rodaje_archivos.indice para que el usuario lo revise antes de aplicarlo.
// POST { archivoId, modo: "texto", escenaIds: [...] }
//   → la IA transcribe el texto de esas escenas y lo guarda en rodaje_escenas.
export async function POST(req: Request) {
  const user = await verifyApiUser(req)
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const admin = createAdminClient(user.id)
  const { data: perfil } = await admin.from("profiles").select("role").eq("id", user.id).single()
  if (!perfil || !ROLES_EDITAN_RODAJE.includes(perfil.role)) {
    return NextResponse.json({ error: "Tu usuario no puede leer guiones con IA" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const archivoId = String(body.archivoId || "")
  const modo = body.modo === "texto" ? "texto" : "indice"
  if (!archivoId) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 })

  const { data: archivo } = await admin
    .from("rodaje_archivos")
    .select("id, plan_id, nombre, ruta, mime, estado")
    .eq("id", archivoId)
    .maybeSingle()
  if (!archivo) return NextResponse.json({ error: "El archivo ya no existe" }, { status: 404 })

  // ── Qué escenas se piden (solo en modo texto) ──────────────────────────────
  let pedidas: (EscenaPedida & { id: string })[] = []
  if (modo === "texto") {
    const ids: string[] = Array.isArray(body.escenaIds)
      ? body.escenaIds.map((x: unknown) => String(x)).slice(0, MAX_ESCENAS_POR_TANDA)
      : []
    if (!ids.length) return NextResponse.json({ leidas: [], faltan: [] })

    const [{ data: escenas }, { data: guiones }] = await Promise.all([
      admin
        .from("rodaje_escenas")
        .select("id, guion_id, orden, numero, encabezado, locacion, pagina")
        .eq("plan_id", archivo.plan_id)
        .in("id", ids),
      admin
        .from("rodaje_guiones")
        .select("id, orden, numero, titulo")
        .eq("plan_id", archivo.plan_id)
        .eq("archivo_id", archivo.id),
    ])
    const porGuion = new Map((guiones || []).map((g) => [g.id, g]))
    pedidas = (escenas || [])
      .filter((e) => porGuion.has(e.guion_id))
      .sort((a, b) => {
        const ga = porGuion.get(a.guion_id)!, gb = porGuion.get(b.guion_id)!
        return ga.orden - gb.orden || a.orden - b.orden
      })
      .map((e, i) => {
        const g = porGuion.get(e.guion_id)!
        return {
          id: e.id,
          clave: `e${i + 1}`,
          guionNumero: g.numero,
          guionTitulo: g.titulo,
          numero: e.numero,
          encabezado: e.encabezado,
          locacion: e.locacion,
          pagina: e.pagina,
        }
      })
    if (!pedidas.length) return NextResponse.json({ leidas: [], faltan: ids })
  }

  // ── El archivo ─────────────────────────────────────────────────────────────
  const { data: blob, error: errDescarga } = await admin.storage.from(BUCKET).download(archivo.ruta)
  if (errDescarga || !blob) {
    const mensaje = "El archivo no terminó de subirse. Quítalo y vuelve a subirlo."
    if (modo === "indice") {
      await admin.from("rodaje_archivos").update({ estado: "error", error: mensaje }).eq("id", archivo.id)
    }
    return NextResponse.json({ error: mensaje, codigo: "documento" }, { status: 422 })
  }
  const doc = { nombre: archivo.nombre, mime: archivo.mime, datos: Buffer.from(await blob.arrayBuffer()) }

  // ── Índice ─────────────────────────────────────────────────────────────────
  if (modo === "indice") {
    try {
      const { indice, uso } = await leerIndice(doc)
      await admin
        .from("rodaje_archivos")
        .update({ indice, error: null, ...(archivo.estado === "aplicado" ? {} : { estado: "leido" }) })
        .eq("id", archivo.id)
      await admin.rpc("rodaje_sumar_uso", { p_archivo: archivo.id, p_uso: uso })
      return NextResponse.json({ indice })
    } catch (err) {
      const f = fallo(err)
      if (archivo.estado !== "aplicado") {
        await admin.from("rodaje_archivos").update({ estado: "error", error: f.mensaje }).eq("id", archivo.id)
      }
      return NextResponse.json({ error: f.mensaje, codigo: f.codigo }, { status: f.status })
    }
  }

  // ── Texto de escenas ───────────────────────────────────────────────────────
  try {
    const { textos, uso } = await leerTexto(doc, pedidas)
    const leidas: string[] = []
    const faltan: string[] = []
    await Promise.all(
      pedidas.map(async (p) => {
        const lineas = textos[p.clave]
        if (!lineas) {
          faltan.push(p.id)
          return
        }
        const { error } = await admin
          .from("rodaje_escenas")
          .update({ texto: lineas, updated_at: new Date().toISOString() })
          .eq("id", p.id)
        if (error) faltan.push(p.id)
        else leidas.push(p.id)
      })
    )
    await admin.rpc("rodaje_sumar_uso", { p_archivo: archivo.id, p_uso: uso })
    return NextResponse.json({ leidas, faltan })
  } catch (err) {
    const f = fallo(err)
    return NextResponse.json({ error: f.mensaje, codigo: f.codigo }, { status: f.status })
  }
}
