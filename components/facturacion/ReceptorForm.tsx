"use client"
import { useState } from "react"
import { supabase } from "../../lib/supabase"
import { REGIMENES_FISCALES, RFC_RE, USOS_CFDI } from "../../lib/sat-catalogos"
import { FField, FRow, fBtnGhost, fBtnPrimary, fInput, fNote, type Receptor } from "./ui"

// Alta / edición de los datos fiscales de un cliente (receptor de la factura).
export function ReceptorForm({
  inicial,
  onSaved,
  onCancel,
}: {
  inicial?: Receptor | null
  onSaved: (r: Receptor) => void
  onCancel: () => void
}) {
  const [rfc, setRfc] = useState(inicial?.rfc || "")
  const [razon, setRazon] = useState(inicial?.razon_social || "")
  const [regimen, setRegimen] = useState(inicial?.regimen_fiscal || "601")
  const [cp, setCp] = useState(inicial?.cp || "")
  const [uso, setUso] = useState(inicial?.uso_cfdi || "G03")
  const [email, setEmail] = useState(inicial?.email || "")
  const [saving, setSaving] = useState(false)

  async function guardar() {
    const rfcN = rfc.trim().toUpperCase()
    if (!RFC_RE.test(rfcN)) { alert("El RFC no es válido (12 caracteres para empresas, 13 para personas)"); return }
    if (!razon.trim()) { alert("Escribe la razón social tal como está en su constancia fiscal"); return }
    if (!/^\d{5}$/.test(cp.trim())) { alert("El código postal debe tener 5 dígitos"); return }
    setSaving(true)
    const row = {
      rfc: rfcN,
      // CFDI 4.0: la razón social va sin el régimen societario ("SA de CV")
      razon_social: razon.trim().toUpperCase(),
      regimen_fiscal: regimen,
      cp: cp.trim(),
      uso_cfdi: uso,
      email: email.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const q = inicial
      ? supabase.from("receptores_fiscales").update(row).eq("id", inicial.id).select("*").single()
      : supabase.from("receptores_fiscales").insert(row).select("*").single()
    const { data, error } = await q
    setSaving(false)
    if (error) {
      alert(error.code === "23505" ? "Ya hay un cliente con ese RFC" : error.message)
      return
    }
    onSaved(data as Receptor)
  }

  return (
    <div style={{ display: "grid", gap: 12, padding: "14px 16px", borderRadius: 12, background: "rgba(124,58,237,0.06)", border: "1px solid rgba(167,139,250,0.20)" }}>
      <FRow>
        <div style={{ flex: "1 1 140px" }}>
          <FField label="RFC *">
            <input value={rfc} onChange={e => setRfc(e.target.value.toUpperCase())} placeholder="ABC123456XY9" style={fInput} maxLength={13} />
          </FField>
        </div>
        <div style={{ flex: "0 1 110px" }}>
          <FField label="C.P. fiscal *">
            <input value={cp} onChange={e => setCp(e.target.value.replace(/\D/g, ""))} placeholder="06700" style={fInput} maxLength={5} inputMode="numeric" />
          </FField>
        </div>
      </FRow>
      <FField label="Razón social *">
        <input value={razon} onChange={e => setRazon(e.target.value)} placeholder="Como aparece en su constancia, sin “SA de CV”" style={fInput} />
      </FField>
      <FField label="Régimen fiscal *">
        <select value={regimen} onChange={e => setRegimen(e.target.value)} style={fInput}>
          {REGIMENES_FISCALES.map(r => <option key={r.clave} value={r.clave}>{r.clave} · {r.nombre}</option>)}
        </select>
      </FField>
      <FRow>
        <div style={{ flex: "1 1 160px" }}>
          <FField label="Uso de CFDI">
            <select value={uso} onChange={e => setUso(e.target.value)} style={fInput}>
              {USOS_CFDI.map(u => <option key={u.clave} value={u.clave}>{u.clave} · {u.nombre}</option>)}
            </select>
          </FField>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <FField label="Correo para facturas">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="facturas@cliente.com" style={fInput} />
          </FField>
        </div>
      </FRow>
      <p style={fNote()}>Copia los datos de la constancia de situación fiscal del cliente; si no coinciden, el SAT rechaza la factura.</p>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onCancel} disabled={saving} style={fBtnGhost}>Cancelar</button>
        <button onClick={guardar} disabled={saving} style={fBtnPrimary(saving)}>{saving ? "Guardando…" : "Guardar datos"}</button>
      </div>
    </div>
  )
}
