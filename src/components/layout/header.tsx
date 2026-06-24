import { Check, Loader2, TriangleAlert } from "lucide-react"
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

function SyncBadge() {
  const { phase } = useSync()
  if (phase === "idle") return null

  const map = {
    syncing: {
      icon: <Loader2 className="size-3.5 animate-spin text-muted-foreground" />,
      text: "Syncing…",
      cls: "text-muted-foreground",
    },
    synced: {
      icon: <Check className="size-3.5 text-emerald-500" />,
      text: "Synced",
      cls: "text-foreground",
    },
    error: {
      icon: <TriangleAlert className="size-3.5 text-destructive" />,
      text: "Sync failed",
      cls: "text-destructive",
    },
  }[phase]

  return (
    <div className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium duration-200 animate-in fade-in-0 zoom-in-95">
      {map.icon}
      <span className={cn(map.cls)}>{map.text}</span>
    </div>
  )
}

export function Header() {
  const { section } = useNav()

  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md pt-safe md:border-b">
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between gap-3 px-4 md:h-16 md:px-8 lg:px-10">
        <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl">
          {SECTION_TITLES[section]}
        </h1>
        <SyncBadge />
      </div>
    </header>
  )
}
