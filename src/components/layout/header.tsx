import { Check, Loader2, TriangleAlert } from "lucide-react"
import { useNav, type Section } from "@/store/nav"
import { useSync } from "@/store/sync"
import { cn } from "@/lib/utils"
import { BrandMark, Wordmark } from "@/components/brand/logo"
import { TopNav } from "./navigation"
import { WeightGoalProgress } from "./weight-goal-progress"

export const SECTION_TITLES: Record<Section, string> = {
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
      icon: <Loader2 className="size-3.5 animate-spin text-ink-3" />,
      text: "Syncing…",
      cls: "text-ink-2",
    },
    synced: {
      icon: <Check className="size-3.5 text-green-deep dark:text-green" />,
      text: "Synced",
      cls: "text-foreground",
    },
    error: {
      icon: <TriangleAlert className="size-3.5 text-red" />,
      text: "Sync failed",
      cls: "text-red",
    },
  }[phase]

  return (
    <div className="pill-surface flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold duration-200 animate-in fade-in-0 zoom-in-95">
      {map.icon}
      <span className={cn(map.cls)}>{map.text}</span>
    </div>
  )
}

/** Stickshift topbar: an icy frosted pill that floats over the page. */
export function Header() {
  const { section, setSection } = useNav()

  return (
    <div className="sticky top-0 z-30 px-3 pt-safe md:px-4">
      <header className="topbar-glass glint relative mx-auto mt-2 flex max-w-[1720px] items-center justify-between gap-3 rounded-[22px] px-3 py-2 md:mt-3 md:px-4 md:py-2.5">
        <button
          type="button"
          onClick={() => {
            if (section === "home") {
              const reduce = window.matchMedia(
                "(prefers-reduced-motion: reduce)"
              ).matches
              window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" })
            } else {
              setSection("home")
            }
          }}
          aria-label="Adonis home"
          className="flex shrink-0 items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandMark size={36} />
          <Wordmark className="hidden sm:inline" />
          <span className="font-display text-[17px] font-semibold tracking-[-0.01em] sm:hidden">
            {SECTION_TITLES[section]}
          </span>
        </button>

        <TopNav />

        <div className="flex shrink-0 items-center gap-2.5">
          <WeightGoalProgress />
          <SyncBadge />
        </div>
      </header>
    </div>
  )
}
