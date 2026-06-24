import { useMemo, useState, type ReactNode } from "react"
import { addDays, format, parse, subDays } from "date-fns"
import {
  Activity,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  Dumbbell,
  HeartPulse,
  Scale,
  Trash2,
  UtensilsCrossed,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
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
import { EmptyState } from "@/components/common/bits"
import { useStore } from "@/store/store"
import {
  cardioDistance,
  dateKey,
  fmt,
  fmtNum,
  formatDuration,
  formatPace,
  formatTime,
  sessionRepCount,
  sessionSetCount,
  sessionVolume,
  sumMacros,
  todayKey,
} from "@/lib/calc"
import { useDraft } from "@/lib/storage"
import type {
  CardioEntry,
  DistanceUnit,
  FoodEntry,
  WeightEntry,
  WeightUnit,
  WorkoutSession,
} from "@/lib/types"
import { toast } from "sonner"

const KEY_FMT = "yyyy-MM-dd"

function keyToDate(key: string): Date {
  try {
    const d = parse(key, KEY_FMT, new Date())
    if (isNaN(d.getTime())) return new Date()
    return d
  } catch {
    return new Date()
  }
}

function byTime(a: { datetime: string }, b: { datetime: string }): number {
  return a.datetime < b.datetime ? -1 : a.datetime > b.datetime ? 1 : 0
}

// ───────────────────────────── Confirm delete button ─────────────────────────────
function DeleteButton({
  label,
  description,
  onConfirm,
}: {
  label: string
  description: string
  onConfirm: () => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
          aria-label={label}
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className="h-11"
            onClick={onConfirm}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ───────────────────────────── Section shell ─────────────────────────────
function SectionCard({
  icon,
  title,
  count,
  children,
}: {
  icon: ReactNode
  title: string
  count: number
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="text-muted-foreground">{icon}</span>
          {title}
          {count > 0 && (
            <Badge variant="secondary" className="ml-auto tabular-nums">
              {count}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function NothingLogged({ what }: { what: string }) {
  const text = what.charAt(0).toUpperCase() + what.slice(1)
  return (
    <p className="py-2 text-sm text-muted-foreground">{text}.</p>
  )
}

// ───────────────────────────── Food ─────────────────────────────
function FoodSection({
  entries,
  onDelete,
}: {
  entries: FoodEntry[]
  onDelete: (id: string) => void
}) {
  const totals = useMemo(() => sumMacros(entries), [entries])

  return (
    <SectionCard
      icon={<UtensilsCrossed className="size-4" />}
      title="Food"
      count={entries.length}
    >
      {entries.length === 0 ? (
        <NothingLogged what="no food entries for this day" />
      ) : (
        <div className="space-y-3">
          <ul className="divide-y">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-start gap-3 py-2 first:pt-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{e.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatTime(e.datetime)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {e.serving} × {fmtNum(e.quantity)}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums">
                    <span className="font-medium text-foreground">
                      {fmtNum(e.calories)} kcal
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      · P {fmt(e.protein)} g · C {fmt(e.carbs)} g · F{" "}
                      {fmt(e.fat)} g
                    </span>
                  </p>
                </div>
                <DeleteButton
                  label="Delete food entry"
                  description={`Delete "${e.name}" (${fmtNum(e.calories)} kcal)? This cannot be undone.`}
                  onConfirm={() => onDelete(e.id)}
                />
              </li>
            ))}
          </ul>
          <Separator />
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Calories</p>
              <p className="font-semibold">{fmtNum(totals.calories)} kcal</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Protein</p>
              <p className="font-semibold">{fmt(totals.protein)} g</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Carbs</p>
              <p className="font-semibold">{fmt(totals.carbs)} g</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Fat</p>
              <p className="font-semibold">{fmt(totals.fat)} g</p>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  )
}

// ───────────────────────────── Workout ─────────────────────────────
function WorkoutSection({
  sessions,
  weightUnit,
  onDelete,
}: {
  sessions: WorkoutSession[]
  weightUnit: WeightUnit
  onDelete: (id: string) => void
}) {
  return (
    <SectionCard
      icon={<Dumbbell className="size-4" />}
      title="Workout"
      count={sessions.length}
    >
      {sessions.length === 0 ? (
        <NothingLogged what="no workout sessions for this day" />
      ) : (
        <div className="space-y-4">
          {sessions.map((s) => {
            const vol = sessionVolume(s, weightUnit)
            return (
              <div key={s.id} className="rounded-lg border p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate font-medium">
                        {s.routineName || "Workout"}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {formatTime(s.datetime)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {fmtNum(s.exercises.length)} exercises ·{" "}
                      {fmtNum(sessionSetCount(s))} sets ·{" "}
                      {fmtNum(sessionRepCount(s))} reps ·{" "}
                      {fmtNum(vol)} {weightUnit} volume ·{" "}
                      {formatDuration(s.durationSec)}
                    </p>
                  </div>
                  <DeleteButton
                    label="Delete workout"
                    description={`Delete this ${s.routineName || "Workout"} session (${fmtNum(s.exercises.length)} exercises)? This cannot be undone.`}
                    onConfirm={() => onDelete(s.id)}
                  />
                </div>
                {s.exercises.length > 0 && (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    {s.exercises.map((ex, i) => (
                      <div key={`${ex.exerciseId}-${i}`}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-medium">{ex.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {ex.muscleGroup}
                          </span>
                        </div>
                        {ex.sets.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {ex.sets.map((set, j) => (
                              <Badge
                                key={j}
                                variant="outline"
                                className="font-normal tabular-nums"
                              >
                                {fmtNum(set.reps)} × {fmtNum(set.weight)}{" "}
                                {set.unit}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1 text-xs text-muted-foreground">
                            No sets
                          </p>
                        )}
                        {ex.notes && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {ex.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

// ───────────────────────────── Cardio ─────────────────────────────
function CardioSection({
  entries,
  distanceUnit,
  onDelete,
}: {
  entries: CardioEntry[]
  distanceUnit: DistanceUnit
  onDelete: (id: string) => void
}) {
  const unitLabel = distanceUnit === "km" ? "km" : "mi"
  return (
    <SectionCard
      icon={<HeartPulse className="size-4" />}
      title="Cardio"
      count={entries.length}
    >
      {entries.length === 0 ? (
        <NothingLogged what="no cardio entries for this day" />
      ) : (
        <ul className="divide-y">
          {entries.map((e) => {
            const dist = cardioDistance(e, distanceUnit)
            return (
              <li key={e.id} className="flex items-start gap-3 py-2 first:pt-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{e.activity}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatTime(e.datetime)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {e.steps != null && e.steps > 0 ? (
                      <>{fmtNum(e.steps)} steps</>
                    ) : (
                      <>
                        {e.distance != null && e.distance > 0 && (
                          <>
                            {fmt(dist)} {unitLabel} ·{" "}
                          </>
                        )}
                        {formatDuration(e.durationSec)}
                        {e.distance != null && e.distance > 0 && (
                          <>
                            {" "}
                            · {formatPace(dist, e.durationSec, distanceUnit)}
                          </>
                        )}
                        {e.avgHeartRate != null && e.avgHeartRate > 0 && (
                          <>
                            {" "}
                            · {fmtNum(e.avgHeartRate)} bpm
                          </>
                        )}
                        {e.caloriesBurned != null && e.caloriesBurned > 0 && (
                          <>
                            {" "}
                            · {fmtNum(e.caloriesBurned)} kcal
                          </>
                        )}
                      </>
                    )}
                  </p>
                  {e.notes && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {e.notes}
                    </p>
                  )}
                </div>
                <DeleteButton
                  label="Delete cardio entry"
                  description={`Delete this ${e.activity} entry (${formatDuration(e.durationSec)})? This cannot be undone.`}
                  onConfirm={() => onDelete(e.id)}
                />
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}

// ───────────────────────────── Body weight ─────────────────────────────
function WeightSection({
  entries,
  onDelete,
}: {
  entries: WeightEntry[]
  onDelete: (id: string) => void
}) {
  return (
    <SectionCard
      icon={<Scale className="size-4" />}
      title="Body Weight"
      count={entries.length}
    >
      {entries.length === 0 ? (
        <NothingLogged what="no body weight entries for this day" />
      ) : (
        <ul className="divide-y">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start gap-3 py-2 first:pt-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium tabular-nums">
                    {fmt(e.weight)} {e.unit}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {formatTime(e.datetime)}
                  </span>
                </div>
                {e.notes && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {e.notes}
                  </p>
                )}
              </div>
              <DeleteButton
                label="Delete weight entry"
                description={`Delete this entry (${fmt(e.weight)} ${e.unit})? This cannot be undone.`}
                onConfirm={() => onDelete(e.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

// ───────────────────────────── Page ─────────────────────────────
export default function Page() {
  const s = useStore()
  const [selectedKey, setSelectedKey] = useDraft<string>(
    "wt_draft_history_date",
    todayKey()
  )
  const [calOpen, setCalOpen] = useState(false)

  const selectedDate = keyToDate(selectedKey)

  const food = useMemo(
    () =>
      s.foodLog
        .filter((e) => dateKey(e.datetime) === selectedKey)
        .sort(byTime),
    [s.foodLog, selectedKey]
  )
  const workouts = useMemo(
    () =>
      s.workoutLog
        .filter((e) => dateKey(e.datetime) === selectedKey)
        .sort(byTime),
    [s.workoutLog, selectedKey]
  )
  const cardio = useMemo(
    () =>
      s.cardioLog
        .filter((e) => dateKey(e.datetime) === selectedKey)
        .sort(byTime),
    [s.cardioLog, selectedKey]
  )
  const weights = useMemo(
    () =>
      s.weightLog
        .filter((e) => dateKey(e.datetime) === selectedKey)
        .sort(byTime),
    [s.weightLog, selectedKey]
  )

  const totalEntries =
    food.length + workouts.length + cardio.length + weights.length

  function shiftDay(delta: number) {
    const next = delta > 0 ? addDays(selectedDate, 1) : subDays(selectedDate, 1)
    setSelectedKey(format(next, KEY_FMT))
  }

  function handleDelete(fn: (id: string) => void, id: string, label: string) {
    fn(id)
    toast.success(`${label} deleted`)
  }

  function exportDay() {
    const payload = {
      date: selectedKey,
      exportedAt: new Date().toISOString(),
      version: 1,
      foodLog: food,
      workoutLog: workouts,
      cardioLog: cardio,
      weightLog: weights,
    }
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `adonis_${selectedKey}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${fmtNum(totalEntries)} entries`)
    } catch {
      toast.error("Export failed")
    }
  }

  const isToday = selectedKey === todayKey()

  return (
    <div className="space-y-6">

      {/* Date navigation */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            onClick={() => shiftDay(-1)}
            aria-label="Previous day"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Popover open={calOpen} onOpenChange={setCalOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-11 min-w-0 flex-1 justify-start gap-2 font-normal"
              >
                <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {format(selectedDate, "EEE, MMM d, yyyy")}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => {
                  if (d) setSelectedKey(format(d, KEY_FMT))
                  setCalOpen(false)
                }}
                autoFocus
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            onClick={() => shiftDay(1)}
            aria-label="Next day"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            onClick={exportDay}
            disabled={totalEntries === 0}
            aria-label="Export this day"
            title="Export this day"
          >
            <Download className="size-4" />
          </Button>
        </div>
        {!isToday && (
          <Button
            variant="ghost"
            className="h-11"
            onClick={() => setSelectedKey(todayKey())}
          >
            Today
          </Button>
        )}
      </div>

      {totalEntries === 0 ? (
        <EmptyState
          icon={<Activity className="size-8" />}
          title="Nothing logged on this day"
          hint="Pick another date, or log food, workouts, cardio or weight."
        />
      ) : (
        <div className="space-y-4">
          <FoodSection
            entries={food}
            onDelete={(id) => handleDelete(s.deleteFood, id, "Food entry")}
          />
          <WorkoutSection
            sessions={workouts}
            weightUnit={s.settings.weightUnit}
            onDelete={(id) => handleDelete(s.deleteWorkout, id, "Workout")}
          />
          <CardioSection
            entries={cardio}
            distanceUnit={s.settings.distanceUnit}
            onDelete={(id) => handleDelete(s.deleteCardio, id, "Cardio entry")}
          />
          <WeightSection
            entries={weights}
            onDelete={(id) => handleDelete(s.deleteWeight, id, "Weight entry")}
          />
        </div>
      )}
    </div>
  )
}
