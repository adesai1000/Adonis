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

/** Flat cells: empty, one logged, and the days outside the tracked range. */
function tileClass(level: ConsistencyDay["level"]): string {
  switch (level) {
    case "before":
      return "bg-[var(--heat-0)] opacity-40"
    case "future":
      return "border border-line-strong bg-transparent"
    case "one":
      return "bg-[var(--heat-2)]"
    default:
      return "bg-[var(--heat-0)]"
  }
}

/**
 * The top three tiers are emoji: 🔥 for two of three logged, 💯 for a full
 * day, 👑 for a full day with steps too. Anything else is a flat tile.
 */
function tileEmoji(day: ConsistencyDay): string | null {
  if (day.level === "diamond") return day.steps ? "👑" : "💯"
  if (day.level === "two") return "🔥"
  return null
}

function tileTitle(day: ConsistencyDay): string {
  if (day.level === "before") return `${day.date}: before tracking started`
  if (day.level === "future") return `${day.date}: hasn't happened yet`
  if (day.level === "none") return `${day.date}: nothing logged`
  const parts = [
    day.food && "food",
    day.sleep && "sleep",
    day.workout && "workout",
    day.steps && "steps",
  ].filter(Boolean)
  const suffix = day.level === "diamond" ? (day.steps ? " — full day + steps" : " — full day") : ""
  return `${day.date}: ${parts.join(" + ")}${suffix}`
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
const TILE_SIZE = 36
const GAP = 7
const COL_WIDTH = TILE_SIZE + GAP
/** How many weeks past today stay visible after the initial auto-scroll. */
const FUTURE_PEEK_WEEKS = 3

export function ConsistencyTracker() {
  const { foodLog, workoutLog, cardioLog, sleepLog, settings } = useStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  const stats = useMemo(() => {
    const input = { foodLog, workoutLog, cardioLog, sleepLog }
    const start = parseDate(settings.trackingStartDate) ?? earliestLogDate(input)
    const goal = parseDate(settings.goalWeightDate)
    return buildConsistency(input, start, goal)
  }, [
    foodLog,
    workoutLog,
    cardioLog,
    sleepLog,
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

  // Auto-scroll so today's column is in view with a little of the future
  // showing. Land on a column boundary so no sliver of a half-scrolled tile
  // sits beside the day labels.
  const todayCol = Math.floor(Math.max(0, stats.todayIndex) / 7)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const raf = requestAnimationFrame(() => {
      const fit = Math.floor(el.clientWidth / COL_WIDTH)
      const first = Math.max(0, todayCol + FUTURE_PEEK_WEEKS + 1 - fit)
      el.scrollLeft = first * COL_WIDTH
    })
    return () => cancelAnimationFrame(raf)
  }, [todayCol, weeks.length])

  const weekCount = Math.max(1, Math.ceil(stats.totalDays / 7))


  return (
    <Card className="gap-4 py-5" data-section="tracker">
      <CardHeader className="flex flex-row items-center gap-3 px-5">
        <span className="grid size-6 place-items-center rounded-lg bg-muted text-ink-2">
          <Grid3x3 className="size-3.5" />
        </span>
        <span className="text-[13px] font-semibold">Consistency</span>
      </CardHeader>

      <CardContent className="px-5">
        <div className="flex gap-2">
          <div
            className="flex shrink-0 flex-col text-[11px] text-muted-foreground"
            style={{ paddingTop: TILE_SIZE + 4, gap: GAP }}
          >
            {DAY_LABELS.map((label, i) => (
              <span key={i} style={{ height: TILE_SIZE, lineHeight: `${TILE_SIZE}px` }}>
                {label}
              </span>
            ))}
          </div>

          {/* Sideways only: a vertical swipe over the grid scrolls the page. */}
          <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden pb-4">
            <div style={{ width: weeks.length * COL_WIDTH - GAP }}>
              <div className="relative" style={{ height: TILE_SIZE }}>
                {monthLabels.map((label, wi) =>
                  label ? (
                    <span
                      key={wi}
                      className="absolute top-0 whitespace-nowrap text-[11px] text-muted-foreground"
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
                  week.map((day, di) => {
                    const emoji = tileEmoji(day)
                    return emoji ? (
                      <span
                        key={`${wi}-${di}`}
                        className="grid place-items-center text-[26px] leading-none"
                        title={tileTitle(day)}
                      >
                        {emoji}
                      </span>
                    ) : (
                      <span
                        key={`${wi}-${di}`}
                        className={cn("rounded-[6px]", tileClass(day.level))}
                        title={tileTitle(day)}
                      />
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span>
            {stats.trackedDays} day{stats.trackedDays === 1 ? "" : "s"} tracked in{" "}
            {weekCount} week{weekCount === 1 ? "" : "s"} · longest streak{" "}
            {stats.longestStreak} day{stats.longestStreak === 1 ? "" : "s"}
          </span>
          {/* The scale: how much of food / sleep / workout a day covered. */}
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="microlabel">food · sleep · workout</span>
            <span className="flex items-center gap-1.5">
              <span className="size-[11px] rounded-[3px] bg-[var(--heat-2)]" /> 1 logged
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-sm leading-none">🔥</span> 2 logged
            </span>
            <span
              className="flex items-center gap-1.5"
              title="Food, sleep and a workout all logged (food and sleep on a weekend)"
            >
              <span className="text-sm leading-none">💯</span> full day
            </span>
            <span className="flex items-center gap-1.5" title="A full day with steps logged too">
              <span className="text-sm leading-none">👑</span> full day + steps
            </span>
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

