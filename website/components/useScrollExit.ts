"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

// Al montar, ignora el scroll durante este tiempo: evita que la inercia
// del gesto que te trajo a esta página (trackpad/mouse) seguido disparando
// eventos "wheel" te empuje de inmediato a la siguiente.
const MOUNT_COOLDOWN_MS = 700

/* Scroll o swipe hacia abajo/arriba → navega a la página siguiente/anterior de la secuencia */
export function useScrollExit(nextHref: string | null, prevHref: string | null = null) {
  const router = useRouter()
  const navigatingRef = useRef(false)

  useEffect(() => {
    if (!nextHref && !prevHref) return

    const mountedAt = Date.now()
    navigatingRef.current = false

    function go(href: string, dir: "nav-forward" | "nav-back") {
      if (navigatingRef.current) return
      if (Date.now() - mountedAt < MOUNT_COOLDOWN_MS) return
      navigatingRef.current = true
      router.push(href, { transitionTypes: [dir] })
    }

    function onWheel(e: WheelEvent) {
      if (e.deltaY > 60 && nextHref) go(nextHref, "nav-forward")
      else if (e.deltaY < -60 && prevHref) go(prevHref, "nav-back")
    }

    let touchStartY: number | null = null
    function onTouchStart(e: TouchEvent) { touchStartY = e.touches[0].clientY }
    function onTouchEnd(e: TouchEvent) {
      if (touchStartY === null) return
      const dy = touchStartY - e.changedTouches[0].clientY
      if (dy > 60 && nextHref) go(nextHref, "nav-forward")
      else if (dy < -60 && prevHref) go(prevHref, "nav-back")
      touchStartY = null
    }

    window.addEventListener("wheel", onWheel, { passive: true })
    window.addEventListener("touchstart", onTouchStart, { passive: true })
    window.addEventListener("touchend", onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener("wheel", onWheel)
      window.removeEventListener("touchstart", onTouchStart)
      window.removeEventListener("touchend", onTouchEnd)
    }
  }, [nextHref, prevHref, router])
}
