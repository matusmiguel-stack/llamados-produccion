import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiRole } from "../../../../lib/api-auth"
import { INGRESO_FACTURA_COLS, registrarFacturaIngreso } from "../../../../lib/ingresos-factura"
import { crearFactura, descargarFactura, enviarFacturaPorCorreo, esModoPruebas } from "../../../../lib/facturapi"

const EMPRESAS = ["retro_studio", "retro_films"]
const r2 = (n: number) => Math.round(n * 100) / 100

// POST JSON → factura "desde cero": crea la línea en el control de ingresos
// (manual, sin proyecto), timbra el CFDI con varios conceptos y lo registra
// igual que una factura timbrada desde un ingreso.
export async function POST(req: Request) {
  try {
    const user = await verifyApiRole(req, ["admin", "finanzas"])
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const admin = createAdminClient(user.id)

    const b = await req.json()
    const empresa = String(b.empresa || "")
    const receptorId = String(b.receptorId || "")
    const clienteAgencia = String(b.clienteAgencia || "").trim()
    const proyecto = String(b.proyecto || "").trim()
    const responsable = String(b.responsable || "").trim() || null
    const mesCierre = String(b.mesCierre || "").trim() || null
    const uso = String(b.uso || "G03")
    const metodoPago = b.metodoPago === "PPD" ? "PPD" : "PUE"
    const formaPago = String(b.formaPago || "03")
    const ivaTasa = Number(b.ivaTasa) === 0 ? 0 : 0.16
    const email = String(b.email || "").trim()
    const conceptos = (Array.isArray(b.conceptos) ? b.conceptos : []).map((c: any) => ({
      descripcion: String(c?.descripcion || "").trim(),
      clave_prod_serv: String(c?.claveProdServ || "").trim(),
      clave_unidad: String(c?.claveUnidad || "").trim().toUpperCase(),
      precio: r2(Number(c?.subtotal)),
    }))

    if (!EMPRESAS.includes(empresa)) return NextResponse.json({ error: "Elige si factura Retro Studio o Retro Films" }, { status: 400 })
    if (!receptorId) return NextResponse.json({ error: "Elige a quién se le factura" }, { status: 400 })
    if (!clienteAgencia || !proyecto) return NextResponse.json({ error: "Escribe el cliente y el nombre con que aparece en Ingresos" }, { status: 400 })
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

    const subtotal = r2(conceptos.reduce((s: number, c: { precio: number }) => s + c.precio, 0))
    const ivaEstimado = r2(conceptos.reduce((s: number, c: { precio: number }) => s + r2(c.precio * ivaTasa), 0))

    // La línea del ingreso va primero: si después algo falla, el facturapi_id
    // queda guardado en ella y "✓ Facturar → Timbrar" la recupera sin duplicar.
    const { data: ingreso, error: insErr } = await admin.from("ingresos").insert({
      empresa,
      cliente_agencia: clienteAgencia,
      proyecto,
      responsable,
      mes_cierre: mesCierre,
      subtotal,
      iva: ivaEstimado,
      estatus: "en_produccion",
      receptor_fiscal_id: receptor.id,
      updated_at: new Date().toISOString(),
    }).select(INGRESO_FACTURA_COLS).single()
    if (insErr || !ingreso) return NextResponse.json({ error: `No se pudo crear el ingreso: ${insErr?.message}` }, { status: 500 })

    let factura
    try {
      factura = await crearFactura(empresa, {
        receptor: { rfc: receptor.rfc, razon_social: receptor.razon_social, regimen_fiscal: receptor.regimen_fiscal, cp: receptor.cp, email: receptor.email },
        conceptos,
        ivaTasa,
        uso,
        formaPago,
        metodoPago,
        serie: emisor?.serie || null,
      })
    } catch (e: any) {
      // No se timbró nada: se quita la línea para no dejar un ingreso huérfano
      await admin.from("ingresos").delete().eq("id", ingreso.id)
      throw e
    }

    try {
      await admin.from("ingresos").update({ facturapi_id: factura.id }).eq("id", ingreso.id)
      const [xml, pdf] = await Promise.all([
        descargarFactura(empresa, factura.id, "xml"),
        descargarFactura(empresa, factura.id, "pdf"),
      ])
      const numeroFactura = `${factura.series || ""}${factura.folio_number ?? ""}` || factura.uuid.slice(0, 8)
      // El IVA real es el que calculó el PAC (puede variar por centavos)
      const iva = Number.isFinite(factura.total) ? r2(factura.total - subtotal) : ivaEstimado
      await registrarFacturaIngreso(admin, ingreso as any, {
        xml, pdf,
        xmlName: `${numeroFactura}.xml`,
        pdfName: `${numeroFactura}.pdf`,
        numeroFactura,
        uuidFiscal: factura.uuid || null,
        parcial: null,
        label: proyecto,
        extra: { facturapi_id: factura.id, factura_metodo_pago: metodoPago, iva },
      })

      await admin.from("receptores_fiscales").update({
        ultima_forma_pago: metodoPago === "PPD" ? receptor.ultima_forma_pago : formaPago,
        ultimo_metodo_pago: metodoPago,
        uso_cfdi: uso,
        updated_at: new Date().toISOString(),
      }).eq("id", receptor.id)

      let correo: string | null = null
      if (email) {
        try {
          await enviarFacturaPorCorreo(empresa, factura.id, email)
          correo = email
        } catch (e: any) {
          console.error("[facturacion/nueva] correo:", e.message)
        }
      }

      return NextResponse.json({
        ok: true, numeroFactura, uuid: factura.uuid, total: factura.total, remanente: null,
        correo, correoFallo: !!email && !correo, pruebas: esModoPruebas(empresa),
      })
    } catch (e: any) {
      throw new Error(`La factura SÍ se timbró, pero no se terminó de guardar (${e.message}). Quedó la línea "${proyecto}" en Ingresos: dale ✓ Facturar → Timbrar en la app y la recupera sin timbrar otra.`)
    }
  } catch (err: any) {
    console.error("[facturacion/nueva] error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
