"use client"

import { useEffect, useState } from "react"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import { supabase } from "../lib/supabase"

export default function Home() {
  const [events, setEvents] = useState<any[]>([])
  const [resources, setResources] = useState<any[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState("")
  const [title, setTitle] = useState("")
  const [allDay, setAllDay] = useState(false)
  const [startTime, setStartTime] = useState("09:00")
  const [endTime, setEndTime] = useState("18:00")
  const [selectedResources, setSelectedResources] = useState<string[]>([])

  async function loadShoots() {
    const { data, error } = await supabase
      .from("shoots")
      .select("*")
      .order("start_time", { ascending: true })

    if (error) {
      alert(error.message)
      return
    }

    setEvents(
      data.map((shoot) => ({
        id: shoot.id,
        title: shoot.title,
        start: shoot.start_time,
        end: shoot.end_time,
        allDay: shoot.all_day,
        backgroundColor: "#111827",
        borderColor: "#111827",
        textColor: "#ffffff",
      }))
    )
  }

  async function loadResources() {
    const { data, error } = await supabase
      .from("resources")
      .select("*")
      .order("type", { ascending: true })
      .order("category", { ascending: true })

    if (error) {
      alert(error.message)
      return
    }

    setResources(data)
  }

  useEffect(() => {
    loadShoots()
    loadResources()
  }, [])

  function handleDateClick(info: any) {
    setSelectedDate(info.dateStr)
    setModalOpen(true)
  }

  function toggleResource(resourceId: string) {
    if (selectedResources.includes(resourceId)) {
      setSelectedResources(selectedResources.filter((id) => id !== resourceId))
    } else {
      setSelectedResources([...selectedResources, resourceId])
    }
  }

  async function createShoot() {
    if (!title) {
      alert("Ponle nombre al llamado")
      return
    }

    let start = `${selectedDate}T${startTime}:00`
    let end = `${selectedDate}T${endTime}:00`

    if (allDay) {
      start = `${selectedDate}T00:00:00`
      end = `${selectedDate}T23:59:59`
    }

    const { data: newShoot, error: shootError } = await supabase
      .from("shoots")
      .insert({
        title,
        start_time: start,
        end_time: end,
        all_day: allDay,
        public_notes: "",
        private_notes: "",
      })
      .select()
      .single()

    if (shootError) {
      alert(shootError.message)
      return
    }

    if (selectedResources.length > 0) {
      const assignments = selectedResources.map((resourceId) => ({
        shoot_id: newShoot.id,
        resource_id: resourceId,
      }))

      const { error: assignmentError } = await supabase
        .from("shoot_resources")
        .insert(assignments)

      if (assignmentError) {
        alert(assignmentError.message)
        return
      }
    }

    setModalOpen(false)
    setTitle("")
    setAllDay(false)
    setStartTime("09:00")
    setEndTime("18:00")
    setSelectedResources([])

    await loadShoots()
  }

  const humanResources = resources.filter((resource) => resource.type === "human")
  const technicalResources = resources.filter(
    (resource) => resource.type === "technical"
  )

  return (
    <main style={{ padding: "20px" }}>
      <h1 style={{ marginBottom: "20px" }}>🎬 Sistema de Llamados</h1>

      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        height="80vh"
        events={events}
        selectable={true}
        dateClick={handleDateClick}
        eventDisplay="block"
      />

      {modalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            zIndex: 999999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "520px",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#ffffff",
              color: "#111111",
              borderRadius: "18px",
              padding: "24px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Nuevo llamado</h2>

            <input
              type="text"
              placeholder="Nombre del llamado"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                marginTop: "12px",
                border: "1px solid #ccc",
                borderRadius: "8px",
              }}
            />

            <div style={{ marginTop: "20px" }}>
              <label>
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                />{" "}
                Todo el día
              </label>
            </div>

            {!allDay && (
              <>
                <div style={{ marginTop: "20px" }}>
                  <label>Hora inicio</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px",
                      marginTop: "8px",
                      border: "1px solid #ccc",
                      borderRadius: "8px",
                    }}
                  />
                </div>

                <div style={{ marginTop: "20px" }}>
                  <label>Hora fin</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px",
                      marginTop: "8px",
                      border: "1px solid #ccc",
                      borderRadius: "8px",
                    }}
                  />
                </div>
              </>
            )}

            <h3 style={{ marginTop: "24px" }}>Recursos humanos</h3>

            {humanResources.map((resource) => (
              <label
                key={resource.id}
                style={{ display: "block", marginTop: "8px" }}
              >
                <input
                  type="checkbox"
                  checked={selectedResources.includes(resource.id)}
                  onChange={() => toggleResource(resource.id)}
                />{" "}
                {resource.name} — {resource.category}
              </label>
            ))}

            <h3 style={{ marginTop: "24px" }}>Recursos técnicos</h3>

            {technicalResources.map((resource) => (
              <label
                key={resource.id}
                style={{ display: "block", marginTop: "8px" }}
              >
                <input
                  type="checkbox"
                  checked={selectedResources.includes(resource.id)}
                  onChange={() => toggleResource(resource.id)}
                />{" "}
                {resource.name} — {resource.category}
              </label>
            ))}

            <button
              onClick={createShoot}
              style={{
                marginTop: "24px",
                width: "100%",
                padding: "14px",
                background: "black",
                color: "white",
                border: "none",
                borderRadius: "10px",
                cursor: "pointer",
              }}
            >
              Guardar llamado
            </button>

            <button
              onClick={() => setModalOpen(false)}
              style={{
                marginTop: "12px",
                width: "100%",
                padding: "12px",
                background: "#eeeeee",
                color: "black",
                border: "none",
                borderRadius: "10px",
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </main>
  )
}