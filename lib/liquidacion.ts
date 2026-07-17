// Nombre de la línea remanente al facturar parcialmente un ingreso.
// "Proyecto X"                 → "Proyecto X - Liquidación"
// "Proyecto X - Liquidación"   → "Proyecto X - Liquidación 2"
// "Proyecto X - Liquidación 2" → "Proyecto X - Liquidación 3"
export function nombreLiquidacion(label: string): string {
  const m = label.trim().match(/^(.*) - Liquidación(?: (\d+))?$/)
  if (m) {
    const n = m[2] ? parseInt(m[2], 10) + 1 : 2
    return `${m[1]} - Liquidación ${n}`
  }
  return `${label.trim()} - Liquidación`
}
