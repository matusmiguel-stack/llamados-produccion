import { supabase } from "./supabase"

// El portal de facturas identifica al proveedor por su correo, así que cada
// correo debe estar en UN solo registro. Con dos registros iguales el portal
// no sabe quién factura y el proveedor se queda sin poder subir su factura
// (le pasó a Flor Locutores el 5-nov-2026).

type ProveedorNombre = { nombre?: string | null; apellido?: string | null; empresa?: string | null }

export function etiquetaProveedor(p: ProveedorNombre): string {
  const persona = `${p.nombre ?? ""} ${p.apellido ?? ""}`.trim()
  if (!p.empresa) return persona
  return persona ? `${p.empresa} (${persona})` : p.empresa
}

// Devuelve la etiqueta del OTRO registro que ya usa ese correo, o null si está libre.
export async function proveedorConMismoCorreo(email: string, excluirId?: string): Promise<string | null> {
  const correo = email.trim().toLowerCase()
  if (!correo) return null
  const { data, error } = await supabase
    .from("proveedores")
    .select("id, nombre, apellido, empresa, email")
    .ilike("email", correo)
  if (error) throw error
  // ilike trata "_" y "%" como comodines: aquí se confirma el correo exacto.
  const otro = (data || []).find(
    (p) => p.id !== excluirId && (p.email || "").trim().toLowerCase() === correo
  )
  return otro ? etiquetaProveedor(otro) : null
}

// Avisa y devuelve true si el correo ya está en otro proveedor (o si no se
// pudo verificar: mejor no guardar que dejar pasar un duplicado).
export async function correoDeProveedorOcupado(email: string, excluirId?: string): Promise<boolean> {
  try {
    const otro = await proveedorConMismoCorreo(email, excluirId)
    if (!otro) return false
    alert(
      `El correo ${email.trim().toLowerCase()} ya está registrado en “${otro}”.\n\n` +
        "Cada proveedor debe tener su propio correo: el portal de facturas identifica al proveedor por email " +
        "y con dos registros iguales no podría subir sus facturas."
    )
    return true
  } catch (err) {
    alert("No se pudo verificar si el correo ya existe en otro proveedor: " + (err instanceof Error ? err.message : String(err)))
    return true
  }
}
