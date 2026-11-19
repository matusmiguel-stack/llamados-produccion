// CFDI relacionado por sustitución (TipoRelacion 04 · "Sustitución de los CFDI
// previos"): al refacturar, la factura nueva lleva el UUID de la anterior.
// Sin UUID la factura se emite normal, sin relación.

const UUID_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/

/** Limpia lo pegado (espacios, minúsculas). "" → null. */
export function normalizarUuid(raw: unknown): string | null {
  const s = String(raw ?? "").replace(/\s+/g, "").toUpperCase()
  return s || null
}

/** Devuelve el UUID a relacionar (o null si va vacío) o el error a mostrar. */
export function validarSustitucion(raw: unknown): { uuid: string | null; error: string | null } {
  const uuid = normalizarUuid(raw)
  if (!uuid) return { uuid: null, error: null }
  if (!UUID_RE.test(uuid)) {
    return { uuid: null, error: "El UUID de la factura a sustituir no es válido (formato XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX)" }
  }
  return { uuid, error: null }
}

/**
 * Motivo de cancelación ante el SAT. 01 (con errores con relación) exige el
 * UUID de la factura que sustituye a la cancelada; 02 y 03 no llevan UUID.
 */
export function validarMotivoCancelacion(motivo: unknown, sustituidaPor: unknown): { motivo: string; uuid: string | null; error: string | null } {
  const m = String(motivo ?? "")
  if (!["01", "02", "03"].includes(m)) return { motivo: m, uuid: null, error: "Motivo de cancelación no válido" }
  if (m !== "01") return { motivo: m, uuid: null, error: null }
  const { uuid, error } = validarSustitucion(sustituidaPor)
  if (error) return { motivo: m, uuid: null, error: "El UUID de la factura que la sustituye no es válido" }
  if (!uuid) return { motivo: m, uuid: null, error: "Con motivo 01 escribe el UUID de la factura que la sustituye" }
  return { motivo: m, uuid, error: null }
}
