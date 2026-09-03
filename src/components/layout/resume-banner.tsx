import { useState } from "react"
import { Play, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useStore } from "@/store/store"
import { useNav } from "@/store/nav"

export function ResumeBanner() {
  const { activeSession, clearActiveSession } = useStore()
  const { section, logTab, goLog } = useNav()
  const [confirm, setConfirm] = useState(false)

  const onWorkoutTab = section === "log" && logTab === "workout"
  if (!activeSession || onWorkoutTab) return null

  const exerciseCount = activeSession.exercises.length

  return (
    <div className="px-3 pt-2 md:px-4">
      <div className="glass mx-auto flex max-w-[1720px] items-center gap-3 rounded-[18px] px-4 py-2.5">
        <span className="relative flex size-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-green" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Unfinished workout session</p>
          <p className="truncate text-xs text-ink-3">
            {exerciseCount} exercise{exerciseCount === 1 ? "" : "s"} in progress
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => goLog("workout")}>
          <Play className="size-3.5" />
          Resume
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="shrink-0"
          onClick={() => setConfirm(true)}
          aria-label="Discard session"
        >
          <X className="size-4" />
        </Button>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this session?</AlertDialogTitle>
            <AlertDialogDescription>
              The unfinished workout and its logged sets will be removed. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                clearActiveSession()
                toast.success("Session discarded")
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
