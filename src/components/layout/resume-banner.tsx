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
    <div className="sticky top-14 z-20 border-b bg-primary/10 px-4 py-2.5 md:top-16 md:px-8 lg:px-10">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-3">
        <span className="relative flex size-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">Unfinished workout session</p>
          <p className="truncate text-xs text-muted-foreground">
            {exerciseCount} exercise{exerciseCount === 1 ? "" : "s"} in progress
          </p>
        </div>
        <Button size="sm" className="h-8 gap-1.5" onClick={() => goLog("workout")}>
          <Play className="size-3.5" />
          Resume
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
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
              Your in-progress workout will be permanently removed. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep session</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
