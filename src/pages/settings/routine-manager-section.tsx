import { useEffect, useMemo, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react"
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
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Combobox, type ComboOption } from "@/components/common/combobox"
import { DragList } from "@/components/common/drag-list"
import { EmptyState, FieldError, Stepper } from "@/components/common/bits"
import { uid } from "@/lib/calc"
import { useStore } from "@/store/store"
import type { Exercise, Routine, RoutineExercise } from "@/lib/types"

interface BuilderRow extends RoutineExercise {
  // local-only unique key (exercise can appear more than once)
  _uid: string
  // resolved snapshot for display
  name: string
  muscleGroup: string
}

function makeRow(ex: Exercise): BuilderRow {
  return {
    _uid: uid(),
    exerciseId: ex.id,
    targetSets: 3,
    notes: "",
    name: ex.name,
    muscleGroup: ex.muscleGroup,
  }
}

function RoutineBuilder({
  open,
  onOpenChange,
  routine,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  routine: Routine | null
}) {
  const { exercises, addRoutine, updateRoutine } = useStore()

  const exMap = useMemo(() => {
    const m = new Map<string, Exercise>()
    for (const e of exercises) m.set(e.id, e)
    return m
  }, [exercises])

  const [name, setName] = useState("")
  const [rows, setRows] = useState<BuilderRow[]>([])
  const [pick, setPick] = useState<string | null>(null)
  const [showErrors, setShowErrors] = useState(false)

  // (Re)seed local builder state each time the dialog opens for a routine.
  useEffect(() => {
    if (!open) return
    setName(routine?.name ?? "")
    setRows(
      (routine?.exercises ?? []).map((re) => {
        const ex = exMap.get(re.exerciseId)
        return {
          ...re,
          _uid: uid(),
          name: ex?.name ?? "Unknown exercise",
          muscleGroup: ex?.muscleGroup ?? "",
        }
      })
    )
    setPick(null)
    setShowErrors(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, routine])

  const options: ComboOption[] = useMemo(
    () =>
      exercises.map((e) => ({
        value: e.id,
        label: e.name,
        group: e.muscleGroup,
        sublabel: e.equipment,
        keywords: [e.muscleGroup, e.equipment ?? ""],
      })),
    [exercises]
  )

  const nameTrim = name.trim()
  const nameError = !nameTrim ? "Routine name is required." : ""
  const noExercises = rows.length === 0

  function addPicked(id: string) {
    const ex = exMap.get(id)
    if (!ex) return
    setRows((r) => [...r, makeRow(ex)])
    setPick(null)
  }

  function move(index: number, dir: -1 | 1) {
    setRows((r) => {
      const to = index + dir
      if (to < 0 || to >= r.length) return r
      const next = r.slice()
      const [m] = next.splice(index, 1)
      next.splice(to, 0, m)
      return next
    })
  }

  function patchRow(index: number, patch: Partial<BuilderRow>) {
    setRows((r) => r.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function removeRow(index: number) {
    setRows((r) => r.filter((_, i) => i !== index))
  }

  function save() {
    if (nameError || noExercises) {
      setShowErrors(true)
      return
    }
    const payload: RoutineExercise[] = rows.map((r) => ({
      exerciseId: r.exerciseId,
      targetSets: Math.max(1, Math.round(r.targetSets) || 1),
      notes: r.notes?.trim() ? r.notes.trim() : undefined,
    }))
    if (routine) {
      updateRoutine(routine.id, { name: nameTrim, exercises: payload })
      toast.success("Routine updated")
    } else {
      addRoutine({ name: nameTrim, exercises: payload })
      toast.success("Routine created")
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b p-6 pb-4">
          <DialogTitle>{routine ? "Edit routine" : "New routine"}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60dvh]">
          <div className="space-y-5 p-6">
            <div className="space-y-1.5">
              <Label htmlFor="routine-name">Name</Label>
              <Input
                id="routine-name"
                className="h-11"
                value={name}
                placeholder="e.g. Push Day A"
                aria-invalid={showErrors && !!nameError}
                onChange={(e) => setName(e.target.value)}
              />
              {showErrors && <FieldError>{nameError}</FieldError>}
            </div>

            <div className="space-y-1.5">
              <Label>Add exercise</Label>
              <Combobox
                options={options}
                value={pick}
                onChange={addPicked}
                placeholder="Select an exercise to add"
                searchPlaceholder="Search exercises…"
                emptyText="No exercises found."
              />
              {showErrors && noExercises && (
                <FieldError>Add at least one exercise.</FieldError>
              )}
            </div>

            {rows.length > 0 && (
              <DragList
                items={rows}
                getKey={(row) => row._uid}
                onReorder={(next) => setRows(next)}
                renderItem={(row, handle, { index }) => (
                  <div className="mb-3 rounded-lg border bg-card p-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label="Drag to reorder"
                        {...handle}
                        className="-m-1 flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                      >
                        <GripVertical className="size-4" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {row.name}
                        </p>
                        {row.muscleGroup && (
                          <p className="truncate text-xs text-muted-foreground">
                            {row.muscleGroup}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label="Move up"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label="Move down"
                        disabled={index === rows.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${row.name}`}
                        onClick={() => removeRow(index)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>

                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">
                          Target sets
                        </Label>
                        <Stepper
                          value={row.targetSets}
                          min={1}
                          max={20}
                          onChange={(v) => patchRow(index, { targetSets: v })}
                        />
                      </div>
                    </div>

                    <Textarea
                      className="mt-3 min-h-11"
                      placeholder="Notes (optional)"
                      value={row.notes ?? ""}
                      onChange={(e) =>
                        patchRow(index, { notes: e.target.value })
                      }
                    />
                  </div>
                )}
              />
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t p-6 pt-4">
          <Button
            variant="outline"
            className="h-11"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button className="h-11" onClick={save}>
            {routine ? "Save changes" : "Create routine"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RoutineRow({
  routine,
  onEdit,
}: {
  routine: Routine
  onEdit: () => void
}) {
  const { deleteRoutine } = useStore()
  const count = routine.exercises.length
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{routine.name}</p>
        <p className="text-xs text-muted-foreground">
          {count} {count === 1 ? "exercise" : "exercises"}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        aria-label={`Edit ${routine.name}`}
        onClick={onEdit}
      >
        <Pencil className="size-4" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-muted-foreground hover:text-destructive"
            aria-label={`Delete ${routine.name}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete routine?</AlertDialogTitle>
            <AlertDialogDescription>
              {routine.name} will be permanently removed. Logged workouts are
              not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                deleteRoutine(routine.id)
                toast.success("Routine deleted")
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function RoutineManagerSection() {
  const { routines } = useStore()
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editing, setEditing] = useState<Routine | null>(null)

  function openNew() {
    setEditing(null)
    setBuilderOpen(true)
  }
  function openEdit(r: Routine) {
    setEditing(r)
    setBuilderOpen(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Routines</CardTitle>
        <CardAction>
          <div className="flex items-center gap-2">
            {routines.length > 0 && (
              <Badge variant="secondary" className="h-6">
                {routines.length}
              </Badge>
            )}
            <Button size="sm" className="h-9 gap-1.5" onClick={openNew}>
              <Plus className="size-4" />
              New
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {routines.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="size-8" />}
            title="No routines yet"
            hint="Create a routine to plan and start workouts faster."
            action={
              <Button size="sm" className="gap-1.5" onClick={openNew}>
                <Plus className="size-4" />
                New routine
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {routines.map((r) => (
              <RoutineRow key={r.id} routine={r} onEdit={() => openEdit(r)} />
            ))}
          </div>
        )}
      </CardContent>

      <RoutineBuilder
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        routine={editing}
      />
    </Card>
  )
}
