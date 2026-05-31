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
      <div style={cardStyle}>

        {/* Logo */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
          <Image
            src="/logo-retro.png"
            alt="Retro"
            width={200}
            height={72}
            style={{ objectFit: "contain", filter: "drop-shadow(0 10px 35px rgba(255,255,255,0.08))" }}
            priority
          />
        </div>

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
            <div style={sentIconStyle}>✉️</div>
            <h2 style={sentTitleStyle}>Revisa tu correo</h2>
            <p style={subtitleStyle}>
              Si <strong style={{ color: "#e2e8f0" }}>{resetEmail}</strong> está registrado, recibirás un enlace para crear una nueva contraseña. Puede tardar unos minutos.
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
  background: "radial-gradient(circle at top left, rgba(124,58,237,0.22), transparent 32%), radial-gradient(circle at bottom right, rgba(14,165,233,0.16), transparent 28%), #05070d",
  color: "#f8fafc",
}

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  background: "rgba(15,23,42,0.82)",
  border: "1px solid rgba(148,163,184,0.22)",
  boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
  backdropFilter: "blur(16px)",
  padding: "36px 32px 32px",
  borderRadius: 24,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(2,6,23,0.7)",
  color: "#f8fafc",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
}

const primaryBtnStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 20,
  padding: "14px 0",
  background: "linear-gradient(135deg, #7c3aed, #0ea5e9)",
  color: "white",
  border: "none",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 15,
  boxShadow: "0 18px 45px rgba(124,58,237,0.28)",
}

const linkBtnStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 14,
  padding: "10px 0",
  background: "none",
  border: "none",
  color: "#64748b",
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
  color: "#fca5a5",
  fontSize: 13,
}

const subtitleStyle: React.CSSProperties = {
  margin: "0 0 20px",
  color: "#94a3b8",
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
  color: "#f8fafc",
  textAlign: "center",
}
