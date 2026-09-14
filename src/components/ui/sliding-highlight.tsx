import { useLayoutEffect, useRef, useState, type CSSProperties } from "react"

import { cn } from "@/lib/utils"

interface Slot {
  left: number
  top: number
  width: number
  height: number
}

/**
 * One highlight pill that slides between the segments of a rail instead of
 * each segment painting its own. Drop it inside any `relative` container:
 * it finds the active segment via `selector` (matched against the container's
 * descendants), sits under it, and glides whenever the match moves. Siblings
 * must be positioned (`relative`) so they paint above it.
 *
 * Re-measures on attribute changes (Radix `data-state`, `aria-current`),
 * container resize, and once fonts finish loading.
 */
export function SlidingHighlight({
  selector,
  className,
}: {
  selector: string
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    const rail = ref.current?.parentElement
    if (!rail) return
    const measure = () => {
      const el = rail.querySelector<HTMLElement>(selector)
      if (!el) {
        setSlot(null)
        return
      }
      // offsets are relative to the nearest positioned ancestor — the rail
      let left = 0
      let top = 0
      for (let n: HTMLElement | null = el; n && n !== rail; n = n.offsetParent as HTMLElement | null) {
        left += n.offsetLeft
        top += n.offsetTop
      }
      setSlot({ left, top, width: el.offsetWidth, height: el.offsetHeight })
    }
    measure()
    // land the first paint without sliding in from the origin
    const raf = requestAnimationFrame(() => setReady(true))
    const mo = new MutationObserver(measure)
    mo.observe(rail, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state", "aria-current", "aria-pressed", "class"],
    })
    const ro = new ResizeObserver(measure)
    ro.observe(rail)
    document.fonts?.ready.then(measure)
    return () => {
      cancelAnimationFrame(raf)
      mo.disconnect()
      ro.disconnect()
    }
  }, [selector])

  const style: CSSProperties | undefined = slot
    ? {
        transform: `translate(${slot.left}px, ${slot.top}px)`,
        width: slot.width,
        height: slot.height,
      }
    : undefined

  return (
    <span
      ref={ref}
      aria-hidden
      style={style}
      className={cn(
        "pointer-events-none absolute top-0 left-0 rounded-full bg-foreground will-change-transform",
        "dark:border dark:border-white/15 dark:bg-white/10 dark:backdrop-blur-md",
        "motion-safe:[transition:transform_320ms_cubic-bezier(0.32,0.72,0,1),width_320ms_cubic-bezier(0.32,0.72,0,1),height_320ms_cubic-bezier(0.32,0.72,0,1)]",
        (!slot || !ready) && "transition-none",
        !slot && "opacity-0",
        className
      )}
    />
  )
}
