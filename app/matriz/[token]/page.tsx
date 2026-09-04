"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Image from "next/image"
import { SECCIONES_MATRIZ, partirEnLigas } from "../../../lib/matriz-campos"

// Vista pública de una matriz. A propósito NO llama a requireSessionProfile:
// es la única página que se abre sin usuario. Todo lo que muestra viene de
// /api/matriz-publica/[token], que valida el token y devuelve solo esa matriz.

function Valor({ texto }: { texto: string }) {
  if (!texto || !texto.trim()) return <span style={{ color: "#64748b" }}>—</span>
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {texto.split("\n").map((linea, i) =>
        linea.trim() === "" ? (
          <span key={i} style={{ height: 6 }} />
        ) : (
          <span key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {partirEnLigas(linea).map((t, j) =>
              t.esLiga ? (
                <a key={j} href={t.texto} target="_blank" rel="noreferrer noopener"
                   style={{ color: "#60a5fa", textDecoration: "underline", wordBreak: "break-all" }}>
                  {t.texto}
                </a>
              ) : (
                <span key={j}>{t.texto}</span>
              )
            )}
          </span>
        )
      )}
    </div>
  )
}

export default function MatrizPublicaPage() {
  const { token } = useParams() as { token: string }
  const [data, setData]   = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768) }
    check(); window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const res = await fetch(`/api/matriz-publica/${token}`)
        const json = await res.json().catch(() => ({}))
        if (cancel) return
        if (!res.ok) { setError(json.error || "Esta liga ya no está disponible"); return }
        setData(json)
      } catch {
        if (!cancel) setError("No se pudo cargar la matriz. Revisa tu conexión e intenta de nuevo.")
      }
    })()
    return () => { cancel = true }
  }, [token])

  if (error) {
    return (
      <div style={centradoStyle}>
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <p style={{ margin: 0, fontSize: 17, color: "#f8fafc", fontWeight: 600 }}>{error}</p>
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "#7d8ca3", lineHeight: 1.6 }}>
            Pide una liga nueva a tu contacto en Retro.
          </p>
        </div>
      </div>
    )
  }

  if (!data) {
    return <div style={centradoStyle}><p style={{ color: "#7d8ca3", fontSize: 14 }}>Cargando matriz…</p></div>
  }

  const m = data.matriz as Record<string, string>

  return (
    <div style={{ minHeight: "100vh", padding: isMobile ? "28px 14px 60px" : "48px 24px 80px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>

        <header style={{ marginBottom: 26 }}>
          <Image src="/logo-retro.png" alt="Retro Casa Productora" width={104} height={37} style={{ height: "auto" }} priority />
          <h1 style={{ margin: "18px 0 0", fontSize: isMobile ? 23 : 30, color: "#f8fafc", lineHeight: 1.15 }}>
            {m.nombre || "Matriz de proyecto"}
          </h1>
          {(data.proyecto || data.cliente) && (
            <p style={{ margin: "8px 0 0", color: "#94a3b8", fontSize: 14 }}>
              {[data.proyecto, data.cliente].filter(Boolean).join(" · ")}
            </p>
          )}
          <p style={{ margin: "14px 0 0", color: "#7d8ca3", fontSize: 12 }}>
            Vista de solo lectura · se actualiza sola cuando el equipo edita la matriz
          </p>
        </header>

        <div style={docStyle}>
          {SECCIONES_MATRIZ.map((sec) => (
            <div key={sec.titulo}>
              <div style={seccionStyle}>
                {sec.titulo.toUpperCase()}
                {sec.nota && (
                  <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 400, opacity: 0.65, textTransform: "none", letterSpacing: 0 }}>
                    {sec.nota}
                  </span>
                )}
              </div>
              {sec.campos.map((c) => (
                <div key={c.key} style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "190px 1fr",
                  borderBottom: "1px solid rgba(148,163,184,0.08)",
                }}>
                  <div style={etiquetaStyle(isMobile)}>{c.label}</div>
                  <div style={{ padding: "12px 16px", color: "#e2e8f0", fontSize: 13, lineHeight: 1.5 }}>
                    <Valor texto={m[c.key] || ""} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        <p style={{ margin: "22px 0 0", color: "#64748b", fontSize: 11, textAlign: "center" }}>
          Retro Casa Productora
        </p>
      </div>
    </div>
  )
}

const centradoStyle: React.CSSProperties = {
  minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
}

const docStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 14,
  overflow: "hidden",
  background: "rgba(8,12,28,0.82)",
  backdropFilter: "blur(14px)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
}

const seccionStyle: React.CSSProperties = {
  background: "linear-gradient(90deg, rgba(29,78,216,0.28), rgba(30,58,138,0.18))",
  borderTop: "1px solid rgba(59,130,246,0.20)",
  borderBottom: "1px solid rgba(59,130,246,0.20)",
  padding: "8px 16px",
  color: "#bfdbfe",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1.4,
  textAlign: "center",
}

function etiquetaStyle(isMobile: boolean): React.CSSProperties {
  return {
    padding: isMobile ? "10px 12px 4px" : "12px 14px",
    background: "rgba(255,255,255,0.022)",
    color: "#7d8ca3",
    fontSize: 11,
    textAlign: isMobile ? "left" : "right",
    borderRight: isMobile ? "none" : "1px solid rgba(148,163,184,0.10)",
    lineHeight: 1.4,
  }
}
