"use client"
import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { FORMAS_PAGO, USOS_CFDI } from "../../lib/sat-catalogos"
import { ReceptorForm } from "./ReceptorForm"
import {
  EMPRESA_LABEL, FField, FRow, fBody, fBtnGhost, fBtnPrimary, fBtnSmall, fClose, fHeader, fInput, fModal, fNote, fOverlay,
  type Emisor, type Receptor,
} from "./ui"

const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
const r2 = (n: number) => Math.round(n * 100) / 100

type Concepto = { key: number; descripcion: string; clave: string; unidad: string; subtotal: string }

export type NuevaFacturaResultado = {
  numeroFactura: string
  total: number
  correo: string | null
  correoFallo: boolean
  pruebas: boolean
}

// Factura "desde cero" (independiente): se captura concepto por concepto y NO
// entra al control de ingresos — casi siempre son préstamos entre Retro
// Studio y Retro Films. Solo PUE: estas facturas no llevan complemento.
export function NuevaFacturaModal({
  empresaInicial,
  ambiente,
  onDone,
  onClose,
}: {
  empresaInicial: string
  ambiente: Record<string, "pruebas" | "real" | null>
  onDone: (r: NuevaFacturaResultado) => void
  onClose: () => void
}) {
  const [empresa, setEmpresa] = useState(empresaInicial)
  const [emisores, setEmisores] = useState<Emisor[]>([])
  const [receptores, setReceptores] = useState<Receptor[]>([])
  const [receptorId, setReceptorId] = useState("")
  const [nuevo, setNuevo] = useState(false)
  const [conceptos, setConceptos] = useState<Concepto[]>([{ key: 1, descripcion: "", clave: "", unidad: "E48", subtotal: "" }])
  const [iva, setIva] = useState(0.16)
  const [uso, setUso] = useState("G03")
  const [forma, setForma] = useState("03")
  const [notas, setNotas] = useState("")
  const [enviar, setEnviar] = useState(false)
  const [email, setEmail] = useState("")
  const [timbrando, setTimbrando] = useState(false)

  useEffect(() => {
    (async () => {
      const [{ data: rs }, { data: es }] = await Promise.all([
        supabase.from("receptores_fiscales").select("*").order("razon_social"),
        supabase.from("emisores_fiscales").select("*"),
      ])
      setReceptores((rs || []) as Receptor[])
      setEmisores((es || []) as Emisor[])
      aplicarDefaults(empresaInicial, (es || []) as Emisor[])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Clave SAT y unidad por omisión de la empresa que factura: se aplican a
  // los conceptos que siguen vacíos o con la clave de la otra empresa.
  function aplicarDefaults(emp: string, lista = emisores) {
    const em = lista.find(e => e.empresa === emp)
    if (!em) return
    const otras = lista.filter(e => e.empresa !== emp)
    setConceptos(cs => cs.map(c => ({
      ...c,
      clave: !c.clave || otras.some(o => o.clave_prod_serv === c.clave) ? (em.clave_prod_serv || c.clave) : c.clave,
      unidad: !c.unidad || otras.some(o => o.clave_unidad === c.unidad) ? (em.clave_unidad || c.unidad) : c.unidad,
    })))
  }
  function cambiarEmpresa(emp: string) {
    setEmpresa(emp)
    aplicarDefaults(emp)
  }
  const emisor = emisores.find(e => e.empresa === empresa) || null

  function elegir(id: string, lista = receptores) {
    setReceptorId(id)
    const r = lista.find(x => x.id === id)
    if (!r) return
    setUso(r.uso_cfdi || "G03")
    if (r.ultima_forma_pago && r.ultima_forma_pago !== "99") setForma(r.ultima_forma_pago)
    setEmail(r.email || "")
  }

  // Préstamos entre empresas: la otra empresa como receptor, con sus datos
  // fiscales (se da de alta como cliente si todavía no existe).
  const otra = emisores.find(e => e.empresa !== empresa && e.rfc) || null
  async function facturarAOtra() {
    if (!otra?.rfc) return
    const existente = receptores.find(r => r.rfc === otra.rfc)
    if (existente) { elegir(existente.id); return }
    if (!otra.razon_social || !otra.regimen_fiscal || !otra.cp) {
      alert(`Faltan datos fiscales de ${EMPRESA_LABEL[otra.empresa]}; captúrala con ＋ Nuevo`)
      return
    }
    const { data, error } = await supabase.from("receptores_fiscales").insert({
      rfc: otra.rfc, razon_social: otra.razon_social, regimen_fiscal: otra.regimen_fiscal, cp: otra.cp, uso_cfdi: "G03",
    }).select("*").single()
    if (error || !data) { alert(error?.message || "No se pudo dar de alta"); return }
    const lista = [...receptores, data as Receptor].sort((a, b) => a.razon_social.localeCompare(b.razon_social))
    setReceptores(lista)
    elegir(data.id, lista)
  }

  function cambiar(key: number, campo: keyof Concepto, valor: string) {
    setConceptos(cs => cs.map(c => (c.key === key ? { ...c, [campo]: valor } : c)))
  }
  function agregar() {
    setConceptos(cs => [...cs, {
      key: Math.max(...cs.map(c => c.key)) + 1,
      descripcion: "",
      clave: cs[cs.length - 1]?.clave || emisor?.clave_prod_serv || "",
      unidad: cs[cs.length - 1]?.unidad || emisor?.clave_unidad || "E48",
      subtotal: "",
    }])
  }
  function quitar(key: number) {
    setConceptos(cs => (cs.length > 1 ? cs.filter(c => c.key !== key) : cs))
  }

  const receptor = receptores.find(r => r.id === receptorId) || null
  const subtotal = r2(conceptos.reduce((s, c) => s + (parseFloat(c.subtotal) || 0), 0))
  const ivaMonto = r2(conceptos.reduce((s, c) => s + r2((parseFloat(c.subtotal) || 0) * iva), 0))
  const total = r2(subtotal + ivaMonto)
  const amb = ambiente[empresa] ?? null

  async function timbrar() {
    if (!receptor) { alert("Elige a quién se le factura"); return }
    for (const [i, c] of conceptos.entries()) {
      if (!c.descripcion.trim()) { alert(`Concepto ${i + 1}: escribe la descripción`); return }
      if (!/^\d{8}$/.test(c.clave)) { alert(`Concepto ${i + 1}: la clave SAT debe tener 8 dígitos`); return }
      if (!((parseFloat(c.subtotal) || 0) > 0)) { alert(`Concepto ${i + 1}: escribe el subtotal`); return }
    }
    if (enviar && !email.trim()) { alert("Escribe el correo al que se manda la factura"); return }
    const aviso = amb === "real" ? "Se timbrará ante el SAT una factura REAL" : "Se timbrará una factura de PRUEBA (no es válida ante el SAT)"
    const resumen = `${EMPRESA_LABEL[empresa]} → ${receptor.razon_social} (${receptor.rfc})\n${conceptos.length} concepto${conceptos.length === 1 ? "" : "s"} · Total ${money(total)} · PUE`
    if (!confirm(`${aviso}:\n\n${resumen}\n\n¿Continuar?`)) return
    setTimbrando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/facturacion/nueva", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa,
          receptorId: receptor.id,
          conceptos: conceptos.map(c => ({ descripcion: c.descripcion.trim(), claveProdServ: c.clave, claveUnidad: c.unidad, subtotal: parseFloat(c.subtotal) })),
          ivaTasa: iva,
          uso,
          formaPago: forma,
          notas: notas.trim(),
          email: enviar ? email.trim() : "",
        }),
      })
      const d = await res.json()
      if (!res.ok || d.error) throw new Error(d.error || `Error ${res.status}`)
      onDone(d as NuevaFacturaResultado)
    } catch (e: any) {
      alert("No se pudo timbrar: " + e.message)
    } finally {
      setTimbrando(false)
    }
  }

  return (
    <div style={fOverlay}>
      <div style={fModal(720)} onClick={e => e.stopPropagation()}>
        <div style={fHeader}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#f8fafc" }}>🧾 Nueva factura</h2>
          <button onClick={onClose} disabled={timbrando} style={fClose}>✕</button>
        </div>
        <div style={fBody}>
          {/* ── Quién factura ── */}
          <div style={{ display: "flex", gap: 6 }}>
            {["retro_studio", "retro_films"].map(e => (
              <button key={e} onClick={() => cambiarEmpresa(e)} style={{
                ...fBtnSmall,
                ...(empresa === e ? { background: "rgba(124,58,237,0.18)", borderColor: "rgba(167,139,250,0.45)", color: "#c4b5fd" } : {}),
              }}>
                {EMPRESA_LABEL[e]}
              </button>
            ))}
          </div>
          {amb === null ? (
            <p style={{ ...fNote("#fbbf24"), padding: "8px 10px", borderRadius: 8, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}>
              Facturapi todavía no está conectado para {EMPRESA_LABEL[empresa]}; el timbrado fallará hasta que se configure la llave.
            </p>
          ) : amb === "pruebas" ? (
            <p style={{ ...fNote("#38bdf8"), padding: "8px 10px", borderRadius: 8, background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.25)" }}>
              Modo pruebas: la factura se genera pero no es válida ante el SAT.
            </p>
          ) : null}

          {/* ── Cliente (receptor) ── */}
          {nuevo ? (
            <ReceptorForm
              onCancel={() => setNuevo(false)}
              onSaved={r => {
                const lista = [...receptores, r].sort((a, b) => a.razon_social.localeCompare(b.razon_social))
                setReceptores(lista)
                setNuevo(false)
                elegir(r.id, lista)
              }}
            />
          ) : (
            <FField label="Facturar a *">
              <div style={{ display: "flex", gap: 8 }}>
                <select value={receptorId} onChange={e => elegir(e.target.value)} style={{ ...fInput, flex: 1, minWidth: 0 }}>
                  <option value="">Elige el cliente…</option>
                  {receptores.map(r => <option key={r.id} value={r.id}>{r.razon_social} · {r.rfc}</option>)}
                </select>
                <button onClick={() => setNuevo(true)} style={fBtnSmall} title="Capturar datos fiscales de un cliente nuevo">＋ Nuevo</button>
              </div>
              {otra && receptor?.rfc !== otra.rfc && (
                <div>
                  <button onClick={facturarAOtra} style={fBtnSmall}>↔ Facturar a {EMPRESA_LABEL[otra.empresa]}</button>
                </div>
              )}
              {receptor && (
                <span style={fNote()}>
                  RFC <span style={{ fontFamily: "var(--font-mono)" }}>{receptor.rfc}</span> · Régimen {receptor.regimen_fiscal} · C.P. {receptor.cp}
                </span>
              )}
            </FField>
          )}

          {/* ── Conceptos ── */}
          <div style={{ display: "grid", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#7d8ca3" }}>Conceptos *</span>
            {conceptos.map((c, i) => (
              <div key={c.key} style={{ display: "grid", gap: 8, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(148,163,184,0.10)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 11, color: "#64748b", fontFamily: "var(--font-mono)", paddingTop: 9, minWidth: 14 }}>{i + 1}</span>
                  <textarea
                    value={c.descripcion}
                    onChange={e => cambiar(c.key, "descripcion", e.target.value)}
                    rows={2}
                    placeholder="Descripción del concepto"
                    style={{ ...fInput, resize: "vertical", fontFamily: "inherit", flex: 1 }}
                  />
                  {conceptos.length > 1 && (
                    <button onClick={() => quitar(c.key)} style={{ ...fClose, color: "#f87171", paddingTop: 8 }} title="Quitar concepto">✕</button>
                  )}
                </div>
                <FRow>
                  <div style={{ flex: "1 1 120px" }}>
                    <FField label="Clave SAT">
                      <input value={c.clave} onChange={e => cambiar(c.key, "clave", e.target.value.replace(/\D/g, ""))} placeholder="8 dígitos" style={fInput} maxLength={8} inputMode="numeric" />
                    </FField>
                  </div>
                  <div style={{ flex: "0 1 80px" }}>
                    <FField label="Unidad">
                      <input value={c.unidad} onChange={e => cambiar(c.key, "unidad", e.target.value.toUpperCase())} style={fInput} />
                    </FField>
                  </div>
                  <div style={{ flex: "1 1 140px" }}>
                    <FField label="Subtotal (sin IVA)">
                      <input
                        value={c.subtotal}
                        onChange={e => cambiar(c.key, "subtotal", e.target.value.replace(/[^\d.]/g, ""))}
                        placeholder="0.00"
                        inputMode="decimal"
                        style={{ ...fInput, textAlign: "right", fontFamily: "var(--font-mono)" }}
                      />
                    </FField>
                  </div>
                </FRow>
              </div>
            ))}
            <div>
              <button onClick={agregar} style={fBtnSmall}>＋ Agregar concepto</button>
            </div>
          </div>

          <FRow>
            <div style={{ flex: "0 1 100px" }}>
              <FField label="IVA">
                <select value={iva} onChange={e => setIva(Number(e.target.value))} style={fInput}>
                  <option value={0.16}>16%</option>
                  <option value={0}>0%</option>
                </select>
              </FField>
            </div>
            <div style={{ flex: "1 1 220px" }}>
              <FField label="Forma de pago (PUE)">
                <select value={forma} onChange={e => setForma(e.target.value)} style={fInput}>
                  {FORMAS_PAGO.filter(f => f.clave !== "99").map(f => <option key={f.clave} value={f.clave}>{f.clave} · {f.nombre}</option>)}
                </select>
              </FField>
            </div>
          </FRow>

          <FField label="Uso de CFDI">
            <select value={uso} onChange={e => setUso(e.target.value)} style={fInput}>
              {USOS_CFDI.map(u => <option key={u.clave} value={u.clave}>{u.clave} · {u.nombre}</option>)}
            </select>
          </FField>

          <FField label="Nota interna (opcional)">
            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="ej. Préstamo de Retro Studio a Retro Films" style={fInput} />
          </FField>
          <p style={fNote("#94a3b8")}>Esta factura no se suma al control de ingresos; queda en la lista de facturas independientes.</p>

          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>
            <input type="checkbox" checked={enviar} onChange={e => setEnviar(e.target.checked)} style={{ accentColor: "#7c3aed", width: 15, height: 15 }} />
            Enviar la factura por correo al cliente
          </label>
          {enviar && (
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="facturas@cliente.com" style={fInput} />
          )}

          <div style={{ display: "grid", gap: 4, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(148,163,184,0.10)", fontSize: 12, color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Subtotal</span><span style={{ fontFamily: "var(--font-mono)" }}>{money(subtotal)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>IVA {iva * 100}%</span><span style={{ fontFamily: "var(--font-mono)" }}>{money(ivaMonto)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#f8fafc", fontWeight: 700, fontSize: 13 }}><span>Total</span><span style={{ fontFamily: "var(--font-mono)" }}>{money(total)}</span></div>
            {emisor?.serie && <div style={{ fontSize: 11, color: "#64748b" }}>Serie {emisor.serie} · el folio lo asigna Facturapi</div>}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button onClick={onClose} disabled={timbrando} style={fBtnGhost}>Cancelar</button>
            <button onClick={timbrar} disabled={timbrando || nuevo} style={fBtnPrimary(timbrando || nuevo)}>
              {timbrando ? "Timbrando…" : "🧾 Timbrar factura"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
