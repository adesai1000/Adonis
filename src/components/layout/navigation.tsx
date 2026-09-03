import {
  CalendarDays,
  Dumbbell,
  Home,
  Scale,
  Settings,
  UtensilsCrossed,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useNav, type Section } from "@/store/nav"
import { cn } from "@/lib/utils"

interface NavItem {
  key: Section
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Home", icon: Home },
  { key: "log", label: "Log", icon: Dumbbell },
  { key: "meals", label: "Meals", icon: UtensilsCrossed },
  { key: "history", label: "History", icon: CalendarDays },
  { key: "weight", label: "Weight", icon: Scale },
  { key: "settings", label: "Settings", icon: Settings },
]

/** Desktop: the Stickshift `.nav` pill rail that lives inside the topbar. */
export function TopNav() {
  const { section, setSection } = useNav()
  return (
    <nav
      aria-label="Primary"
      className="pill-surface hidden items-center gap-0.5 rounded-full p-1 md:flex"
    >
      {NAV_ITEMS.map((item) => {
        const active = section === item.key
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => setSection(item.key)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-2 text-[13.5px] font-medium whitespace-nowrap transition-[color,background-color] duration-200",
              active
                ? "bg-foreground text-background"
                : "text-ink-2 hover:text-foreground"
            )}
          >
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

/** Mobile: a floating frosted dock. */
export function BottomNav() {
  const { section, setSection } = useNav()
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 md:hidden"
    >
      <div className="topbar-glass mx-auto flex max-w-lg items-stretch justify-around rounded-[26px] px-1 py-1">
        {NAV_ITEMS.map((item) => {
          const active = section === item.key
          const Icon = item.icon
          return (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className="group flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-1 px-0.5"
            >
              <span
                className={cn(
                  "flex h-8 w-12 items-center justify-center rounded-full transition-[background-color,transform] duration-200 group-active:scale-90",
                  active ? "bg-foreground" : "bg-transparent"
                )}
              >
                <Icon
                  className={cn(
                    "size-[1.25rem] transition-colors",
                    active ? "text-background" : "text-ink-2"
                  )}
                  strokeWidth={active ? 2.4 : 2}
                />
              </span>
              <span
                className={cn(
                  "text-[0.65rem] leading-none font-semibold transition-colors",
                  active ? "text-foreground" : "text-ink-3"
                )}
              >
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
