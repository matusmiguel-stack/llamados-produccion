"use client"
import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { REGIMENES_FISCALES } from "../../lib/sat-catalogos"
import { ReceptorForm } from "./ReceptorForm"
import {
  EMPRESA_LABEL, FField, FRow, fBody, fBtnPrimary, fBtnSmall, fClose, fHeader, fInput, fModal, fNote, fOverlay,
  type Emisor, type Receptor,
} from "./ui"

const regimenNombre = (c: string) => REGIMENES_FISCALES.find(r => r.clave === c)?.nombre || c

// Datos fiscales de los clientes (a quién se factura) y de Retro Studio /
// Retro Films (serie, clave SAT y unidad que se usan por omisión al timbrar).
export function DatosFiscalesModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"clientes" | "empresas">("clientes")
  const [receptores, setReceptores] = useState<Receptor[]>([])
  const [emisores, setEmisores] = useState<Emisor[]>([])
  const [loading, setLoading] = useState(true)
  const [buscar, setBuscar] = useState("")
  const [editando, setEditando] = useState<Receptor | "nuevo" | null>(null)
  const [importando, setImportando] = useState(false)
  const [importRes, setImportRes] = useState<string | null>(null)

  async function cargar() {
    const [{ data: rs }, { data: es }] = await Promise.all([
      supabase.from("receptores_fiscales").select("*").order("razon_social"),
      supabase.from("emisores_fiscales").select("*").order("empresa", { ascending: false }),
    ])
    setReceptores((rs || []) as Receptor[])
    setEmisores((es || []) as Emisor[])
    setLoading(false)
  }
  useEffect(() => { cargar() }, [])

  async function importar() {
    setImportando(true)
    setImportRes(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/facturacion/importar", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const d = await res.json()
      if (!res.ok || d.error) throw new Error(d.error || `Error ${res.status}`)
      const partes = [
        `Leí ${d.facturasLeidas} factura${d.facturasLeidas === 1 ? "" : "s"}: ${d.receptoresNuevos} cliente${d.receptoresNuevos === 1 ? "" : "s"} nuevo${d.receptoresNuevos === 1 ? "" : "s"}.`,
      ]
      if (d.incompletos?.length) partes.push(`Sin régimen o C.P. en el XML (captúralos a mano): ${d.incompletos.join(", ")}.`)
      if (d.fallidos) partes.push(`${d.fallidos} XML no se pudieron leer.`)
      setImportRes(partes.join(" "))
      await cargar()
    } catch (e: any) {
      setImportRes("Error: " + e.message)
    } finally {
      setImportando(false)
    }
  }

  const q = buscar.trim().toLowerCase()
  const visibles = receptores.filter(r => !q || r.razon_social.toLowerCase().includes(q) || r.rfc.toLowerCase().includes(q))

  return (
    <div style={fOverlay}>
      <div style={fModal(620)} onClick={e => e.stopPropagation()}>
        <div style={fHeader}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#f8fafc" }}>🧾 Datos fiscales</h2>
          <button onClick={onClose} style={fClose}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 6, padding: "12px 24px 0" }}>
          {(["clientes", "empresas"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              ...fBtnSmall,
              ...(tab === t ? { background: "rgba(124,58,237,0.18)", borderColor: "rgba(167,139,250,0.45)", color: "#c4b5fd" } : {}),
            }}>
              {t === "clientes" ? `Clientes (${receptores.length})` : "Retro Studio / Films"}
            </button>
          ))}
        </div>
        <div style={fBody}>
          {loading ? (
            <p style={fNote("#94a3b8")}>Cargando…</p>
          ) : tab === "clientes" ? (
            <>
              {editando ? (
                <ReceptorForm
                  inicial={editando === "nuevo" ? null : editando}
                  onCancel={() => setEditando(null)}
                  onSaved={() => { setEditando(null); cargar() }}
                />
              ) : (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre o RFC…" style={{ ...fInput, flex: "1 1 200px", width: "auto" }} />
                    <button onClick={() => setEditando("nuevo")} style={fBtnSmall}>＋ Nuevo cliente</button>
                    <button onClick={importar} disabled={importando} style={fBtnSmall} title="Lee los XML de las facturas que ya subiste en Ingresos">
                      {importando ? "Leyendo facturas…" : "⬇ Llenar desde facturas anteriores"}
                    </button>
                  </div>
                  {importRes && <p style={fNote(importRes.startsWith("Error") ? "#f87171" : "#34d399")}>{importRes}</p>}
                  {visibles.length === 0 ? (
                    <p style={fNote("#94a3b8")}>
                      {receptores.length === 0
                        ? "Aún no hay clientes con datos fiscales. Usa “Llenar desde facturas anteriores” para traerlos de las facturas que ya subiste."
                        : "Ningún cliente coincide con la búsqueda."}
                    </p>
                  ) : (
                    <div style={{ display: "grid", gap: 6 }}>
                      {visibles.map(r => (
                        <button key={r.id} onClick={() => setEditando(r)} style={{
                          textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                          background: "rgba(255,255,255,0.025)", border: "1px solid rgba(148,163,184,0.10)", color: "#e2e8f0",
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" }}>{r.razon_social}</div>
                          <div style={{ fontSize: 11, color: "#7d8ca3", marginTop: 3, overflowWrap: "anywhere" }}>
                            <span style={{ fontFamily: "var(--font-mono)" }}>{r.rfc}</span> · {r.regimen_fiscal} {regimenNombre(r.regimen_fiscal)} · C.P. {r.cp}
                            {r.email ? ` · ${r.email}` : ""}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <p style={fNote("#94a3b8")}>
                Valores que se usan por omisión al timbrar. Se llenan solos con “Llenar desde facturas anteriores”; los puedes ajustar aquí.
              </p>
              {emisores.map(em => <EmisorCard key={em.empresa} emisor={em} onSaved={cargar} />)}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function EmisorCard({ emisor, onSaved }: { emisor: Emisor; onSaved: () => void }) {
  const [serie, setSerie] = useState(emisor.serie || "")
  const [clave, setClave] = useState(emisor.clave_prod_serv || "")
  const [unidad, setUnidad] = useState(emisor.clave_unidad || "")
  const [saving, setSaving] = useState(false)

  async function guardar() {
    if (clave && !/^\d{8}$/.test(clave.trim())) { alert("La clave de producto/servicio SAT debe tener 8 dígitos"); return }
    setSaving(true)
    const { error } = await supabase.from("emisores_fiscales").update({
      serie: serie.trim() || null,
      clave_prod_serv: clave.trim() || null,
      clave_unidad: unidad.trim().toUpperCase() || null,
      updated_at: new Date().toISOString(),
    }).eq("empresa", emisor.empresa)
    setSaving(false)
    if (error) { alert(error.message); return }
    onSaved()
  }

  return (
    <div style={{ display: "grid", gap: 10, padding: "14px 16px", borderRadius: 12, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(148,163,184,0.10)" }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc" }}>{EMPRESA_LABEL[emisor.empresa] || emisor.empresa}</div>
        <div style={{ fontSize: 11, color: "#7d8ca3", marginTop: 3 }}>
          {emisor.rfc
            ? <>{emisor.razon_social} · <span style={{ fontFamily: "var(--font-mono)" }}>{emisor.rfc}</span> · Régimen {emisor.regimen_fiscal} · C.P. {emisor.cp}</>
            : "Sin datos todavía (se llenan al leer sus facturas anteriores)"}
        </div>
      </div>
      <FRow>
        <div style={{ flex: "0 1 90px" }}>
          <FField label="Serie">
            <input value={serie} onChange={e => setSerie(e.target.value.toUpperCase())} placeholder="F" style={fInput} />
          </FField>
        </div>
        <div style={{ flex: "1 1 130px" }}>
          <FField label="Clave prod./serv. SAT">
            <input value={clave} onChange={e => setClave(e.target.value.replace(/\D/g, ""))} placeholder="8 dígitos" style={fInput} maxLength={8} inputMode="numeric" />
          </FField>
        </div>
        <div style={{ flex: "0 1 100px" }}>
          <FField label="Unidad SAT">
            <input value={unidad} onChange={e => setUnidad(e.target.value.toUpperCase())} placeholder="E48" style={fInput} />
          </FField>
        </div>
      </FRow>
      <div style={{ display: "flex" }}>
        <button onClick={guardar} disabled={saving} style={{ ...fBtnPrimary(saving), flex: "0 0 auto", padding: "8px 16px" }}>{saving ? "Guardando…" : "Guardar"}</button>
      </div>
    </div>
  )
}
