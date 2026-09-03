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
 * Reorderable list driven by pointer events (mouse + touch, no DnD library).
 * The grabbed row follows the pointer 1:1; the other rows glide out of its
 * way with a FLIP animation. On release the row settles into its slot.
 */
export function DragList<T>({
  items,
  getKey,
  onReorder,
  renderItem,
  className,
}: DragListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const dragKeyRef = useRef<string | null>(null)
  const orderRef = useRef<T[]>(items)
  orderRef.current = items

  // Drag geometry. offsetTop ignores CSS transforms, so it tracks the row's
  // *slot* even while the row itself is translated under the pointer.
  const startPointerY = useRef(0)
  const startSlotTop = useRef(0)
  const lastPointerY = useRef(0)

  function draggedEl(): HTMLElement | null {
    const container = containerRef.current
    const key = dragKeyRef.current
    if (!container || key == null) return null
    return (
      (Array.from(container.children) as HTMLElement[]).find(
        (c) => c.dataset.key === key
      ) ?? null
    )
  }

  function pinToPointer() {
    const el = draggedEl()
    if (!el) return
    const dy =
      lastPointerY.current -
      startPointerY.current -
      (el.offsetTop - startSlotTop.current)
    el.style.transition = "none"
    el.style.transform = `translateY(${dy}px)`
  }

  // ── FLIP: animate the *other* rows sliding to their new positions ──
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
      if (key === dragKeyRef.current) continue
      const prev = prevRects.current.get(key)
      const next = newRects.get(key)!
      if (!prev) continue
      const dy = prev.top - next.top
      if (dy === 0) continue
      child.style.transition = "none"
      child.style.transform = `translateY(${dy}px)`
      requestAnimationFrame(() => {
        child.style.transition = "transform 180ms cubic-bezier(0.2, 0, 0, 1)"
        child.style.transform = ""
      })
    }
    prevRects.current = newRects
    // After a reorder the grabbed row's slot moved; keep it under the finger.
    if (dragKeyRef.current) pinToPointer()
  })

  function reorder(from: number, to: number) {
    const next = orderRef.current.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    orderRef.current = next
    onReorder(next)
  }

  /** Index the grabbed row should occupy for the current pointer position. */
  function findTarget(): number {
    const container = containerRef.current
    const el = draggedEl()
    if (!container || !el) return -1
    const children = Array.from(container.children) as HTMLElement[]
    const from = children.indexOf(el)
    const rect = el.getBoundingClientRect()
    const centerY = rect.top + rect.height / 2
    // Walk from the current slot outward: swap only once the row's visual
    // center crosses a neighbor's midpoint (natural hysteresis, no jitter).
    let to = from
    for (let i = from - 1; i >= 0; i--) {
      const r = children[i].getBoundingClientRect()
      if (centerY < r.top + r.height / 2) to = i
      else break
    }
    if (to === from) {
      for (let i = from + 1; i < children.length; i++) {
        const r = children[i].getBoundingClientRect()
        if (centerY > r.top + r.height / 2) to = i
        else break
      }
    }
    return to
  }

  function handlePointerDown(e: React.PointerEvent, key: string) {
    e.preventDefault()
    e.stopPropagation()
    const container = containerRef.current
    if (!container) return
    const el = (Array.from(container.children) as HTMLElement[]).find(
      (c) => c.dataset.key === key
    )
    if (!el) return

    dragKeyRef.current = key
    setDragKey(key)
    startPointerY.current = e.clientY
    lastPointerY.current = e.clientY
    startSlotTop.current = el.offsetTop
    document.body.style.userSelect = "none"
    document.body.style.cursor = "grabbing"

    const onMove = (ev: PointerEvent) => {
      if (dragKeyRef.current == null) return
      lastPointerY.current = ev.clientY
      pinToPointer()
      const container = containerRef.current
      const cur = draggedEl()
      if (!container || !cur) return
      const from = (Array.from(container.children) as HTMLElement[]).indexOf(cur)
      const to = findTarget()
      if (to >= 0 && to !== from) reorder(from, to)
    }
    const onUp = () => {
      const cur = draggedEl()
      if (cur) {
        // settle into the slot
        cur.style.transition = "transform 160ms cubic-bezier(0.2, 0, 0, 1)"
        cur.style.transform = ""
      }
      dragKeyRef.current = null
      setDragKey(null)
      document.body.style.userSelect = ""
      document.body.style.cursor = ""
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
        const key = getKey(item)
        const dragging = dragKey === key
        const handle: DragHandleProps = {
          onPointerDown: (e) => handlePointerDown(e, key),
          style: { touchAction: "none", cursor: "grab" },
          className: "shrink-0",
        }
        return (
          <div
            key={key}
            data-key={key}
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
