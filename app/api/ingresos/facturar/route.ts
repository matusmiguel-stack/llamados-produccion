import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiUser } from "../../../../lib/api-auth"
import { parseNumeroFactura, parseUuidFiscal } from "../../../../lib/cfdi"
import { nombreLiquidacion } from "../../../../lib/liquidacion"

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
    // Facturación parcial: monto SIN IVA que ampara esta factura. El resto se
    // vuelve una línea nueva "… - Liquidación". Vacío = se factura todo.
    const parcialRaw = String(form.get("parcialSubtotal") || "").trim()
    // Nombre tal como se ve en la lista (para ingresos ligados el texto de la
    // columna no siempre coincide con lo mostrado, así que lo manda el cliente)
    const label = String(form.get("label") || "").trim()

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
      .select("id, proyecto, estatus, subtotal, iva, empresa, cliente_agencia, responsable, mes_cierre, created_at, project_id, liquidacion_project_id")
      .eq("id", ingresoId)
      .single()
    if (findErr || !ingreso) {
      return NextResponse.json({ error: "Ingreso no encontrado" }, { status: 404 })
    }

    // Validar el monto parcial contra el subtotal original
    const subtotalOriginal = Number(ingreso.subtotal ?? 0)
    const ivaOriginal = Number(ingreso.iva ?? 0)
    let parcial: number | null = null
    if (parcialRaw) {
      parcial = Math.round(parseFloat(parcialRaw) * 100) / 100
      if (!Number.isFinite(parcial) || parcial <= 0) {
        return NextResponse.json({ error: "El monto parcial no es válido" }, { status: 400 })
      }
      if (parcial >= subtotalOriginal) {
        return NextResponse.json(
          { error: "El monto parcial debe ser menor al subtotal del ingreso; para facturar todo deja la parcialidad vacía" },
          { status: 400 },
        )
      }
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

    // Parcial: el IVA se prorratea para que las dos líneas sumen el original
    const ivaParcial = parcial != null && subtotalOriginal > 0
      ? Math.round(ivaOriginal * (parcial / subtotalOriginal) * 100) / 100
      : null

    const { error: updErr } = await auth.admin
      .from("ingresos")
      .update({
        estatus: "facturado",
        numero_factura: numeroFactura,
        factura_uuid: uuidFiscal,
        factura_xml_path: xmlUp.data.path,
        factura_pdf_path: pdfUp.data.path,
        ...(parcial != null ? { subtotal: parcial, iva: ivaParcial } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", ingresoId)
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    // Crear la línea del remanente ("… - Liquidación"). Va DESVINCULADA de
    // proyecto y cotización: solo vive en el control de ingresos, así no toca
    // egresos ni cotizaciones, y finanzas puede corregirla como ingreso manual.
    let remanente: { proyecto: string; subtotal: number } | null = null
    if (parcial != null) {
      const nombreBase = label || ingreso.proyecto || ""
      const nombreRem = nombreLiquidacion(nombreBase)
      const subtotalRem = Math.round((subtotalOriginal - parcial) * 100) / 100
      const ivaRem = Math.round((ivaOriginal - (ivaParcial ?? 0)) * 100) / 100
      // created_at un segundo antes del original: la lista ordena por fecha
      // descendente, así el remanente queda justo ABAJO de la línea facturada.
      const createdRem = new Date(new Date(ingreso.created_at).getTime() - 1000).toISOString()
      const { error: insErr } = await auth.admin.from("ingresos").insert({
        empresa: ingreso.empresa,
        cliente_agencia: ingreso.cliente_agencia,
        responsable: ingreso.responsable,
        proyecto: nombreRem,
        // Hipervínculo al proyecto de origen (o el heredado, si esto ya es una
        // Liquidación encadenada). NO es project_id: la línea sigue siendo manual.
        liquidacion_project_id: ingreso.project_id ?? ingreso.liquidacion_project_id ?? null,
        subtotal: subtotalRem,
        iva: ivaRem,
        estatus: "en_produccion",
        mes_cierre: ingreso.mes_cierre,
        notas: `Remanente de la factura ${numeroFactura}`,
        created_at: createdRem,
        updated_at: new Date().toISOString(),
      })
      if (insErr) {
        return NextResponse.json(
          { error: `La factura se guardó, pero no se pudo crear la línea de liquidación: ${insErr.message}` },
          { status: 500 },
        )
      }
      remanente = { proyecto: nombreRem, subtotal: subtotalRem }
    }

    return NextResponse.json({ ok: true, numeroFactura, remanente })
  } catch (err: any) {
    console.error("[ingresos/facturar] error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
