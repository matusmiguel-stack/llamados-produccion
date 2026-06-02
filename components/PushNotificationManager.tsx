"use client"

import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  const arr = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i)
  return arr.buffer
}

type Props = { userId: string }

export function PushNotificationManager({ userId }: Props) {
  const [status, setStatus] = useState<"idle" | "granted" | "denied" | "unsupported">("idle")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported")
      return
    }
    if (Notification.permission === "granted") {
      setStatus("granted")
      ensureSubscribed()
    } else if (Notification.permission === "denied") {
      setStatus("denied")
    }
  }, [])

  async function ensureSubscribed() {
    try {
      const reg = await navigator.serviceWorker.register("/sw.js")
      await navigator.serviceWorker.ready

      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")!))),
          auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth")!))),
        }),
      })
    } catch { /* silently fail */ }
  }

  async function requestPermission() {
    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission === "granted") {
        setStatus("granted")
        await ensureSubscribed()
      } else {
        setStatus("denied")
      }
    } finally {
      setLoading(false)
    }
  }

  if (status === "unsupported" || status === "denied") return null

  if (status === "granted") {
    return (
      <button
        onClick={() => new Notification("🔔 Prueba", { body: "Las notificaciones funcionan correctamente", icon: "/logo-retro.png" })}
        style={{ ...btnStyle, background: "rgba(8,145,178,0.3)", marginBottom: 12 }}
      >
        🔔 Probar notificación
      </button>
    )
  }

  return (
    <div style={bannerStyle}>
      <span style={{ fontSize: 14 }}>🔔</span>
      <span style={{ fontSize: 13, color: "#cbd5e1" }}>
        Activa notificaciones para pagos vencidos y juntas próximas
      </span>
      <button onClick={requestPermission} disabled={loading} style={btnStyle}>
        {loading ? "..." : "Activar"}
      </button>
    </div>
  )
}

const bannerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 14px",
  borderRadius: 10,
  background: "rgba(124,58,237,0.10)",
  border: "1px solid rgba(167,139,250,0.20)",
  marginBottom: 12,
  flexWrap: "wrap",
}

const btnStyle: React.CSSProperties = {
  marginLeft: "auto",
  padding: "5px 14px",
  borderRadius: 8,
  border: "none",
  background: "rgba(124,58,237,0.70)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
}
