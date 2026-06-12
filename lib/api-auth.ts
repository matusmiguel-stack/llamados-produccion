import { createClient } from "@supabase/supabase-js"

/**
 * Verifica el token Bearer de Supabase en una API route.
 * Devuelve el usuario autenticado o null si el token falta o es inválido.
 */
export async function verifyApiUser(req: Request) {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return null

  const token = authHeader.replace(/^Bearer\s+/i, "").trim()
  if (!token || token === "undefined" || token === "null") return null

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  // Pasar el token explícito: funciona en cualquier versión de supabase-js
  // y no depende de session storage (que no existe en el servidor)
  const { data: { user }, error } = await userClient.auth.getUser(token)
  if (error || !user) return null
  return user
}

/**
 * Verifica token + que el rol del usuario esté en la lista permitida.
 * Devuelve el usuario o null.
 */
export async function verifyApiRole(req: Request, allowedRoles: string[]) {
  const user = await verifyApiUser(req)
  if (!user) return null

  const { createAdminClient } = await import("./supabase-admin")
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (!profile || !allowedRoles.includes(profile.role)) return null
  return user
}
