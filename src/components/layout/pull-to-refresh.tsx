import { useEffect, useRef, useState, type ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { useSync } from "@/store/sync"

const THRESHOLD = 70
const MAX_PULL = 110
/** Finger travel before we decide whether a touch is a pull or a scroll. */
const DEAD_ZONE = 8

type RState = "idle" | "refreshing"
/**
 * What the current touch gesture is doing. Decided once per gesture, after
 * DEAD_ZONE px of movement, and never revisited: a gesture that started as
 * a scroll must never call preventDefault, or iOS locks scrolling for the
 * rest of the touch.
 */
type Gesture = "undecided" | "pull" | "scroll"

/**
 * Pull-down-to-refresh for the installed PWA (standalone display mode). Pulling
 * past the threshold runs a sync refresh; progress is surfaced via the header's
 * sync badge, not a second indicator here. No-op in a normal browser tab
 * (native pull-to-refresh stays).
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const { refresh } = useSync()
  const [pull, setPull] = useState(0)
  const [rstate, setRstate] = useState<RState>("idle")
  const [settling, setSettling] = useState(true)

  const pullRef = useRef(0)
  const startYRef = useRef<number | null>(null)
  const gestureRef = useRef<Gesture>("scroll")
  const rstateRef = useRef<RState>("idle")
  rstateRef.current = rstate
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    if (!standalone) return

    function reset(animate: boolean) {
      pullRef.current = 0
      setSettling(animate)
      setPull(0)
    }

    function onStart(e: TouchEvent) {
      gestureRef.current = "scroll"
      startYRef.current = null
      if (rstateRef.current !== "idle" || window.scrollY > 0) return
      if (e.touches.length !== 1) return
      startYRef.current = e.touches[0].clientY
      gestureRef.current = "undecided"
    }

    function onMove(e: TouchEvent) {
      if (startYRef.current === null || gestureRef.current === "scroll") return
      const dy = e.touches[0].clientY - startYRef.current

      if (gestureRef.current === "undecided") {
        if (Math.abs(dy) < DEAD_ZONE) return
        // Only a downward drag from the very top becomes a pull. Anything
        // else is a scroll, and we stay out of the browser's way from here on.
        if (dy > 0 && window.scrollY <= 0) {
          gestureRef.current = "pull"
        } else {
          gestureRef.current = "scroll"
          return
        }
      }

      // Pull mode: we own this gesture. Keep the page from scrolling under
      // the spinner, including when the finger comes back up.
      if (e.cancelable) e.preventDefault()
      const p = Math.max(0, Math.min((dy - DEAD_ZONE) * 0.5, MAX_PULL))
      pullRef.current = p
      setSettling(false)
      setPull(p)
    }

    async function onEnd() {
      const wasPull = gestureRef.current === "pull"
      gestureRef.current = "scroll"
      startYRef.current = null
      if (!wasPull) return
      if (pullRef.current >= THRESHOLD) {
        reset(true)
        setRstate("refreshing")
        try {
          await refreshRef.current()
        } catch {
          /* surfaced in the sync audit */
        } finally {
          setRstate("idle")
        }
      } else {
        reset(true)
      }
    }

    window.addEventListener("touchstart", onStart, { passive: true })
    window.addEventListener("touchmove", onMove, { passive: false })
    window.addEventListener("touchend", onEnd, { passive: true })
    window.addEventListener("touchcancel", onEnd, { passive: true })
    return () => {
      window.removeEventListener("touchstart", onStart)
      window.removeEventListener("touchmove", onMove)
      window.removeEventListener("touchend", onEnd)
      window.removeEventListener("touchcancel", onEnd)
    }
  }, [])

  const progress = Math.min(pull / THRESHOLD, 1)

  return (
    <div className="relative">
      {/* Pull spinner (during the gesture, before release) */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
        style={{
          transform: `translateY(${pull - 40}px)`,
          opacity: pull > 4 ? 1 : 0,
          transition: settling ? "opacity 0.2s, transform 0.2s" : "none",
        }}
      >
        <div className="flex size-9 items-center justify-center rounded-full border bg-background shadow-sm">
          <Loader2
            className="size-4 text-primary"
            style={{
              transform: `rotate(${progress * 270}deg)`,
              opacity: 0.4 + progress * 0.6,
            }}
          />
        </div>
      </div>

      <div
        style={{
          transform: pull ? `translateY(${pull}px)` : undefined,
          transition: settling ? "transform 0.3s cubic-bezier(0.2,0,0,1)" : "none",
        }}
      >
        {children}
      </div>
    </div>
  )
}
