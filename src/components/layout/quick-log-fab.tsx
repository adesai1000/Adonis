import { useState } from "react"
import { Activity, Dumbbell, Plus, Scale, UtensilsCrossed } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { useNav, type LogTab } from "@/store/nav"
import { cn } from "@/lib/utils"

const OPTIONS: { tab: LogTab; label: string; icon: LucideIcon; color: string }[] = [
  { tab: "food", label: "Food", icon: UtensilsCrossed, color: "text-amber" },
  { tab: "workout", label: "Workout", icon: Dumbbell, color: "text-green-deep dark:text-green" },
  { tab: "cardio", label: "Cardio", icon: Activity, color: "text-red" },
  { tab: "weight", label: "Body Weight", icon: Scale, color: "text-ink-2" },
]

export function QuickLogFab() {
  const [open, setOpen] = useState(false)
  const { goLog } = useNav()

  return (
    <>
      <Button
        size="icon"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-30 size-14 shadow-[var(--shadow-fab)] md:right-8 md:bottom-8"
        aria-label="Quick log"
      >
        <Plus className="size-6" />
        <span className="absolute top-2 right-2 size-2 rounded-full bg-green" aria-hidden="true" />
      </Button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader className="pb-2">
            <DrawerTitle>Quick log</DrawerTitle>
          </DrawerHeader>
          <div className="grid grid-cols-2 gap-3 p-4 pb-8">
            {OPTIONS.map((opt) => {
              const Icon = opt.icon
              return (
                <button
                  key={opt.tab}
                  onClick={() => {
                    goLog(opt.tab)
                    setOpen(false)
                  }}
                  className="glass flex flex-col items-center justify-center gap-2 rounded-[18px] py-6 transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
                >
                  <Icon className={cn("size-6", opt.color)} />
                  <span className="text-sm font-semibold">{opt.label}</span>
                </button>
              )
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
