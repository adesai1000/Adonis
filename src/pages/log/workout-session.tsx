import { useEffect, useMemo, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  CircleCheckBig,
  Clock,
  History,
  Minus,
  Plus,
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
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { Combobox, type ComboOption } from "@/components/common/combobox"
import {
  fmt,
  formatDate,
  formatDuration,
  sessionVolume,
} from "@/lib/calc"
import { useStore } from "@/store/store"
import type {
  ActiveSession as ActiveSessionType,
  LoggedExercise,
  WeightUnit,
  WorkoutSession as WorkoutSessionType,
  WorkoutSet,
} from "@/lib/types"

function elapsedSeconds(startedAt: string): number {
  const start = new Date(startedAt).getTime()
  if (!isFinite(start)) return 0
  return Math.max(0, Math.floor((Date.now() - start) / 1000))
}

function toNum(v: string): number {
  const n = parseFloat(v)
  return isFinite(n) ? n : 0
}

export function WorkoutSession() {
  const {
    activeSession,
    setActiveSession,
    clearActiveSession,
    workoutLog,
    exercises,
    addWorkout,
    settings,
  } = useStore()

  const startedAt = activeSession?.startedAt ?? null

  const [elapsed, setElapsed] = useState(() =>
    startedAt ? elapsedSeconds(startedAt) : 0
  )
  const [finishOpen, setFinishOpen] = useState(false)

  // Live elapsed timer - re-anchored only when the session start changes,
  // so per-set edits don't reset the interval.
  useEffect(() => {
    if (!startedAt) return
    setElapsed(elapsedSeconds(startedAt))
    const id = window.setInterval(() => {
      setElapsed(elapsedSeconds(startedAt))
    }, 1000)
    return () => window.clearInterval(id)
  }, [startedAt])

  const exerciseLibrary = useMemo<ComboOption[]>(
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

  // ── set / exercise mutators (write through, auto-persisted) ──
  function patchCurrentExercise(fn: (ex: LoggedExercise) => LoggedExercise) {
    setActiveSession((s) => {
      if (!s) return s
      const exs = s.exercises.map((ex, i) =>
        i === s.currentIndex ? fn(ex) : ex
      )
      return { ...s, exercises: exs }
    })
  }

  function patchSet(setIndex: number, patch: Partial<WorkoutSet>) {
    patchCurrentExercise((ex) => ({
      ...ex,
      sets: ex.sets.map((st, i) => (i === setIndex ? { ...st, ...patch } : st)),
    }))
  }

  function addSet() {
    patchCurrentExercise((ex) => {
      const last = ex.sets[ex.sets.length - 1]
      const next: WorkoutSet = last
        ? { ...last }
        : { reps: 0, weight: 0, unit: settings.weightUnit }
      return { ...ex, sets: [...ex.sets, next] }
    })
  }

  function removeLastSet() {
    patchCurrentExercise((ex) =>
      ex.sets.length <= 1
        ? ex
        : { ...ex, sets: ex.sets.slice(0, -1) }
    )
  }

  function setNotes(notes: string) {
    patchCurrentExercise((ex) => ({ ...ex, notes }))
  }

  function goTo(index: number) {
    setActiveSession((s) => {
      if (!s) return s
      const clamped = Math.max(0, Math.min(s.exercises.length - 1, index))
      return { ...s, currentIndex: clamped }
    })
  }

  function addExerciseMidSession(exerciseId: string) {
    const ex = exercises.find((e) => e.id === exerciseId)
    if (!ex) return
    setActiveSession((s) => {
      if (!s) return s
      const logged: LoggedExercise = {
        exerciseId: ex.id,
        name: ex.name,
        muscleGroup: ex.muscleGroup,
        sets: [{ reps: 0, weight: 0, unit: settings.weightUnit }],
      }
      const exs = [...s.exercises, logged]
      return { ...s, exercises: exs, currentIndex: exs.length - 1 }
    })
    toast.success(`Added ${ex.name}`)
  }

  function buildSession(s: ActiveSessionType): Omit<WorkoutSessionType, "id"> {
    return {
      datetime: s.datetime,
      routineId: s.routineId,
      routineName: s.routineName,
      exercises: s.exercises,
      durationSec: elapsedSeconds(s.startedAt),
    }
  }

  function finishWorkout() {
    if (!activeSession) return
    addWorkout(buildSession(activeSession))
    clearActiveSession()
    setFinishOpen(false)
    toast.success("Workout saved")
  }

  function discardWorkout() {
    clearActiveSession()
    toast.success("Session discarded")
  }

  if (!activeSession) return null

  const total = activeSession.exercises.length
  const current = activeSession.exercises[activeSession.currentIndex]
  const progressPct =
    total > 0 ? ((activeSession.currentIndex + 1) / total) * 100 : 0

  // Previous performance: latest past session containing this exercise.
  const previous = current
    ? findPreviousSets(workoutLog, current.exerciseId)
    : null

  const sessionForVolume: WorkoutSessionType = {
    id: "preview",
    ...buildSession(activeSession),
  }
  const totalVolume = sessionVolume(sessionForVolume, settings.weightUnit)

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-200">
      {/* Timer + progress header */}
      <Card className="gap-0 py-4">
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="size-4" />
              <span className="text-sm">
                {activeSession.routineName ?? "Workout"}
              </span>
            </div>
            <span className="font-mono text-2xl font-semibold tabular-nums">
              {formatDuration(elapsed)}
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Exercise {activeSession.currentIndex + 1} of {total}
              </span>
              <span className="tabular-nums">
                {fmt(totalVolume)} {settings.weightUnit} volume
              </span>
            </div>
            <Progress value={progressPct} />
          </div>
        </CardContent>
      </Card>

      {current && (
        <div
          key={activeSession.currentIndex}
          className="space-y-4 animate-in fade-in-50 duration-200"
        >
          {/* Current exercise */}
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">{current.name}</h3>
            <Badge variant="secondary">{current.muscleGroup}</Badge>
          </div>

          {/* Previous performance */}
          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <History className="size-3.5" />
              Previous
            </div>
            {previous ? (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {formatDate(previous.datetime)}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {previous.sets.map((st, i) => (
                    <span
                      key={i}
                      className="rounded-md bg-background px-2 py-1 text-xs tabular-nums shadow-xs"
                    >
                      {fmt(st.reps, 0)} × {fmt(st.weight)} {st.unit}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No previous data</p>
            )}
          </div>

          {/* Set rows */}
          <div className="space-y-2">
            <div className="grid grid-cols-[2rem_1fr_1fr_auto] items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
              <span>Set</span>
              <span>Reps</span>
              <span>Weight</span>
              <span className="text-right">Unit</span>
            </div>
            {current.sets.map((st, i) => (
              <SetRow
                key={i}
                index={i}
                set={st}
                onReps={(reps) => patchSet(i, { reps })}
                onWeight={(weight) => patchSet(i, { weight })}
                onUnit={(unit) => patchSet(i, { unit })}
              />
            ))}
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1"
                onClick={addSet}
              >
                <Plus className="size-4" />
                Add set
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1"
                onClick={removeLastSet}
                disabled={current.sets.length <= 1}
              >
                <Minus className="size-4" />
                Remove set
              </Button>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea
              placeholder="Optional notes for this exercise"
              value={current.notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Add exercise mid-session */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Add exercise</Label>
        <Combobox
          options={exerciseLibrary}
          value={null}
          onChange={addExerciseMidSession}
          placeholder="Add another exercise"
          searchPlaceholder="Search exercises…"
          emptyText="No exercises found."
        />
      </div>

      {/* Navigation */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1"
          onClick={() => goTo(activeSession.currentIndex - 1)}
          disabled={activeSession.currentIndex <= 0}
        >
          <ChevronLeft className="size-4" />
          Back
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1"
          onClick={() => goTo(activeSession.currentIndex + 1)}
          disabled={activeSession.currentIndex >= total - 1}
        >
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <Separator />

      <div className="flex gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 text-destructive hover:text-destructive"
            >
              <X className="size-4" />
              Discard
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard this session?</AlertDialogTitle>
              <AlertDialogDescription>
                All sets logged in this session will be lost. This cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep going</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={discardWorkout}
              >
                Discard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button
          type="button"
          className="h-11 flex-1"
          onClick={() => setFinishOpen(true)}
        >
          <CircleCheckBig className="size-4" />
          Finish
        </Button>
      </div>

      {/* Finish summary dialog */}
      <Dialog open={finishOpen} onOpenChange={setFinishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finish workout</DialogTitle>
            <DialogDescription>
              Review and save this session to your history.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 text-center">
            <SummaryStat
              label="Volume"
              value={`${fmt(totalVolume)}`}
              unit={settings.weightUnit}
            />
            <SummaryStat label="Exercises" value={`${total}`} />
            <SummaryStat
              label="Duration"
              value={formatDuration(elapsed)}
              mono
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => setFinishOpen(false)}
            >
              Back
            </Button>
            <Button type="button" className="h-11" onClick={finishWorkout}>
              <CircleCheckBig className="size-4" />
              Save workout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SetRow({
  index,
  set,
  onReps,
  onWeight,
  onUnit,
}: {
  index: number
  set: WorkoutSet
  onReps: (v: number) => void
  onWeight: (v: number) => void
  onUnit: (u: WeightUnit) => void
}) {
  return (
    <div className="grid grid-cols-[2rem_1fr_1fr_auto] items-center gap-2">
      <div className="flex size-8 items-center justify-center rounded-md bg-muted text-sm font-semibold tabular-nums">
        {index + 1}
      </div>
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        placeholder="0"
        className="h-11 text-center tabular-nums"
        value={set.reps === 0 ? "" : String(set.reps)}
        onChange={(e) => onReps(Math.max(0, toNum(e.target.value)))}
        aria-label={`Set ${index + 1} reps`}
      />
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.5"
        placeholder="0"
        className="h-11 text-center tabular-nums"
        value={set.weight === 0 ? "" : String(set.weight)}
        onChange={(e) => onWeight(Math.max(0, toNum(e.target.value)))}
        aria-label={`Set ${index + 1} weight`}
      />
      <ToggleGroup
        type="single"
        variant="outline"
        value={set.unit}
        onValueChange={(v) => {
          if (v === "kg" || v === "lbs") onUnit(v)
        }}
        className="h-11"
      >
        <ToggleGroupItem value="kg" className="h-11 text-xs">
          kg
        </ToggleGroupItem>
        <ToggleGroupItem value="lbs" className="h-11 text-xs">
          lbs
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}

function SummaryStat({
  label,
  value,
  unit,
  mono,
}: {
  label: string
  value: string
  unit?: string
  mono?: boolean
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-2 py-3">
      <p
        className={
          "text-lg font-semibold tabular-nums" + (mono ? " font-mono" : "")
        }
      >
        {value}
        {unit && (
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

/** Most recent past session that includes the given exercise. */
function findPreviousSets(
  log: WorkoutSessionType[],
  exerciseId: string
): { datetime: string; sets: WorkoutSet[] } | null {
  const sorted = [...log].sort((a, b) =>
    a.datetime < b.datetime ? 1 : -1
  )
  for (const session of sorted) {
    const ex = session.exercises.find((e) => e.exerciseId === exerciseId)
    if (ex && ex.sets.length > 0) {
      return { datetime: session.datetime, sets: ex.sets }
    }
  }
  return null
}
