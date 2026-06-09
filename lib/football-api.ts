// football-data.org API v4
const API_BASE = 'https://api.football-data.org/v4'
const WC_2026_ID = 2000 // FIFA World Cup competition ID

async function fetchAPI(path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'X-Auth-Token': process.env.FOOTBALL_API_KEY! },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`Football API error: ${res.status}`)
  return res.json()
}

export async function getMatches() {
  const data = await fetchAPI(`/competitions/${WC_2026_ID}/matches`)
  return data.matches
}

export function mapMatchToPartido(match: Record<string, unknown>) {
  const home = match.homeTeam as Record<string, string>
  const away = match.awayTeam as Record<string, string>
  const score = match.score as Record<string, Record<string, number | null>>

  let estado: 'pendiente' | 'en_curso' | 'finalizado' = 'pendiente'
  if (match.status === 'FINISHED') estado = 'finalizado'
  else if (match.status === 'IN_PLAY' || match.status === 'PAUSED') estado = 'en_curso'

  return {
    api_id: match.id as number,
    fase: match.stage as string,
    fecha: match.utcDate as string,
    equipo_local: home.name,
    bandera_local: home.crest ?? '',
    equipo_visitante: away.name,
    bandera_visitante: away.crest ?? '',
    goles_local: score?.fullTime?.home ?? null,
    goles_visitante: score?.fullTime?.away ?? null,
    estado,
  }
}
