export function calcularPuntos(
  predLocal: number,
  predVisitante: number,
  realLocal: number,
  realVisitante: number,
  ptsExacto: number,
  ptsGanador: number
): number {
  if (predLocal === realLocal && predVisitante === realVisitante) return ptsExacto

  const predResultado = Math.sign(predLocal - predVisitante)
  const realResultado = Math.sign(realLocal - realVisitante)
  if (predResultado === realResultado) return ptsGanador

  return 0
}
