import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiRole } from "../../../../lib/api-auth"
import { esModoPruebas } from "../../../../lib/facturapi"
import { ComplementoError, cargarFacturaPPD, emitirComplementoPago } from "../../../../lib/complementos-pago"

// POST JSON { ingresoId, formaPago } → emite el complemento de pago (CFDI P)
// de un ingreso PPD ya marcado como pagado. Sirve igual para facturas
// timbradas en la app que para las que se subieron de Orderly: todo sale del
// XML guardado. Importe = subtotal + IVA de la línea pagada.
// (Los complementos "a mano" van por /api/facturacion/complementos.)
export async function POST(req: Request) {
  try {
    const user = await verifyApiRole(req, ["admin", "finanzas"])
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const admin = createAdminClient(user.id)

    const { ingresoId, formaPago } = await req.json()
    const forma = String(formaPago || "03")
    if (!/^\d{2}$/.test(forma) || forma === "99") {
      return NextResponse.json({ error: "Elige cómo se recibió el pago (transferencia, cheque…)" }, { status: 400 })
    }

    const { data: ing } = await admin
      .from("ingresos")
      .select("id, empresa, estatus, subtotal, iva, fecha_pago, factura_xml_path, factura_uuid")
      .eq("id", ingresoId).single()
    if (!ing) return NextResponse.json({ error: "Ingreso no encontrado" }, { status: 404 })
    if (ing.estatus !== "pagado" || !ing.fecha_pago) {
      return NextResponse.json({ error: "Primero marca el ingreso como pagado" }, { status: 400 })
    }
    if (!ing.factura_xml_path) return NextResponse.json({ error: "El ingreso no tiene el XML de su factura" }, { status: 400 })
    if (!ing.factura_uuid) return NextResponse.json({ error: "No se pudo leer el folio fiscal de la factura" }, { status: 400 })

    const { data: ya } = await admin.from("complementos_pago").select("numero")
      .eq("ingreso_id", ingresoId).eq("estatus", "vigente").maybeSingle()
    if (ya) return NextResponse.json({ error: `Este pago ya tiene complemento (${ya.numero || "emitido"})` }, { status: 400 })

    const factura = await cargarFacturaPPD(admin, ing.factura_uuid)
    const r = await emitirComplementoPago(admin, {
      factura,
      monto: Number(ing.subtotal) + Number(ing.iva),
      fecha: String(ing.fecha_pago).slice(0, 10),
      formaPago: forma,
      ingresoId: ing.id,
      origen: "auto",
      createdBy: user.id,
    })

    return NextResponse.json({
      ok: true, numero: r.numero, parcialidad: r.parcialidad, saldoAnterior: r.saldoAnterior, monto: r.monto,
      saldoInsoluto: r.saldoInsoluto, pruebas: esModoPruebas(factura.empresa),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (err instanceof ComplementoError) return NextResponse.json({ error: msg }, { status: 400 })
    console.error("[ingresos/complemento-pago] error:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
