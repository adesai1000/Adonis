import { useMemo, useState } from "react"
import { Dumbbell, Lock, Plus, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EmptyState, FieldError } from "@/components/common/bits"
import { useDraft } from "@/lib/storage"
import { useStore } from "@/store/store"
import { MUSCLE_GROUPS, type Exercise } from "@/lib/types"

interface ExerciseDraft {
  name: string
  muscleGroup: string
  equipment: string
}

const emptyDraft: ExerciseDraft = {
  name: "",
  muscleGroup: MUSCLE_GROUPS[0],
  equipment: "",
}

function AddExerciseDialog() {
  const { exercises, addExercise } = useStore()
  const [open, setOpen] = useState(false)
  const [draft, setDraft, resetDraft] = useDraft<ExerciseDraft>(
    "wt_draft_exercise",
    emptyDraft
  )
  const [showErrors, setShowErrors] = useState(false)

  const name = draft.name.trim()
  const nameTaken = exercises.some(
    (e) => e.name.trim().toLowerCase() === name.toLowerCase()
  )
  const nameError = !name
    ? "Name is required."
    : nameTaken
      ? "An exercise with this name already exists."
      : ""

  function submit() {
    if (nameError) {
      setShowErrors(true)
      return
    }
    addExercise({
      name,
      muscleGroup: draft.muscleGroup,
      equipment: draft.equipment.trim() || undefined,
    })
    resetDraft()
    setShowErrors(false)
    setOpen(false)
    toast.success("Exercise added")
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setShowErrors(false)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="h-9 gap-1.5">
          <Plus className="size-4" />
          Add
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add exercise</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ex-name">Name</Label>
            <Input
              id="ex-name"
              className="h-11"
              value={draft.name}
              placeholder="e.g. Cable Crossover"
              aria-invalid={showErrors && !!nameError}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
            {showErrors && <FieldError>{nameError}</FieldError>}
          </div>
          <div className="space-y-1.5">
            <Label>Muscle group</Label>
            <Select
              value={draft.muscleGroup}
              onValueChange={(v) =>
                setDraft((d) => ({ ...d, muscleGroup: v }))
              }
            >
              <SelectTrigger className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MUSCLE_GROUPS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-equip">Equipment</Label>
            <Input
              id="ex-equip"
              className="h-11"
              value={draft.equipment}
              placeholder="e.g. Cable, Dumbbell (optional)"
              onChange={(e) =>
                setDraft((d) => ({ ...d, equipment: e.target.value }))
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="h-11"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button className="h-11" onClick={submit}>
            Add exercise
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ExerciseRow({ exercise }: { exercise: Exercise }) {
  const { deleteExercise } = useStore()
  return (
    <div className="flex items-center gap-3 px-1 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{exercise.name}</p>
        {exercise.equipment && (
          <p className="truncate text-xs text-muted-foreground">
            {exercise.equipment}
          </p>
        )}
      </div>
      {exercise.builtIn ? (
        <span
          className="flex size-9 items-center justify-center text-muted-foreground/70"
          title="Built-in - protected"
        >
          <Lock className="size-4" />
        </span>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 text-muted-foreground hover:text-destructive"
              aria-label={`Delete ${exercise.name}`}
            >
              <Trash2 className="size-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete exercise?</AlertDialogTitle>
              <AlertDialogDescription>
                {exercise.name} will be removed from your library. Logged
                workouts that used it are not affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  deleteExercise(exercise.id)
                  toast.success("Exercise deleted")
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}

export function ExerciseLibrarySection() {
  const { exercises } = useStore()
  const [query, setQuery] = useState("")

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? exercises.filter(
          (e) =>
            e.name.toLowerCase().includes(q) ||
            e.muscleGroup.toLowerCase().includes(q) ||
            (e.equipment ?? "").toLowerCase().includes(q)
        )
      : exercises
    const byGroup = new Map<string, Exercise[]>()
    for (const ex of filtered) {
      if (!byGroup.has(ex.muscleGroup)) byGroup.set(ex.muscleGroup, [])
      byGroup.get(ex.muscleGroup)!.push(ex)
    }
    // Order by MUSCLE_GROUPS, then any custom groups alphabetically.
    const ordered: [string, Exercise[]][] = []
    for (const g of MUSCLE_GROUPS) {
      if (byGroup.has(g)) {
        ordered.push([g, byGroup.get(g)!])
        byGroup.delete(g)
      }
    }
    for (const g of Array.from(byGroup.keys()).sort()) {
      ordered.push([g, byGroup.get(g)!])
    }
    for (const [, list] of ordered) {
      list.sort((a, b) => a.name.localeCompare(b.name))
    }
    return ordered
  }, [exercises, query])

  const total = exercises.length

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exercise library</CardTitle>
        <CardAction>
          <AddExerciseDialog />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 pl-9"
            placeholder={`Search ${total} exercises`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {groups.length === 0 ? (
          <EmptyState
            icon={<Dumbbell className="size-8" />}
            title="No exercises found"
            hint="Try a different search, or add a custom exercise."
          />
        ) : (
          <ScrollArea className="h-80 rounded-lg border">
            <div className="p-2">
              {groups.map(([group, list]) => (
                <div key={group} className="mb-2 last:mb-0">
                  <div className="sticky top-0 z-10 flex items-center gap-2 bg-card/95 px-1 py-1.5 backdrop-blur">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {group}
                    </span>
                    <Badge variant="secondary" className="h-5 px-1.5">
                      {list.length}
                    </Badge>
                  </div>
                  <div className="divide-y">
                    {list.map((ex) => (
                      <ExerciseRow key={ex.id} exercise={ex} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
