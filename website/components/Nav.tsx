"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"

export default function Nav() {
  const pathname = usePathname()
  const isHome = pathname === "/"
  const [visible, setVisible] = useState(!isHome)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isHome) {
      setVisible(true)
      return
    }

    // On home: show briefly on mount, then hide after 2s
    setVisible(true)
    timerRef.current = setTimeout(() => setVisible(false), 2000)

    function onScroll() {
      // Show nav when user scrolls down (not on home since home is 100vh)
      setVisible(window.scrollY > 40)
    }

    function onMouseMove(e: MouseEvent) {
      if (e.clientY < 80) {
        setVisible(true)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
          if (window.scrollY < 40) setVisible(false)
        }, 1800)
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("mousemove", onMouseMove)

    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("mousemove", onMouseMove)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [isHome])

  // Re-evaluate when pathname changes
  useEffect(() => {
    if (!isHome) setVisible(true)
  }, [pathname, isHome])

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 40px",
        background: isHome
          ? "rgba(6, 6, 8, 0.55)"
          : "rgba(6, 6, 8, 0.72)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(232, 228, 220, 0.06)",
        transform: visible ? "translateY(0)" : "translateY(-100%)",
        opacity: visible ? 1 : 0,
        transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <Link
        href="/"
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontStyle: "italic",
          fontSize: 16,
          letterSpacing: "0.04em",
          color: "var(--fg)",
        }}
      >
        Retro Casa
      </Link>

      <ul style={{ display: "flex", gap: 28, listStyle: "none" }}>
        {[
          { href: "/proyectos", label: "Proyectos" },
          { href: "/films", label: "Films" },
          { href: "/live", label: "Live" },
          { href: "/nosotros", label: "Nosotros" },
        ].map(({ href, label }) => (
          <li key={href}>
            <Link
              href={href}
              style={{
                fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
                fontSize: 9,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: pathname === href ? "var(--fg)" : "var(--fg2)",
                position: "relative",
                paddingBottom: 2,
                borderBottom: pathname === href
                  ? "1px solid var(--red)"
                  : "1px solid transparent",
                transition: "color 0.25s, border-color 0.25s",
              }}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href="/nosotros#contacto"
        style={{
          fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
          fontSize: 9,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          background: "var(--red)",
          color: "#fff",
          border: "none",
          padding: "8px 20px",
          borderRadius: 2,
          cursor: "pointer",
        }}
      >
        Contacto
      </Link>
    </nav>
  )
}
