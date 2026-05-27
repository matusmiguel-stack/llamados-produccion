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
    }

    window.addEventListener("pointermove", handlePointerMove)
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
    if (target.closest("button, input, select, textarea, a, label, [data-no-drag]")) {
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
  }

  return (
    <div
      className={className}
      data-dragging={isDragging || undefined}
      onPointerDown={handlePointerDown}
      style={{
        ...style,
        pointerEvents: "auto",
        transform: enabled ? `translate(${offset.x}px, ${offset.y}px)` : style?.transform,
        transition: isDragging ? "none" : undefined,
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
