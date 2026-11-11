"use client"
import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { MOTIVOS_CANCELACION } from "../../lib/sat-catalogos"
import { NuevoComplementoModal, llamarComplementos, mensajeComplemento, nombreFormaPago, type ComplementoResultado } from "./NuevoComplementoModal"
import { EMPRESA_LABEL, fBody, fBtnPrimary, fBtnSmall, fClose, fHeader, fInput, fModal, fNote, fOverlay } from "./ui"

const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
const fechaCorta = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })

type Complemento = {
  id: string
  empresa: string
  numero: string | null
  factura_numero: string | null
  receptor_nombre: string | null
  monto: number
  parcialidad: number
  saldo_anterior: number
  fecha_pago: string
  forma_pago: string
  origen: "auto" | "manual"
  estatus: "vigente" | "cancelada"
}

type ComplementoFila = Omit<Complemento, "monto" | "saldo_anterior"> & { monto: number | string; saldo_anterior: number | string }

async function leerComplementos(): Promise<Complemento[]> {
  const { data } = await supabase.from("complementos_pago")
    .select("id, empresa, numero, factura_numero, receptor_nombre, monto, parcialidad, saldo_anterior, fecha_pago, forma_pago, origen, estatus")
    .order("created_at", { ascending: false })
  return ((data || []) as ComplementoFila[]).map(c => ({ ...c, monto: Number(c.monto), saldo_anterior: Number(c.saldo_anterior) }))
}

// Todos los complementos de pago emitidos desde la app (los automáticos de
// Ingresos y los hechos a mano): PDF/XML, cancelación y alta de uno nuevo.
export function ComplementosPagoModal({
  ambiente,
  onChanged,
  onClose,
}: {
  ambiente: Record<string, "pruebas" | "real" | null>
  onChanged?: () => void
  onClose: () => void
}) {
  const [comps, setComps] = useState<Complemento[]>([])
  const [loading, setLoading] = useState(true)
  const [nuevo, setNuevo] = useState(false)
  const [cancelando, setCancelando] = useState<{ c: Complemento; motivo: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  function cargar() {
    leerComplementos().then(setComps)
  }
  useEffect(() => {
    let vivo = true
    leerComplementos().then(lista => {
      if (!vivo) return
      setComps(lista)
      setLoading(false)
    })
    return () => { vivo = false }
  }, [])

  // La pestaña se abre antes del fetch para que Safari no la bloquee
  async function abrir(id: string, tipo: "pdf" | "xml") {
    const w = window.open("", "_blank")
    try {
      const d = await llamarComplementos({ action: "archivo", id, tipo })
      if (w) w.location.href = d.url
      else window.open(d.url, "_blank")
    } catch (e) {
      w?.close()
      alert("No se pudo abrir el archivo: " + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function confirmarCancelacion() {
    if (!cancelando) return
    setOcupado(true)
    try {
      const d = await llamarComplementos({ action: "cancelar", id: cancelando.c.id, motivo: cancelando.motivo })
      alert(d.pendiente ? d.mensaje : `Complemento ${d.cancelado} cancelado. Su pago ya no cuenta para el saldo de la factura.`)
      setCancelando(null)
      cargar()
      onChanged?.()
    } catch (e) {
      alert("No se pudo cancelar: " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setOcupado(false)
    }
  }

  function onEmitido(d: ComplementoResultado) {
    alert(mensajeComplemento(d))
    setNuevo(false)
    cargar()
    onChanged?.()
  }

  if (nuevo) {
    return <NuevoComplementoModal ambiente={ambiente} onDone={onEmitido} onClose={() => setNuevo(false)} />
  }

  const link: React.CSSProperties = {
    background: "none", border: "none", padding: 0, color: "#a78bfa", fontSize: 12,
    textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer",
  }

  return (
    <div style={fOverlay}>
      <div style={fModal(720)} onClick={e => e.stopPropagation()}>
        <div style={fHeader}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#f8fafc" }}>🧾 Complementos de pago</h2>
          <button onClick={onClose} style={fClose}>✕</button>
        </div>
        <div style={fBody}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <p style={{ ...fNote("#94a3b8"), flex: "1 1 260px" }}>
              Complementos de facturas PPD. Los de Ingresos salen solos al marcar pagada la línea; aquí puedes emitir uno a mano para cualquier factura PPD, con su monto, fecha y forma de pago.
            </p>
            <button onClick={() => setNuevo(true)} style={{ ...fBtnPrimary(), flex: "0 0 auto", padding: "9px 16px" }}>＋ Nuevo complemento</button>
          </div>

          {cancelando && (
            <div style={{ display: "grid", gap: 10, padding: "12px 14px", borderRadius: 12, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(248,113,113,0.25)" }}>
              <span style={{ fontSize: 13, color: "#fca5a5", fontWeight: 600 }}>
                Cancelar ante el SAT el complemento {cancelando.c.numero} · {money(cancelando.c.monto)} de la factura {cancelando.c.factura_numero}
              </span>
              <select value={cancelando.motivo} onChange={e => setCancelando({ ...cancelando, motivo: e.target.value })} style={fInput}>
                {MOTIVOS_CANCELACION.map(m => <option key={m.clave} value={m.clave}>{m.clave} · {m.nombre}</option>)}
              </select>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setCancelando(null)} disabled={ocupado} style={fBtnSmall}>No cancelar</button>
                <button onClick={confirmarCancelacion} disabled={ocupado} style={{ ...fBtnSmall, color: "#f87171", borderColor: "rgba(248,113,113,0.4)" }}>
                  {ocupado ? "Cancelando…" : "Sí, cancelar complemento"}
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <p style={fNote("#94a3b8")}>Cargando…</p>
          ) : comps.length === 0 ? (
            <p style={fNote("#94a3b8")}>Todavía no hay complementos de pago.</p>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {comps.map(c => {
                const cancelado = c.estatus === "cancelada"
                const saldo = Math.max(Math.round((c.saldo_anterior - c.monto) * 100) / 100, 0)
                return (
                  <div key={c.id} style={{
                    display: "grid", gap: 4, padding: "10px 12px", borderRadius: 10,
                    background: "rgba(255,255,255,0.025)", border: "1px solid rgba(148,163,184,0.10)", opacity: cancelado ? 0.55 : 1,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", overflowWrap: "anywhere" }}>
                        <span style={{ fontFamily: "var(--font-mono)", color: "#38bdf8" }}>{c.numero || "—"}</span>
                        {" · "}{EMPRESA_LABEL[c.empresa] || c.empresa} → {c.receptor_nombre || "—"}
                        {cancelado && <span style={{ color: "#f87171", fontWeight: 700 }}> · CANCELADO</span>}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", color: "#f8fafc", fontWeight: 700, fontSize: 13 }}>{money(c.monto)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#7d8ca3", overflowWrap: "anywhere" }}>
                      Factura {c.factura_numero || "—"} · parcialidad {c.parcialidad} · pagado el {fechaCorta(c.fecha_pago)} · {nombreFormaPago(c.forma_pago)}
                      {" · "}saldo después {money(saldo)}
                      {" · "}{c.origen === "manual" ? "hecho a mano" : "al marcar pagado"}
                    </div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 2 }}>
                      <button onClick={() => abrir(c.id, "pdf")} style={link}>PDF</button>
                      <button onClick={() => abrir(c.id, "xml")} style={link}>XML</button>
                      {!cancelado && (
                        <button onClick={() => setCancelando({ c, motivo: "02" })} style={{ ...link, color: "#f87171", marginLeft: "auto" }}>⊘ Cancelar</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
