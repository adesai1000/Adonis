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
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur-md pb-safe md:hidden">
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {NAV_ITEMS.map((item) => {
          const active = section === item.key
          const Icon = item.icon
          return (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className={cn(
                "flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[0.65rem] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("size-5", active && "stroke-[2.5]")} />
              {item.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
