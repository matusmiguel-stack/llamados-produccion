"use client"

import { useEffect, useState } from "react"
import { supabase } from "../../lib/supabase"
import Image from "next/image"

type View = "loading" | "form" | "success" | "invalid"

export default function ResetPasswordPage() {
  const [view, setView]           = useState<View>("loading")
  const [password, setPassword]   = useState("")
  const [confirm, setConfirm]     = useState("")
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState("")

  // Supabase picks up the token from the URL hash automatically.
  // We wait briefly for the session to be established, then check.
  useEffect(() => {
    const timer = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setView(session ? "form" : "invalid")
    }, 600)
    return () => clearTimeout(timer)
  }, [])

  async function handleReset() {
    setError("")
    if (!password) { setError("Escribe tu nueva contraseña."); return }
    if (password.length < 8) { setError("La contraseña debe tener al menos 8 caracteres."); return }
    if (password !== confirm) { setError("Las contraseñas no coinciden."); return }
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) { setError(err.message); return }
    setView("success")
  }

  return (
    <main style={mainStyle}>
      {/* Logo blanco sobre el grafito, fuera de la tarjeta */}
      <Image
        src="/logo-retro.png"
        alt="Retro"
        width={150}
        height={54}
        style={{ objectFit: "contain", height: "auto", marginBottom: 28 }}
        priority
      />
      <div style={cardStyle}>

        {/* ── Loading ── */}
        {view === "loading" && (
          <p style={{ color: "#737373", textAlign: "center", fontSize: 14 }}>Verificando enlace…</p>
        )}

        {/* ── Invalid / expired ── */}
        {view === "invalid" && (
          <>
            <div style={iconStyle}>⚠️</div>
            <h2 style={titleStyle}>Enlace inválido</h2>
            <p style={subtitleStyle}>
              Este enlace ya expiró o no es válido. Solicita uno nuevo desde la pantalla de inicio.
            </p>
            <button onClick={() => { window.location.href = "/login" }} style={primaryBtnStyle}>
              Volver al inicio
            </button>
          </>
        )}

        {/* ── New password form ── */}
        {view === "form" && (
          <>
            <h2 style={titleStyle}>Nueva contraseña</h2>
            <p style={subtitleStyle}>Elige una contraseña segura de al menos 8 caracteres.</p>

            <input
              type="password"
              placeholder="Nueva contraseña"
              value={password}
              onChange={e => { setPassword(e.target.value); setError("") }}
              onKeyDown={e => e.key === "Enter" && handleReset()}
              style={inputStyle}
              autoFocus
              autoComplete="new-password"
            />
            <input
              type="password"
              placeholder="Confirmar contraseña"
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError("") }}
              onKeyDown={e => e.key === "Enter" && handleReset()}
              style={{ ...inputStyle, marginTop: 12 }}
              autoComplete="new-password"
            />

            {/* Strength hint */}
            {password.length > 0 && (
              <div style={strengthBarWrap}>
                <div style={strengthBar(password)} />
                <span style={strengthLabel(password)}>{strengthText(password)}</span>
              </div>
            )}

            {error && <p style={errorStyle}>{error}</p>}

            <button onClick={handleReset} disabled={loading} style={primaryBtnStyle}>
              {loading ? "Guardando…" : "Guardar contraseña"}
            </button>
          </>
        )}

        {/* ── Success ── */}
        {view === "success" && (
          <>
            <div style={iconStyle}>✅</div>
            <h2 style={titleStyle}>¡Contraseña actualizada!</h2>
            <p style={subtitleStyle}>Tu contraseña se cambió correctamente. Ya puedes entrar con ella.</p>
            <button onClick={() => { window.location.href = "/login" }} style={primaryBtnStyle}>
              Ir a iniciar sesión
            </button>
          </>
        )}

      </div>
    </main>
  )
}

// ─── Strength helpers ─────────────────────────────────────────────────────────

function strengthLevel(pw: string): 0 | 1 | 2 | 3 {
  if (pw.length < 6) return 0
  const checks = [/[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/]
  const score = checks.filter(r => r.test(pw)).length + (pw.length >= 12 ? 1 : 0)
  if (score >= 3) return 3
  if (score === 2) return 2
  return 1
}

function strengthText(pw: string) {
  return ["Muy débil", "Débil", "Regular", "Fuerte"][strengthLevel(pw)]
}

function strengthBar(pw: string): React.CSSProperties {
  const l = strengthLevel(pw)
  const colors = ["#D92D20", "#C2410C", "#A86B00", "#1F8A55"]
  const widths = ["20%", "45%", "70%", "100%"]
  return {
    height: 4,
    borderRadius: 999,
    background: colors[l],
    width: widths[l],
    transition: "width 0.3s ease, background 0.3s ease",
  }
}

function strengthLabel(pw: string): React.CSSProperties {
  const colors = ["#D92D20", "#C2410C", "#A86B00", "#1F8A55"]
  return {
    fontSize: 11,
    color: colors[strengthLevel(pw)],
    fontWeight: 600,
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const mainStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  flexDirection: "column",
  background: "#18181A",
  color: "#141414",
}

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 400,
  background: "#FFFFFF",
  padding: "28px 28px 22px",
  borderRadius: 14,
}

const titleStyle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 20,
  fontWeight: 700,
  color: "#141414",
  textAlign: "center",
}

const subtitleStyle: React.CSSProperties = {
  margin: "0 0 20px",
  color: "#6B6B6B",
  fontSize: 14,
  lineHeight: 1.6,
  textAlign: "center",
}

const iconStyle: React.CSSProperties = {
  fontSize: 38,
  textAlign: "center",
  marginBottom: 10,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.15)",
  background: "#FFFFFF",
  color: "#141414",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
}

const strengthBarWrap: React.CSSProperties = {
  marginTop: 10,
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "#FFFFFF",
  borderRadius: 8,
  padding: "6px 10px",
}

const primaryBtnStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 20,
  padding: "14px 0",
  background: "#131313",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 15,
  boxShadow: "0 18px 45px rgba(0,0,0,0.06)",
}

const errorStyle: React.CSSProperties = {
  margin: "12px 0 0",
  padding: "10px 14px",
  borderRadius: 10,
  background: "rgba(239,68,68,0.10)",
  border: "1px solid rgba(239,68,68,0.22)",
  color: "#B42318",
  fontSize: 13,
}
