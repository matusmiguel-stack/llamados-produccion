"use client"

import { useEffect, useRef } from "react"
import styles from "./CustomCursor.module.css"

export default function CustomCursor() {
  const dotRef  = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return

    let mx = window.innerWidth  / 2
    let my = window.innerHeight / 2
    let rx = mx, ry = my
    let rafId: number

    function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

    function move(e: MouseEvent) {
      mx = e.clientX
      my = e.clientY
      dotRef.current!.style.transform = `translate(${mx}px,${my}px)`
    }

    function over(e: MouseEvent) {
      const t = e.target as Element | null
      const isLink    = !!t?.closest("a, button")
      const isVideo   = !!t?.closest("[data-cursor='play']")

      dotRef.current!.classList.toggle(styles.dotHover, isLink)
      ringRef.current!.classList.toggle(styles.ringHover, isLink && !isVideo)
      ringRef.current!.classList.toggle(styles.ringPlay,  isVideo)
    }

    // Show / hide when cursor enters or leaves the window
    document.addEventListener("mouseleave", () => {
      dotRef.current!.style.opacity  = "0"
      ringRef.current!.style.opacity = "0"
    })
    document.addEventListener("mouseenter", () => {
      dotRef.current!.style.opacity  = "1"
      ringRef.current!.style.opacity = "1"
    })

    function tick() {
      rx = lerp(rx, mx, 0.1)
      ry = lerp(ry, my, 0.1)
      ringRef.current!.style.transform = `translate(${rx}px,${ry}px)`
      rafId = requestAnimationFrame(tick)
    }

    window.addEventListener("mousemove", move)
    window.addEventListener("mouseover", over)
    rafId = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener("mousemove", move)
      window.removeEventListener("mouseover", over)
      cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <>
      <div ref={dotRef}  className={styles.dot}  aria-hidden />
      <div ref={ringRef} className={styles.ring} aria-hidden />
    </>
  )
}
