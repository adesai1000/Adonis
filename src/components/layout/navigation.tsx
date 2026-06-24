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

const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Home", icon: Home },
  { key: "log", label: "Log", icon: Dumbbell },
  { key: "meals", label: "Meals", icon: UtensilsCrossed },
  { key: "history", label: "History", icon: CalendarDays },
  { key: "weight", label: "Weight", icon: Scale },
  { key: "settings", label: "Settings", icon: Settings },
]

export function Sidebar() {
  const { section, setSection } = useNav()
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r bg-sidebar md:flex">
      <div className="flex h-14 items-center px-5">
        <span className="text-sm font-semibold tracking-widest text-muted-foreground">
          ADONIS
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => {
          const active = section === item.key
          const Icon = item.icon
          return (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="size-5 shrink-0" />
              {item.label}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}

export function BottomNav() {
  const { section, setSection } = useNav()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur-md pb-safe md:hidden">
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1">
        {NAV_ITEMS.map((item) => {
          const active = section === item.key
          const Icon = item.icon
          return (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className="group flex min-h-[4rem] flex-1 flex-col items-center justify-center gap-1 px-0.5 pb-1.5 pt-2"
            >
              <span
                className={cn(
                  "flex h-8 w-14 items-center justify-center rounded-full transition-all duration-200 group-active:scale-90",
                  active ? "bg-primary/15" : "bg-transparent"
                )}
              >
                <Icon
                  className={cn(
                    "size-[1.4rem] transition-colors",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                  strokeWidth={active ? 2.4 : 2}
                />
              </span>
              <span
                className={cn(
                  "text-[0.7rem] font-medium leading-none transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
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
