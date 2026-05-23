"use client"

import { useState } from "react"
import { supabase } from "../../lib/supabase"

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
        background: "#f5f5f5",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "white",
          padding: "32px",
          borderRadius: "18px",
        }}
      >
        <h1>🎬 Login</h1>

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

        <button
          onClick={login}
          disabled={loading}
          style={buttonStyle}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </div>
    </main>
  )
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px",
  marginTop: "16px",
  borderRadius: "10px",
  border: "1px solid #ccc",
}

const buttonStyle: React.CSSProperties = {
  width: "100%",
  marginTop: "20px",
  padding: "14px",
  background: "black",
  color: "white",
  border: "none",
  borderRadius: "10px",
  cursor: "pointer",
}