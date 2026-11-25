/* Comunicación mínima entre el header (layout raíz) y el escenario. */

type Navigate = (href: string) => boolean

let navigateHandler: Navigate | null = null
let revealed = false
const revealListeners = new Set<() => void>()

/* El escenario registra quién resuelve la navegación entre sus rutas
   sin pasar por el router (para que la animación arranque al instante). */
export function setStageNavigator(fn: Navigate | null) {
  navigateHandler = fn
}

export function stageNavigate(href: string) {
  return navigateHandler?.(href) ?? false
}

/* En rutas del escenario, su intro decide cuándo aparece el header. */
export function revealHeader() {
  if (revealed) return
  revealed = true
  for (const fn of revealListeners) fn()
  revealListeners.clear()
}

export function onHeaderReveal(fn: () => void) {
  if (revealed) {
    fn()
    return () => {}
  }
  revealListeners.add(fn)
  return () => { revealListeners.delete(fn) }
}

export function headerRevealed() {
  return revealed
}
