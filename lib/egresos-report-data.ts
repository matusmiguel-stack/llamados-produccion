import { supabase } from "./supabase"
import { employeeDisplayName } from "./employee-dates"
import { exportEgresosReport } from "./exportEgresosReport"
import { exportEgresosReportXlsx } from "./exportEgresosReportXlsx"

type ProjectMeta = {
  projectName: string
  projectCode: string | null
  empresa: "retro_studio" | "retro_films" | null
  responsable: string | null
  formato?: "pdf" | "xlsx"
}

// Reúne todos los egresos y genera el reporte PDF del proyecto
export async function generateEgresosReport(projectId: string, meta: ProjectMeta): Promise<void> {
  const [{ data: provs }, { data: emps }, { data: ingreso }, { data: facturas }] = await Promise.all([
    supabase.from("proveedores").select("id,nombre,apellido,empresa").order("nombre"),
    supabase.from("employees").select("id,nombre,apellido_paterno,apellido_materno,nickname").order("nombre"),
    supabase.from("ingresos").select("subtotal,cliente_agencia").eq("project_id", projectId).limit(1).maybeSingle(),
    supabase.from("facturas").select("proveedor_id,quote_item_id,subtotal,status,origen,fecha_pago,paid_at,concepto").eq("project_id", projectId),
  ])

  const { data: quotes } = await supabase
    .from("quotes").select("id").eq("project_id", projectId).eq("released", true)

  type Item = {
    id: string; seccion: string; concepto: string; proveedor: string; monto: number
    pagado: boolean; tipoPago: "proveedor" | "anticipo" | "comprobacion" | "reembolso"
    proveedorId: string | null
  }
  const items: Item[] = []

  for (const quote of quotes || []) {
    const { data: sections } = await supabase
      .from("quote_sections").select("id,name").eq("quote_id", quote.id).order("order_index")
    for (const section of sections || []) {
      const { data: raw } = await supabase
        .from("quote_items")
        .select("id,description,qty,days,unit_price,actual_qty,actual_days,actual_unit_price,actual_supplier_id,actual_employee_id,pago_estado,pago_modo")
        .eq("section_id", section.id).order("order_index")
      for (const row of (raw as any[]) || []) {
        const hasReal = row.actual_qty != null || row.actual_days != null || row.actual_unit_price != null
        if (!hasReal) continue
        const q = row.actual_qty        != null ? row.actual_qty        : Math.max(row.qty  || 0, 1)
        const d = row.actual_days       != null ? row.actual_days       : Math.max(row.days || 0, 1)
        const p = row.actual_unit_price != null ? row.actual_unit_price : row.unit_price
        const monto = q * d * p
        if (monto === 0) continue

        let proveedor = "Sin asignar"
        if (row.actual_supplier_id) {
          const prov = (provs || []).find((x: any) => x.id === row.actual_supplier_id)
          if (prov) proveedor = prov.empresa ? `${prov.empresa} — ${prov.nombre} ${prov.apellido}` : `${prov.nombre} ${prov.apellido}`
        } else if (row.actual_employee_id) {
          const emp = (emps || []).find((x: any) => x.id === row.actual_employee_id)
          if (emp) proveedor = employeeDisplayName(emp)
        }

        const esReembolso = typeof row.description === "string" && row.description.startsWith("Reembolso")
        const tipoPago: Item["tipoPago"] =
          row.pago_modo === "anticipo" ? "anticipo" :
          row.pago_modo === "comprobacion" ? "comprobacion" :
          esReembolso ? "reembolso" : "proveedor"

        items.push({
          id: row.id,
          seccion: section.name,
          concepto: row.description,
          proveedor,
          monto: Math.round(monto * 100) / 100,
          pagado: row.pago_estado === "pagado",
          tipoPago,
          proveedorId: row.actual_supplier_id,
        })
      }
    }
  }

  // El responsable se guarda como nombre completo; mostrar su nickname.
  const nickOf = (full: string | null): string | null => {
    if (!full) return full
    const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    const t = norm(full)
    const m = (emps as any[] || []).find((e) => {
      const f3 = norm([e.nombre, e.apellido_paterno, e.apellido_materno].filter(Boolean).join(" "))
      const f2 = norm([e.nombre, e.apellido_paterno].filter(Boolean).join(" "))
      return f3 === t || f2 === t
    })
    return m?.nickname?.trim() || full
  }

  const reportData = {
    projectName: meta.projectName,
    projectCode: meta.projectCode,
    empresa: meta.empresa,
    cliente: (ingreso as any)?.cliente_agencia || "",
    responsable: nickOf(meta.responsable),
    cobrado: Number(ingreso?.subtotal || 0),
    items,
    facturas: (facturas as any[]) || [],
  }

  if (meta.formato === "xlsx") {
    await exportEgresosReportXlsx(reportData)
  } else {
    await exportEgresosReport(reportData)
  }
}
