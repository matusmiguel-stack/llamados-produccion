// Service Worker — Retro Casa Productora
// Recibe push events y muestra notificaciones

self.addEventListener("push", (event) => {
  if (!event.data) return

  let data = {}
  try {
    data = event.data.json()
  } catch {
    data = { title: "Retro", body: event.data.text() }
  }

  const { title = "Retro", body = "", url = "/", icon = "/logo-retro.png" } = data

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: "/logo-retro.png",
      data: { url },
      requireInteraction: false,
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data?.url || "/"
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return clients.openWindow(url)
    })
  )
})
