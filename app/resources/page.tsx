"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "../../lib/supabase"

export default function ResourcesPage() {
  const [resources, setResources] = useState<any[]>([])
  const [name, setName] = useState("")
  const [type, setType] = useState("human")
  const [category, setCategory] = useState("")

  async function loadResources() {
    const { data, error } = await supabase
      .from("resources")
      .select("*")
      .order("type", { ascending: true })
      .order("category", { ascending: true })

    if (error) return alert(error.message)
    setResources(data || [])
  }

  useEffect(() => {
    loadResources()
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
    await loadResources()
  }

  async function deleteResource(id: string) {
    if (!confirm("¿Seguro que quieres borrar este recurso?")) return

    const { error } = await supabase.from("resources").delete().eq("id", id)

    if (error) return alert(error.message)

    await loadResources()
  }

  const humans = resources.filter((r) => r.type === "human")
  const technical = resources.filter((r) => r.type === "technical")

  return (
    <main style={{ padding: 20 }}>
      <nav style={{ marginBottom: 24 }}>
        <Link href="/">← Volver al calendario</Link>
      </nav>

      <h1>📦 Inventario de recursos</h1>

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
  )
}

const cardStyle: React.CSSProperties = {
  background: "white",
  padding: 20,
  borderRadius: 16,
  marginTop: 20,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 12,
  marginTop: 10,
  border: "1px solid #ccc",
  borderRadius: 8,
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 0",
  borderBottom: "1px solid #eee",
}

const primaryButton: React.CSSProperties = {
  marginTop: 16,
  width: "100%",
  padding: 14,
  background: "black",
  color: "white",
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
}

const dangerButton: React.CSSProperties = {
  padding: "8px 12px",
  background: "#b91c1c",
  color: "white",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
}