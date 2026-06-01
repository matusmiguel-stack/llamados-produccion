import webpush from "web-push"
import { createAdminClient } from "./supabase-admin"

// Inicialización lazy — solo cuando las vars estén disponibles en runtime
let vapidReady = false
function initVapid() {
  if (vapidReady) return
  const subject = process.env.VAPID_SUBJECT
  const pub     = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv    = process.env.VAPID_PRIVATE_KEY
  if (!subject || !pub || !priv) return  // no-op si faltan vars
  webpush.setVapidDetails(subject, pub, priv)
  vapidReady = true
}

export type PushPayload = {
  title: string
  body: string
  url?: string
}

/**
 * Manda una notificación push a todos los dispositivos suscritos de un usuario.
 * Elimina automáticamente las suscripciones inválidas (expired/gone).
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  initVapid()
  const admin = createAdminClient()
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)

  if (!subs?.length) return

  const sends = subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      )
    } catch (err: any) {
      // 410 Gone / 404 → subscription expirada → borrar
      if (err.statusCode === 410 || err.statusCode === 404) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id)
      }
    }
  })
  await Promise.allSettled(sends)
}

/**
 * Registra en el log que ya se envió esta notificación para evitar duplicados.
 * Devuelve `true` si se insertó (nueva), `false` si ya existía.
 */
export async function markNotificationSent(
  type: string,
  refId: string,
  userId: string,
): Promise<boolean> {
  const admin = createAdminClient()
  const { error } = await admin
    .from("notification_log")
    .insert({ type, ref_id: refId, user_id: userId })
  return !error // false si ya existía (constraint unique)
}
