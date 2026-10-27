import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiRole } from "../../../../lib/api-auth"
import { crearFactura, descargarFactura, esModoPruebas } from "../../../../lib/facturapi"
import { enviarFacturaCliente } from "../../../../lib/factura-email"
import { guardarArchivosIndependiente } from "../../../../lib/facturas-independientes"

const EMPRESAS = ["retro_studio", "retro_films"]
const r2 = (n: number) => Math.round(n * 100) / 100

// POST JSON → factura "desde cero" con varios conceptos. NO toca el control de
// ingresos (suelen ser préstamos entre Retro Studio y Retro Films): se guarda
// en facturas_independientes.
export async function POST(req: Request) {
  try {
    const user = await verifyApiRole(req, ["admin", "finanzas"])
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const admin = createAdminClient(user.id)

    const b = await req.json()
    const empresa = String(b.empresa || "")
    const receptorId = String(b.receptorId || "")
    const uso = String(b.uso || "G03")
    const formaPago = String(b.formaPago || "03")
    const ivaTasa = Number(b.ivaTasa) === 0 ? 0 : 0.16
    const notas = String(b.notas || "").trim() || null
    const email = String(b.email || "").trim()
    const conceptos = (Array.isArray(b.conceptos) ? b.conceptos : []).map((c: any) => ({
      descripcion: String(c?.descripcion || "").trim(),
      clave_prod_serv: String(c?.claveProdServ || "").trim(),
      clave_unidad: String(c?.claveUnidad || "").trim().toUpperCase(),
      precio: r2(Number(c?.subtotal)),
    }))

    if (!EMPRESAS.includes(empresa)) return NextResponse.json({ error: "Elige si factura Retro Studio o Retro Films" }, { status: 400 })
    if (!receptorId) return NextResponse.json({ error: "Elige a quién se le factura" }, { status: 400 })
    if (conceptos.length === 0) return NextResponse.json({ error: "Agrega al menos un concepto" }, { status: 400 })
    for (const [i, c] of conceptos.entries()) {
      const n = `Concepto ${i + 1}`
      if (!c.descripcion) return NextResponse.json({ error: `${n}: escribe la descripción` }, { status: 400 })
      if (!/^\d{8}$/.test(c.clave_prod_serv)) return NextResponse.json({ error: `${n}: la clave SAT debe tener 8 dígitos` }, { status: 400 })
      if (!c.clave_unidad) return NextResponse.json({ error: `${n}: falta la clave de unidad` }, { status: 400 })
      if (!Number.isFinite(c.precio) || c.precio <= 0) return NextResponse.json({ error: `${n}: el subtotal debe ser mayor a cero` }, { status: 400 })
    }

    const { data: receptor } = await admin.from("receptores_fiscales").select("*").eq("id", receptorId).single()
    if (!receptor) return NextResponse.json({ error: "No se encontró el cliente a facturar" }, { status: 404 })
    const { data: emisor } = await admin.from("emisores_fiscales").select("serie").eq("empresa", empresa).maybeSingle()

    const factura = await crearFactura(empresa, {
      receptor: { rfc: receptor.rfc, razon_social: receptor.razon_social, regimen_fiscal: receptor.regimen_fiscal, cp: receptor.cp, email: receptor.email },
      conceptos,
      ivaTasa,
      uso,
      formaPago,
      metodoPago: "PUE",
      serie: emisor?.serie || null,
    })
    const numero = `${factura.series || ""}${factura.folio_number ?? ""}` || factura.uuid.slice(0, 8)
    const subtotal = r2(conceptos.reduce((s: number, c: { precio: number }) => s + c.precio, 0))

    // Ya está timbrada: se registra de inmediato para que nunca se pierda. Si
    // fallan los archivos, la lista los vuelve a bajar de Facturapi al abrirlos.
    const { data: fila, error: insErr } = await admin.from("facturas_independientes").insert({
      empresa,
      receptor_fiscal_id: receptor.id,
      receptor_rfc: receptor.rfc,
      receptor_nombre: receptor.razon_social,
      conceptos: conceptos.map((c: any) => ({ descripcion: c.descripcion, clave_prod_serv: c.clave_prod_serv, clave_unidad: c.clave_unidad, subtotal: c.precio })),
      subtotal,
      iva: r2(factura.total - subtotal),
      total: factura.total,
      metodo_pago: "PUE",
      forma_pago: formaPago,
      uso_cfdi: uso,
      notas,
      facturapi_id: factura.id,
      uuid: factura.uuid || null,
      numero,
      created_by: user.id,
    }).select("id").single()
    if (insErr || !fila) {
      throw new Error(`La factura ${numero} SÍ se timbró, pero no se pudo registrar en la app (${insErr?.message}). Búscala en Facturapi; no la vuelvas a timbrar.`)
    }

    let archivos: { xml: Buffer; pdf: Buffer } | null = null
    try {
      archivos = await guardarArchivosIndependiente(admin, { id: fila.id, empresa, facturapi_id: factura.id, numero })
    } catch (e: any) {
      console.error("[facturacion/nueva] archivos:", e.message)
    }

    await admin.from("receptores_fiscales").update({
      ultima_forma_pago: formaPago,
      uso_cfdi: uso,
      updated_at: new Date().toISOString(),
    }).eq("id", receptor.id)

    let correo: string | null = null
    if (email) {
      try {
        if (!archivos) {
          const [xml, pdf] = await Promise.all([descargarFactura(empresa, factura.id, "xml"), descargarFactura(empresa, factura.id, "pdf")])
          archivos = { xml, pdf }
        }
        await enviarFacturaCliente({
          para: email, empresa, numero, receptor: receptor.razon_social,
          total: factura.total, uuid: factura.uuid || null, pdf: archivos.pdf, xml: archivos.xml,
        })
        correo = email
      } catch (e: any) {
        console.error("[facturacion/nueva] correo:", e.message)
      }
    }

    return NextResponse.json({
      ok: true, numeroFactura: numero, total: factura.total,
      correo, correoFallo: !!email && !correo, pruebas: esModoPruebas(empresa),
    })
  } catch (err: any) {
    console.error("[facturacion/nueva] error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
