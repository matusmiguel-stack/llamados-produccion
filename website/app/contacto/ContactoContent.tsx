"use client"

import { useState, type FormEvent } from "react"
import PageTransition from "@/components/PageTransition"
import SectionTitle from "@/components/SectionTitle"
import { useScrollExit } from "@/components/useScrollExit"
import styles from "./contacto.module.css"

const EMAIL = "paulina@retrocasaproductora.com"
const PHONE_DISPLAY = "55 5277 6158"
const PHONE_HREF = "+525552776158"
const ADDRESS = "Benjamín Franklin 233, Col. Hipódromo Condesa, CDMX, México."
const BG_VIMEO_ID = "1229379326"
const BG_VIMEO_HASH = "aeb1e744f0"

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
      <path d="M3.5 6.5l8.5 6 8.5-6" />
    </svg>
  )
}
function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M5 3.5h3.2l1.6 4.4-2.1 1.9a13 13 0 0 0 6.5 6.5l1.9-2.1 4.4 1.6V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.1 1.5 1.5 0 0 1 5 3.5Z" />
    </svg>
  )
}
function PinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M12 21s7-6.6 7-12a7 7 0 1 0-14 0c0 5.4 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.3" />
    </svg>
  )
}

function mailto(subject: string, body: string) {
  window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function Field({
  label, value, onChange, type = "text", textarea = false, required = false, placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  textarea?: boolean
  required?: boolean
  placeholder?: string
}) {
  const id = `f-${label.toLowerCase().replace(/\s+/g, "-")}`
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {textarea ? (
        <textarea id={id} value={value} required={required} placeholder={placeholder}
          onChange={e => onChange(e.target.value)} />
      ) : (
        <input id={id} type={type} value={value} required={required} placeholder={placeholder}
          onChange={e => onChange(e.target.value)} />
      )}
    </div>
  )
}

export default function ContactoContent() {
  // Contacto es el último de la secuencia — arriba regresa a Live
  useScrollExit(null, "/live")

  const [f1, setF1] = useState({ asunto: "", nombre: "", mail: "", comentarios: "" })
  const [f2, setF2] = useState({ nombre: "", mail: "", reel: "", comentarios: "" })

  function submitContacto(e: FormEvent) {
    e.preventDefault()
    mailto(
      f1.asunto || "Contacto — Retro Casa Productora",
      `Nombre: ${f1.nombre}\nMail: ${f1.mail}\n\n${f1.comentarios}`
    )
  }

  function submitEquipo(e: FormEvent) {
    e.preventDefault()
    mailto(
      "Quiero formar parte del equipo",
      `Nombre: ${f2.nombre}\nMail: ${f2.mail}\nReel / CV: ${f2.reel}\n\n${f2.comentarios}`
    )
  }

  return (
    <PageTransition>
      <main className={styles.main}>
        <div className={styles.videoBg} aria-hidden>
          <iframe
            className={styles.videoIframe}
            src={`https://player.vimeo.com/video/${BG_VIMEO_ID}?h=${BG_VIMEO_HASH}&background=1&autoplay=1&muted=1&loop=1&controls=0&byline=0&title=0&portrait=0&dnt=1`}
            allow="autoplay"
            tabIndex={-1}
          />
          <div className={styles.videoOverlay} />
        </div>

        <SectionTitle>Contacto</SectionTitle>

        <div className={styles.inner}>
          <section>
            <h2 className={styles.heading}>Contacto comercial</h2>
            <ul className={styles.infoList}>
              <li><MailIcon /><a href={`mailto:${EMAIL}`}>{EMAIL}</a></li>
              <li><PhoneIcon /><a href={`tel:${PHONE_HREF}`}>{PHONE_DISPLAY}</a></li>
              <li><PinIcon /><span>{ADDRESS}</span></li>
            </ul>
          </section>

          <div className={styles.columns}>
            <form className={styles.form} onSubmit={submitContacto}>
              <Field label="Asunto" value={f1.asunto} onChange={v => setF1(s => ({ ...s, asunto: v }))} required />
              <Field label="Nombre" value={f1.nombre} onChange={v => setF1(s => ({ ...s, nombre: v }))} required />
              <Field label="Mail" type="email" value={f1.mail} onChange={v => setF1(s => ({ ...s, mail: v }))} required />
              <Field label="Comentarios" textarea value={f1.comentarios} onChange={v => setF1(s => ({ ...s, comentarios: v }))} />
              <button type="submit" className={styles.submit}>Enviar →</button>
            </form>

            <div className={styles.divider} aria-hidden />

            <div>
              <h2 className={styles.heading}>¿Quieres formar parte del equipo?</h2>
              <p className={styles.sub}>Envía tu reel o cv</p>
              <form className={styles.form} onSubmit={submitEquipo}>
                <Field label="Nombre" value={f2.nombre} onChange={v => setF2(s => ({ ...s, nombre: v }))} required />
                <Field label="Mail" type="email" value={f2.mail} onChange={v => setF2(s => ({ ...s, mail: v }))} required />
                <Field label="Link a tu reel o CV" value={f2.reel} onChange={v => setF2(s => ({ ...s, reel: v }))}
                  placeholder="https://…" required />
                <Field label="Comentarios" textarea value={f2.comentarios} onChange={v => setF2(s => ({ ...s, comentarios: v }))} />
                <button type="submit" className={styles.submit}>Enviar →</button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </PageTransition>
  )
}
