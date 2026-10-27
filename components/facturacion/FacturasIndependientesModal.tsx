"use client"
import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { MOTIVOS_CANCELACION } from "../../lib/sat-catalogos"
import { NuevaFacturaModal, type NuevaFacturaResultado } from "./NuevaFacturaModal"
import { EMPRESA_LABEL, fBody, fBtnPrimary, fBtnSmall, fClose, fHeader, fInput, fModal, fNote, fOverlay } from "./ui"

const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)

type FacturaIndependiente = {
  id: string
  empresa: string
  receptor_rfc: string
  receptor_nombre: string
  conceptos: { descripcion: string; subtotal: number }[]
  subtotal: number
  iva: number
  total: number
  notas: string | null
  numero: string | null
  estatus: "vigente" | "cancelada"
  created_at: string
}

async function llamar(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch("/api/facturacion/independientes", {
    method: "POST",
    headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const d = await res.json()
  if (!res.ok || d.error) throw new Error(d.error || `Error ${res.status}`)
  return d
}

// Facturas timbradas "desde cero" que no forman parte del control de ingresos
// (préstamos entre empresas, etc.): lista, PDF/XML, cancelación y alta.
export function FacturasIndependientesModal({
  empresaInicial,
  ambiente,
  onClose,
}: {
  empresaInicial: string
  ambiente: Record<string, "pruebas" | "real" | null>
  onClose: () => void
}) {
  const [facturas, setFacturas] = useState<FacturaIndependiente[]>([])
  const [loading, setLoading] = useState(true)
  const [nueva, setNueva] = useState(false)
  const [cancelando, setCancelando] = useState<{ f: FacturaIndependiente; motivo: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  async function cargar() {
    const { data } = await supabase.from("facturas_independientes")
      .select("id, empresa, receptor_rfc, receptor_nombre, conceptos, subtotal, iva, total, notas, numero, estatus, created_at")
      .order("created_at", { ascending: false })
    setFacturas(((data || []) as any[]).map(f => ({ ...f, subtotal: Number(f.subtotal), iva: Number(f.iva), total: Number(f.total) })))
    setLoading(false)
  }
  useEffect(() => { cargar() }, [])

  // La pestaña se abre antes del fetch para que Safari no la bloquee
  async function abrir(id: string, tipo: "pdf" | "xml") {
    const w = window.open("", "_blank")
    try {
      const d = await llamar({ action: "archivo", id, tipo })
      if (w) w.location.href = d.url
      else window.open(d.url, "_blank")
    } catch (e: any) {
      w?.close()
      alert("No se pudo abrir el archivo: " + e.message)
    }
  }

  async function confirmarCancelacion() {
    if (!cancelando) return
    setOcupado(true)
    try {
      const d = await llamar({ action: "cancelar", id: cancelando.f.id, motivo: cancelando.motivo })
      alert(d.pendiente ? d.mensaje : `Factura ${d.cancelada} cancelada.`)
      setCancelando(null)
      cargar()
    } catch (e: any) {
      alert("No se pudo cancelar: " + e.message)
    } finally {
      setOcupado(false)
    }
  }

  function onTimbrada(d: NuevaFacturaResultado) {
    const partes = [`Factura ${d.numeroFactura} timbrada por ${money(d.total)}${d.pruebas ? " (modo pruebas)" : ""}.`]
    if (d.correo) partes.push(`Se envió a ${d.correo}.`)
    if (d.correoFallo) partes.push("No se pudo enviar el correo; descárgala y mándala a mano.")
    alert(partes.join("\n"))
    setNueva(false)
    cargar()
  }

  if (nueva) {
    return <NuevaFacturaModal empresaInicial={empresaInicial} ambiente={ambiente} onDone={onTimbrada} onClose={() => setNueva(false)} />
  }

  const link: React.CSSProperties = {
    background: "none", border: "none", padding: 0, color: "#a78bfa", fontSize: 12,
    textDecoration: "underline", textUnderlineOffset: 2, cursor: "pointer",
  }

  return (
    <div style={fOverlay}>
      <div style={fModal(720)} onClick={e => e.stopPropagation()}>
        <div style={fHeader}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#f8fafc" }}>🧾 Facturas independientes</h2>
          <button onClick={onClose} style={fClose}>✕</button>
        </div>
        <div style={fBody}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <p style={{ ...fNote("#94a3b8"), flex: "1 1 260px" }}>
              Facturas que no están en el control de ingresos (como préstamos entre Retro Studio y Retro Films). No suman a los totales de Ingresos.
            </p>
            <button onClick={() => setNueva(true)} style={{ ...fBtnPrimary(), flex: "0 0 auto", padding: "9px 16px" }}>＋ Nueva factura</button>
          </div>

          {cancelando && (
            <div style={{ display: "grid", gap: 10, padding: "12px 14px", borderRadius: 12, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(248,113,113,0.25)" }}>
              <span style={{ fontSize: 13, color: "#fca5a5", fontWeight: 600 }}>
                Cancelar ante el SAT la factura {cancelando.f.numero} · {money(cancelando.f.total)}
              </span>
              <select value={cancelando.motivo} onChange={e => setCancelando({ ...cancelando, motivo: e.target.value })} style={fInput}>
                {MOTIVOS_CANCELACION.map(m => <option key={m.clave} value={m.clave}>{m.clave} · {m.nombre}</option>)}
              </select>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setCancelando(null)} disabled={ocupado} style={fBtnSmall}>No cancelar</button>
                <button onClick={confirmarCancelacion} disabled={ocupado} style={{ ...fBtnSmall, color: "#f87171", borderColor: "rgba(248,113,113,0.4)" }}>
                  {ocupado ? "Cancelando…" : "Sí, cancelar factura"}
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <p style={fNote("#94a3b8")}>Cargando…</p>
          ) : facturas.length === 0 ? (
            <p style={fNote("#94a3b8")}>Todavía no hay facturas independientes.</p>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {facturas.map(f => {
                const cancelada = f.estatus === "cancelada"
                return (
                  <div key={f.id} style={{
                    display: "grid", gap: 4, padding: "10px 12px", borderRadius: 10,
                    background: "rgba(255,255,255,0.025)", border: "1px solid rgba(148,163,184,0.10)", opacity: cancelada ? 0.55 : 1,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", overflowWrap: "anywhere" }}>
                        <span style={{ fontFamily: "var(--font-mono)", color: "#a78bfa" }}>{f.numero || "—"}</span>
                        {" · "}{EMPRESA_LABEL[f.empresa] || f.empresa} → {f.receptor_nombre}
                        {cancelada && <span style={{ color: "#f87171", fontWeight: 700 }}> · CANCELADA</span>}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", color: "#f8fafc", fontWeight: 700, fontSize: 13 }}>{money(f.total)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#7d8ca3", overflowWrap: "anywhere" }}>
                      {new Date(f.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                      {" · "}{f.conceptos.length === 1 ? f.conceptos[0].descripcion : `${f.conceptos.length} conceptos`}
                      {f.notas ? ` · ${f.notas}` : ""}
                    </div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 2 }}>
                      <button onClick={() => abrir(f.id, "pdf")} style={link}>PDF</button>
                      <button onClick={() => abrir(f.id, "xml")} style={link}>XML</button>
                      {!cancelada && (
                        <button onClick={() => setCancelando({ f, motivo: "02" })} style={{ ...link, color: "#f87171", marginLeft: "auto" }}>⊘ Cancelar</button>
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
