import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiUser } from "../../../../lib/api-auth"
import { parseNumeroFactura, parseUuidFiscal } from "../../../../lib/cfdi"

// Mismos roles que pueden tocar ingresos en la app
const ROLES = ["admin", "finanzas"]

async function requireFinanzas(req: Request) {
  const user = await verifyApiUser(req)
  if (!user) return null
  // admin client con el actor → atribuye el movimiento al usuario en la auditoría
  const admin = createAdminClient(user.id)
  const { data: profile } = await admin
    .from("profiles").select("role").eq("id", user.id).single()
  if (!profile || !ROLES.includes(profile.role)) return null
  return { user, admin }
}

// POST con FormData → marca un ingreso como facturado.
// Exige el XML y el PDF del CFDI; el número de factura sale del propio XML.
export async function POST(req: Request) {
  try {
    const auth = await requireFinanzas(req)
    if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const form = await req.formData()
    const ingresoId = String(form.get("ingresoId") || "").trim()
    const xmlFile = form.get("xml") as File | null
    const pdfFile = form.get("pdf") as File | null
    // El número lo autollena el navegador leyendo el XML, pero es editable: no
    // todos los CFDI traen Serie/Folio, así que se acepta el que venga del form.
    const numeroForm = String(form.get("numeroFactura") || "").trim()

    if (!ingresoId) {
      return NextResponse.json({ error: "Falta el ingreso" }, { status: 400 })
    }
    if (!xmlFile || !pdfFile) {
      return NextResponse.json(
        { error: "El XML y el PDF de la factura son obligatorios" },
        { status: 400 },
      )
    }

    const { data: ingreso, error: findErr } = await auth.admin
      .from("ingresos")
      .select("id, proyecto, estatus")
      .eq("id", ingresoId)
      .single()
    if (findErr || !ingreso) {
      return NextResponse.json({ error: "Ingreso no encontrado" }, { status: 404 })
    }

    // Número de factura: el del formulario manda; si viene vacío se intenta leer
    // del CFDI (Serie + Folio). Muchos CFDI omiten la Serie, así que no siempre
    // se puede deducir.
    const xmlText = await xmlFile.text()
    const numeroFactura = numeroForm || parseNumeroFactura(xmlText)
    if (!numeroFactura) {
      return NextResponse.json(
        { error: "El XML no trae número de factura (Serie/Folio). Escríbelo a mano." },
        { status: 400 },
      )
    }
    const uuidFiscal = parseUuidFiscal(xmlText)

    // No permitir la misma factura en dos ingresos
    if (uuidFiscal) {
      const { data: dupe } = await auth.admin
        .from("ingresos")
        .select("id, proyecto")
        .eq("factura_uuid", uuidFiscal)
        .neq("id", ingresoId)
        .maybeSingle()
      if (dupe) {
        return NextResponse.json(
          { error: `Esa factura ya está registrada en el ingreso "${dupe.proyecto}"` },
          { status: 400 },
        )
      }
    }

    // Guardar archivos
    const stamp = Date.now()
    const safe = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_")
    const folder = `ingresos/${numeroFactura}`

    const xmlUp = await auth.admin.storage.from("facturas")
      .upload(`${folder}/${stamp}-${safe(xmlFile.name)}`, Buffer.from(await xmlFile.arrayBuffer()), {
        contentType: "text/xml",
      })
    if (xmlUp.error) {
      return NextResponse.json({ error: `No se pudo guardar el XML: ${xmlUp.error.message}` }, { status: 500 })
    }
    const pdfUp = await auth.admin.storage.from("facturas")
      .upload(`${folder}/${stamp}-${safe(pdfFile.name)}`, Buffer.from(await pdfFile.arrayBuffer()), {
        contentType: "application/pdf",
      })
    if (pdfUp.error) {
      return NextResponse.json({ error: `No se pudo guardar el PDF: ${pdfUp.error.message}` }, { status: 500 })
    }

    const { error: updErr } = await auth.admin
      .from("ingresos")
      .update({
        estatus: "facturado",
        numero_factura: numeroFactura,
        factura_uuid: uuidFiscal,
        factura_xml_path: xmlUp.data.path,
        factura_pdf_path: pdfUp.data.path,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ingresoId)
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, numeroFactura })
  } catch (err: any) {
    console.error("[ingresos/facturar] error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
