import { createClient } from "@supabase/supabase-js"

/**
 * Verifica el token Bearer de Supabase en una API route.
 * Devuelve el usuario autenticado o null si el token falta o es inválido.
 */
export async function verifyApiUser(req: Request) {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return null

  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) return null
  return user
}
