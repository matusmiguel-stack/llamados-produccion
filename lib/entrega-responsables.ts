// Responsables de una entrega (Postproducción y Diseño comparten el selector).
//
// Además del equipo de casa, se puede asignar a alguien externo: la opción
// genérica "Freelance", o un freelance con nombre propio.
//
// En el formulario un freelance con nombre viaja como "freelance:Ana Ruiz" y se
// guarda como "Freelance · Ana Ruiz". Conservar la palabra "Freelance" dentro
// del texto es lo que permite que el filtro de Freelance los agrupe a todos.
import { employeeDisplayName } from "./employee-dates"

export const FREELANCE = {
  id: "freelance",
  nombre: "Freelance",
  apellido_paterno: "",
  nickname: null as string | null,
  puesto: "Externo",
}

export const FREELANCE_PREFIX = "freelance:"
export const FREELANCE_SEP = " · "

export function esEntradaFreelance(entrada: string): boolean {
  return entrada === FREELANCE.id || entrada.startsWith(FREELANCE_PREFIX)
}

/** Entrada del formulario → nombre tal como se guarda en `entregas.editores`. */
export function etiquetaResponsable(entrada: string, lista: any[]): string | null {
  if (entrada.startsWith(FREELANCE_PREFIX)) {
    const nombre = entrada.slice(FREELANCE_PREFIX.length).trim()
    return nombre ? `${FREELANCE.nombre}${FREELANCE_SEP}${nombre}` : FREELANCE.nombre
  }
  const emp = lista.find((e: any) => e.id === entrada)
  return emp ? employeeDisplayName(emp) : null
}

/**
 * Camino inverso, al abrir una entrega para editarla. Devuelve null solo si el
 * nombre no corresponde ni a un empleado ni a un externo; sin esto, cualquier
 * nombre desconocido se perdía en silencio al guardar de nuevo.
 */
export function entradaDesdeNombre(nombre: string, lista: any[]): string | null {
  if (nombre === FREELANCE.nombre) return FREELANCE.id
  if (nombre.startsWith(FREELANCE.nombre + FREELANCE_SEP)) {
    return FREELANCE_PREFIX + nombre.slice((FREELANCE.nombre + FREELANCE_SEP).length)
  }
  const emp = lista.find((e: any) =>
    `${e.nombre} ${e.apellido_paterno}` === nombre || employeeDisplayName(e) === nombre
  )
  return emp?.id ?? null
}
