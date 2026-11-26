"use client"

import { useState } from "react"
import { supabase } from "../../lib/supabase"
import { redirectAfterLogin } from "../../lib/session-profile"
import Image from "next/image"

type View = "login" | "forgot" | "sent"

export default function LoginPage() {
  const [view, setView]         = useState<View>("login")
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [resetEmail, setResetEmail] = useState("")
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState("")

  // ── Login ──────────────────────────────────────────────────────────────────
  async function login() {
    setError("")
    if (!email || !password) { setError("Escribe tu correo y contraseña."); return }
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err) { setError("Correo o contraseña incorrectos."); return }
    await redirectAfterLogin()
  }

  // ── Forgot password ────────────────────────────────────────────────────────
  async function sendReset() {
    setError("")
    if (!resetEmail) { setError("Escribe tu correo."); return }
    setLoading(true)
    const redirectTo = `${window.location.origin}/reset-password`
    const { error: err } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), { redirectTo })
    setLoading(false)
    if (err) { setError(err.message); return }
    setView("sent")
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

        {/* ── Login form ── */}
        {view === "login" && (
          <>
            <input
              type="email"
              placeholder="correo@empresa.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setError("") }}
              onKeyDown={e => e.key === "Enter" && login()}
              style={inputStyle}
              autoComplete="email"
            />
            <input
              type="password"
              placeholder="contraseña"
              value={password}
              onChange={e => { setPassword(e.target.value); setError("") }}
              onKeyDown={e => e.key === "Enter" && login()}
              style={{ ...inputStyle, marginTop: 12 }}
              autoComplete="current-password"
            />

            {error && <p style={errorStyle}>{error}</p>}

            <button onClick={login} disabled={loading} style={primaryBtnStyle}>
              {loading ? "Entrando…" : "Entrar"}
            </button>

            <button
              onClick={() => { setView("forgot"); setResetEmail(email); setError("") }}
              style={linkBtnStyle}
            >
              ¿Olvidaste tu contraseña?
            </button>
          </>
        )}

        {/* ── Forgot password form ── */}
        {view === "forgot" && (
          <>
            <p style={subtitleStyle}>
              Escribe tu correo y te enviaremos un enlace para crear una nueva contraseña.
            </p>
            <input
              type="email"
              placeholder="correo@empresa.com"
              value={resetEmail}
              onChange={e => { setResetEmail(e.target.value); setError("") }}
              onKeyDown={e => e.key === "Enter" && sendReset()}
              style={inputStyle}
              autoFocus
              autoComplete="email"
            />

            {error && <p style={errorStyle}>{error}</p>}

            <button onClick={sendReset} disabled={loading} style={primaryBtnStyle}>
              {loading ? "Enviando…" : "Enviar enlace"}
            </button>

            <button onClick={() => { setView("login"); setError("") }} style={linkBtnStyle}>
              ← Volver
            </button>
          </>
        )}

        {/* ── Sent confirmation ── */}
        {view === "sent" && (
          <>
            <h2 style={sentTitleStyle}>Revisa tu correo</h2>
            <p style={subtitleStyle}>
              Si <strong style={{ color: "#262626" }}>{resetEmail}</strong> está registrado, recibirás un enlace para crear una nueva contraseña. Puede tardar unos minutos.
            </p>
            <button onClick={() => { setView("login"); setError("") }} style={primaryBtnStyle}>
              Volver al inicio
            </button>
          </>
        )}

      </div>
    </main>
  )
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 8,
  border: "1px solid #E2E2E2",
  background: "#FFFFFF",
  color: "#141414",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
}

const primaryBtnStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 20,
  padding: "14px 0",
  background: "#131313",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 15,
}

const linkBtnStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 14,
  padding: "10px 0",
  background: "none",
  border: "none",
  color: "#737373",
  fontSize: 13,
  cursor: "pointer",
  textAlign: "center",
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

const subtitleStyle: React.CSSProperties = {
  margin: "0 0 20px",
  color: "#6B6B6B",
  fontSize: 14,
  lineHeight: 1.6,
}

const sentIconStyle: React.CSSProperties = {
  fontSize: 40,
  textAlign: "center",
  marginBottom: 12,
}

const sentTitleStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 20,
  fontWeight: 700,
  color: "#141414",
  textAlign: "center",
}
