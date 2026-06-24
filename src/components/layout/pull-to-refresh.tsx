import { useEffect, useRef, useState, type ReactNode } from "react"
import { Check, Loader2 } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { useSync } from "@/store/sync"

const THRESHOLD = 70
const MAX_PULL = 110

type RState = "idle" | "refreshing" | "done"

/**
 * Pull-down-to-refresh for the installed PWA (standalone display mode). Pulling
 * past the threshold runs a sync refresh and shows a Refreshing → Synced
 * indicator. No-op in a normal browser tab (native pull-to-refresh stays).
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const { refresh } = useSync()
  const [pull, setPull] = useState(0)
  const [rstate, setRstate] = useState<RState>("idle")
  const [settling, setSettling] = useState(true)

  const pullRef = useRef(0)
  const startYRef = useRef<number | null>(null)
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
      if (rstateRef.current !== "idle" || window.scrollY > 0) {
        startYRef.current = null
        return
      }
      startYRef.current = e.touches[0].clientY
    }

    function onMove(e: TouchEvent) {
      if (startYRef.current === null || rstateRef.current !== "idle") return
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

    async function onEnd() {
      if (startYRef.current === null) return
      startYRef.current = null
      if (pullRef.current >= THRESHOLD) {
        reset(true)
        setRstate("refreshing")
        try {
          await refreshRef.current()
        } catch {
          /* surfaced in the sync audit */
        }
        setRstate("done")
        window.setTimeout(() => setRstate("idle"), 1000)
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

  const showPill = rstate !== "idle"
  const offset = showPill ? 56 : pull
  const progress = Math.min(pull / THRESHOLD, 1)

  return (
    <div className="relative">
      {/* Pull spinner (during the gesture) */}
      {!showPill && (
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
      )}

      {/* Refresh indicator (after release) */}
      {showPill && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center duration-200 animate-in fade-in-0 slide-in-from-top-2">
          <div className="flex w-44 flex-col gap-2 rounded-2xl border bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur">
            <div className="flex items-center gap-2 text-sm font-medium">
              {rstate === "done" ? (
                <Check className="size-4 text-emerald-500" />
              ) : (
                <Loader2 className="size-4 animate-spin text-primary" />
              )}
              {rstate === "done" ? "Synced" : "Refreshing…"}
            </div>
            <Progress value={rstate === "done" ? 100 : 65} className="h-1" />
          </div>
        </div>
      )}

      <div
        style={{
          transform: `translateY(${offset}px)`,
          transition:
            settling || showPill
              ? "transform 0.3s cubic-bezier(0.2,0,0,1)"
              : "none",
        }}
      >
        {children}
      </div>
    </div>
  )
}
