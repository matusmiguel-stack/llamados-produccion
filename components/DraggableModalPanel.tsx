"use client"

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"

type DraggableModalPanelProps = {
  children: ReactNode
  className?: string
  style?: CSSProperties
  enabled?: boolean
  resetKey?: string | number | boolean
}

export function DraggableModalPanel({
  children,
  className,
  style,
  enabled = true,
  resetKey,
}: DraggableModalPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  useEffect(() => {
    setOffset({ x: 0, y: 0 })
    setIsDragging(false)
    dragRef.current = null
  }, [resetKey])

  useEffect(() => {
    if (!enabled) return

    function handlePointerMove(event: PointerEvent) {
      if (!dragRef.current || event.pointerId !== dragRef.current.pointerId) return

      event.preventDefault()

      setOffset({
        x:
          dragRef.current.originX +
          (event.clientX - dragRef.current.startX),
        y:
          dragRef.current.originY +
          (event.clientY - dragRef.current.startY),
      })
    }

    function stopDrag(event: PointerEvent) {
      if (!dragRef.current || event.pointerId !== dragRef.current.pointerId) return

      dragRef.current = null
      setIsDragging(false)

      if (panelRef.current?.hasPointerCapture(event.pointerId)) {
        panelRef.current.releasePointerCapture(event.pointerId)
      }
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: false })
    window.addEventListener("pointerup", stopDrag)
    window.addEventListener("pointercancel", stopDrag)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", stopDrag)
      window.removeEventListener("pointercancel", stopDrag)
    }
  }, [enabled])

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!enabled || event.button !== 0) return

    const target = event.target as HTMLElement
    if (!target.closest("[data-drag-handle]")) return
    if (target.closest("button, input, select, textarea, a, [data-no-drag]")) {
      return
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    }
    setIsDragging(true)
    event.preventDefault()

    panelRef.current?.setPointerCapture(event.pointerId)
  }

  return (
    <div
      ref={panelRef}
      className={className}
      data-dragging={isDragging || undefined}
      onPointerDown={handlePointerDown}
      style={{
        ...style,
        pointerEvents: "auto",
        transform: enabled ? `translate3d(${offset.x}px, ${offset.y}px, 0)` : style?.transform,
        transition: isDragging ? "none" : undefined,
        willChange: isDragging ? "transform" : undefined,
      }}
    >
      {children}
    </div>
  )
}

export const draggableModalHeaderStyle: CSSProperties = {
  cursor: "grab",
  touchAction: "none",
  userSelect: "none",
}
