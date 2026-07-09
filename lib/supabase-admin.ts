import { createClient } from "@supabase/supabase-js"

// actorId: cuando se pasa, se envía el header X-Actor-Id en cada petición.
// El trigger de auditoría (activity_log) lo lee para atribuir el movimiento al
// usuario real aunque la operación use service-role (que de otro modo saldría
// como "Sistema" porque no hay auth.uid()).
export function createAdminClient(actorId?: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    const missing = [
      !supabaseUrl && "NEXT_PUBLIC_SUPABASE_URL",
      !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
    ].filter(Boolean).join(", ")
    throw new Error(`Missing env vars: ${missing}`)
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    ...(actorId ? { global: { headers: { "x-actor-id": actorId } } } : {}),
  })
}
