// Estilos compartidos del módulo Plan de rodaje. Mismo lenguaje visual que el
// resto de la app: fondo pizarra, acentos violeta y verde para lo filmado.

import type { CSSProperties } from "react"

export const C = {
  texto: "#f8fafc",
  texto2: "#cbd5e1",
  tenue: "#94a3b8",
  apagado: "#7d8ca3",
  linea: "rgba(148,163,184,0.14)",
  lineaSuave: "rgba(148,163,184,0.09)",
  panel: "rgba(15,23,42,0.72)",
  hueco: "rgba(2,6,23,0.35)",
  violeta: "#a78bfa",
  violetaClaro: "#c4b5fd",
  violetaFondo: "rgba(124,58,237,0.12)",
  violetaBorde: "rgba(167,139,250,0.28)",
  verde: "#34d399",
  verdeClaro: "#6ee7b7",
  verdeFondo: "rgba(52,211,153,0.10)",
  verdeBorde: "rgba(52,211,153,0.30)",
  ambar: "#fbbf24",
  ambarFondo: "rgba(251,191,36,0.10)",
  ambarBorde: "rgba(251,191,36,0.30)",
  rojo: "#f87171",
  rojoFondo: "rgba(248,113,113,0.10)",
  rojoBorde: "rgba(248,113,113,0.30)",
  azul: "#93c5fd",
}

export const MONO = "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace"

export const panel: CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.linea}`,
  boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
  backdropFilter: "blur(16px)",
  borderRadius: 16,
  padding: "16px 18px",
}

export const boton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 12px",
  borderRadius: 9,
  border: `1px solid ${C.linea}`,
  background: "rgba(255,255,255,0.04)",
  color: C.texto2,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
}

export const botonPrimario: CSSProperties = {
  ...boton,
  border: "1px solid rgba(167,139,250,0.45)",
  background: "linear-gradient(180deg, rgba(124,58,237,0.55), rgba(109,40,217,0.55))",
  color: "#f5f3ff",
}

export const botonVioleta: CSSProperties = {
  ...boton,
  border: `1px solid ${C.violetaBorde}`,
  background: C.violetaFondo,
  color: C.violetaClaro,
}

export const botonVerde: CSSProperties = {
  ...boton,
  border: `1px solid ${C.verdeBorde}`,
  background: C.verdeFondo,
  color: C.verdeClaro,
}

export const botonPeligro: CSSProperties = {
  ...boton,
  border: `1px solid ${C.rojoBorde}`,
  background: C.rojoFondo,
  color: "#fca5a5",
}

export const botonChico: CSSProperties = {
  ...boton,
  padding: "5px 9px",
  fontSize: 12,
  borderRadius: 8,
}

export const botonIcono: CSSProperties = {
  ...boton,
  padding: 0,
  width: 30,
  height: 30,
  fontSize: 13,
  borderRadius: 8,
}

export const campo: CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 9,
  border: `1px solid ${C.linea}`,
  background: "rgba(2,6,23,0.55)",
  color: C.texto,
  fontSize: 14,
  outline: "none",
  minWidth: 0,
}

export const campoChico: CSSProperties = {
  ...campo,
  padding: "6px 8px",
  fontSize: 13,
  borderRadius: 8,
}

export const etiquetaCampo: CSSProperties = {
  display: "block",
  margin: "0 0 5px",
  color: C.apagado,
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.6,
}

export const chip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "2px 8px",
  borderRadius: 999,
  border: `1px solid ${C.linea}`,
  background: "rgba(148,163,184,0.08)",
  color: C.tenue,
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: "nowrap",
}

export const chipVioleta: CSSProperties = {
  ...chip,
  border: `1px solid ${C.violetaBorde}`,
  background: C.violetaFondo,
  color: C.violetaClaro,
}

export const chipVerde: CSSProperties = {
  ...chip,
  border: `1px solid ${C.verdeBorde}`,
  background: C.verdeFondo,
  color: C.verdeClaro,
}

export const chipAmbar: CSSProperties = {
  ...chip,
  border: `1px solid ${C.ambarBorde}`,
  background: C.ambarFondo,
  color: C.ambar,
}

export const aviso: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${C.violetaBorde}`,
  background: C.violetaFondo,
  color: C.violetaClaro,
  fontSize: 13,
  lineHeight: 1.45,
}

export const avisoError: CSSProperties = {
  ...aviso,
  border: `1px solid ${C.rojoBorde}`,
  background: C.rojoFondo,
  color: "#fca5a5",
}

export const avisoAmbar: CSSProperties = {
  ...aviso,
  border: `1px solid ${C.ambarBorde}`,
  background: C.ambarFondo,
  color: C.ambar,
}

export const vacio: CSSProperties = {
  padding: "28px 20px",
  borderRadius: 12,
  border: "1px dashed rgba(148,163,184,0.2)",
  background: "rgba(255,255,255,0.02)",
  textAlign: "center",
  color: C.apagado,
  fontSize: 13,
  lineHeight: 1.5,
}

export const modalFondo: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.62)",
  backdropFilter: "blur(4px)",
  zIndex: 10000,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "32px 16px",
  overflowY: "auto",
}

export const modalCaja: CSSProperties = {
  width: "100%",
  background: "linear-gradient(180deg, rgba(10,14,26,0.99) 0%, rgba(6,9,18,0.99) 100%)",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 18,
  boxShadow: "0 40px 120px rgba(0,0,0,0.60)",
  overflow: "hidden",
}

export const modalCabeza: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 14,
  padding: "16px 20px",
  borderBottom: `1px solid ${C.lineaSuave}`,
}

export const modalCuerpo: CSSProperties = {
  padding: "16px 20px 20px",
}

export const eyebrow: CSSProperties = {
  margin: 0,
  color: C.violeta,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 1.2,
  fontWeight: 700,
}
