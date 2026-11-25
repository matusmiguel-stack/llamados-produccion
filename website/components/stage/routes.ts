export type StageRoute =
  | { mode: "hero" }
  | { mode: "proyectos" }
  | { mode: "case"; slug: string }
  | { mode: "nosotros" }
  | { mode: "outside" }

export function parseRoute(pathname: string): StageRoute {
  const p = pathname.replace(/\/+$/, "") || "/"
  if (p === "/") return { mode: "hero" }
  if (p === "/proyectos") return { mode: "proyectos" }
  if (p === "/nosotros") return { mode: "nosotros" }
  const m = /^\/proyectos\/([^/]+)$/.exec(p)
  if (m) return { mode: "case", slug: decodeURIComponent(m[1]) }
  return { mode: "outside" }
}

/* Rutas que viven dentro del escenario (el reel no se desmonta). */
export function isStageRoute(pathname: string) {
  return parseRoute(pathname).mode !== "outside"
}

/* Rutas cuya página es "delgada" (no pinta nada visible): entre ellas se puede
   navegar con history.pushState sin pedirle nada al router. */
export function isThinRoute(pathname: string) {
  const m = parseRoute(pathname).mode
  return m === "hero" || m === "proyectos" || m === "case"
}

export const SITE = "Retro Casa Productora"
