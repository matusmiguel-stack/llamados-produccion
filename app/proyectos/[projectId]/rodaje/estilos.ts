// Estilos compartidos del módulo Plan de rodaje. Mismo lenguaje visual que el
// resto de la app: fondo claro, acentos en negro y verde para lo filmado.

import type { CSSProperties } from "react"

export const C = {
  texto: "#141414",
  texto2: "#3F3F3F",
  tenue: "#6B6B6B",
  apagado: "#737373",
  linea: "rgba(0,0,0,0.1)",
  lineaSuave: "rgba(0,0,0,0.07)",
  panel: "#FFFFFF",
  hueco: "#FFFFFF",
  violeta: "#131313",
  violetaClaro: "#3F3F3F",
  violetaFondo: "rgba(0,0,0,0.05)",
  violetaBorde: "rgba(0,0,0,0.08)",
  verde: "#1F8A55",
  verdeClaro: "#1F7A4D",
  verdeFondo: "rgba(52,211,153,0.10)",
  verdeBorde: "rgba(52,211,153,0.30)",
  ambar: "#A86B00",
  ambarFondo: "rgba(251,191,36,0.10)",
  ambarBorde: "rgba(251,191,36,0.30)",
  rojo: "#C2362B",
  rojoFondo: "rgba(248,113,113,0.10)",
  rojoBorde: "rgba(248,113,113,0.30)",
  azul: "#1D5FA8",
}

export const MONO = "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace"

export const panel: CSSProperties = {
  background: C.panel,
  border: `1px solid ${C.linea}`,
  boxShadow: "0 20px 60px rgba(0,0,0,0.05)",
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
  background: "#FFFFFF",
  color: C.texto2,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
}

export const botonPrimario: CSSProperties = {
  ...boton,
  border: "1px solid #131313",
  background: "#131313",
  color: "#FFFFFF",
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
  color: "#B42318",
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
  background: "#FFFFFF",
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
}

export const chip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "2px 8px",
  borderRadius: 999,
  border: `1px solid ${C.linea}`,
  background: "rgba(0,0,0,0.03)",
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
  color: "#B42318",
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
  border: "1px dashed rgba(0,0,0,0.14)",
  background: "#FFFFFF",
  textAlign: "center",
  color: C.apagado,
  fontSize: 13,
  lineHeight: 1.5,
}

export const modalFondo: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17,17,17,0.32)",
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
  background: "#FFFFFF",
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 18,
  boxShadow: "0 40px 120px rgba(0,0,0,0.13)",
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
  fontWeight: 700,
}
