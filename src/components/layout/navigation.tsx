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

function scrollToTop() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" })
}

/** Switch sections; re-tapping the current one scrolls back to the top. */
function useNavigate() {
  const { section, setSection } = useNav()
  return {
    section,
    go(key: Section) {
      if (key === section) scrollToTop()
      else setSection(key)
    },
  }
}

/** Desktop: the Stickshift `.nav` pill rail that lives inside the topbar. */
export function TopNav() {
  const { section, go } = useNavigate()
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
            onClick={() => go(item.key)}
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

/** Mobile: a floating frosted dock. The green rim only lights while a tab is pressed. */
export function BottomNav() {
  const { section, go } = useNavigate()
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 md:hidden"
    >
      <div
        className={cn(
          "topbar-glass mx-auto flex max-w-lg items-stretch justify-around rounded-[26px] px-1 py-1 transition-[border-color,box-shadow] duration-200",
          // neutral rim at rest…
          "[box-shadow:inset_0_1px_0_var(--topbar-edge),0_14px_40px_-16px_rgba(16,19,16,0.22)]",
          // …green only while a tab is being pressed
          "has-[button:active]:border-green/60 has-[button:active]:[box-shadow:inset_0_1px_0_var(--topbar-edge),inset_0_0_0_1px_rgba(29,185,84,0.18),0_0_0_1px_rgba(29,185,84,0.35),0_16px_46px_-14px_rgba(29,185,84,0.42)]"
        )}
      >
        {NAV_ITEMS.map((item) => {
          const active = section === item.key
          const Icon = item.icon
          return (
            <button
              key={item.key}
              onClick={() => go(item.key)}
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
