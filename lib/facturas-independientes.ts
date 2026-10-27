import type { SupabaseClient } from "@supabase/supabase-js"
import { descargarFactura } from "./facturapi"

// Baja de Facturapi el XML y el PDF de una factura independiente, los guarda
// en storage y anota las rutas. Devuelve las rutas guardadas.
export async function guardarArchivosIndependiente(
  admin: SupabaseClient,
  f: { id: string; empresa: string; facturapi_id: string; numero: string | null },
): Promise<{ xml_path: string; pdf_path: string }> {
  const [xml, pdf] = await Promise.all([
    descargarFactura(f.empresa, f.facturapi_id, "xml"),
    descargarFactura(f.empresa, f.facturapi_id, "pdf"),
  ])
  const nombre = (f.numero || f.facturapi_id).replace(/[^a-zA-Z0-9._-]/g, "_")
  const folder = `independientes/${f.empresa}/${nombre}-${Date.now()}`
  const xmlUp = await admin.storage.from("facturas").upload(`${folder}/${nombre}.xml`, xml, { contentType: "text/xml" })
  if (xmlUp.error) throw new Error(`No se pudo guardar el XML: ${xmlUp.error.message}`)
  const pdfUp = await admin.storage.from("facturas").upload(`${folder}/${nombre}.pdf`, pdf, { contentType: "application/pdf" })
  if (pdfUp.error) throw new Error(`No se pudo guardar el PDF: ${pdfUp.error.message}`)
  const rutas = { xml_path: xmlUp.data.path, pdf_path: pdfUp.data.path }
  const { error } = await admin.from("facturas_independientes").update(rutas).eq("id", f.id)
  if (error) throw new Error(error.message)
  return rutas
}
