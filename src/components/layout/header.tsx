import { useEffect, useState } from "react"
import { useNav, type Section } from "@/store/nav"
import { useSync } from "@/store/sync"
import { cn } from "@/lib/utils"

const SECTION_TITLES: Record<Section, string> = {
  home: "Home",
  log: "Log",
  meals: "Meals",
  history: "History",
  weight: "Weight",
  settings: "Settings",
}

/** Re-render on an interval so relative timestamps stay fresh. */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

function relTime(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime()
  if (!isFinite(diff) || diff < 0) return "just now"
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function SyncBadge() {
  const { status, last } = useSync()
  const now = useNow(30000)

  const connected = status !== "error"
  const label =
    status === "error"
      ? "Sync unavailable"
      : last
        ? `Updated ${relTime(last, now)}`
        : status === "syncing"
          ? "Syncing…"
          : "Connected"

  return (
    <div className="flex items-center gap-1.5 rounded-full border bg-muted/60 py-1 pl-2 pr-2.5 text-xs font-medium">
      <span className="relative flex size-2">
        {status === "syncing" && connected && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full transition-colors",
            connected ? "bg-emerald-500" : "bg-destructive"
          )}
        />
      </span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  )
}

export function Header() {
  const { section } = useNav()
  const { auto } = useSync()

  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md pt-safe">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between gap-3 px-4 md:h-16 md:px-8 lg:px-10">
        <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl">
          {SECTION_TITLES[section]}
        </h1>
        {auto && <SyncBadge />}
      </div>
    </header>
  )
}
