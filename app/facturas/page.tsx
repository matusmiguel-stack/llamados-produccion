"use client"

import { useEffect, useState } from "react"

type Result =
  | { status: "aceptada"; fechaPago: string; subtotal: string }
  | { status: "rechazada"; motivo: string }

export default function FacturasPage() {
  const [open, setOpen] = useState<boolean | null>(null)
  const [email, setEmail] = useState("")
  const [codigo, setCodigo] = useState("")
  const [xmlFile, setXmlFile] = useState<File | null>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    fetch("/api/facturas/submit")
      .then((r) => r.json())
      .then((d) => setOpen(!!d.open))
      .catch(() => setOpen(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !codigo.trim() || !xmlFile || !pdfFile) {
      setErrorMsg("Completa tu email, el código de proyecto y adjunta el XML y el PDF de tu factura.")
      return
    }
    setErrorMsg("")
    setSending(true)
    setResult(null)
    try {
      const form = new FormData()
      form.append("email", email.trim())
      form.append("codigo", codigo.trim())
      form.append("xml", xmlFile)
      form.append("pdf", pdfFile)

      const res = await fetch("/api/facturas/submit", { method: "POST", body: form })
      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || "Error al procesar la factura.")
        return
      }
      if (data.status === "aceptada") {
        setResult({ status: "aceptada", fechaPago: data.fechaPago, subtotal: data.subtotal })
      } else {
        setResult({ status: "rechazada", motivo: data.motivo })
      }
    } catch (err: any) {
      setErrorMsg("Error de conexión: " + err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#737373" }}>
            Retro Casa Productora
          </p>
          <h1 style={{ margin: "8px 0 0", fontSize: 24, fontWeight: 700, color: "#1A1A1A" }}>
            Recepción de Facturas
          </h1>
        </div>

        {open === null ? (
          <p style={{ color: "#737373", textAlign: "center", padding: "32px 0" }}>Cargando...</p>
        ) : !open ? (
          /* ── Cerrado ── */
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <p style={{ fontSize: 44, margin: 0 }}>🗓️</p>
            <p style={{ color: "#262626", fontSize: 17, fontWeight: 600, margin: "16px 0 8px" }}>
              La recepción de facturas está cerrada
            </p>
            <p style={{ color: "#6B6B6B", fontSize: 14, lineHeight: 1.7, margin: 0 }}>
              Las facturas solo se reciben los <strong style={{ color: "#0E7490" }}>jueves de 10:00 a 19:00 hrs</strong> (hora de la Ciudad de México).
              <br />
              Vuelve en ese horario para subir tu factura.
            </p>
          </div>
        ) : result?.status === "aceptada" ? (
          /* ── Aceptada ── */
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <p style={{ fontSize: 44, margin: 0 }}>✅</p>
            <p style={{ color: "#1F8A55", fontSize: 18, fontWeight: 700, margin: "16px 0 8px" }}>
              Factura recibida correctamente
            </p>
            <p style={{ color: "#6B6B6B", fontSize: 14, lineHeight: 1.7 }}>
              Subtotal: <strong style={{ color: "#262626" }}>{result.subtotal}</strong>
            </p>
            <div style={{ marginTop: 16, padding: "16px 20px", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 12 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#1F8A55" }}>
                Fecha estimada de pago
              </p>
              <p style={{ margin: "6px 0 0", fontSize: 16, fontWeight: 700, color: "#1F7A4D" }}>{result.fechaPago}</p>
            </div>
            <p style={{ color: "#737373", fontSize: 13, marginTop: 20 }}>
              Te enviamos la confirmación por correo.
            </p>
          </div>
        ) : result?.status === "rechazada" ? (
          /* ── Rechazada ── */
          <div style={{ padding: "8px 0" }}>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 44, margin: 0 }}>❌</p>
              <p style={{ color: "#C2362B", fontSize: 18, fontWeight: 700, margin: "16px 0 16px" }}>
                Factura rechazada
              </p>
            </div>
            <div style={{ padding: "16px 20px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 12 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#C2362B" }}>
                Motivo
              </p>
              <p style={{ margin: "8px 0 0", fontSize: 14, color: "#B42318", lineHeight: 1.7 }}>{result.motivo}</p>
            </div>
            <p style={{ color: "#737373", fontSize: 13, marginTop: 20, textAlign: "center" }}>
              También te enviamos el detalle por correo. Corrige tu factura y vuelve a intentarlo.
            </p>
            <button onClick={() => { setResult(null); setXmlFile(null); setPdfFile(null) }} style={secondaryBtnStyle}>
              Subir otra factura
            </button>
          </div>
        ) : (
          /* ── Formulario ── */
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#6B6B6B", lineHeight: 1.7 }}>
              Hoy es día de recepción. Sube el <strong style={{ color: "#262626" }}>XML de tu CFDI</strong> y
              el sistema validará tu factura automáticamente contra el proyecto.
            </p>

            <div>
              <label style={labelStyle}>Email registrado como proveedor</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Código de proyecto</label>
              <input
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ej. RS3000"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Factura XML (CFDI) *</label>
              <input
                type="file"
                accept=".xml,text/xml"
                onChange={(e) => setXmlFile(e.target.files?.[0] || null)}
                style={fileStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>PDF de la factura *</label>
              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                style={fileStyle}
              />
            </div>

            {errorMsg && (
              <p style={{ margin: 0, padding: "10px 14px", background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, color: "#B42318", fontSize: 13, lineHeight: 1.6 }}>
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={sending}
              style={{
                ...primaryBtnStyle,
                opacity: sending ? 0.6 : 1,
                cursor: sending ? "not-allowed" : "pointer",
              }}
            >
              {sending ? "Validando factura..." : "Enviar factura"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#FFFFFF",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px 16px",
}

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 460,
  background: "#FFFFFF",
  border: "1px solid rgba(0,0,0,0.1)",
  borderRadius: 18,
  padding: "32px 28px",
  boxShadow: "0 24px 64px rgba(0,0,0,0.11)",
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "#737373",
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 13px",
  background: "#FFFFFF",
  border: "1px solid rgba(0,0,0,0.14)",
  borderRadius: 10,
  color: "#262626",
  fontSize: 14,
  boxSizing: "border-box",
  outline: "none",
}

const fileStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  background: "#FFFFFF",
  border: "1px dashed rgba(0,0,0,0.2)",
  borderRadius: 10,
  color: "#6B6B6B",
  fontSize: 13,
  boxSizing: "border-box",
}

const primaryBtnStyle: React.CSSProperties = {
  padding: "13px 18px",
  borderRadius: 10,
  border: "1px solid rgba(6,182,212,0.40)",
  background: "rgba(6,182,212,0.16)",
  color: "#0E7490",
  fontSize: 14,
  fontWeight: 700,
}

const secondaryBtnStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 18,
  padding: "11px 16px",
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.17)",
  background: "transparent",
  color: "#6B6B6B",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
}
