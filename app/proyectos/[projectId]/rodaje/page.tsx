"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { supabase } from "../../../../lib/supabase"
import { requireSessionProfile, type AppProfile } from "../../../../lib/session-profile"
import { AppSidebar } from "../../../../components/AppSidebar"
import { PlanRodaje } from "./PlanRodaje"
import { C, boton, eyebrow } from "./estilos"

type Proyecto = { id: string; name: string; code: string | null }

// Roles que pueden entrar a la página del proyecto (para el botón de regreso).
const ROLES_PROYECTO = ["admin", "editor", "editor_premium", "productor"]

export default function RodajePage() {
  const params = useParams()
  const projectId = params.projectId as string

  const [perfil, setPerfil] = useState<AppProfile | null>(null)
  const [proyecto, setProyecto] = useState<Proyecto | null>(null)
  const [noExiste, setNoExiste] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [esMovil, setEsMovil] = useState(false)

  useEffect(() => {
    const medir = () => setEsMovil(window.innerWidth < 768)
    medir()
    window.addEventListener("resize", medir)
    return () => window.removeEventListener("resize", medir)
  }, [])

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      const auth = await requireSessionProfile()
      if (!auth || cancelado) return
      setPerfil(auth.profile)
      const { data } = await supabase
        .from("projects")
        .select("id, name, code")
        .eq("id", projectId)
        .maybeSingle()
      if (cancelado) return
      if (data) setProyecto(data as Proyecto)
      else setNoExiste(true)
    }
    if (projectId) cargar()
    return () => {
      cancelado = true
    }
  }, [projectId])

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const rol = perfil?.role || ""
  const esAdmin = rol === "admin" || rol === "editor" || rol === "editor_premium"
  const regreso = ROLES_PROYECTO.includes(rol) ? `/proyectos/${projectId}` : "/"
  const nombre = proyecto ? (proyecto.code ? `${proyecto.code} ${proyecto.name}` : proyecto.name) : "Cargando…"

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <AppSidebar
        profile={perfil}
        user={null}
        isAdmin={esAdmin}
        isMobile={esMovil}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen(!menuOpen)}
        onMenuClose={() => setMenuOpen(false)}
        onLogout={logout}
      />

      <main style={{ flex: 1, minWidth: 0, padding: esMovil ? "76px 12px 40px" : "28px 32px 60px" }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <header style={{ marginBottom: 16 }}>
            <Link href={regreso} style={{ ...boton, textDecoration: "none", marginBottom: 14 }}>
              ← {ROLES_PROYECTO.includes(rol) ? "Volver al proyecto" : "Inicio"}
            </Link>
            <p style={eyebrow}>Plan de rodaje</p>
            <h1 style={{ margin: "6px 0 0", color: C.texto, fontSize: esMovil ? 23 : 28, lineHeight: 1.1 }}>
              {noExiste ? "Proyecto no encontrado" : nombre}
            </h1>
          </header>

          {noExiste ? (
            <p style={{ color: C.apagado, fontSize: 14 }}>
              Este proyecto ya no existe o no tienes acceso a él.
            </p>
          ) : perfil && proyecto ? (
            <PlanRodaje projectId={projectId} proyecto={nombre} perfil={perfil} esMovil={esMovil} />
          ) : (
            <p style={{ color: C.apagado, fontSize: 14 }}>Cargando…</p>
          )}
        </div>
      </main>
    </div>
  )
}
