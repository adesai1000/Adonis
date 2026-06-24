import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface DragHandleProps {
  onPointerDown: (e: React.PointerEvent) => void
  style: React.CSSProperties
  className: string
}

interface DragListProps<T> {
  items: T[]
  getKey: (item: T) => string
  onReorder: (next: T[]) => void
  renderItem: (
    item: T,
    handle: DragHandleProps,
    state: { dragging: boolean; index: number }
  ) => ReactNode
  className?: string
}

/**
 * Reorderable list driven by pointer events (works with mouse + touch, no
 * external DnD library). Items glide to their new positions via a FLIP
 * animation; the item being dragged snaps instantly so it stays responsive.
 */
export function DragList<T>({
  items,
  getKey,
  onReorder,
  renderItem,
  className,
}: DragListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const dragIndexRef = useRef<number | null>(null)
  const orderRef = useRef<T[]>(items)
  orderRef.current = items

  // ── FLIP: animate rows sliding to their new positions ──
  const prevRects = useRef<Map<string, DOMRect>>(new Map())
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const children = Array.from(container.children) as HTMLElement[]
    const newRects = new Map<string, DOMRect>()
    for (const child of children) {
      const key = child.dataset.key
      if (key) newRects.set(key, child.getBoundingClientRect())
    }
    for (const child of children) {
      const key = child.dataset.key
      if (!key) continue
      const prev = prevRects.current.get(key)
      const next = newRects.get(key)!
      if (!prev || child.dataset.dragging === "true") continue
      const dx = prev.left - next.left
      const dy = prev.top - next.top
      if (dx === 0 && dy === 0) continue
      child.style.transition = "none"
      child.style.transform = `translate(${dx}px, ${dy}px)`
      requestAnimationFrame(() => {
        child.style.transition = "transform 160ms cubic-bezier(0.2, 0, 0, 1)"
        child.style.transform = ""
      })
    }
    prevRects.current = newRects
  })

  function reorder(from: number, to: number) {
    const next = orderRef.current.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    orderRef.current = next
    onReorder(next)
  }

  function findTarget(clientY: number): number {
    const container = containerRef.current
    if (!container) return dragIndexRef.current ?? 0
    const children = Array.from(container.children) as HTMLElement[]
    for (let i = 0; i < children.length; i++) {
      const r = children[i].getBoundingClientRect()
      if (clientY < r.top + r.height / 2) return i
    }
    return children.length - 1
  }

  function handlePointerDown(e: React.PointerEvent, index: number) {
    e.preventDefault()
    e.stopPropagation()
    setDragIndex(index)
    dragIndexRef.current = index
    document.body.style.userSelect = "none"

    const onMove = (ev: PointerEvent) => {
      const current = dragIndexRef.current
      if (current == null) return
      const target = findTarget(ev.clientY)
      if (target !== current && target >= 0) {
        reorder(current, target)
        dragIndexRef.current = target
        setDragIndex(target)
      }
    }
    const onUp = () => {
      dragIndexRef.current = null
      setDragIndex(null)
      document.body.style.userSelect = ""
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
  }

  return (
    <div ref={containerRef} className={cn("flex flex-col", className)}>
      {items.map((item, index) => {
        const dragging = dragIndex === index
        const handle: DragHandleProps = {
          onPointerDown: (e) => handlePointerDown(e, index),
          style: { touchAction: "none", cursor: "grab" },
          className: "shrink-0",
        }
        return (
          <div
            key={getKey(item)}
            data-key={getKey(item)}
            data-dragging={dragging ? "true" : "false"}
            className={cn(
              "will-change-transform",
              dragging && "relative z-10 scale-[1.02] opacity-95 shadow-lg"
            )}
          >
            {renderItem(item, handle, { dragging, index })}
          </div>
        )
      })}
    </div>
  )
}
