import { useEffect, useMemo, useRef } from "react"
import { format, parseISO } from "date-fns"
import { Grid3x3 } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  buildConsistency,
  buildConsistencyWeeks,
  earliestLogDate,
  type ConsistencyDay,
} from "@/lib/consistency"
import { cn } from "@/lib/utils"
import { useStore } from "@/store/store"

function tileClass(level: ConsistencyDay["level"]): string {
  switch (level) {
    case 4:
      return "bg-muted/40"
    case 3:
      return "border border-muted-foreground/25 bg-transparent"
    case 2:
      return "bg-blue-600 dark:bg-blue-500"
    case 1:
      return "bg-sky-300 dark:bg-sky-800"
    default:
      return "bg-muted"
  }
}

function tileTitle(day: ConsistencyDay): string {
  const label =
    day.level === 4
      ? "before tracking started"
      : day.level === 3
        ? "hasn't happened yet"
        : day.level === 2
          ? "calories + workout"
          : day.level === 1
            ? "calories logged"
            : "nothing logged"
  return `${day.date}: ${label}`
}

function parseDate(value: string): Date | null {
  if (!value) return null
  try {
    const d = parseISO(value)
    return isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""]
const TILE_SIZE = 12
const GAP = 3
const COL_WIDTH = TILE_SIZE + GAP
/** How many weeks past today stay visible after the initial auto-scroll. */
const FUTURE_PEEK_WEEKS = 3

export function ConsistencyTracker() {
  const { foodLog, workoutLog, cardioLog, settings } = useStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  const stats = useMemo(() => {
    const input = { foodLog, workoutLog, cardioLog }
    const start = parseDate(settings.trackingStartDate) ?? earliestLogDate(input)
    const goal = parseDate(settings.goalWeightDate)
    return buildConsistency(input, start, goal)
  }, [
    foodLog,
    workoutLog,
    cardioLog,
    settings.trackingStartDate,
    settings.goalWeightDate,
  ])

  const weeks = useMemo(() => buildConsistencyWeeks(stats.days), [stats.days])

  const monthLabels = useMemo(() => {
    let prevMonth = ""
    const labels = weeks.map((week) => {
      const month = format(parseISO(week[0].date), "MMM")
      const label = month !== prevMonth ? month : ""
      prevMonth = month
      return label
    })
    // A partial first month can land right beside the next month's label
    // ("AugSep"). Drop any label that has another one within two columns.
    for (let i = 0; i < labels.length; i++) {
      if (!labels[i]) continue
      for (let j = i + 1; j < Math.min(labels.length, i + 3); j++) {
        if (labels[j]) {
          labels[i] = ""
          break
        }
      }
    }
    return labels
  }, [weeks])

  // Auto-scroll so today's column is in view with a little of the future showing.
  const todayCol = Math.floor(Math.max(0, stats.todayIndex) / 7)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const raf = requestAnimationFrame(() => {
      const target =
        (todayCol + 1 + FUTURE_PEEK_WEEKS) * COL_WIDTH - el.clientWidth
      el.scrollLeft = Math.max(0, target)
    })
    return () => cancelAnimationFrame(raf)
  }, [todayCol, weeks.length])

  const weekCount = Math.max(1, Math.ceil(stats.totalDays / 7))

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="flex flex-row items-center gap-3 px-5">
        <span className="flex size-7 items-center justify-center rounded-md bg-muted text-foreground">
          <Grid3x3 className="size-4" />
        </span>
        <span className="text-sm font-semibold">Consistency</span>
      </CardHeader>

      <CardContent className="px-5">
        <div className="flex gap-2">
          <div
            className="flex shrink-0 flex-col text-[10px] text-muted-foreground"
            style={{ paddingTop: TILE_SIZE + 4, gap: GAP }}
          >
            {DAY_LABELS.map((label, i) => (
              <span key={i} style={{ height: TILE_SIZE, lineHeight: `${TILE_SIZE}px` }}>
                {label}
              </span>
            ))}
          </div>

          <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto">
            <div style={{ width: weeks.length * COL_WIDTH - GAP }}>
              <div className="relative" style={{ height: TILE_SIZE }}>
                {monthLabels.map((label, wi) =>
                  label ? (
                    <span
                      key={wi}
                      className="absolute top-0 whitespace-nowrap text-[10px] text-muted-foreground"
                      style={{ left: wi * COL_WIDTH, lineHeight: `${TILE_SIZE}px` }}
                    >
                      {label}
                    </span>
                  ) : null
                )}
              </div>
              <div
                className="grid"
                style={{
                  marginTop: 4,
                  gridTemplateColumns: `repeat(${weeks.length}, ${TILE_SIZE}px)`,
                  gridTemplateRows: `repeat(7, ${TILE_SIZE}px)`,
                  gridAutoFlow: "column",
                  gap: GAP,
                }}
              >
                {weeks.flatMap((week, wi) =>
                  week.map((day, di) => (
                    <span
                      key={`${wi}-${di}`}
                      className={cn("rounded-[3px]", tileClass(day.level))}
                      title={tileTitle(day)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 text-xs text-muted-foreground">
          {stats.trackedDays} day{stats.trackedDays === 1 ? "" : "s"} tracked in{" "}
          {weekCount} week{weekCount === 1 ? "" : "s"} · longest streak{" "}
          {stats.longestStreak} day{stats.longestStreak === 1 ? "" : "s"}
        </div>
      </CardContent>
    </Card>
  )
}
