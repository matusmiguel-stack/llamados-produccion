import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiRole } from "../../../../lib/api-auth"
import { INGRESO_FACTURA_COLS, registrarFacturaIngreso, validarParcial } from "../../../../lib/ingresos-factura"
import { crearFactura, descargarFactura, esModoPruebas, obtenerFactura, type FacturaEmitida } from "../../../../lib/facturapi"
import { enviarFacturaCliente } from "../../../../lib/factura-email"

// POST JSON → timbra el CFDI del ingreso en Facturapi, guarda XML y PDF y lo
// marca como facturado (mismo registro que cuando se sube desde Orderly).
export async function POST(req: Request) {
  try {
    const user = await verifyApiRole(req, ["admin", "finanzas"])
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const admin = createAdminClient(user.id)

    const b = await req.json()
    const ingresoId = String(b.ingresoId || "")
    const receptorId = String(b.receptorId || "")
    const descripcion = String(b.descripcion || "").trim()
    const claveProdServ = String(b.claveProdServ || "").trim()
    const claveUnidad = String(b.claveUnidad || "").trim()
    const uso = String(b.uso || "G03")
    const metodoPago = b.metodoPago === "PPD" ? "PPD" : "PUE"
    const formaPago = String(b.formaPago || "03")
    const ivaTasa = Number(b.ivaTasa) === 0 ? 0 : 0.16
    const label = String(b.label || "").trim()
    const email = String(b.email || "").trim()

    if (!ingresoId || !receptorId) return NextResponse.json({ error: "Falta el ingreso o el cliente a facturar" }, { status: 400 })
    if (!descripcion) return NextResponse.json({ error: "Escribe el concepto de la factura" }, { status: 400 })
    if (!/^\d{8}$/.test(claveProdServ)) return NextResponse.json({ error: "La clave de producto/servicio SAT debe tener 8 dígitos" }, { status: 400 })
    if (!claveUnidad) return NextResponse.json({ error: "Falta la clave de unidad SAT" }, { status: 400 })

    const { data: ingreso, error: findErr } = await admin
      .from("ingresos").select(`${INGRESO_FACTURA_COLS}, facturapi_id`).eq("id", ingresoId).single()
    if (findErr || !ingreso) return NextResponse.json({ error: "Ingreso no encontrado" }, { status: 404 })
    if (ingreso.estatus === "facturado" || ingreso.estatus === "pagado") {
      return NextResponse.json({ error: "Este ingreso ya está facturado" }, { status: 400 })
    }

    const { data: receptor } = await admin.from("receptores_fiscales").select("*").eq("id", receptorId).single()
    if (!receptor) return NextResponse.json({ error: "No se encontró el cliente a facturar" }, { status: 404 })
    const { data: emisor } = await admin.from("emisores_fiscales").select("serie").eq("empresa", ingreso.empresa).maybeSingle()

    const { parcial, error: parcialErr } = validarParcial(String(b.parcialSubtotal || ""), Number(ingreso.subtotal ?? 0))
    if (parcialErr) return NextResponse.json({ error: parcialErr }, { status: 400 })
    const precio = parcial ?? Number(ingreso.subtotal ?? 0)
    if (!(precio > 0)) return NextResponse.json({ error: "El ingreso no tiene subtotal para facturar" }, { status: 400 })

    // Si un intento anterior sí timbró pero falló al guardar, se reutiliza esa
    // factura en vez de timbrar otra (evita CFDI duplicados).
    let factura: FacturaEmitida
    if (ingreso.facturapi_id) {
      const previa = await obtenerFactura(ingreso.empresa, ingreso.facturapi_id)
      if (previa.status !== "valid") {
        await admin.from("ingresos").update({ facturapi_id: null }).eq("id", ingresoId)
        return NextResponse.json({ error: "La factura anterior de este ingreso no está vigente; vuelve a intentarlo" }, { status: 409 })
      }
      factura = previa
    } else {
      factura = await crearFactura(ingreso.empresa, {
        receptor: { rfc: receptor.rfc, razon_social: receptor.razon_social, regimen_fiscal: receptor.regimen_fiscal, cp: receptor.cp, email: receptor.email },
        conceptos: [{ descripcion, clave_prod_serv: claveProdServ, clave_unidad: claveUnidad, precio }],
        ivaTasa,
        uso,
        formaPago,
        metodoPago,
        serie: emisor?.serie || null,
      })
      await admin.from("ingresos").update({ facturapi_id: factura.id }).eq("id", ingresoId)
    }

    const [xml, pdf] = await Promise.all([
      descargarFactura(ingreso.empresa, factura.id, "xml"),
      descargarFactura(ingreso.empresa, factura.id, "pdf"),
    ])
    const numeroFactura = `${factura.series || ""}${factura.folio_number ?? ""}` || factura.uuid.slice(0, 8)

    const { remanente } = await registrarFacturaIngreso(admin, ingreso as any, {
      xml, pdf,
      xmlName: `${numeroFactura}.xml`,
      pdfName: `${numeroFactura}.pdf`,
      numeroFactura,
      uuidFiscal: factura.uuid || null,
      parcial,
      label,
      extra: { facturapi_id: factura.id, receptor_fiscal_id: receptor.id, factura_metodo_pago: metodoPago },
    })

    // Recordar lo usado para prellenar la próxima factura de este cliente
    await admin.from("receptores_fiscales").update({
      ultima_forma_pago: metodoPago === "PPD" ? receptor.ultima_forma_pago : formaPago,
      ultimo_metodo_pago: metodoPago,
      uso_cfdi: uso,
      updated_at: new Date().toISOString(),
    }).eq("id", receptor.id)

    // El correo no debe tumbar la factura: si falla, se avisa y ya
    let correo: string | null = null
    if (email) {
      try {
        await enviarFacturaCliente({
          para: email, empresa: ingreso.empresa, numero: numeroFactura, receptor: receptor.razon_social,
          total: factura.total, uuid: factura.uuid || null, pdf, xml,
        })
        correo = email
      } catch (e: any) {
        console.error("[ingresos/timbrar] correo:", e.message)
      }
    }

    return NextResponse.json({
      ok: true, numeroFactura, uuid: factura.uuid, total: factura.total, remanente,
      correo, correoFallo: !!email && !correo, pruebas: esModoPruebas(ingreso.empresa),
    })
  } catch (err: any) {
    console.error("[ingresos/timbrar] error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
