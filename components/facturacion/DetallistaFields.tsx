"use client"
// Casilla "Complemento Detallista" y sus campos (Liverpool y otras tiendas).
// Se prellena con lo que se usó la última vez con el mismo cliente.
import { FField, FRow, fInput, fNote, type Receptor } from "./ui"

export type DetallistaForm = {
  activo: boolean
  pedido: string
  entrega: string
  glnComprador: string
  glnVendedor: string
  numProveedor: string
}

export const DETALLISTA_VACIO: DetallistaForm = { activo: false, pedido: "", entrega: "", glnComprador: "", glnVendedor: "", numProveedor: "" }

/** Estado inicial al elegir un cliente: lo guardado de ese cliente; el pedido siempre en blanco. */
export function detallistaDeReceptor(r: Receptor | null | undefined): DetallistaForm {
  const g = r?.detallista
  if (!g) return DETALLISTA_VACIO
  return { activo: !!g.activo, pedido: "", entrega: "", glnComprador: g.gln_comprador || "", glnVendedor: g.gln_vendedor || "", numProveedor: g.num_proveedor || "" }
}

/** Lo que se manda a la API (null si no lleva complemento). */
export function detallistaPayload(d: DetallistaForm) {
  if (!d.activo) return null
  return { pedido: d.pedido.trim(), entrega: d.entrega.trim(), glnComprador: d.glnComprador.trim(), glnVendedor: d.glnVendedor.trim(), numProveedor: d.numProveedor.trim() }
}

/** Mensaje de error a mostrar antes de timbrar, o null. */
export function detallistaError(d: DetallistaForm): string | null {
  if (!d.activo) return null
  if (!d.pedido.trim()) return "Complemento Detallista: escribe el número de pedido (orden de compra)"
  if (!/^\d{13}$/.test(d.glnComprador.trim())) return "Complemento Detallista: el GLN del comprador debe tener 13 dígitos"
  if (!/^\d{13}$/.test(d.glnVendedor.trim())) return "Complemento Detallista: el GLN del vendedor debe tener 13 dígitos"
  if (!d.numProveedor.trim()) return "Complemento Detallista: escribe el número de proveedor"
  return null
}

export function DetallistaFields({ value, onChange }: { value: DetallistaForm; onChange: (d: DetallistaForm) => void }) {
  const set = (k: keyof DetallistaForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = k === "glnComprador" || k === "glnVendedor" ? e.target.value.replace(/\D/g, "") : e.target.value
    onChange({ ...value, [k]: v })
  }
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#e2e8f0", fontWeight: 600 }}>
        <input type="checkbox" checked={value.activo} onChange={e => onChange({ ...value, activo: e.target.checked })} style={{ accentColor: "#7c3aed", width: 15, height: 15 }} />
        Complemento Detallista
        <span style={{ fontWeight: 400, color: "#64748b", fontSize: 12 }}>(Liverpool y tiendas departamentales)</span>
      </label>
      {value.activo && (
        <div style={{ display: "grid", gap: 10, padding: "12px 12px", borderRadius: 10, background: "rgba(124,58,237,0.05)", border: "1px solid rgba(167,139,250,0.18)" }}>
          <FRow>
            <div style={{ flex: "1 1 170px" }}>
              <FField label="No. de pedido (orden de compra) *">
                <input value={value.pedido} onChange={set("pedido")} placeholder="7200436486" style={fInput} maxLength={35} />
              </FField>
            </div>
            <div style={{ flex: "1 1 170px" }}>
              <FField label="Folio de entrega / recepción">
                <input value={value.entrega} onChange={set("entrega")} placeholder="Igual al pedido" style={fInput} maxLength={35} />
              </FField>
            </div>
          </FRow>
          <FRow>
            <div style={{ flex: "1 1 140px" }}>
              <FField label="GLN comprador *">
                <input value={value.glnComprador} onChange={set("glnComprador")} placeholder="13 dígitos" style={{ ...fInput, fontFamily: "var(--font-mono)" }} maxLength={13} inputMode="numeric" />
              </FField>
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <FField label="GLN vendedor *">
                <input value={value.glnVendedor} onChange={set("glnVendedor")} placeholder="13 dígitos" style={{ ...fInput, fontFamily: "var(--font-mono)" }} maxLength={13} inputMode="numeric" />
              </FField>
            </div>
            <div style={{ flex: "1 1 110px" }}>
              <FField label="No. de proveedor *">
                <input value={value.numProveedor} onChange={set("numProveedor")} style={{ ...fInput, fontFamily: "var(--font-mono)" }} maxLength={35} />
              </FField>
            </div>
          </FRow>
          <p style={fNote()}>
            El total con letra se agrega solo. Los GLN y el número de proveedor se recuerdan para la próxima factura a este cliente.
          </p>
        </div>
      )}
    </div>
  )
}
