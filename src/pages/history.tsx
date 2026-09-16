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
  Moon,
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
  fmtCompact,
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
import {
  STRAIN_MAX,
  STRAIN_ZONE_LABELS,
  strainBreakdown,
  type StrainZone,
} from "@/lib/strain"
import {
  readinessForDay,
  sleepForDay,
  type ReadinessZone,
} from "@/lib/recovery"
import type {
  CardioEntry,
  DistanceUnit,
  FoodEntry,
  WeightEntry,
  WeightUnit,
  WorkoutSession,
  Settings,
  SleepEntry,
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

/** One cell of the macro grid: `P 8 g`. */
function MacroChip({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <span className="flex min-w-0 items-baseline justify-center gap-1 rounded-full bg-muted px-1.5 py-1 text-[11px] leading-4 whitespace-nowrap">
      <span className="font-semibold text-ink-3">{label}</span>
      <span className="truncate font-medium text-foreground">{children}</span>
    </span>
  )
}

function NothingLogged({ what }: { what: string }) {
  const text = what.charAt(0).toUpperCase() + what.slice(1)
  return (
    <p className="py-2 text-sm text-muted-foreground">{text}.</p>
  )
}

// ───────────────────────────── Day summary ─────────────────────────────
const ZONE_TEXT: Record<StrainZone, string> = {
  rest: "text-ink-3",
  light: "text-ink-2",
  moderate: "text-green-ink",
  high: "text-amber",
  allout: "text-red",
}

const READY_TEXT: Record<ReadinessZone, string> = {
  push: "text-green-ink",
  train: "text-green-ink",
  easy: "text-amber",
  rest: "text-red",
}

interface Tile {
  label: string
  value: string
  sub?: string
  cls?: string
}

/** Macro totals, then strain / sleep / recovery / readiness, leading the day. */
function DaySummary({
  food,
  workoutLog,
  cardioLog,
  sleepLog,
  settings,
  day,
}: {
  food: FoodEntry[]
  workoutLog: WorkoutSession[]
  cardioLog: CardioEntry[]
  sleepLog: SleepEntry[]
  settings: Settings
  day: string
}) {
  const totals = useMemo(() => sumMacros(food), [food])
  const strain = useMemo(
    () => strainBreakdown(workoutLog, cardioLog, day),
    [workoutLog, cardioLog, day]
  )
  const sleep = useMemo(() => sleepForDay(sleepLog, day), [sleepLog, day])
  const ready = useMemo(
    () => readinessForDay({ sleepLog, workoutLog, cardioLog, foodLog: food, settings }, day),
    [sleepLog, workoutLog, cardioLog, food, settings, day]
  )
  const hasFood = food.length > 0
  const trained = strain.sessions > 0 || strain.cardioEntries > 0
  const macro = (v: number, unit: string) =>
    hasFood ? `${fmtCompact(v)} ${unit}` : "-"

  const macros: Tile[] = [
    { label: "Calories", value: macro(totals.calories, "kcal") },
    { label: "Protein", value: macro(totals.protein, "g") },
    { label: "Carbs", value: macro(totals.carbs, "g") },
    { label: "Fat", value: macro(totals.fat, "g") },
    { label: "Sodium", value: macro(totals.sodium, "mg") },
  ]
  const rec = ready.recovery
  const body: Tile[] = [
    {
      label: "Strain",
      value: trained ? `${fmt(strain.score)} / ${STRAIN_MAX}` : "-",
      sub: trained ? STRAIN_ZONE_LABELS[strain.zone] : "Rest day",
      cls: ZONE_TEXT[strain.zone],
    },
    {
      label: "Sleep",
      value: sleep.entries.length ? `${fmt(sleep.totalSec / 3600)} h` : "-",
      sub: sleep.entries.length
        ? sleep.napSec > 0
          ? `incl. ${fmtCompact(sleep.napSec / 60)} min nap`
          : `goal ${fmt(settings.sleepGoalHours, 0)} h`
        : "not logged",
    },
    {
      label: "Recovery",
      value: rec.score != null ? `${rec.score} / 100` : "-",
      sub: rec.score != null ? "from sleep, strain, food" : "needs sleep",
    },
    {
      label: "Readiness",
      value: ready.score != null ? `${ready.score} / 100` : "-",
      sub: ready.zone ? ready.label : "needs sleep",
      cls: ready.zone ? READY_TEXT[ready.zone] : undefined,
    },
  ]

  const render = (t: Tile) => (
    <div key={t.label} className="rounded-xl bg-muted px-3 py-2">
      <p className="microlabel !text-[10px]">{t.label}</p>
      <p className="mt-0.5 text-[13px] font-semibold">{t.value}</p>
      {t.sub && <p className={"text-[11px] font-medium " + (t.cls ?? "")}>{t.sub}</p>}
    </div>
  )

  return (
    <div className="space-y-2 tabular-nums">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">{macros.map(render)}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{body.map(render)}</div>
    </div>
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
          <ul className="divide-y divide-line">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex items-start gap-2 py-2.5 first:pt-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{e.name}</span>
                    <span className="shrink-0 text-xs text-ink-3 tabular-nums">
                      {formatTime(e.datetime)}
                    </span>
                  </div>
                  <p className="text-xs text-ink-3 tabular-nums">
                    <span className="font-semibold text-foreground">
                      {fmtCompact(e.calories)} kcal
                    </span>{" "}
                    · {e.serving} × {fmtNum(e.quantity)}
                  </p>
                  {/* fixed 4-up grid so the macros line up down the list;
                      sodium gets a wider column so "1,300 mg" fits */}
                  <div className="mt-1.5 grid grid-cols-[1fr_1fr_1fr_1.45fr] gap-1 tabular-nums">
                    <MacroChip label="P">{fmtCompact(e.protein)} g</MacroChip>
                    <MacroChip label="C">{fmtCompact(e.carbs)} g</MacroChip>
                    <MacroChip label="F">{fmtCompact(e.fat)} g</MacroChip>
                    <MacroChip label="Na">{fmtCompact(e.sodium ?? 0)} mg</MacroChip>
                  </div>
                  {e.notes && (
                    <p className="mt-1 text-xs text-ink-3">{e.notes}</p>
                  )}
                </div>
                <DeleteButton
                  label="Delete food entry"
                  description={`Delete "${e.name}" (${fmtNum(e.calories)} kcal)? This cannot be undone.`}
                  onConfirm={() => onDelete(e.id)}
                />
              </li>
            ))}
          </ul>
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
              <div key={s.id} className="rounded-[14px] border border-line p-3">
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
                        {ex.cardio ? (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            <Badge variant="outline" className="font-normal tabular-nums">
                              {formatDuration(ex.cardio.durationSec)}
                            </Badge>
                            {(ex.cardio.distance ?? 0) > 0 && (
                              <Badge variant="outline" className="font-normal tabular-nums">
                                {fmtNum(ex.cardio.distance)}{" "}
                                {ex.cardio.distanceUnit === "km" ? "km" : "mi"}
                              </Badge>
                            )}
                            {(ex.cardio.distance ?? 0) > 0 && ex.cardio.durationSec > 0 && (
                              <Badge variant="outline" className="font-normal tabular-nums">
                                {formatPace(
                                  ex.cardio.distance,
                                  ex.cardio.durationSec,
                                  ex.cardio.distanceUnit ?? "km"
                                )}
                              </Badge>
                            )}
                          </div>
                        ) : ex.sets.length > 0 ? (
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

// ───────────────────────────── Sleep ─────────────────────────────
function SleepSection({
  entries,
  onDelete,
}: {
  entries: SleepEntry[]
  onDelete: (id: string) => void
}) {
  return (
    <SectionCard
      icon={<Moon className="size-4" />}
      title="Sleep"
      count={entries.length}
    >
      {entries.length === 0 ? (
        <NothingLogged what="no sleep logged ending on this day" />
      ) : (
        <ul className="divide-y divide-line">
          {entries.map((e) => {
            const wake = new Date(new Date(e.datetime).getTime() + e.durationSec * 1000)
            return (
              <li key={e.id} className="flex items-start gap-2 py-2.5 first:pt-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium">
                      {e.kind === "nap" ? "Nap" : "Sleep"}
                      <span className="text-sm font-semibold tabular-nums">
                        {formatDuration(e.durationSec).replace(/:\d\d$/, "")} h
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatTime(e.datetime)} – {formatTime(wake.toISOString())}
                    </span>
                  </div>
                  {e.notes && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{e.notes}</p>
                  )}
                </div>
                <DeleteButton
                  label="Delete sleep entry"
                  description={`Delete this ${e.kind === "nap" ? "nap" : "sleep"} entry? This cannot be undone.`}
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
  // Sleep belongs to the day it ends (last night's sleep shows under today).
  const sleep = useMemo(
    () => sleepForDay(s.sleepLog, selectedKey).entries,
    [s.sleepLog, selectedKey]
  )

  const totalEntries =
    food.length + workouts.length + cardio.length + weights.length + sleep.length

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
      sleepLog: sleep,
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
          <DaySummary
            food={food}
            workoutLog={s.workoutLog}
            cardioLog={s.cardioLog}
            sleepLog={s.sleepLog}
            settings={s.settings}
            day={selectedKey}
          />
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
          <SleepSection
            entries={sleep}
            onDelete={(id) => handleDelete(s.deleteSleep, id, "Sleep entry")}
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
