// Sube el comprobante de pago del banco DIRECTO a Supabase Storage con una
// URL firmada, sin pasar por Vercel (que corta requests > 4.5 MB y produce
// "Failed to fetch"). Devuelve la ruta en el bucket para vincularla a la
// factura. Uso: en cualquier flujo que marque un pago.
import { supabase } from "./supabase"

const TIPOS_VALIDOS = ["application/pdf", "image/jpeg", "image/jpg", "image/png"]
const MAX_MB = 25

export async function uploadComprobante(file: File, folder: string | null): Promise<string> {
  if (!TIPOS_VALIDOS.includes(file.type)) {
    throw new Error("El comprobante debe ser PDF, JPG o PNG")
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    throw new Error(`El comprobante pesa más de ${MAX_MB} MB; comprímelo e intenta de nuevo`)
  }

  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch("/api/comprobantes/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify({ fileName: file.name, contentType: file.type, folder }),
  })
  const data = await res.json()
  if (!res.ok || data.error) {
    throw new Error(data.error || "No se pudo preparar la subida del comprobante")
  }

  const up = await supabase.storage
    .from("facturas")
    .uploadToSignedUrl(data.path, data.token, file, { contentType: file.type })
  if (up.error) {
    throw new Error(`No se pudo subir el comprobante: ${up.error.message}`)
  }
  return data.path
}
