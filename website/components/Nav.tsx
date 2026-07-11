"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import styles from "./Nav.module.css"

const LINKS = [
  { href: "/proyectos", label: "Proyectos" },
  { href: "/films",     label: "Films"      },
  { href: "/live",      label: "Live"        },
  { href: "/nosotros",  label: "Nosotros"    },
]

export default function Nav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Lock body scroll when overlay is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [open])

  // Close on route change
  useEffect(() => { setOpen(false) }, [pathname])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <>
      {/* ── Persistent top bar ── */}
      <div className={`${styles.bar} ${open ? styles.barOpen : ""}`}>
        <Link href="/" className={styles.logo} onClick={() => setOpen(false)}>
          Retro Casa
        </Link>

        <button
          className={`${styles.hamburger} ${open ? styles.hamburgerOpen : ""}`}
          onClick={() => setOpen(v => !v)}
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
        >
          <span /><span /><span />
        </button>
      </div>

      {/* ── Fullscreen overlay ── */}
      <div
        className={`${styles.overlay} ${open ? styles.overlayOpen : ""}`}
        aria-hidden={!open}
        aria-modal={open}
        role="dialog"
      >
        <div className={styles.scanLines} aria-hidden />

        <nav className={styles.menu}>
          {LINKS.map(({ href, label }, i) => (
            <Link
              key={href}
              href={href}
              className={`${styles.menuItem} ${pathname === href ? styles.menuItemActive : ""}`}
              style={{ transitionDelay: open ? `${0.08 + i * 0.07}s` : "0s" }}
              onClick={() => setOpen(false)}
            >
              <span className={styles.menuText}>{label}</span>
              <span className={styles.menuArrow}>↗</span>
            </Link>
          ))}
        </nav>

        <footer className={styles.menuFoot}>
          <div className={styles.footLeft}>
            <span>Casa productora</span>
            <span>Ciudad de México</span>
          </div>
          <div className={styles.footRight}>
            <a href="https://instagram.com/retrocasaproductora" target="_blank" rel="noopener noreferrer">
              Instagram
            </a>
            <a href="https://vimeo.com" target="_blank" rel="noopener noreferrer">
              Vimeo
            </a>
            <Link href="/nosotros" className={styles.footCta} onClick={() => setOpen(false)}>
              Contacto
            </Link>
          </div>
        </footer>
      </div>
    </>
  )
}
