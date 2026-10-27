"use client"
import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { FORMAS_PAGO, METODOS_PAGO, USOS_CFDI } from "../../lib/sat-catalogos"
import { ReceptorForm } from "./ReceptorForm"
import { FField, FRow, fBtnGhost, fBtnPrimary, fBtnSmall, fInput, fNote, type Emisor, type Receptor } from "./ui"

const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)

export type TimbrarResultado = {
  numeroFactura: string
  total: number
  correo: string | null
  correoFallo: boolean
  pruebas: boolean
  remanente: { proyecto: string; subtotal: number } | null
}

// Campos para timbrar el CFDI de un ingreso desde la app (Facturapi).
export function TimbrarPanel({
  ingreso,
  monto,
  parcialSubtotal,
  parcialSlot,
  ambiente,
  onDone,
  onCancel,
}: {
  ingreso: { id: string; empresa: string; label: string; iva: number; subtotal: number; receptorSugeridoId: string | null; projectId: string | null }
  monto: number                    // subtotal que ampara la factura (sin IVA)
  parcialSubtotal: string | null   // se manda solo si es parcial
  parcialSlot: React.ReactNode
  ambiente: "pruebas" | "real" | null
  onDone: (r: TimbrarResultado) => void
  onCancel: () => void
}) {
  const [receptores, setReceptores] = useState<Receptor[]>([])
  const [emisor, setEmisor] = useState<Emisor | null>(null)
  const [receptorId, setReceptorId] = useState("")
  const [nuevo, setNuevo] = useState(false)
  const [descripcion, setDescripcion] = useState(ingreso.label)
  const [clave, setClave] = useState("")
  const [unidad, setUnidad] = useState("E48")
  const [iva, setIva] = useState(ingreso.subtotal > 0 && ingreso.iva === 0 ? 0 : 0.16)
  const [uso, setUso] = useState("G03")
  const [metodo, setMetodo] = useState<"PUE" | "PPD">("PUE")
  const [forma, setForma] = useState("03")
  const [enviar, setEnviar] = useState(false)
  const [email, setEmail] = useState("")
  const [timbrando, setTimbrando] = useState(false)

  useEffect(() => {
    (async () => {
      const [{ data: rs }, { data: em }] = await Promise.all([
        supabase.from("receptores_fiscales").select("*").order("razon_social"),
        supabase.from("emisores_fiscales").select("*").eq("empresa", ingreso.empresa).maybeSingle(),
      ])
      const lista = (rs || []) as Receptor[]
      setReceptores(lista)
      if (em) {
        setEmisor(em as Emisor)
        if (em.clave_prod_serv) setClave(em.clave_prod_serv)
        if (em.clave_unidad) setUnidad(em.clave_unidad)
      }
      // Sugerencia: el receptor de facturas anteriores del mismo cliente o,
      // si no hay, el ligado al cliente del proyecto.
      let sugerido = ingreso.receptorSugeridoId
      if (!sugerido && ingreso.projectId) {
        const { data: p } = await supabase.from("projects").select("client_id").eq("id", ingreso.projectId).maybeSingle()
        if (p?.client_id) sugerido = lista.find(r => r.client_id === p.client_id)?.id || null
      }
      if (sugerido && lista.some(r => r.id === sugerido)) elegir(sugerido, lista)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingreso.id])

  function elegir(id: string, lista = receptores) {
    setReceptorId(id)
    const r = lista.find(x => x.id === id)
    if (!r) return
    setUso(r.uso_cfdi || "G03")
    setMetodo(r.ultimo_metodo_pago === "PPD" ? "PPD" : "PUE")
    if (r.ultima_forma_pago && r.ultima_forma_pago !== "99") setForma(r.ultima_forma_pago)
    setEmail(r.email || "")
  }

  const receptor = receptores.find(r => r.id === receptorId) || null
  const ivaMonto = Math.round(monto * iva * 100) / 100
  const total = Math.round((monto + ivaMonto) * 100) / 100

  async function timbrar() {
    if (!receptor) { alert("Elige a quién se le factura"); return }
    if (!descripcion.trim()) { alert("Escribe el concepto"); return }
    if (!/^\d{8}$/.test(clave)) { alert("La clave de producto/servicio SAT debe tener 8 dígitos"); return }
    if (enviar && !email.trim()) { alert("Escribe el correo al que se manda la factura"); return }
    const aviso = ambiente === "real" ? "Se timbrará ante el SAT una factura REAL" : "Se timbrará una factura de PRUEBA (no es válida ante el SAT)"
    if (!confirm(`${aviso}:\n\n${receptor.razon_social} (${receptor.rfc})\nTotal ${money(total)} · ${metodo}\n\n¿Continuar?`)) return
    setTimbrando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/ingresos/timbrar", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ingresoId: ingreso.id,
          receptorId: receptor.id,
          descripcion: descripcion.trim(),
          claveProdServ: clave,
          claveUnidad: unidad,
          ivaTasa: iva,
          uso,
          metodoPago: metodo,
          formaPago: forma,
          parcialSubtotal,
          label: ingreso.label,
          email: enviar ? email.trim() : "",
        }),
      })
      const d = await res.json()
      if (!res.ok || d.error) throw new Error(d.error || `Error ${res.status}`)
      onDone(d as TimbrarResultado)
    } catch (e: any) {
      alert("No se pudo timbrar: " + e.message)
    } finally {
      setTimbrando(false)
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {ambiente === null ? (
        <p style={{ ...fNote("#fbbf24"), padding: "8px 10px", borderRadius: 8, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(251,191,36,0.25)" }}>
          Facturapi todavía no está conectado para esta empresa. Puedes llenar los datos, pero el timbrado fallará hasta que se configure la llave.
        </p>
      ) : ambiente === "pruebas" ? (
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
          {receptor && (
            <span style={fNote()}>
              RFC <span style={{ fontFamily: "var(--font-mono)" }}>{receptor.rfc}</span> · Régimen {receptor.regimen_fiscal} · C.P. {receptor.cp}
            </span>
          )}
        </FField>
      )}

      <FField label="Concepto *">
        <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={2} style={{ ...fInput, resize: "vertical", fontFamily: "inherit" }} />
      </FField>

      <FRow>
        <div style={{ flex: "1 1 120px" }}>
          <FField label="Clave prod./serv. SAT *">
            <input value={clave} onChange={e => setClave(e.target.value.replace(/\D/g, ""))} placeholder="8 dígitos" style={fInput} maxLength={8} inputMode="numeric" />
          </FField>
        </div>
        <div style={{ flex: "0 1 90px" }}>
          <FField label="Unidad">
            <input value={unidad} onChange={e => setUnidad(e.target.value.toUpperCase())} style={fInput} />
          </FField>
        </div>
        <div style={{ flex: "0 1 100px" }}>
          <FField label="IVA">
            <select value={iva} onChange={e => setIva(Number(e.target.value))} style={fInput}>
              <option value={0.16}>16%</option>
              <option value={0}>0%</option>
            </select>
          </FField>
        </div>
      </FRow>

      <FRow>
        <div style={{ flex: "1 1 170px" }}>
          <FField label="Método de pago">
            <select value={metodo} onChange={e => setMetodo(e.target.value as "PUE" | "PPD")} style={fInput}>
              {METODOS_PAGO.map(m => <option key={m.clave} value={m.clave}>{m.nombre}</option>)}
            </select>
          </FField>
        </div>
        <div style={{ flex: "1 1 170px" }}>
          <FField label="Forma de pago">
            {metodo === "PPD" ? (
              <input value="99 · Por definir" disabled style={{ ...fInput, opacity: 0.6 }} />
            ) : (
              <select value={forma} onChange={e => setForma(e.target.value)} style={fInput}>
                {FORMAS_PAGO.filter(f => f.clave !== "99").map(f => <option key={f.clave} value={f.clave}>{f.clave} · {f.nombre}</option>)}
              </select>
            )}
          </FField>
        </div>
      </FRow>

      <FField label="Uso de CFDI">
        <select value={uso} onChange={e => setUso(e.target.value)} style={fInput}>
          {USOS_CFDI.map(u => <option key={u.clave} value={u.clave}>{u.clave} · {u.nombre}</option>)}
        </select>
      </FField>

      {parcialSlot}

      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>
        <input type="checkbox" checked={enviar} onChange={e => setEnviar(e.target.checked)} style={{ accentColor: "#7c3aed", width: 15, height: 15 }} />
        Enviar la factura por correo al cliente
      </label>
      {enviar && (
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="facturas@cliente.com" style={fInput} />
      )}

      <div style={{ display: "grid", gap: 4, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(148,163,184,0.10)", fontSize: 12, color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span>Subtotal</span><span style={{ fontFamily: "var(--font-mono)" }}>{money(monto)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span>IVA {iva * 100}%</span><span style={{ fontFamily: "var(--font-mono)" }}>{money(ivaMonto)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#f8fafc", fontWeight: 700, fontSize: 13 }}><span>Total</span><span style={{ fontFamily: "var(--font-mono)" }}>{money(total)}</span></div>
        {emisor?.serie && <div style={{ fontSize: 11, color: "#64748b" }}>Serie {emisor.serie} · el folio lo asigna Facturapi</div>}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button onClick={onCancel} disabled={timbrando} style={fBtnGhost}>Cancelar</button>
        <button onClick={timbrar} disabled={timbrando || nuevo} style={fBtnPrimary(timbrando || nuevo)}>
          {timbrando ? "Timbrando…" : "🧾 Timbrar factura"}
        </button>
      </div>
    </div>
  )
}
