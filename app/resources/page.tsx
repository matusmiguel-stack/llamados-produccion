"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { supabase } from "../../lib/supabase"

export default function ResourcesPage() {
  const [resources, setResources] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)

  const [name, setName] = useState("")
  const [type, setType] = useState("human")
  const [category, setCategory] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)

  const isMobile =
    typeof window !== "undefined" && window.innerWidth < 768

  const isAdmin = profile?.role === "admin"

  async function loadPage() {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      window.location.href = "/login"
      return
    }

    const { data: profiles } = await supabase.from("profiles").select("*")

    const myProfile = profiles?.find(
      (p) =>
        p.email?.trim().toLowerCase() ===
        session.user.email?.trim().toLowerCase()
    )

    if (!myProfile || myProfile.role !== "admin") {
      window.location.href = "/"
      return
    }

    setProfile(myProfile)

    const { data, error } = await supabase
      .from("resources")
      .select("*")
      .order("type", { ascending: true })
      .order("category", { ascending: true })

    if (error) return alert(error.message)

    setResources(data || [])
  }

  useEffect(() => {
    loadPage()
  }, [])

  async function createResource() {
    if (!name) return alert("Escribe el nombre del recurso")
    if (!category) return alert("Escribe la categoría")

    const { error } = await supabase.from("resources").insert({
      name,
      type,
      category,
    })

    if (error) return alert(error.message)

    setName("")
    setCategory("")
    await loadPage()
  }

  async function deleteResource(id: string) {
    if (!confirm("¿Seguro que quieres borrar este recurso?")) return

    const { error } = await supabase.from("resources").delete().eq("id", id)

    if (error) return alert(error.message)

    await loadPage()
  }

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const humans = resources.filter((r) => r.type === "human")
  const technical = resources.filter((r) => r.type === "technical")

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {isMobile && (
        <button onClick={() => setMenuOpen(!menuOpen)} style={hamburgerButton}>
          ☰
        </button>
      )}

      <aside
        style={{
          ...sidebarStyle,
          position: isMobile ? "fixed" : "relative",
          left: isMobile && !menuOpen ? "-100%" : 0,
          width: isMobile ? 260 : 240,
          zIndex: 9999,
          transition: "0.25s",
        }}
      >
        <div style={{ marginBottom: 24, textAlign: "center" }}>
          <Image
            src="/logo-retro.png"
            alt="Retro"
            width={160}
            height={70}
            style={{ objectFit: "contain" }}
          />
        </div>

        <Link href="/" style={navLink} onClick={() => isMobile && setMenuOpen(false)}>
          Calendario
        </Link>

        <Link href="/resources" style={activeNavLink} onClick={() => isMobile && setMenuOpen(false)}>
          Inventario
        </Link>

        {isAdmin && (
          <Link href="/users" style={navLink} onClick={() => isMobile && setMenuOpen(false)}>
            Usuarios
          </Link>
        )}

        <div style={{ marginTop: 24, fontSize: 13, color: "#94a3b8" }}>
          <p>{profile?.email}</p>
          <p>Rol: {profile?.role}</p>
        </div>

        <button onClick={logout} style={logoutButton}>
          Cerrar sesión
        </button>
      </aside>

      <main style={{ flex: 1, padding: isMobile ? "76px 14px 24px" : 32 }}>
        <p style={eyebrow}>Admin</p>
        <h1 style={titleStyle}>Inventario de recursos</h1>

        <section style={cardStyle}>
          <h2>Agregar recurso</h2>

          <input
            placeholder="Nombre del recurso"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />

          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            style={inputStyle}
          >
            <option value="human">Recurso humano</option>
            <option value="technical">Recurso técnico</option>
          </select>

          <input
            placeholder="Categoría, ej: Productor, Cámara, Luces"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={inputStyle}
          />

          <button onClick={createResource} style={primaryButton}>
            Agregar recurso
          </button>
        </section>

        <section style={cardStyle}>
          <h2>Recursos humanos</h2>

          {humans.map((resource) => (
            <div key={resource.id} style={rowStyle}>
              <span>
                {resource.name} — {resource.category}
              </span>

              <button onClick={() => deleteResource(resource.id)} style={dangerButton}>
                Borrar
              </button>
            </div>
          ))}
        </section>

        <section style={cardStyle}>
          <h2>Recursos técnicos</h2>

          {technical.map((resource) => (
            <div key={resource.id} style={rowStyle}>
              <span>
                {resource.name} — {resource.category}
              </span>

              <button onClick={() => deleteResource(resource.id)} style={dangerButton}>
                Borrar
              </button>
            </div>
          ))}
        </section>
      </main>
    </div>
  )
}

const sidebarStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "rgba(15, 23, 42, 0.9)",
  borderRight: "1px solid rgba(148,163,184,0.16)",
  padding: 22,
  color: "white",
  backdropFilter: "blur(18px)",
}

const navLink: React.CSSProperties = {
  display: "block",
  color: "#cbd5e1",
  textDecoration: "none",
  marginTop: 12,
  padding: "12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.05)",
}

const activeNavLink: React.CSSProperties = {
  ...navLink,
  color: "white",
  background: "linear-gradient(135deg, rgba(124,58,237,0.85), rgba(14,165,233,0.55))",
}

const logoutButton: React.CSSProperties = {
  marginTop: 24,
  width: "100%",
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  cursor: "pointer",
  color: "white",
  background: "rgba(255,255,255,0.08)",
}

const hamburgerButton: React.CSSProperties = {
  position: "fixed",
  top: 14,
  left: 14,
  zIndex: 10000,
  border: "none",
  borderRadius: 12,
  padding: "10px 14px",
  background: "#111827",
  color: "white",
  fontSize: 20,
  cursor: "pointer",
}

const eyebrow: React.CSSProperties = {
  color: "#a78bfa",
  textTransform: "uppercase",
  letterSpacing: 1.5,
  fontWeight: 700,
  fontSize: 13,
}

const titleStyle: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 36,
  marginTop: 8,
}

const cardStyle: React.CSSProperties = {
  background: "rgba(15, 23, 42, 0.82)",
  border: "1px solid rgba(148,163,184,0.18)",
  boxShadow: "0 24px 70px rgba(0,0,0,0.35)",
  backdropFilter: "blur(16px)",
  color: "#f8fafc",
  padding: 22,
  borderRadius: 20,
  marginTop: 20,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 14,
  marginTop: 12,
  border: "1px solid rgba(148,163,184,0.28)",
  borderRadius: 12,
  background: "rgba(2,6,23,0.7)",
  color: "#f8fafc",
  outline: "none",
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  padding: "14px 0",
  borderBottom: "1px solid rgba(148,163,184,0.14)",
}

const primaryButton: React.CSSProperties = {
  marginTop: 16,
  width: "100%",
  padding: 14,
  background: "linear-gradient(135deg, #7c3aed, #0ea5e9)",
  color: "white",
  border: "none",
  borderRadius: 12,
  cursor: "pointer",
  fontWeight: 700,
}

const dangerButton: React.CSSProperties = {
  padding: "9px 12px",
  background: "rgba(185,28,28,0.9)",
  color: "white",
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
}