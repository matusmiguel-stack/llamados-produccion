"use client"
// Vista previa del PDF de una factura antes de timbrarla (Facturapi la genera
// sin timbrar ni guardar nada). Se muestra encima del modal de facturación.
import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import { fBtnSmall } from "./ui"

export type VistaPreviaPayload = {
  empresa: string
  receptorId: string
  conceptos: { descripcion: string; claveProdServ: string; claveUnidad: string; subtotal: number }[]
  ivaTasa: number
  uso: string
  metodoPago: "PUE" | "PPD"
  formaPago: string
  detallista: unknown
  sustituyeUuid: string | null
}

export function useVistaPrevia() {
  const [url, setUrl] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  async function abrir(payload: VistaPreviaPayload) {
    setCargando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/facturacion/preview", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let msg = `Error ${res.status}`
        try { const d = await res.json(); if (d?.error) msg = d.error } catch {}
        throw new Error(msg)
      }
      setUrl(URL.createObjectURL(await res.blob()))
    } catch (e) {
      alert("No se pudo generar la vista previa: " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setCargando(false)
    }
  }

  const overlay = url ? (
    <div
      onClick={() => setUrl(null)}
      style={{ position: "fixed", inset: 0, zIndex: 100000, background: "rgba(17,17,17,0.32)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 900, height: "92vh", display: "flex", flexDirection: "column", borderRadius: 14, overflow: "hidden", border: "1px solid rgba(0,0,0,0.13)", background: "#FFFFFF" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid rgba(0,0,0,0.09)", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, color: "#141414", fontSize: 14 }}>Vista previa</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#A86B00", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 6, padding: "2px 7px" }}>
            SIN TIMBRAR · no es válida ante el SAT
          </span>
          <span style={{ flex: 1 }} />
          <a href={url} target="_blank" rel="noreferrer" style={{ ...fBtnSmall, textDecoration: "none" }}>Abrir en otra pestaña</a>
          <button onClick={() => setUrl(null)} style={fBtnSmall}>Cerrar</button>
        </div>
        <iframe src={url} title="Vista previa de la factura" style={{ flex: 1, border: "none", background: "#fff" }} />
      </div>
    </div>
  ) : null

  return { abrir, cargando, overlay }
}
