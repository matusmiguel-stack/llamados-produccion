// Sube el comprobante de pago del banco y devuelve su ruta en Storage.
//
// Archivos chicos (≤ 4 MB, la mayoría): pasan por la API del servidor, que los
// sube con el cliente admin. Es la ruta confiable — el navegador nunca habla
// directo con Storage (algunas redes bloquean ese dominio/ruta y dan
// "Failed to fetch").
//
// Archivos grandes (> 4 MB): Vercel corta requests > 4.5 MB, así que esos van
// directo del navegador a Storage con URL firmada.
import { supabase } from "./supabase"

const TIPOS_VALIDOS = ["application/pdf", "image/jpeg", "image/jpg", "image/png"]
const MAX_MB = 25
// Margen seguro bajo el límite de ~4.5 MB de Vercel.
const API_LIMIT = 4 * 1024 * 1024

/**
 * `fetch` lanza un TypeError cuando la petición no llega a salir del equipo.
 * El navegador solo dice "Failed to fetch", que no le sirve a nadie: este
 * mensaje explica en qué paso murió y qué probar.
 */
export function mensajeDeRed(paso: string): string {
  return (
    `${paso}: la petición no salió de tu equipo.\n\n` +
    `Casi siempre es una de estas tres:\n` +
    `• El archivo está en iCloud o en una unidad de red y no está descargado. ` +
    `Guárdalo en el Escritorio y vuelve a intentar.\n` +
    `• Una extensión del navegador está bloqueando la subida. Prueba en una ventana privada.\n` +
    `• Tu red, VPN o antivirus bloquea el envío de archivos. Prueba con otra red ` +
    `(por ejemplo, el celular como hotspot).`
  )
}

/** Envuelve fetch para distinguir "no salió de tu equipo" de un error del servidor. */
async function fetchOFallaDeRed(url: string, init: RequestInit, paso: string): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch {
    throw new Error(mensajeDeRed(paso))
  }
}

export async function uploadComprobante(file: File, folder: string | null): Promise<string> {
  if (!TIPOS_VALIDOS.includes(file.type)) {
    throw new Error("El comprobante debe ser PDF, JPG o PNG")
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    throw new Error(`El comprobante pesa más de ${MAX_MB} MB; comprímelo e intenta de nuevo`)
  }

  const { data: { session } } = await supabase.auth.getSession()

  // Ruta principal (archivos chicos): subida server-side por la API.
  if (file.size <= API_LIMIT) {
    const fd = new FormData()
    fd.append("file", file)
    if (folder) fd.append("folder", folder)
    const res = await fetchOFallaDeRed("/api/comprobantes/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: fd,
    }, "No se pudo subir el comprobante")
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.error) {
      throw new Error(data.error || `No se pudo subir el comprobante (error ${res.status})`)
    }
    return data.path
  }

  // Ruta de respaldo (archivos grandes): directo a Storage con URL firmada.
  const res = await fetchOFallaDeRed("/api/comprobantes/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ fileName: file.name, contentType: file.type, folder }),
  }, "No se pudo preparar la subida del comprobante")
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) {
    throw new Error(data.error || `No se pudo preparar la subida del comprobante (error ${res.status})`)
  }
  const up = await supabase.storage
    .from("facturas")
    .uploadToSignedUrl(data.path, data.token, file, { contentType: file.type })
  if (up.error) {
    // supabase-js devuelve el fallo de red como error, no como excepción
    if (/failed to fetch|network|load failed/i.test(up.error.message)) {
      throw new Error(mensajeDeRed("No se pudo subir el comprobante"))
    }
    throw new Error(`No se pudo subir el comprobante: ${up.error.message}`)
  }
  return data.path
}
