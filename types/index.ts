export interface Grupo {
  id: string
  codigo: string
  nombre: string
  pts_exacto: number
  pts_ganador: number
  created_at: string
}

export interface Jugador {
  id: string
  nombre: string
  grupo_id: string
  created_at: string
}

export interface Partido {
  id: string
  api_id: number
  fase: string
  fecha: string
  equipo_local: string
  bandera_local: string
  equipo_visitante: string
  bandera_visitante: string
  goles_local: number | null
  goles_visitante: number | null
  estado: 'pendiente' | 'en_curso' | 'finalizado'
}

export interface Prediccion {
  id: string
  jugador_id: string
  partido_id: string
  goles_local: number
  goles_visitante: number
  puntos: number | null
  created_at: string
}

export interface PosicionTabla {
  jugador_id: string
  nombre: string
  puntos_total: number
  exactos: number
  ganadores: number
  predicciones: number
}
