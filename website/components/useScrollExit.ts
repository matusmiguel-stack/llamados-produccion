"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

/* Scroll o swipe hacia abajo → navega a la siguiente página de la secuencia */
export function useScrollExit(nextHref: string | null) {
  const router = useRouter()
  const navigatingRef = useRef(false)

  useEffect(() => {
    if (!nextHref) return

    function goNext() {
      if (navigatingRef.current) return
      navigatingRef.current = true
      router.push(nextHref!, { transitionTypes: ["nav-forward"] })
    }

    function onWheel(e: WheelEvent) {
      if (e.deltaY > 60) goNext()
    }

    let touchStartY: number | null = null
    function onTouchStart(e: TouchEvent) { touchStartY = e.touches[0].clientY }
    function onTouchEnd(e: TouchEvent) {
      if (touchStartY === null) return
      if (touchStartY - e.changedTouches[0].clientY > 60) goNext()
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
  }, [nextHref, router])
}
