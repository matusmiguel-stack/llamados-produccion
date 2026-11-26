"use client"

import { useEffect, type CSSProperties, type ReactNode } from "react"
import { createPortal } from "react-dom"

// Panel lateral que se desliza desde la derecha para ver el detalle de un
// evento sin perder el calendario de vista. Se cierra con Esc o picando fuera.
// En teléfono ocupa todo el ancho.

export function SideDrawer({
  onClose,
  label,
  width = 560,
  children,
}: {
  onClose: () => void
  label: string
  width?: number
  children: ReactNode
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // Portal al body: así el velo cubre también la barra lateral, aunque el
  // panel se declare dentro de un contenedor con su propia capa.
  if (typeof document === "undefined") return null
  return createPortal(
    <div className="drawer-overlay" style={overlayStyle} onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="drawer-panel"
        style={{ ...panelStyle, width: `min(${width}px, 100vw)` }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </aside>
    </div>,
    document.body,
  )
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 999999,
  background: "rgba(20,20,20,0.32)",
}

const panelStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  display: "flex",
  flexDirection: "column",
  background: "#FFFFFF",
  color: "#141414",
  boxShadow: "-18px 0 50px rgba(0,0,0,0.14)",
  overflow: "hidden",
}

// ── Piezas comunes del panel ────────────────────────────────────────────────

export const drawerBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "14px 20px",
  borderBottom: "1px solid #EDEDED",
  flexShrink: 0,
}

export const drawerBodyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  padding: "24px 32px 32px",
}

export const drawerIconButtonStyle: CSSProperties = {
  width: 34,
  height: 34,
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 7,
  border: "none",
  background: "transparent",
  color: "#595959",
  cursor: "pointer",
}

export const drawerQuietButtonStyle: CSSProperties = {
  height: 34,
  padding: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  borderRadius: 7,
  border: "1px solid #E2E2E2",
  background: "#FFFFFF",
  color: "#141414",
  fontSize: 13.5,
  fontWeight: 500,
  whiteSpace: "nowrap",
  cursor: "pointer",
}

export const drawerInkButtonStyle: CSSProperties = {
  ...drawerQuietButtonStyle,
  border: "1px solid #131313",
  background: "#131313",
  color: "#FFFFFF",
  fontWeight: 600,
}

export function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}
