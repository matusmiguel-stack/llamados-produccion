import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiUser } from "../../../../lib/api-auth"
import { parseCfdiResumen, parseNumeroFactura, parseUuidFiscal } from "../../../../lib/cfdi"
import { INGRESO_FACTURA_COLS, registrarFacturaIngreso, validarParcial } from "../../../../lib/ingresos-factura"

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
      .select(INGRESO_FACTURA_COLS)
      .eq("id", ingresoId)
      .single()
    if (findErr || !ingreso) {
      return NextResponse.json({ error: "Ingreso no encontrado" }, { status: 404 })
    }

    // Validar el monto parcial contra el subtotal original
    const { parcial, error: parcialErr } = validarParcial(parcialRaw, Number(ingreso.subtotal ?? 0))
    if (parcialErr) return NextResponse.json({ error: parcialErr }, { status: 400 })

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
        .limit(1)
        .maybeSingle()
      if (dupe) {
        return NextResponse.json(
          { error: `Esa factura ya está registrada en el ingreso "${dupe.proyecto}"` },
          { status: 400 },
        )
      }
    }

    const { remanente } = await registrarFacturaIngreso(auth.admin, ingreso as any, {
      xml: Buffer.from(xmlText, "utf8"),
      pdf: Buffer.from(await pdfFile.arrayBuffer()),
      xmlName: xmlFile.name,
      pdfName: pdfFile.name,
      numeroFactura,
      uuidFiscal,
      parcial,
      label,
      // PUE/PPD: decide si al cobrar se emite complemento de pago
      extra: { factura_metodo_pago: parseCfdiResumen(xmlText).metodoPago },
    })

    return NextResponse.json({ ok: true, numeroFactura, remanente })
  } catch (err: any) {
    console.error("[ingresos/facturar] error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
