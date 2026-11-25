"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import gsap from "gsap"
import { gooTimeline } from "@/lib/goo"
import { isStageRoute } from "./stage/routes"
import { headerRevealed, onHeaderReveal, revealHeader, stageNavigate } from "./stage/bus"
import styles from "./Header.module.css"

const LINKS = [
  { href: "/nosotros", label: "Nosotros" },
  { href: "/proyectos", label: "Proyectos" },
  { href: "/films", label: "Films" },
  { href: "/live", label: "Live" },
  { href: "/contacto", label: "Contacto" },
]

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function Header() {
  const pathname = usePathname()
  const header = useRef<HTMLElement>(null)
  const logo = useRef<HTMLSpanElement>(null)
  const nav = useRef<HTMLElement>(null)

  // Aparición con goo: en las rutas del escenario espera a que termine su intro
  useEffect(() => {
    const els = [logo.current, ...Array.from(nav.current?.querySelectorAll<HTMLElement>("[data-goo]") ?? [])]
    const play = () => { gooTimeline(els, "in", { duration: 1.0, stagger: 0.07 }) }
    if (headerRevealed() || !isStageRoute(window.location.pathname)) {
      revealHeader()
      play()
      return
    }
    const off = onHeaderReveal(play)
    const safety = setTimeout(revealHeader, 9000)
    return () => { off(); clearTimeout(safety) }
  }, [])

  // Puntitos que aparecen bajo cada link al pasar el mouse
  useEffect(() => {
    const build = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10
      nav.current?.querySelectorAll<HTMLElement>("[data-scan]").forEach((link) => {
        link.querySelector(`.${styles.scan}`)?.remove()
        const row = document.createElement("span")
        row.className = styles.scan
        row.setAttribute("aria-hidden", "true")
        const n = Math.max(6, Math.round((link.offsetWidth / rem) * 1.6))
        for (let i = 0; i < n; i++) {
          const dot = document.createElement("i")
          dot.style.setProperty("--d", `${(Math.random() * 0.32).toFixed(3)}s`)
          row.append(dot)
        }
        link.append(row)
      })
    }
    let raf = 0
    const onResize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(build) }
    ;(document.fonts?.ready ?? Promise.resolve()).then(build)
    window.addEventListener("resize", onResize)
    return () => { window.removeEventListener("resize", onResize); cancelAnimationFrame(raf) }
  }, [])

  // Paralaje leve contrario al mouse
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const target = { x: 0, y: 0 }
    const cur = { x: 0, y: 0 }
    let last = ""
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return
      target.x = (e.clientX / window.innerWidth) * 2 - 1
      target.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    const tick = (_t: number, dtMs: number) => {
      const k = 1 - Math.pow(0.94, (dtMs / 1000) * 60)
      cur.x += (target.x - cur.x) * k
      cur.y += (target.y - cur.y) * k
      if (Math.abs(target.x - cur.x) < 5e-4) cur.x = target.x
      if (Math.abs(target.y - cur.y) < 5e-4) cur.y = target.y
      const key = `${cur.x.toFixed(4)}|${cur.y.toFixed(4)}`
      if (key === last || !header.current) return
      last = key
      header.current.style.setProperty("--px", cur.x.toFixed(4))
      header.current.style.setProperty("--py", cur.y.toFixed(4))
    }
    window.addEventListener("pointermove", onMove, { passive: true })
    gsap.ticker.add(tick)
    return () => { window.removeEventListener("pointermove", onMove); gsap.ticker.remove(tick) }
  }, [])

  function onNav(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    if (stageNavigate(href)) e.preventDefault()
  }

  return (
    <header ref={header} className={styles.header}>
      <Link href="/" className={styles.logo} aria-label="Retro Casa Productora — inicio" onClick={(e) => onNav(e, "/")}>
        <span ref={logo} className={styles.logoGoo} data-goo>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-retro.png" alt="" />
        </span>
      </Link>
      <nav ref={nav} className={styles.nav} aria-label="Principal">
        {LINKS.map(({ href, label }, i) => (
          <Link
            key={href}
            href={href}
            className={styles.link}
            aria-current={isCurrent(pathname, href) ? "page" : undefined}
            data-goo
            data-scan
            onClick={(e) => onNav(e, href)}
          >
            {label}
            {i < LINKS.length - 1 && <span className={styles.comma} aria-hidden>,</span>}
          </Link>
        ))}
      </nav>
    </header>
  )
}
