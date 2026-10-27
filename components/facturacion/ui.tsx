// Estilos y piezas compartidas de los modales de facturación (mismo look que
// los modales de Ingresos).
import type React from "react"

export const fInput: React.CSSProperties = {
  padding: "8px 11px",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.14)",
  background: "rgba(255,255,255,0.04)",
  color: "#f8fafc",
  fontSize: 13,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
}

export const fLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#7d8ca3" }

export const fOverlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
  zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
}

export const fModal = (maxWidth: number): React.CSSProperties => ({
  background: "linear-gradient(160deg, rgba(13,20,38,0.99), rgba(8,12,24,0.99))",
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 18,
  boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
  width: "100%",
  maxWidth,
  maxHeight: "90vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
})

export const fHeader: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "18px 24px 14px", borderBottom: "1px solid rgba(148,163,184,0.10)",
}

export const fBody: React.CSSProperties = { padding: "20px 24px", overflowY: "auto", display: "grid", gap: 14, flex: 1 }

export const fClose: React.CSSProperties = { background: "none", border: "none", color: "#7d8ca3", fontSize: 16, cursor: "pointer", padding: "2px 6px" }

export const fBtnGhost: React.CSSProperties = {
  flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid rgba(148,163,184,0.14)",
  background: "transparent", color: "#94a3b8", fontSize: 13, cursor: "pointer",
}

export const fBtnPrimary = (busy = false): React.CSSProperties => ({
  flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid rgba(167,139,250,0.4)",
  background: "rgba(124,58,237,0.15)", color: "#a78bfa", fontSize: 13, fontWeight: 700,
  cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1,
})

export const fBtnSmall: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(148,163,184,0.08)", color: "#cbd5e1", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
}

export const fNote = (color = "#64748b"): React.CSSProperties => ({ margin: 0, fontSize: 11, color, lineHeight: 1.5 })

export function FField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 5, flex: 1, minWidth: 0 }}>
      <label style={fLabel}>{label}</label>
      {children}
    </div>
  )
}

export function FRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{children}</div>
}

export type Receptor = {
  id: string
  rfc: string
  razon_social: string
  regimen_fiscal: string
  cp: string
  uso_cfdi: string
  email: string | null
  client_id: string | null
  ultima_forma_pago: string | null
  ultimo_metodo_pago: string | null
}

export type Emisor = {
  empresa: string
  rfc: string | null
  razon_social: string | null
  regimen_fiscal: string | null
  cp: string | null
  serie: string | null
  clave_prod_serv: string | null
  clave_unidad: string | null
}

export const EMPRESA_LABEL: Record<string, string> = { retro_studio: "Retro Studio", retro_films: "Retro Films" }
