import { useEffect, useRef, useState, type ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const THRESHOLD = 70
const MAX_PULL = 110

/**
 * Pull-down-to-refresh for the installed PWA (standalone display mode), where
 * the browser's own pull-to-refresh isn't available. In a normal browser tab
 * this is a no-op so the native behavior is left intact.
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const pullRef = useRef(0)
  const startYRef = useRef<number | null>(null)
  const refreshingRef = useRef(false)
  const [settling, setSettling] = useState(true)

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
      if (refreshingRef.current || window.scrollY > 0) {
        startYRef.current = null
        return
      }
      startYRef.current = e.touches[0].clientY
    }

    function onMove(e: TouchEvent) {
      if (startYRef.current === null || refreshingRef.current) return
      const dy = e.touches[0].clientY - startYRef.current
      if (dy <= 0 || window.scrollY > 0) {
        if (pullRef.current !== 0) reset(true)
        return
      }
      const p = Math.min(dy * 0.5, MAX_PULL)
      pullRef.current = p
      setSettling(false)
      setPull(p)
      if (e.cancelable) e.preventDefault()
    }

    function onEnd() {
      if (startYRef.current === null) return
      startYRef.current = null
      if (pullRef.current >= THRESHOLD) {
        refreshingRef.current = true
        setRefreshing(true)
        setSettling(true)
        setPull(THRESHOLD)
        window.setTimeout(() => window.location.reload(), 350)
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
            className={cn("size-4 text-primary", refreshing && "animate-spin")}
            style={{
              transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
              opacity: 0.4 + progress * 0.6,
            }}
          />
        </div>
      </div>
      <div
        style={{
          transform: `translateY(${pull}px)`,
          transition: settling
            ? "transform 0.25s cubic-bezier(0.2,0,0,1)"
            : "none",
        }}
      >
        {children}
      </div>
    </div>
  )
}
