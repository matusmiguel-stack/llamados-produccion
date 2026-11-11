import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiRole } from "../../../../lib/api-auth"
import { parseCfdiResumen } from "../../../../lib/cfdi"
import { cancelarFactura, esModoPruebas } from "../../../../lib/facturapi"
import {
  ComplementoError, cargarFacturaPPD, emitirComplementoPago, guardarArchivosComplemento, saldoFactura,
} from "../../../../lib/complementos-pago"

// POST JSON → complementos de pago "a mano" (además del automático que sale al
// marcar pagado un ingreso):
//   { action: "sincronizar" } → anota PUE/PPD en los ingresos cuyo XML se subió
//     sin leerlo (facturas de Orderly), para que sus complementos aparezcan
//   { action: "detalle", facturaUuid } → total, lo ya pagado, saldo y parcialidad
//   { action: "emitir", facturaUuid, fecha, monto, formaPago } → timbra el complemento
//   { action: "archivo", id, tipo: "pdf" | "xml" } → link firmado
//   { action: "cancelar", id, motivo: "02" | "03" } → cancela ante el SAT
export async function POST(req: Request) {
  try {
    const user = await verifyApiRole(req, ["admin", "finanzas"])
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const admin = createAdminClient(user.id)

    const b = await req.json()
    const action = String(b.action || "")

    if (action === "sincronizar") {
      return NextResponse.json({ ok: true, actualizados: await sincronizarMetodoPago(admin) })
    }

    if (action === "detalle") {
      const factura = await cargarFacturaPPD(admin, String(b.facturaUuid || ""))
      const s = await saldoFactura(admin, factura)
      return NextResponse.json({
        factura: {
          uuid: factura.uuid, numero: factura.numero, empresa: factura.empresa, origen: factura.origen,
          fecha: factura.fecha, total: factura.total,
          receptor: { razon_social: factura.receptor.razon_social, rfc: factura.receptor.rfc },
        },
        pagado: s.pagado, saldo: s.saldo, parcialidad: s.parcialidad, complementos: s.complementos,
        pruebas: esModoPruebas(factura.empresa),
      })
    }

    if (action === "emitir") {
      const fecha = String(b.fecha || "")
      const hoy = new Date().toLocaleDateString("sv", { timeZone: "America/Mexico_City" })
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json({ error: "Escribe la fecha en que se recibió el pago" }, { status: 400 })
      if (fecha > hoy) return NextResponse.json({ error: "La fecha del pago no puede ser futura" }, { status: 400 })
      const factura = await cargarFacturaPPD(admin, String(b.facturaUuid || ""))
      const r = await emitirComplementoPago(admin, {
        factura,
        monto: Number(b.monto),
        fecha,
        formaPago: String(b.formaPago || ""),
        ingresoId: null,
        origen: "manual",
        createdBy: user.id,
      })
      return NextResponse.json({ ok: true, ...r, factura: factura.numero, pruebas: esModoPruebas(factura.empresa) })
    }

    if (action === "archivo" || action === "cancelar") {
      const { data: c } = await admin.from("complementos_pago")
        .select("id, empresa, facturapi_id, numero, estatus, xml_path, pdf_path, factura_uuid, parcialidad").eq("id", String(b.id || "")).single()
      if (!c) return NextResponse.json({ error: "Complemento no encontrado" }, { status: 404 })

      if (action === "archivo") {
        let path = b.tipo === "xml" ? c.xml_path : c.pdf_path
        if (!path) {
          const rutas = await guardarArchivosComplemento(admin, c)
          path = b.tipo === "xml" ? rutas.xml_path : rutas.pdf_path
        }
        const { data, error } = await admin.storage.from("facturas").createSignedUrl(path, 60 * 10)
        if (error) throw new Error(error.message)
        return NextResponse.json({ url: data.signedUrl })
      }

      if (!["02", "03"].includes(b.motivo)) return NextResponse.json({ error: "Motivo de cancelación no válido" }, { status: 400 })
      if (c.estatus === "cancelada") return NextResponse.json({ error: "Este complemento ya está cancelado" }, { status: 400 })
      // Cada complemento lleva el saldo que dejó el anterior: se cancelan del
      // más reciente hacia atrás para no romper la cadena de parcialidades.
      const { data: posteriores } = await admin.from("complementos_pago").select("numero")
        .eq("factura_uuid", c.factura_uuid).eq("estatus", "vigente").gt("parcialidad", c.parcialidad)
      if (posteriores?.length) {
        const nums = posteriores.map(p => p.numero || "sin folio").join(", ")
        return NextResponse.json({ error: `Primero cancela los complementos posteriores de la misma factura (${nums})` }, { status: 400 })
      }
      const r = await cancelarFactura(c.empresa, c.facturapi_id, b.motivo)
      if (r.status !== "canceled") {
        return NextResponse.json({
          ok: true, pendiente: true,
          mensaje: "El SAT pidió que el receptor acepte la cancelación. Queda en proceso; vuelve a intentarlo cuando la acepte.",
        })
      }
      const { error } = await admin.from("complementos_pago")
        .update({ estatus: "cancelada", cancelada_at: new Date().toISOString() }).eq("id", c.id)
      if (error) throw new Error(`El complemento se canceló en el SAT, pero no se pudo marcar en la app: ${error.message}`)
      return NextResponse.json({ ok: true, cancelado: c.numero })
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (err instanceof ComplementoError) return NextResponse.json({ error: msg }, { status: 400 })
    console.error("[facturacion/complementos] error:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Facturas de Orderly subidas a Ingresos antes de que la app leyera el método
// de pago del XML: sin él no se sabe si son PPD (y si llevan complemento).
// Solo toca las que tienen XML y método vacío; las que ya lo tienen no cuestan nada.
async function sincronizarMetodoPago(admin: SupabaseClient): Promise<number> {
  const { data: filas, error } = await admin
    .from("ingresos")
    .select("id, factura_xml_path")
    .not("factura_xml_path", "is", null)
    .is("factura_metodo_pago", null)
    .limit(200)
  if (error) throw new Error(error.message)
  let actualizados = 0
  const pendientes = [...(filas || [])]
  while (pendientes.length) {
    const lote = pendientes.splice(0, 8)
    await Promise.all(lote.map(async f => {
      const { data: file } = await admin.storage.from("facturas").download(f.factura_xml_path!)
      if (!file) return
      const metodo = parseCfdiResumen(await file.text()).metodoPago
      if (metodo !== "PUE" && metodo !== "PPD") return
      const { error: upErr } = await admin.from("ingresos").update({ factura_metodo_pago: metodo })
        .eq("id", f.id).is("factura_metodo_pago", null)
      if (!upErr) actualizados++
    }))
  }
  return actualizados
}
