"use client"

import { useState } from "react"
import { supabase } from "../../lib/supabase"
import Image from "next/image"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  async function login() {
    if (!email || !password) {
      alert("Escribe correo y contraseña")
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (error) {
      alert(error.message)
      return
    }

    window.location.href = "/"
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        background:
          "radial-gradient(circle at top left, rgba(124,58,237,0.22), transparent 32%), radial-gradient(circle at bottom right, rgba(14,165,233,0.16), transparent 28%), #05070d",
        color: "#f8fafc",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "rgba(15, 23, 42, 0.82)",
          border: "1px solid rgba(148,163,184,0.22)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
          backdropFilter: "blur(16px)",
          padding: 32,
          borderRadius: 24,
        }}
      >
        <div
  style={{
    display: "flex",
    justifyContent: "center",
    marginBottom: 24,
  }}
>
  <Image
    src="/logo-retro.png"
    alt="Retro"
    width={220}
    height={80}
    style={{
      objectFit: "contain",
      filter:
        "drop-shadow(0 10px 35px rgba(255,255,255,0.08))",
    }}
  />
</div>
        <p
          style={{
            margin: 0,
            color: "#a78bfa",
            fontSize: 13,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          Production OS
        </p>

        <h1
          style={{
            marginTop: 12,
            marginBottom: 8,
            fontSize: 34,
            lineHeight: 1,
          }}
        >
          🎬 Llamados
        </h1>

        <p style={{ marginTop: 0, color: "#94a3b8" }}>
          Entra para consultar y administrar el calendario de producción.
        </p>

        <input
          type="email"
          placeholder="correo@empresa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />

        <input
          type="password"
          placeholder="contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />

        <button onClick={login} disabled={loading} style={buttonStyle}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </div>
    </main>
  )
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  marginTop: 16,
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.28)",
  background: "rgba(2,6,23,0.7)",
  color: "#f8fafc",
  outline: "none",
}

const buttonStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 22,
  padding: 15,
  background: "linear-gradient(135deg, #7c3aed, #0ea5e9)",
  color: "white",
  border: "none",
  borderRadius: 14,
  cursor: "pointer",
  fontWeight: 700,
  boxShadow: "0 18px 45px rgba(124,58,237,0.28)",
}