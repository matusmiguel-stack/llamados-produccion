import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiRole } from "../../../../lib/api-auth"
import { cancelarFactura } from "../../../../lib/facturapi"

// POST JSON { ingresoId, motivo } → cancela ante el SAT la factura timbrada
// desde la app y regresa el ingreso a "En producción" sin datos de factura.
// Si el SAT pide la aceptación del cliente, la cancelación queda en proceso y
// el ingreso no se toca hasta que se confirme (se puede volver a intentar).
export async function POST(req: Request) {
  try {
    const user = await verifyApiRole(req, ["admin", "finanzas"])
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const admin = createAdminClient(user.id)

    const { ingresoId, motivo } = await req.json()
    if (!["02", "03"].includes(motivo)) return NextResponse.json({ error: "Motivo de cancelación no válido" }, { status: 400 })

    const { data: ingreso } = await admin
      .from("ingresos").select("id, empresa, estatus, facturapi_id, numero_factura").eq("id", ingresoId).single()
    if (!ingreso?.facturapi_id) {
      return NextResponse.json({ error: "Esta factura no se timbró desde la app; cancélala donde se emitió" }, { status: 400 })
    }
    if (ingreso.estatus === "pagado") {
      return NextResponse.json({ error: "El ingreso ya está pagado; no se puede cancelar su factura desde aquí" }, { status: 400 })
    }

    const r = await cancelarFactura(ingreso.empresa, ingreso.facturapi_id, motivo)
    if (r.status !== "canceled") {
      return NextResponse.json({
        ok: true, pendiente: true,
        mensaje: "El SAT pidió que el cliente acepte la cancelación. Queda en proceso; vuelve a intentarlo cuando la acepte.",
      })
    }

    const { error } = await admin.from("ingresos").update({
      estatus: "en_produccion",
      numero_factura: null,
      factura_uuid: null,
      factura_xml_path: null,
      factura_pdf_path: null,
      facturapi_id: null,
      factura_metodo_pago: null,
      updated_at: new Date().toISOString(),
    }).eq("id", ingresoId)
    if (error) throw new Error(`La factura se canceló en el SAT, pero no se pudo actualizar el ingreso: ${error.message}`)

    return NextResponse.json({ ok: true, cancelada: ingreso.numero_factura })
  } catch (err: any) {
    console.error("[ingresos/cancelar-factura] error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
