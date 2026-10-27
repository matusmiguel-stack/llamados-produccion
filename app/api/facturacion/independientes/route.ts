import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiRole } from "../../../../lib/api-auth"
import { cancelarFactura } from "../../../../lib/facturapi"
import { guardarArchivosIndependiente } from "../../../../lib/facturas-independientes"

// POST JSON → acciones sobre una factura independiente:
//   { action: "archivo", id, tipo: "pdf" | "xml" } → link firmado (si el
//     archivo no se guardó al timbrar, se baja de Facturapi en ese momento)
//   { action: "cancelar", id, motivo: "02" | "03" } → cancela ante el SAT
export async function POST(req: Request) {
  try {
    const user = await verifyApiRole(req, ["admin", "finanzas"])
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const admin = createAdminClient(user.id)

    const { action, id, tipo, motivo } = await req.json()
    const { data: f } = await admin.from("facturas_independientes")
      .select("id, empresa, facturapi_id, numero, estatus, xml_path, pdf_path").eq("id", String(id || "")).single()
    if (!f) return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })

    if (action === "archivo") {
      let path = tipo === "xml" ? f.xml_path : f.pdf_path
      if (!path) {
        const rutas = await guardarArchivosIndependiente(admin, f)
        path = tipo === "xml" ? rutas.xml_path : rutas.pdf_path
      }
      const { data, error } = await admin.storage.from("facturas").createSignedUrl(path, 60 * 10)
      if (error) throw new Error(error.message)
      return NextResponse.json({ url: data.signedUrl })
    }

    if (action === "cancelar") {
      if (!["02", "03"].includes(motivo)) return NextResponse.json({ error: "Motivo de cancelación no válido" }, { status: 400 })
      if (f.estatus === "cancelada") return NextResponse.json({ error: "Esta factura ya está cancelada" }, { status: 400 })
      const r = await cancelarFactura(f.empresa, f.facturapi_id, motivo)
      if (r.status !== "canceled") {
        return NextResponse.json({
          ok: true, pendiente: true,
          mensaje: "El SAT pidió que el receptor acepte la cancelación. Queda en proceso; vuelve a intentarlo cuando la acepte.",
        })
      }
      const { error } = await admin.from("facturas_independientes")
        .update({ estatus: "cancelada", cancelada_at: new Date().toISOString() }).eq("id", f.id)
      if (error) throw new Error(`La factura se canceló en el SAT, pero no se pudo marcar en la app: ${error.message}`)
      return NextResponse.json({ ok: true, cancelada: f.numero })
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 })
  } catch (err: any) {
    console.error("[facturacion/independientes] error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
