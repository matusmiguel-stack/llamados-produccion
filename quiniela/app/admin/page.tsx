'use client'

import { useState } from 'react'
import Image from 'next/image'

interface Grupo {
  id: string
  codigo: string
  nombre: string
  pts_exacto: number
  pts_ganador: number
  entrada: number
  created_at: string
}

interface Partido {
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

export default function AdminPage() {
  const [password, setPassword] = useState('')
  const [autenticado, setAutenticado] = useState(false)
  const [errorAuth, setErrorAuth] = useState('')

  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [nombreGrupo, setNombreGrupo] = useState('')
  const [ptsExacto, setPtsExacto] = useState('3')
  const [ptsGanador, setPtsGanador] = useState('1')
  const [entrada, setEntrada] = useState('100')
  const [creando, setCreando] = useState(false)
  const [errorCrear, setErrorCrear] = useState('')
  const [copiado, setCopiado] = useState<string | null>(null)
  const [eliminando, setEliminando] = useState<string | null>(null)

  // Edición
  const [editando, setEditando] = useState<Grupo | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Participantes
  const [viendoGrupo, setViendoGrupo] = useState<Grupo | null>(null)
  const [participantes, setParticipantes] = useState<{ id: string; nombre: string; email: string; created_at: string }[]>([])
  const [cargandoPart, setCargandoPart] = useState(false)

  // Partidos
  const [tab, setTab] = useState<'grupos' | 'partidos'>('grupos')
  const [partidos, setPartidos] = useState<Partido[]>([])
  const [cargandoPartidos, setCargandoPartidos] = useState(false)
  const [editandoPartido, setEditandoPartido] = useState<Partido | null>(null)
  const [golesLocal, setGolesLocal] = useState('')
  const [golesVisitante, setGolesVisitante] = useState('')
  const [estadoPartido, setEstadoPartido] = useState<'pendiente' | 'en_curso' | 'finalizado'>('finalizado')
  const [guardandoPartido, setGuardandoPartido] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch('/api/admin/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) { setErrorAuth('Contraseña incorrecta'); return }
    setAutenticado(true)
    cargarGrupos()
  }

  const cargarGrupos = async () => {
    const res = await fetch(`/api/admin/grupos?password=${encodeURIComponent(password)}`)
    if (res.ok) setGrupos(await res.json())
  }

  const cargarPartidos = async () => {
    setCargandoPartidos(true)
    const res = await fetch(`/api/admin/partidos?password=${encodeURIComponent(password)}`)
    if (res.ok) setPartidos(await res.json())
    setCargandoPartidos(false)
  }

  const handleTabPartidos = () => {
    setTab('partidos')
    if (partidos.length === 0) cargarPartidos()
  }

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await fetch('/api/sync-now')
      const data = await res.json()
      setSyncMsg(`✓ Sincronizado: ${data.synced} partidos, ${data.puntos} puntos actualizados`)
      if (tab === 'partidos') cargarPartidos()
    } catch {
      setSyncMsg('Error al sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  const handleCrear = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombreGrupo.trim()) return
    setCreando(true)
    setErrorCrear('')
    try {
      const res = await fetch('/api/admin/grupos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          nombre: nombreGrupo.trim(),
          pts_exacto: parseInt(ptsExacto) || 3,
          pts_ganador: parseInt(ptsGanador) || 1,
          entrada: parseInt(entrada) || 0,
        }),
      })
      if (!res.ok) { setErrorCrear('Error creando grupo'); return }
      setNombreGrupo('')
      cargarGrupos()
    } finally {
      setCreando(false)
    }
  }

  const verParticipantes = async (g: Grupo) => {
    setViendoGrupo(g)
    setCargandoPart(true)
    const res = await fetch(`/api/admin/participantes?password=${encodeURIComponent(password)}&grupo_id=${g.id}`)
    if (res.ok) setParticipantes(await res.json())
    setCargandoPart(false)
  }

  const handleGuardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editando) return
    setGuardando(true)
    try {
      const res = await fetch('/api/admin/grupos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          id: editando.id,
          nombre: editando.nombre,
          pts_exacto: editando.pts_exacto,
          pts_ganador: editando.pts_ganador,
          entrada: editando.entrada,
        }),
      })
      if (res.ok) {
        setEditando(null)
        cargarGrupos()
      }
    } finally {
      setGuardando(false)
    }
  }

  const abrirEditarPartido = (p: Partido) => {
    setEditandoPartido(p)
    setGolesLocal(p.goles_local != null ? String(p.goles_local) : '')
    setGolesVisitante(p.goles_visitante != null ? String(p.goles_visitante) : '')
    setEstadoPartido(p.estado)
  }

  const handleGuardarPartido = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editandoPartido) return
    setGuardandoPartido(true)
    try {
      const res = await fetch('/api/admin/partidos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          id: editandoPartido.id,
          goles_local: golesLocal !== '' ? parseInt(golesLocal) : null,
          goles_visitante: golesVisitante !== '' ? parseInt(golesVisitante) : null,
          estado: estadoPartido,
        }),
      })
      if (res.ok) {
        setEditandoPartido(null)
        cargarPartidos()
      }
    } finally {
      setGuardandoPartido(false)
    }
  }

  const copiar = (codigo: string) => {
    navigator.clipboard.writeText(codigo)
    setCopiado(codigo)
    setTimeout(() => setCopiado(null), 2000)
  }

  const handleEliminar = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar el grupo "${nombre}"? Se borrarán todos sus jugadores y predicciones.`)) return
    setEliminando(id)
    await fetch(`/api/admin/grupos?password=${encodeURIComponent(password)}&id=${id}`, { method: 'DELETE' })
    setEliminando(null)
    cargarGrupos()
  }

  const formatFecha = (fecha: string) => {
    return new Date(fecha).toLocaleDateString('es-MX', {
      timeZone: 'America/Mexico_City',
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const estadoColor = (estado: string) => {
    if (estado === 'finalizado') return 'text-green-400/60'
    if (estado === 'en_curso') return 'text-amber-400'
    return 'text-white/20'
  }

  const inputClass = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-amber-500/60 transition-colors"

  if (!autenticado) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-xs flex flex-col items-center gap-8">
          <Image src="/logo-quiniela.png" alt="Quiniela" width={56} height={56} className="object-contain opacity-80" priority />
          <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="text-white font-semibold mb-4">Admin</h2>
            <form onSubmit={handleLogin} className="flex flex-col gap-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                className={inputClass}
                autoFocus
              />
              {errorAuth && <p className="text-red-400 text-sm">{errorAuth}</p>}
              <button
                type="submit"
                disabled={!password}
                className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors"
              >
                Entrar
              </button>
            </form>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto flex flex-col gap-6 pt-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo-quiniela.png" alt="Quiniela" width={40} height={40} className="object-contain opacity-80" />
            <span className="text-white/40 text-sm">Admin · Quiniela</span>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 text-sm font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-40"
          >
            {syncing ? '⟳ Sincronizando…' : '⟳ Sync ahora'}
          </button>
        </div>

        {syncMsg && (
          <p className="text-sm text-green-400/80 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-2.5">{syncMsg}</p>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1">
          <button
            onClick={() => setTab('grupos')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'grupos' ? 'bg-amber-600 text-white' : 'text-white/40 hover:text-white/70'}`}
          >
            Grupos
          </button>
          <button
            onClick={handleTabPartidos}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === 'partidos' ? 'bg-amber-600 text-white' : 'text-white/40 hover:text-white/70'}`}
          >
            Partidos
          </button>
        </div>

        {/* Modal participantes */}
        {viendoGrupo && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
                <div>
                  <h2 className="text-white font-semibold">{viendoGrupo.nombre}</h2>
                  <p className="text-white/30 text-xs mt-0.5 font-mono">{viendoGrupo.codigo} · {participantes.length} participante{participantes.length !== 1 ? 's' : ''}</p>
                </div>
                <button onClick={() => setViendoGrupo(null)} className="text-white/30 hover:text-white transition-colors text-xl leading-none">×</button>
              </div>
              <div className="overflow-y-auto flex-1">
                {cargandoPart ? (
                  <p className="text-white/20 text-sm text-center py-8 animate-pulse">Cargando…</p>
                ) : participantes.length === 0 ? (
                  <p className="text-white/20 text-sm text-center py-8">Nadie se ha unido aún</p>
                ) : (
                  <div className="divide-y divide-white/6">
                    {participantes.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-3 px-5 py-3.5">
                        <span className="text-white/20 text-xs w-5 text-right flex-shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">{p.nombre}</p>
                          <p className="text-white/35 text-xs truncate">{p.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {viendoGrupo.entrada > 0 && (
                <div className="border-t border-white/8 px-5 py-3 flex items-center justify-between bg-amber-500/5">
                  <p className="text-white/30 text-xs">{participantes.length} × ${viendoGrupo.entrada} entrada</p>
                  <p className="text-amber-300 font-bold">${(participantes.length * viendoGrupo.entrada).toLocaleString('es-MX')} MXN</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal editar grupo */}
        {editando && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
              <h2 className="text-white font-semibold mb-4">Editar grupo</h2>
              <form onSubmit={handleGuardarEdicion} className="flex flex-col gap-3">
                <div>
                  <label className="text-xs text-white/40 block mb-1">Nombre</label>
                  <input
                    value={editando.nombre}
                    onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-white/40 block mb-1">Pts exacto</label>
                    <input type="number" min="1" max="10"
                      value={editando.pts_exacto}
                      onChange={(e) => setEditando({ ...editando, pts_exacto: parseInt(e.target.value) || 1 })}
                      className={`${inputClass} text-center`}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-white/40 block mb-1">Pts ganador</label>
                    <input type="number" min="0" max="10"
                      value={editando.pts_ganador}
                      onChange={(e) => setEditando({ ...editando, pts_ganador: parseInt(e.target.value) || 0 })}
                      className={`${inputClass} text-center`}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-white/40 block mb-1">Entrada por jugador ($MXN)</label>
                  <input type="number" min="0" step="50"
                    value={editando.entrada}
                    onChange={(e) => setEditando({ ...editando, entrada: parseInt(e.target.value) || 0 })}
                    className={inputClass}
                  />
                </div>
                <div className="flex gap-3 mt-2">
                  <button type="button" onClick={() => setEditando(null)}
                    className="flex-1 bg-white/6 hover:bg-white/10 text-white/50 font-medium py-2.5 rounded-xl transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={guardando}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors">
                    {guardando ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal editar partido */}
        {editandoPartido && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 w-full max-w-sm">
              <h2 className="text-white font-semibold mb-1">Resultado del partido</h2>
              <p className="text-white/40 text-xs mb-4">{editandoPartido.equipo_local} vs {editandoPartido.equipo_visitante}</p>
              <form onSubmit={handleGuardarPartido} className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-center">
                    <p className="text-xs text-white/40 mb-1 truncate">{editandoPartido.bandera_local} {editandoPartido.equipo_local}</p>
                    <input
                      type="number" min="0" max="99"
                      value={golesLocal}
                      onChange={(e) => setGolesLocal(e.target.value)}
                      placeholder="0"
                      className={`${inputClass} text-center text-2xl font-bold`}
                    />
                  </div>
                  <span className="text-white/30 text-xl font-bold mt-5">—</span>
                  <div className="flex-1 text-center">
                    <p className="text-xs text-white/40 mb-1 truncate">{editandoPartido.bandera_visitante} {editandoPartido.equipo_visitante}</p>
                    <input
                      type="number" min="0" max="99"
                      value={golesVisitante}
                      onChange={(e) => setGolesVisitante(e.target.value)}
                      placeholder="0"
                      className={`${inputClass} text-center text-2xl font-bold`}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-white/40 block mb-1">Estado</label>
                  <select
                    value={estadoPartido}
                    onChange={(e) => setEstadoPartido(e.target.value as 'pendiente' | 'en_curso' | 'finalizado')}
                    className={`${inputClass} bg-[#1a1a1a]`}
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="en_curso">En curso</option>
                    <option value="finalizado">Finalizado</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setEditandoPartido(null)}
                    className="flex-1 bg-white/6 hover:bg-white/10 text-white/50 font-medium py-2.5 rounded-xl transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={guardandoPartido}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors">
                    {guardandoPartido ? 'Guardando…' : 'Guardar y calcular puntos'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB: Grupos */}
        {tab === 'grupos' && (
          <>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <h2 className="text-white font-semibold mb-4">Crear grupo</h2>
              <form onSubmit={handleCrear} className="flex flex-col gap-3">
                <input
                  value={nombreGrupo}
                  onChange={(e) => setNombreGrupo(e.target.value)}
                  placeholder="Nombre del grupo"
                  className={inputClass}
                />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-white/40 block mb-1">Pts exacto</label>
                    <input type="number" min="1" max="10" value={ptsExacto} onChange={(e) => setPtsExacto(e.target.value)} className={`${inputClass} text-center`} />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-white/40 block mb-1">Pts ganador</label>
                    <input type="number" min="0" max="10" value={ptsGanador} onChange={(e) => setPtsGanador(e.target.value)} className={`${inputClass} text-center`} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-white/40 block mb-1">Entrada por jugador ($MXN)</label>
                  <input type="number" min="0" step="50" value={entrada}
                    onChange={(e) => setEntrada(e.target.value)} placeholder="Ej: 100" className={inputClass} />
                </div>
                {errorCrear && <p className="text-red-400 text-sm">{errorCrear}</p>}
                <button type="submit" disabled={creando || !nombreGrupo}
                  className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl transition-colors">
                  {creando ? 'Creando…' : 'Crear grupo'}
                </button>
              </form>
            </div>

            <div>
              <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">
                Grupos ({grupos.length})
              </h2>
              {grupos.length === 0 ? (
                <p className="text-white/30 text-sm text-center py-6">No hay grupos todavía</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {grupos.map((g) => (
                    <div key={g.id} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                      <button onClick={() => verParticipantes(g)} className="min-w-0 flex-1 text-left">
                        <p className="text-white font-medium text-sm truncate hover:text-amber-300 transition-colors">{g.nombre}</p>
                        <p className="text-white/30 text-xs mt-0.5">
                          {g.pts_exacto}pts exacto · {g.pts_ganador}pt ganador
                          {g.entrada > 0 && <span className="text-amber-400/60"> · ${g.entrada} entrada</span>}
                        </p>
                      </button>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="font-mono font-bold text-amber-300 tracking-widest">{g.codigo}</span>
                        <button onClick={() => copiar(g.codigo)} className="text-xs text-white/30 hover:text-white/70 transition-colors">
                          {copiado === g.codigo ? '✓' : 'copiar'}
                        </button>
                        <button onClick={() => setEditando(g)} className="text-xs text-blue-400/60 hover:text-blue-300 transition-colors">
                          editar
                        </button>
                        <button onClick={() => handleEliminar(g.id, g.nombre)} disabled={eliminando === g.id}
                          className="text-xs text-red-500/50 hover:text-red-400 disabled:opacity-30 transition-colors">
                          {eliminando === g.id ? '…' : 'eliminar'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB: Partidos */}
        {tab === 'partidos' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">
                Partidos ({partidos.length})
              </h2>
              <button onClick={cargarPartidos} className="text-xs text-white/30 hover:text-white/60 transition-colors">
                ↻ Actualizar
              </button>
            </div>
            {cargandoPartidos ? (
              <p className="text-white/20 text-sm text-center py-8 animate-pulse">Cargando…</p>
            ) : (
              <div className="flex flex-col gap-2">
                {partidos.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => abrirEditarPartido(p)}
                    className="bg-white/5 border border-white/10 hover:border-amber-500/30 rounded-xl px-4 py-3 flex items-center gap-3 text-left transition-colors w-full"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">
                        {p.bandera_local} {p.equipo_local} <span className="text-white/30">vs</span> {p.equipo_visitante} {p.bandera_visitante}
                      </p>
                      <p className="text-white/25 text-xs mt-0.5">{formatFecha(p.fecha)} · {p.fase}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      {p.goles_local != null && p.goles_visitante != null ? (
                        <p className="text-white font-bold text-sm">{p.goles_local} — {p.goles_visitante}</p>
                      ) : (
                        <p className="text-white/20 text-sm">vs</p>
                      )}
                      <p className={`text-xs mt-0.5 ${estadoColor(p.estado)}`}>{p.estado}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
