import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiRole } from "../../../../lib/api-auth"
import { INGRESO_FACTURA_COLS, registrarFacturaIngreso, validarParcial } from "../../../../lib/ingresos-factura"
import { cancelarFactura, crearFactura, descargarFactura, esModoPruebas, obtenerFactura, type FacturaEmitida } from "../../../../lib/facturapi"
import { enviarFacturaCliente } from "../../../../lib/factura-email"
import { detallistaParaGuardar, validarDetallista } from "../../../../lib/detallista"
import { validarSustitucion } from "../../../../lib/cfdi-sustitucion"

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
      .from("ingresos").select(`${INGRESO_FACTURA_COLS}, facturapi_id, factura_uuid, numero_factura`).eq("id", ingresoId).single()
    if (findErr || !ingreso) return NextResponse.json({ error: "Ingreso no encontrado" }, { status: 404 })
    const { uuid: sustituyeUuid, error: sustErr } = validarSustitucion(b.sustituyeUuid)
    if (sustErr) return NextResponse.json({ error: sustErr }, { status: 400 })

    // Refacturar: un ingreso ya facturado se puede volver a timbrar solo como
    // sustitución (relación 04) de su propia factura. La nueva queda en el
    // ingreso y la anterior se cancela con motivo 01.
    const uuidActual = String(ingreso.factura_uuid || "").toUpperCase()
    const refacturar = ingreso.estatus === "facturado" && !!uuidActual && sustituyeUuid === uuidActual
    if (ingreso.estatus === "pagado") {
      return NextResponse.json({ error: "Este ingreso ya está pagado; no se puede volver a facturar" }, { status: 400 })
    }
    if (ingreso.estatus === "facturado" && !refacturar) {
      return NextResponse.json({ error: "Este ingreso ya está facturado; para cambiar su factura usa 🔁 Refacturar" }, { status: 400 })
    }
    if (refacturar) {
      if (b.parcialSubtotal) return NextResponse.json({ error: "Al refacturar no se puede facturar parcialmente" }, { status: 400 })
      const { count } = await admin.from("complementos_pago")
        .select("id", { count: "exact", head: true }).eq("factura_uuid", ingreso.factura_uuid).eq("estatus", "vigente")
      if (count) {
        return NextResponse.json({ error: "La factura actual tiene complementos de pago vigentes; cancélalos primero en 🧾 Complementos de pago" }, { status: 400 })
      }
    }

    const { data: receptor } = await admin.from("receptores_fiscales").select("*").eq("id", receptorId).single()
    if (!receptor) return NextResponse.json({ error: "No se encontró el cliente a facturar" }, { status: 404 })
    const { datos: detallista, error: detallistaErr } = validarDetallista(b.detallista)
    if (detallistaErr) return NextResponse.json({ error: detallistaErr }, { status: 400 })
    const { data: emisor } = await admin.from("emisores_fiscales").select("serie").eq("empresa", ingreso.empresa).maybeSingle()

    const { parcial, error: parcialErr } = validarParcial(String(b.parcialSubtotal || ""), Number(ingreso.subtotal ?? 0))
    if (parcialErr) return NextResponse.json({ error: parcialErr }, { status: 400 })
    const precio = parcial ?? Number(ingreso.subtotal ?? 0)
    if (!(precio > 0)) return NextResponse.json({ error: "El ingreso no tiene subtotal para facturar" }, { status: 400 })

    // Si un intento anterior sí timbró pero falló al guardar, se reutiliza esa
    // factura en vez de timbrar otra (evita CFDI duplicados).
    // Al refacturar, ingreso.facturapi_id es la factura que se sustituye (si
    // se timbró en la app); si ya apunta a otra con distinto UUID, es la nueva
    // de un intento anterior que falló al guardar.
    let factura: FacturaEmitida
    let anteriorFacturapiId: string | null = null
    let previa: (FacturaEmitida & { status: string }) | null = null
    if (ingreso.facturapi_id) {
      previa = await obtenerFactura(ingreso.empresa, ingreso.facturapi_id)
      if (refacturar && previa.uuid === uuidActual) {
        anteriorFacturapiId = previa.id
        previa = null
      }
    }
    if (previa) {
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
        detallista,
        sustituyeUuid,
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

    // Refacturar: cancelar la factura anterior con motivo 01 apuntando a la
    // nueva. Si no se timbró en la app (Orderly), se avisa para hacerlo allá.
    let sustitucion: { anterior: string; cancelada: boolean; pendiente: boolean; mensaje: string } | null = null
    if (refacturar) {
      const anterior = ingreso.numero_factura || uuidActual
      if (!anteriorFacturapiId) {
        sustitucion = {
          anterior, cancelada: false, pendiente: false,
          mensaje: `Cancela la factura ${anterior} donde se emitió (Orderly o el panel de Facturapi) con motivo 01 y el UUID de la nueva: ${factura.uuid}`,
        }
      } else {
        try {
          const r = await cancelarFactura(ingreso.empresa, anteriorFacturapiId, "01", factura.uuid)
          sustitucion = r.status === "canceled"
            ? { anterior, cancelada: true, pendiente: false, mensaje: `La factura ${anterior} se canceló ante el SAT (motivo 01).` }
            : { anterior, cancelada: false, pendiente: true, mensaje: `La cancelación de ${anterior} (motivo 01) quedó en proceso: el SAT pidió que el cliente la acepte.` }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error("[ingresos/timbrar] cancelar anterior:", msg)
          sustitucion = {
            anterior, cancelada: false, pendiente: false,
            mensaje: `No se pudo cancelar ${anterior} (${msg}). Cancélala en el panel de Facturapi con motivo 01 y el UUID de la nueva: ${factura.uuid}`,
          }
        }
      }
    }

    // Recordar lo usado para prellenar la próxima factura de este cliente
    await admin.from("receptores_fiscales").update({
      ultima_forma_pago: metodoPago === "PPD" ? receptor.ultima_forma_pago : formaPago,
      ultimo_metodo_pago: metodoPago,
      uso_cfdi: uso,
      detallista: detallistaParaGuardar(detallista, receptor.detallista ?? null),
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
      ok: true, numeroFactura, uuid: factura.uuid, total: factura.total, remanente, sustitucion,
      correo, correoFallo: !!email && !correo, pruebas: esModoPruebas(ingreso.empresa),
    })
  } catch (err: any) {
    console.error("[ingresos/timbrar] error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
