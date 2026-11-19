import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiRole } from "../../../../lib/api-auth"
import { previewFactura } from "../../../../lib/facturapi"
import { validarDetallista } from "../../../../lib/detallista"
import { validarSustitucion } from "../../../../lib/cfdi-sustitucion"

const EMPRESAS = ["retro_studio", "retro_films"]
const r2 = (n: number) => Math.round(n * 100) / 100

// POST JSON → PDF de vista previa de una factura, SIN timbrar: no se manda al
// SAT, no consume folio y no se guarda nada. Mismos datos que /api/ingresos/timbrar
// y /api/facturacion/nueva, con los conceptos ya armados.
export async function POST(req: Request) {
  try {
    const user = await verifyApiRole(req, ["admin", "finanzas"])
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const admin = createAdminClient(user.id)

    const b = await req.json()
    const empresa = String(b.empresa || "")
    const receptorId = String(b.receptorId || "")
    const metodoPago: "PUE" | "PPD" = b.metodoPago === "PPD" ? "PPD" : "PUE"
    const formaPago = metodoPago === "PPD" ? "99" : String(b.formaPago || "03")
    const conceptos = (Array.isArray(b.conceptos) ? b.conceptos : []).map((c: Record<string, unknown>) => ({
      descripcion: String(c?.descripcion || "").trim(),
      clave_prod_serv: String(c?.claveProdServ || "").trim(),
      clave_unidad: String(c?.claveUnidad || "").trim().toUpperCase(),
      precio: r2(Number(c?.subtotal)),
    }))

    if (!EMPRESAS.includes(empresa)) return NextResponse.json({ error: "Falta la empresa que factura" }, { status: 400 })
    if (!receptorId) return NextResponse.json({ error: "Elige a quién se le factura" }, { status: 400 })
    if (conceptos.length === 0) return NextResponse.json({ error: "Agrega al menos un concepto" }, { status: 400 })
    for (const [i, c] of conceptos.entries()) {
      const n = conceptos.length > 1 ? `Concepto ${i + 1}: ` : ""
      if (!c.descripcion) return NextResponse.json({ error: `${n}escribe la descripción` }, { status: 400 })
      if (!/^\d{8}$/.test(c.clave_prod_serv)) return NextResponse.json({ error: `${n}la clave SAT debe tener 8 dígitos` }, { status: 400 })
      if (!c.clave_unidad) return NextResponse.json({ error: `${n}falta la clave de unidad` }, { status: 400 })
      if (!Number.isFinite(c.precio) || c.precio <= 0) return NextResponse.json({ error: `${n}el subtotal debe ser mayor a cero` }, { status: 400 })
    }

    const { data: receptor } = await admin.from("receptores_fiscales").select("*").eq("id", receptorId).single()
    if (!receptor) return NextResponse.json({ error: "No se encontró el cliente a facturar" }, { status: 404 })
    const { data: emisor } = await admin.from("emisores_fiscales").select("serie").eq("empresa", empresa).maybeSingle()
    const { datos: detallista, error: detallistaErr } = validarDetallista(b.detallista)
    if (detallistaErr) return NextResponse.json({ error: detallistaErr }, { status: 400 })
    const { uuid: sustituyeUuid, error: sustErr } = validarSustitucion(b.sustituyeUuid)
    if (sustErr) return NextResponse.json({ error: sustErr }, { status: 400 })

    const pdf = await previewFactura(empresa, {
      receptor: { rfc: receptor.rfc, razon_social: receptor.razon_social, regimen_fiscal: receptor.regimen_fiscal, cp: receptor.cp, email: receptor.email },
      conceptos,
      ivaTasa: Number(b.ivaTasa) === 0 ? 0 : 0.16,
      uso: String(b.uso || "G03"),
      formaPago,
      metodoPago,
      serie: emisor?.serie || null,
      detallista,
      sustituyeUuid,
    })
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="vista-previa.pdf"`, "Cache-Control": "no-store" },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[facturacion/preview] error:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
