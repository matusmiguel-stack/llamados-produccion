// Semáforo de referencias: quién puede calificar y cómo se ordena.
// Compartido entre el frontend y las API routes.

export type Semaforo = "verde" | "amarillo" | "rojo"

// Solo estas personas pueden calificar referencias.
export const REFERENCIA_RATERS = [
  "miguel@retrocasaproductora.com",   // Miguel Matus
  "matusmiguel@gmail.com",            // Miguel Matus (cuenta de pruebas)
  "regina@retrocasaproductora.com",   // Regina Ranz
]

export const puedeCalificar = (email: string | null | undefined) =>
  !!email && REFERENCIA_RATERS.includes(email.toLowerCase())

// Orden: verdes → amarillas → sin calificar → rojas al final.
export const ordenSemaforo = (s: string | null | undefined): number =>
  s === "verde" ? 0 : s === "amarillo" ? 1 : s === "rojo" ? 3 : 2

export const SEMAFORO_INFO: Record<Semaforo, { emoji: string; label: string; color: string }> = {
  verde:    { emoji: "🟢", label: "Buena",   color: "#34d399" },
  amarillo: { emoji: "🟡", label: "Regular", color: "#fbbf24" },
  rojo:     { emoji: "🔴", label: "Mala",    color: "#f87171" },
}
