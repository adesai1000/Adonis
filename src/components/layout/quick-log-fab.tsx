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
  { tab: "food", label: "Food", icon: UtensilsCrossed, color: "text-amber-500" },
  { tab: "workout", label: "Workout", icon: Dumbbell, color: "text-primary" },
  { tab: "cardio", label: "Cardio", icon: Activity, color: "text-rose-500" },
  { tab: "weight", label: "Body Weight", icon: Scale, color: "text-emerald-500" },
]

export function QuickLogFab() {
  const [open, setOpen] = useState(false)
  const { goLog } = useNav()

  return (
    <>
      <Button
        size="icon"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-30 size-14 rounded-full shadow-lg shadow-primary/30 md:bottom-8 md:right-8"
        aria-label="Quick log"
      >
        <Plus className="size-6" />
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
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border bg-card py-6 transition-colors hover:bg-accent active:scale-[0.98]"
                >
                  <Icon className={cn("size-6", opt.color)} />
                  <span className="text-sm font-medium">{opt.label}</span>
                </button>
              )
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
