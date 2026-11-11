"use client"
import { useEffect, useMemo, useState } from "react"
import { supabase } from "../../lib/supabase"
import { FORMAS_PAGO } from "../../lib/sat-catalogos"
import {
  EMPRESA_LABEL, FField, FRow, fBody, fBtnGhost, fBtnPrimary, fBtnSmall, fClose, fHeader, fInput, fModal, fNote, fOverlay,
} from "./ui"

const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
const r2 = (n: number) => Math.round(n * 100) / 100
const hoyCdmx = () => new Date().toLocaleDateString("sv", { timeZone: "America/Mexico_City" })
const fechaCorta = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
export const nombreFormaPago = (clave: string) => FORMAS_PAGO.find(f => f.clave === clave)?.nombre || clave

// Llama a /api/facturacion/complementos con la sesión del usuario
export async function llamarComplementos(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch("/api/facturacion/complementos", {
    method: "POST",
    headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const d = await res.json()
  if (!res.ok || d.error) throw new Error(d.error || `Error ${res.status}`)
  return d
}

type IngresoPPD = {
  empresa: string
  numero_factura: string | null
  factura_uuid: string
  subtotal: number | string | null
  iva: number | string | null
  cliente_agencia: string | null
  proyecto: string | null
}
type IndependientePPD = { empresa: string; numero: string | null; uuid: string; total: number | string; receptor_nombre: string | null }
type MontoComplemento = { factura_uuid: string; monto: number | string }

type Candidata = {
  uuid: string
  empresa: string
  numero: string
  nombre: string
  detalle: string
  total: number
  pagado: number
  saldo: number
}

type Detalle = {
  factura: {
    uuid: string
    numero: string
    empresa: string
    origen: "ingreso" | "independiente"
    fecha: string | null
    total: number
    receptor: { razon_social: string; rfc: string }
  }
  pagado: number
  saldo: number
  parcialidad: number
  complementos: { id: string; numero: string | null; monto: number; parcialidad: number; fecha_pago: string; forma_pago: string; origen: string }[]
  pruebas: boolean
}

export type ComplementoResultado = {
  numero: string
  factura: string
  monto: number
  parcialidad: number
  saldoInsoluto: number
  pruebas: boolean
}

export function mensajeComplemento(d: ComplementoResultado): string {
  return `Complemento de pago ${d.numero} emitido${d.pruebas ? " (modo pruebas)" : ""}.\n\n` +
    `Factura ${d.factura} · parcialidad ${d.parcialidad} · pagado ${money(d.monto)}\n` +
    `Saldo pendiente de la factura: ${money(d.saldoInsoluto)}`
}

// Complemento de pago "a mano": para cualquier factura PPD (de Ingresos o
// independiente), con el monto, la fecha y la forma de pago que se elijan.
// El automático de Ingresos (al marcar pagado) sigue funcionando igual; los
// dos cuentan para la parcialidad y el saldo de la factura.
export function NuevoComplementoModal({
  facturaUuidInicial,
  ambiente,
  onDone,
  onClose,
}: {
  facturaUuidInicial?: string | null
  ambiente: Record<string, "pruebas" | "real" | null>
  onDone: (r: ComplementoResultado) => void
  onClose: () => void
}) {
  const fija = !!facturaUuidInicial
  const [candidatas, setCandidatas] = useState<Candidata[] | null>(null)
  const [buscar, setBuscar] = useState("")
  const [verPagadas, setVerPagadas] = useState(false)
  const [uuid, setUuid] = useState(facturaUuidInicial || "")
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const [cargandoDetalle, setCargandoDetalle] = useState(!!facturaUuidInicial)
  const [errorDetalle, setErrorDetalle] = useState("")
  const [fecha, setFecha] = useState(hoyCdmx())
  const [monto, setMonto] = useState("")
  const [forma, setForma] = useState("03")
  const [emitiendo, setEmitiendo] = useState(false)

  // Facturas PPD de Ingresos y facturas independientes PPD, con lo ya pagado
  useEffect(() => {
    if (fija) return
    (async () => {
      // Las facturas de Orderly subidas sin leer su método de pago: se clasifican primero
      try { await llamarComplementos({ action: "sincronizar" }) } catch { /* no bloquea la lista */ }
      const [{ data: ings }, { data: fis }, { data: comps }] = await Promise.all([
        supabase.from("ingresos")
          .select("empresa, numero_factura, factura_uuid, subtotal, iva, cliente_agencia, proyecto")
          .eq("factura_metodo_pago", "PPD").not("factura_uuid", "is", null),
        supabase.from("facturas_independientes")
          .select("empresa, numero, uuid, total, receptor_nombre")
          .eq("metodo_pago", "PPD").eq("estatus", "vigente").not("uuid", "is", null),
        supabase.from("complementos_pago").select("factura_uuid, monto").eq("estatus", "vigente"),
      ])
      const porUuid = new Map<string, Candidata>()
      for (const i of (ings || []) as IngresoPPD[]) {
        const u = String(i.factura_uuid).toUpperCase()
        const importe = Number(i.subtotal || 0) + Number(i.iva || 0)
        const prev = porUuid.get(u)
        if (prev) { prev.total = r2(prev.total + importe); continue }
        porUuid.set(u, {
          uuid: u, empresa: i.empresa, numero: i.numero_factura || u.slice(0, 8),
          nombre: i.cliente_agencia || "", detalle: String(i.proyecto || "").replace(/\s*-\s*Liquidaci[oó]n$/i, ""),
          total: r2(importe), pagado: 0, saldo: 0,
        })
      }
      for (const f of (fis || []) as IndependientePPD[]) {
        const u = String(f.uuid).toUpperCase()
        porUuid.set(u, {
          uuid: u, empresa: f.empresa, numero: f.numero || u.slice(0, 8), nombre: f.receptor_nombre || "",
          detalle: "Factura independiente", total: Number(f.total), pagado: 0, saldo: 0,
        })
      }
      for (const c of (comps || []) as MontoComplemento[]) {
        const cand = porUuid.get(String(c.factura_uuid).toUpperCase())
        if (cand) cand.pagado = r2(cand.pagado + Number(c.monto))
      }
      const lista = [...porUuid.values()]
        .map(c => ({ ...c, saldo: r2(c.total - c.pagado) }))
        .sort((a, b) => b.numero.localeCompare(a.numero, "es", { numeric: true }))
      setCandidatas(lista)
    })()
  }, [fija])

  function elegirFactura(u: string) {
    setUuid(u)
    setDetalle(null)
    setErrorDetalle("")
    setCargandoDetalle(!!u)
  }

  // Datos exactos de la factura elegida (total del XML, complementos previos)
  useEffect(() => {
    if (!uuid) return
    let vigente = true
    llamarComplementos({ action: "detalle", facturaUuid: uuid })
      .then((d: Detalle) => {
        if (!vigente) return
        setDetalle(d)
        setMonto(d.saldo > 0 ? d.saldo.toFixed(2) : "")
      })
      .catch((e: Error) => { if (vigente) setErrorDetalle(e.message) })
      .finally(() => { if (vigente) setCargandoDetalle(false) })
    return () => { vigente = false }
  }, [uuid])

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return (candidatas || []).filter(c =>
      (verPagadas || c.saldo > 0.01 || c.uuid === uuid) &&
      (!q || `${c.numero} ${c.nombre} ${c.detalle}`.toLowerCase().includes(q))
    )
  }, [candidatas, buscar, verPagadas, uuid])

  const montoNum = r2(parseFloat(monto) || 0)
  const saldoDespues = detalle ? r2(detalle.saldo - montoNum) : 0
  const pagada = !!detalle && !(detalle.saldo > 0.005)
  const amb = detalle ? ambiente[detalle.factura.empresa] ?? null : null

  async function emitir() {
    if (!detalle) return
    if (!(montoNum > 0)) { alert("Escribe el monto que se recibió (con IVA)"); return }
    if (montoNum > detalle.saldo + 0.05) { alert(`El monto es mayor al saldo pendiente de la factura (${money(detalle.saldo)})`); return }
    if (!fecha || fecha > hoyCdmx()) { alert("La fecha del pago no puede ser futura"); return }
    const aviso = amb === "real"
      ? "Se timbrará ante el SAT un complemento de pago REAL"
      : "Se timbrará un complemento de pago de PRUEBA (no es válido ante el SAT)"
    const resumen =
      `Factura ${detalle.factura.numero} · ${EMPRESA_LABEL[detalle.factura.empresa]} → ${detalle.factura.receptor.razon_social}\n` +
      `Parcialidad ${detalle.parcialidad} · ${money(montoNum)} pagado el ${fechaCorta(fecha)} · ${nombreFormaPago(forma)}\n` +
      `Saldo pendiente después: ${money(Math.max(saldoDespues, 0))}`
    if (!confirm(`${aviso}:\n\n${resumen}\n\n¿Continuar?`)) return
    setEmitiendo(true)
    try {
      const d = await llamarComplementos({ action: "emitir", facturaUuid: detalle.factura.uuid, fecha, monto: montoNum, formaPago: forma })
      onDone(d as ComplementoResultado)
    } catch (e) {
      alert("No se pudo emitir el complemento: " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setEmitiendo(false)
    }
  }

  const caja: React.CSSProperties = {
    display: "grid", gap: 6, padding: "10px 12px", borderRadius: 10,
    background: "rgba(255,255,255,0.025)", border: "1px solid rgba(148,163,184,0.10)", fontSize: 12, color: "#94a3b8",
  }
  const filaMonto = (label: string, valor: string, fuerte = false) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, ...(fuerte ? { color: "#f8fafc", fontWeight: 700, fontSize: 13 } : {}) }}>
      <span>{label}</span><span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{valor}</span>
    </div>
  )

  return (
    <div style={fOverlay}>
      <div style={fModal(620)} onClick={e => e.stopPropagation()}>
        <div style={fHeader}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#f8fafc" }}>🧾 Nuevo complemento de pago</h2>
          <button onClick={onClose} disabled={emitiendo} style={fClose}>✕</button>
        </div>
        <div style={fBody}>
          {!fija && (
            <FField label="Factura PPD *">
              {candidatas === null ? (
                <p style={fNote("#94a3b8")}>Cargando facturas…</p>
              ) : (
                <>
                  <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por folio, cliente o proyecto" style={fInput} />
                  <select value={uuid} onChange={e => elegirFactura(e.target.value)} style={fInput}>
                    <option value="">{visibles.length ? "Elige la factura…" : "No hay facturas PPD con saldo pendiente"}</option>
                    {visibles.map(c => (
                      <option key={c.uuid} value={c.uuid}>
                        {c.numero} · {EMPRESA_LABEL[c.empresa] || c.empresa} · {c.nombre}{c.detalle ? ` (${c.detalle})` : ""} · saldo {money(c.saldo)}
                      </option>
                    ))}
                  </select>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "#94a3b8" }}>
                    <input type="checkbox" checked={verPagadas} onChange={e => setVerPagadas(e.target.checked)} style={{ accentColor: "#7c3aed" }} />
                    Mostrar también las que ya están pagadas por completo
                  </label>
                </>
              )}
            </FField>
          )}

          {cargandoDetalle && <p style={fNote("#94a3b8")}>Leyendo la factura…</p>}
          {errorDetalle && (
            <p style={{ ...fNote("#fca5a5"), padding: "8px 10px", borderRadius: 8, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(248,113,113,0.25)" }}>
              {errorDetalle}
            </p>
          )}

          {detalle && (
            <>
              <div style={caja}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", overflowWrap: "anywhere" }}>
                  <span style={{ fontFamily: "var(--font-mono)", color: "#a78bfa" }}>{detalle.factura.numero}</span>
                  {" · "}{EMPRESA_LABEL[detalle.factura.empresa] || detalle.factura.empresa} → {detalle.factura.receptor.razon_social}
                </div>
                <div style={{ fontSize: 11, color: "#7d8ca3" }}>
                  RFC <span style={{ fontFamily: "var(--font-mono)" }}>{detalle.factura.receptor.rfc}</span>
                  {detalle.factura.fecha ? ` · emitida el ${fechaCorta(detalle.factura.fecha)}` : ""}
                  {detalle.factura.origen === "independiente" ? " · factura independiente" : " · de Ingresos"}
                </div>
                {filaMonto("Total de la factura", money(detalle.factura.total))}
                {filaMonto(`Ya pagado (${detalle.complementos.length} complemento${detalle.complementos.length === 1 ? "" : "s"})`, money(detalle.pagado))}
                {filaMonto("Saldo pendiente", money(detalle.saldo), true)}
                {detalle.complementos.length > 0 && (
                  <div style={{ display: "grid", gap: 2, marginTop: 4, fontSize: 11, color: "#7d8ca3" }}>
                    {detalle.complementos.map(c => (
                      <span key={c.id}>
                        {c.parcialidad}. {c.numero || "Complemento"} · {fechaCorta(c.fecha_pago)} · {money(Number(c.monto))} · {nombreFormaPago(c.forma_pago)}
                        {c.origen === "auto" ? " · al marcar pagado" : " · a mano"}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {pagada ? (
                <p style={fNote("#4ade80")}>Esta factura ya está pagada por completo con sus complementos; no lleva otro.</p>
              ) : (
                <>
                  {amb === null ? (
                    <p style={{ ...fNote("#fbbf24"), padding: "8px 10px", borderRadius: 8, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}>
                      Facturapi todavía no está conectado para {EMPRESA_LABEL[detalle.factura.empresa]}; el timbrado fallará hasta que se configure la llave.
                    </p>
                  ) : amb === "pruebas" ? (
                    <p style={{ ...fNote("#38bdf8"), padding: "8px 10px", borderRadius: 8, background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.25)" }}>
                      Modo pruebas: el complemento se genera pero no es válido ante el SAT.
                    </p>
                  ) : null}

                  <FRow>
                    <div style={{ flex: "1 1 150px" }}>
                      <FField label="Fecha en que se recibió el pago">
                        <input type="date" value={fecha} max={hoyCdmx()} onChange={e => setFecha(e.target.value)} style={fInput} />
                      </FField>
                    </div>
                    <div style={{ flex: "1 1 180px" }}>
                      <FField label="Monto recibido (con IVA)">
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            value={monto}
                            onChange={e => setMonto(e.target.value.replace(/[^\d.]/g, ""))}
                            placeholder="0.00"
                            inputMode="decimal"
                            style={{ ...fInput, textAlign: "right", fontFamily: "var(--font-mono)", flex: 1, minWidth: 0 }}
                          />
                          <button onClick={() => setMonto(detalle.saldo.toFixed(2))} style={fBtnSmall} title="Todo el saldo pendiente">Todo</button>
                        </div>
                      </FField>
                    </div>
                  </FRow>

                  <FField label="¿Cómo se recibió el pago?">
                    <select value={forma} onChange={e => setForma(e.target.value)} style={fInput}>
                      {FORMAS_PAGO.filter(f => f.clave !== "99").map(f => <option key={f.clave} value={f.clave}>{f.clave} · {f.nombre}</option>)}
                    </select>
                  </FField>

                  <div style={caja}>
                    {filaMonto(`Parcialidad ${detalle.parcialidad} · este pago`, money(montoNum))}
                    {filaMonto("Saldo pendiente después", money(Math.max(saldoDespues, 0)), true)}
                    {montoNum > detalle.saldo + 0.05 && <span style={{ color: "#fca5a5" }}>El monto es mayor al saldo pendiente.</span>}
                  </div>
                  <p style={fNote()}>
                    No toca el control de ingresos: si este cobro corresponde a una línea de Ingresos, márcala pagada sin volver a emitir su complemento.
                  </p>
                </>
              )}
            </>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button onClick={onClose} disabled={emitiendo} style={fBtnGhost}>Cancelar</button>
            <button
              onClick={emitir}
              disabled={emitiendo || !detalle || pagada}
              style={fBtnPrimary(emitiendo || !detalle || pagada)}
            >
              {emitiendo ? "Emitiendo…" : "🧾 Emitir complemento"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
