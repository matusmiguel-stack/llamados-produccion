import { NextResponse } from "next/server"
import { createAdminClient } from "../../../../lib/supabase-admin"
import { verifyApiRole } from "../../../../lib/api-auth"
import { parseCfdiResumen, type CfdiResumen } from "../../../../lib/cfdi"

// Llena los datos fiscales leyendo los XML de las facturas que ya se subieron
// a Ingresos (las que venían de Orderly):
//  - receptores_fiscales: uno por RFC, con los datos de su factura más reciente.
//    Los que ya existen NO se tocan (pudieron corregirse a mano).
//  - emisores_fiscales: RFC/razón social/régimen/CP de Retro Studio y Films, y
//    la serie, clave SAT y unidad más usadas, solo donde estén vacíos.
//  - ingresos.receptor_fiscal_id para los ingresos de esas facturas.
export async function POST(req: Request) {
  try {
    const user = await verifyApiRole(req, ["admin", "finanzas"])
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const admin = createAdminClient(user.id)

    const { data: ingresos, error } = await admin
      .from("ingresos")
      .select("id, empresa, factura_xml_path, receptor_fiscal_id, project_id, projects:project_id(client_id)")
      .not("factura_xml_path", "is", null)
    if (error) throw new Error(error.message)

    type Leido = { ingresoId: string; empresa: string; clientId: string | null; cfdi: CfdiResumen }
    const leidos: Leido[] = []
    let fallidos = 0
    for (const ing of ingresos || []) {
      const { data: file, error: dlErr } = await admin.storage.from("facturas").download(ing.factura_xml_path!)
      if (dlErr || !file) { fallidos++; continue }
      const cfdi = parseCfdiResumen(await file.text())
      if (!cfdi.receptor.rfc) { fallidos++; continue }
      leidos.push({ ingresoId: ing.id, empresa: ing.empresa, clientId: (ing as any).projects?.client_id ?? null, cfdi })
    }

    // ── Receptores: el más reciente por RFC ─────────────────────────────────
    const porRfc = new Map<string, Leido>()
    for (const l of leidos) {
      const prev = porRfc.get(l.cfdi.receptor.rfc!)
      if (!prev || (l.cfdi.fecha || "") > (prev.cfdi.fecha || "")) porRfc.set(l.cfdi.receptor.rfc!, l)
    }
    const { data: existentes } = await admin.from("receptores_fiscales").select("id, rfc")
    const idPorRfc = new Map((existentes || []).map((r: any) => [r.rfc, r.id as string]))
    let nuevos = 0
    const incompletos: string[] = []
    for (const [rfc, l] of porRfc) {
      if (idPorRfc.has(rfc)) continue
      const r = l.cfdi.receptor
      // CFDI 3.3 no traía régimen ni CP del receptor: esos quedan para captura
      if (!r.nombre || !r.regimen || !r.cp) { incompletos.push(`${r.nombre || rfc} (${rfc})`); continue }
      const { data: ins, error: insErr } = await admin.from("receptores_fiscales").insert({
        rfc, razon_social: r.nombre, regimen_fiscal: r.regimen, cp: r.cp,
        uso_cfdi: r.uso || "G03",
        client_id: l.clientId,
        ultima_forma_pago: l.cfdi.formaPago,
        ultimo_metodo_pago: l.cfdi.metodoPago,
      }).select("id").single()
      if (insErr) throw new Error(insErr.message)
      idPorRfc.set(rfc, ins.id)
      nuevos++
    }

    // Vincular cada ingreso con su receptor
    for (const l of leidos) {
      const rid = idPorRfc.get(l.cfdi.receptor.rfc!)
      if (rid) await admin.from("ingresos").update({ receptor_fiscal_id: rid }).eq("id", l.ingresoId).is("receptor_fiscal_id", null)
    }

    // ── Emisores: datos y valores más usados por empresa ────────────────────
    const masUsado = (vals: (string | null)[]) => {
      const c = new Map<string, number>()
      for (const v of vals) if (v) c.set(v, (c.get(v) || 0) + 1)
      return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    }
    const { data: emisores } = await admin.from("emisores_fiscales").select("*")
    const emisoresRes: Record<string, unknown> = {}
    for (const em of emisores || []) {
      const suyos = leidos.filter(l => l.empresa === em.empresa)
      if (!suyos.length) continue
      const ultimo = [...suyos].sort((a, b) => (b.cfdi.fecha || "").localeCompare(a.cfdi.fecha || ""))[0].cfdi
      const valores = {
        rfc: ultimo.emisor.rfc,
        razon_social: ultimo.emisor.nombre,
        regimen_fiscal: ultimo.emisor.regimen,
        cp: ultimo.lugarExpedicion,
        serie: masUsado(suyos.map(l => l.cfdi.serie)),
        clave_prod_serv: masUsado(suyos.map(l => l.cfdi.concepto.claveProdServ)),
        clave_unidad: masUsado(suyos.map(l => l.cfdi.concepto.claveUnidad)),
      }
      const cambios: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(valores)) if (v && !em[k]) cambios[k] = v
      if (Object.keys(cambios).length) {
        await admin.from("emisores_fiscales").update({ ...cambios, updated_at: new Date().toISOString() }).eq("empresa", em.empresa)
      }
      emisoresRes[em.empresa] = { ...valores, facturas: suyos.length }
    }

    return NextResponse.json({
      ok: true,
      facturasLeidas: leidos.length,
      fallidos,
      receptoresNuevos: nuevos,
      receptoresTotal: idPorRfc.size,
      incompletos,
      emisores: emisoresRes,
    })
  } catch (err: any) {
    console.error("[facturacion/importar] error:", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
