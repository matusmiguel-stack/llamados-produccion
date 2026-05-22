"use client"

import { useEffect, useState } from "react"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import { supabase } from "../lib/supabase"

export default function Home() {
  const [events, setEvents] = useState<any[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState("")
  const [title, setTitle] = useState("")
  const [allDay, setAllDay] = useState(false)
  const [startTime, setStartTime] = useState("09:00")
  const [endTime, setEndTime] = useState("18:00")

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

  useEffect(() => {
    loadShoots()
  }, [])

  function handleDateClick(info: any) {
    setSelectedDate(info.dateStr)
    setModalOpen(true)
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

    const { error } = await supabase.from("shoots").insert({
      title,
      start_time: start,
      end_time: end,
      all_day: allDay,
      public_notes: "",
      private_notes: "",
    })

    if (error) {
      alert(error.message)
      return
    }

    setModalOpen(false)
    setTitle("")
    setAllDay(false)
    setStartTime("09:00")
    setEndTime("18:00")

    await loadShoots()
  }

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
              maxWidth: "420px",
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