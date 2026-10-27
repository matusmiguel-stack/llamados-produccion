import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiRole } from "../../../../lib/api-auth"
import { parseCfdiResumen } from "../../../../lib/cfdi"
import { crearComplementoPago, descargarFactura, esModoPruebas } from "../../../../lib/facturapi"

// POST JSON { ingresoId, formaPago } → emite el complemento de pago (CFDI P)
// de un ingreso PPD ya marcado como pagado. Sirve igual para facturas
// timbradas en la app que para las que se subieron de Orderly: todo sale del
// XML guardado. Importe = subtotal + IVA de la línea pagada.
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
      .select("id, empresa, estatus, subtotal, iva, fecha_pago, factura_xml_path, factura_uuid, receptor_fiscal_id")
      .eq("id", ingresoId).single()
    if (!ing) return NextResponse.json({ error: "Ingreso no encontrado" }, { status: 404 })
    if (ing.estatus !== "pagado" || !ing.fecha_pago) {
      return NextResponse.json({ error: "Primero marca el ingreso como pagado" }, { status: 400 })
    }
    if (!ing.factura_xml_path) return NextResponse.json({ error: "El ingreso no tiene el XML de su factura" }, { status: 400 })

    const { data: ya } = await admin.from("complementos_pago").select("numero").eq("ingreso_id", ingresoId).maybeSingle()
    if (ya) return NextResponse.json({ error: `Este pago ya tiene complemento (${ya.numero || "emitido"})` }, { status: 400 })

    // Datos de la factura PPD desde su XML
    const { data: file, error: dlErr } = await admin.storage.from("facturas").download(ing.factura_xml_path)
    if (dlErr || !file) return NextResponse.json({ error: "No se pudo leer el XML de la factura" }, { status: 500 })
    const cfdi = parseCfdiResumen(await file.text())
    const facturaUuid = (ing.factura_uuid || "").toUpperCase()
    if (cfdi.metodoPago !== "PPD") {
      return NextResponse.json({ error: "La factura es PUE (pagada en una exhibición); no lleva complemento de pago" }, { status: 400 })
    }
    if (!facturaUuid || cfdi.total == null) return NextResponse.json({ error: "No se pudo leer el folio fiscal o el total de la factura" }, { status: 400 })

    // Receptor: el ligado al ingreso o, si no, el del RFC de la factura
    let receptor: any = null
    if (ing.receptor_fiscal_id) {
      receptor = (await admin.from("receptores_fiscales").select("*").eq("id", ing.receptor_fiscal_id).maybeSingle()).data
    }
    if (!receptor && cfdi.receptor.rfc) {
      receptor = (await admin.from("receptores_fiscales").select("*").eq("rfc", cfdi.receptor.rfc).maybeSingle()).data
    }
    if (!receptor) {
      return NextResponse.json({
        error: `Faltan los datos fiscales de ${cfdi.receptor.nombre || cfdi.receptor.rfc}. Captúralos en 🧾 Datos fiscales y vuelve a intentarlo.`,
      }, { status: 400 })
    }

    // Parcialidad y saldo con los complementos previos de esta factura
    const { data: previos } = await admin.from("complementos_pago").select("monto").eq("factura_uuid", facturaUuid)
    const pagadoAntes = (previos || []).reduce((s, p: any) => s + Number(p.monto), 0)
    const parcialidad = (previos?.length || 0) + 1
    const saldoAnterior = Math.round((cfdi.total - pagadoAntes) * 100) / 100
    const monto = Math.round((Number(ing.subtotal) + Number(ing.iva)) * 100) / 100
    if (!(monto > 0)) return NextResponse.json({ error: "El pago no tiene importe" }, { status: 400 })
    if (monto > saldoAnterior + 0.05) {
      return NextResponse.json({
        error: `El pago (${monto.toFixed(2)}) es mayor al saldo pendiente de la factura (${saldoAnterior.toFixed(2)})`,
      }, { status: 400 })
    }
    const ratio = cfdi.subtotal ? cfdi.total / cfdi.subtotal : 1.16
    const ivaTasa = Math.abs(ratio - 1) < 0.005 ? 0 : 0.16

    const comp = await crearComplementoPago(ing.empresa, {
      receptor: { rfc: receptor.rfc, razon_social: receptor.razon_social, regimen_fiscal: receptor.regimen_fiscal, cp: receptor.cp, email: receptor.email },
      formaPago: forma,
      fecha: String(ing.fecha_pago).slice(0, 10),
      factura: { uuid: facturaUuid, serie: cfdi.serie, folio: cfdi.folio, moneda: cfdi.moneda || "MXN" },
      monto: Math.min(monto, saldoAnterior),
      parcialidad,
      saldoAnterior,
      ivaTasa,
    })
    const numero = `${comp.series || ""}${comp.folio_number ?? ""}`

    // Registrar en cuanto se timbra (aunque falle la descarga) para no duplicar
    const { data: fila, error: insErr } = await admin.from("complementos_pago").insert({
      ingreso_id: ingresoId, factura_uuid: facturaUuid, facturapi_id: comp.id, uuid: comp.uuid || null, numero,
      monto: Math.min(monto, saldoAnterior), parcialidad, saldo_anterior: saldoAnterior,
      fecha_pago: String(ing.fecha_pago).slice(0, 10), forma_pago: forma,
    }).select("id").single()
    if (insErr) throw new Error(`El complemento ${numero} se timbró pero no se pudo registrar: ${insErr.message}`)

    try {
      const [xml, pdf] = await Promise.all([
        descargarFactura(ing.empresa, comp.id, "xml"),
        descargarFactura(ing.empresa, comp.id, "pdf"),
      ])
      const folder = `ingresos/complementos/${numero.replace(/[^a-zA-Z0-9._-]/g, "_") || comp.id}`
      const stamp = Date.now()
      const x = await admin.storage.from("facturas").upload(`${folder}/${stamp}-${numero}.xml`, xml, { contentType: "text/xml" })
      const p = await admin.storage.from("facturas").upload(`${folder}/${stamp}-${numero}.pdf`, pdf, { contentType: "application/pdf" })
      await admin.from("complementos_pago").update({ xml_path: x.data?.path ?? null, pdf_path: p.data?.path ?? null }).eq("id", fila.id)
    } catch (e: any) {
      console.error("[complemento-pago] archivos:", e.message)
    }

    return NextResponse.json({
      ok: true, numero, parcialidad, saldoAnterior, monto: Math.min(monto, saldoAnterior),
      saldoInsoluto: Math.round((saldoAnterior - Math.min(monto, saldoAnterior)) * 100) / 100,
      pruebas: esModoPruebas(ing.empresa),
    })
  } catch (err: any) {
    console.error("[ingresos/complemento-pago] error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
