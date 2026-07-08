"use client"
import { useEffect } from "react"

// Reemplaza el alert() nativo del navegador (el cuadro gris de
// "app.retrocasaproductora.com says…") por toasts estilizados, sin tocar los
// ~200 call sites. Detecta el tono del mensaje para colorear: error (rojo),
// éxito (verde) o informativo (morado). Montado una vez en el layout raíz.

const ERROR_RE = /error|no se pudo|no pudimos|falló|fall[oó]|falta|inv[aá]lid|rechazad|denegad|no autorizado|vuelve a intentar/i
const OK_RE = /^✓|✓ |enviad|guardad|cread|actualizad|registrad|pagad|listo|copiad|sincronizad|completad|éxito|exitos/i

function tone(msg: string): "error" | "ok" | "info" {
  if (ERROR_RE.test(msg)) return "error"
  if (OK_RE.test(msg)) return "ok"
  return "info"
}

const COLORS = {
  error: { accent: "#f87171", bg: "rgba(248,113,113,0.10)", icon: "✕" },
  ok:    { accent: "#34d399", bg: "rgba(52,211,153,0.10)",  icon: "✓" },
  info:  { accent: "#a78bfa", bg: "rgba(167,139,250,0.10)", icon: "ℹ" },
}

function showToast(message: string) {
  const t = tone(message)
  const c = COLORS[t]

  let container = document.getElementById("app-toasts") as HTMLDivElement | null
  if (!container) {
    container = document.createElement("div")
    container.id = "app-toasts"
    Object.assign(container.style, {
      position: "fixed", top: "16px", right: "16px", zIndex: "99999",
      display: "flex", flexDirection: "column", gap: "10px",
      maxWidth: "min(400px, calc(100vw - 32px))", pointerEvents: "none",
    } as CSSStyleDeclaration)
    document.body.appendChild(container)
  }

  const toast = document.createElement("div")
  Object.assign(toast.style, {
    display: "flex", alignItems: "flex-start", gap: "10px",
    padding: "13px 16px", borderRadius: "12px",
    background: "#0d1120", border: `1px solid ${c.accent}55`,
    borderLeft: `3px solid ${c.accent}`,
    boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
    color: "#e2e8f0", fontSize: "13px", lineHeight: "1.5",
    fontFamily: "Inter, system-ui, sans-serif",
    whiteSpace: "pre-line", wordBreak: "break-word",
    pointerEvents: "auto", cursor: "pointer",
    opacity: "0", transform: "translateX(24px)",
    transition: "opacity 0.25s ease, transform 0.25s ease",
  } as CSSStyleDeclaration)

  const icon = document.createElement("span")
  icon.textContent = c.icon
  Object.assign(icon.style, {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: "20px", height: "20px", borderRadius: "50%", flexShrink: "0",
    background: c.bg, border: `1px solid ${c.accent}55`,
    color: c.accent, fontSize: "11px", fontWeight: "700", marginTop: "1px",
  } as CSSStyleDeclaration)

  const text = document.createElement("span")
  text.textContent = message

  toast.appendChild(icon)
  toast.appendChild(text)
  container.appendChild(toast)

  requestAnimationFrame(() => {
    toast.style.opacity = "1"
    toast.style.transform = "translateX(0)"
  })

  // Duración según el largo del mensaje; clic para cerrar antes.
  const duration = Math.min(9000, Math.max(3500, message.length * 45))
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    toast.style.opacity = "0"
    toast.style.transform = "translateX(24px)"
    setTimeout(() => toast.remove(), 260)
  }
  toast.addEventListener("click", close)
  setTimeout(close, duration)
}

export function ToastOverride() {
  useEffect(() => {
    const original = window.alert
    window.alert = (msg?: unknown) => showToast(String(msg ?? ""))
    return () => { window.alert = original }
  }, [])
  return null
}
