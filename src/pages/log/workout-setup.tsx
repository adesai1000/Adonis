import { useMemo } from "react"
import { Dumbbell, GripVertical, Play, Plus, X } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Combobox, type ComboOption } from "@/components/common/combobox"
import { DateTimePicker } from "@/components/common/datetime-picker"
import { DragList } from "@/components/common/drag-list"
import { EmptyState, FieldError } from "@/components/common/bits"
import { isoNow } from "@/lib/calc"
import { useDraft } from "@/lib/storage"
import { useStore } from "@/store/store"
import type { ActiveSession, LoggedExercise } from "@/lib/types"

const CUSTOM = "__custom__"

interface SetupDraft {
  datetime: string
  routineId: string | null
  // exerciseIds chosen for a custom session (ordered)
  customExerciseIds: string[]
}

const initialDraft = (): SetupDraft => ({
  datetime: isoNow(),
  routineId: null,
  customExerciseIds: [],
})

export function WorkoutSetup() {
  const { routines, exercises, settings, setActiveSession } = useStore()
  const [draft, setDraft, reset] = useDraft<SetupDraft>(
    "wt_draft_workout_setup",
    initialDraft()
  )

  const isCustom = draft.routineId === CUSTOM
  const routine = useMemo(
    () => routines.find((r) => r.id === draft.routineId) ?? null,
    [routines, draft.routineId]
  )

  const exerciseById = useMemo(() => {
    const map = new Map<string, (typeof exercises)[number]>()
    for (const ex of exercises) map.set(ex.id, ex)
    return map
  }, [exercises])

  const routinePicker = useMemo<ComboOption[]>(() => {
    const opts: ComboOption[] = routines.map((r) => ({
      value: r.id,
      label: r.name,
      group: "Routines",
      sublabel: `${r.exercises.length} exercises`,
      keywords: [r.name],
    }))
    opts.push({
      value: CUSTOM,
      label: "Custom session",
      group: "Build your own",
      keywords: ["custom", "ad hoc", "empty"],
    })
    return opts
  }, [routines])

  const libraryOptions = useMemo<ComboOption[]>(
    () =>
      exercises.map((ex) => ({
        value: ex.id,
        label: ex.name,
        group: ex.muscleGroup,
        sublabel: ex.equipment,
        keywords: [ex.name, ex.muscleGroup, ex.equipment ?? ""],
      })),
    [exercises]
  )

  // The resolved, ordered list of exercises that will start the session.
  const preview: { id: string; name: string; muscleGroup: string }[] =
    useMemo(() => {
      if (isCustom) {
        return draft.customExerciseIds
          .map((id) => exerciseById.get(id))
          .filter((ex): ex is NonNullable<typeof ex> => !!ex)
          .map((ex) => ({
            id: ex.id,
            name: ex.name,
            muscleGroup: ex.muscleGroup,
          }))
      }
      if (routine) {
        return routine.exercises
          .map((re) => exerciseById.get(re.exerciseId))
          .filter((ex): ex is NonNullable<typeof ex> => !!ex)
          .map((ex) => ({
            id: ex.id,
            name: ex.name,
            muscleGroup: ex.muscleGroup,
          }))
      }
      return []
    }, [isCustom, draft.customExerciseIds, routine, exerciseById])

  const noSelection = draft.routineId === null
  const empty = !noSelection && preview.length === 0

  function addCustomExercise(id: string) {
    setDraft((d) => ({ ...d, customExerciseIds: [...d.customExerciseIds, id] }))
  }
  function removeCustomExercise(index: number) {
    setDraft((d) => ({
      ...d,
      customExerciseIds: d.customExerciseIds.filter((_, i) => i !== index),
    }))
  }
  function reorderCustom(next: { id: string; key: string }[]) {
    setDraft((d) => ({ ...d, customExerciseIds: next.map((n) => n.id) }))
  }

  function startSession() {
    if (preview.length === 0) {
      toast.error("Add at least one exercise")
      return
    }
    const loggedExercises: LoggedExercise[] = preview.map((ex) => ({
      exerciseId: ex.id,
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      sets: [{ reps: 0, weight: 0, unit: settings.weightUnit }],
    }))
    const session: ActiveSession = {
      startedAt: isoNow(),
      datetime: draft.datetime,
      routineId: isCustom ? null : routine?.id ?? null,
      routineName: isCustom ? "Custom session" : routine?.name,
      currentIndex: 0,
      exercises: loggedExercises,
    }
    setActiveSession(session)
    reset()
    toast.success("Session started")
  }

  // DragList needs items with a stable key even when ids repeat.
  const customItems = draft.customExerciseIds.map((id, i) => ({
    id,
    key: `${id}-${i}`,
  }))

  return (
    <div className="space-y-4">
      <DateTimePicker
        label="Session start"
        value={draft.datetime}
        onChange={(datetime) => setDraft((d) => ({ ...d, datetime }))}
      />

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Routine</Label>
        <Combobox
          options={routinePicker}
          value={draft.routineId}
          onChange={(routineId) =>
            setDraft((d) => ({
              ...d,
              routineId,
              // reset custom list when switching to/away from custom
              customExerciseIds:
                routineId === CUSTOM ? d.customExerciseIds : [],
            }))
          }
          placeholder="Pick a routine or build a custom one"
          searchPlaceholder="Search routines…"
          emptyText="No routines. Pick Custom session."
        />
        {noSelection && (
          <FieldError>Choose a routine or a custom session.</FieldError>
        )}
      </div>

      {isCustom && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Add exercise</Label>
          <Combobox
            options={libraryOptions}
            value={null}
            onChange={addCustomExercise}
            placeholder="Search the exercise library"
            searchPlaceholder="Search exercises…"
            emptyText="No exercises found."
          />
        </div>
      )}

      {preview.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Exercises <span className="text-muted-foreground">({preview.length})</span>
          </p>
          {isCustom ? (
            <DragList
              className="gap-2"
              items={customItems}
              getKey={(i) => i.key}
              onReorder={reorderCustom}
              renderItem={(item, handle, { index }) => {
                const ex = exerciseById.get(item.id)
                if (!ex) return null
                return (
                  <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5">
                    <button
                      type="button"
                      {...handle}
                      className="-ml-1 flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                      aria-label="Drag to reorder"
                    >
                      <GripVertical className="size-4" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{ex.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {ex.muscleGroup}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0 text-muted-foreground"
                      onClick={() => removeCustomExercise(index)}
                      aria-label="Remove exercise"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                )
              }}
            />
          ) : (
            <ul className="divide-y rounded-lg border">
              {preview.map((ex, i) => (
                <li
                  key={`${ex.id}-${i}`}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{ex.name}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {ex.muscleGroup}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {empty && (
        <EmptyState
          icon={<Dumbbell className="size-8" />}
          title="No exercises selected"
          hint={
            isCustom
              ? "Add exercises from the library above."
              : "This routine has no exercises."
          }
        />
      )}

      <Button
        type="button"
        className="h-11 w-full"
        onClick={startSession}
        disabled={preview.length === 0}
      >
        <Play className="size-4" />
        Start session
      </Button>

      {isCustom && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Plus className="size-3" />
          You can add more exercises mid-session.
        </p>
      )}
    </div>
  )
}
