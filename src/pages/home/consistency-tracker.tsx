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
import { Opal, OpalField, type OpalGem } from "@/components/common/opal-field"

/** Stickshift's single-hue heat ramp: --heat-0 (empty) → --heat-4 (most). */
function tileClass(level: ConsistencyDay["level"]): string {
  switch (level) {
    case "before":
      return "bg-[var(--heat-0)] opacity-40"
    case "future":
      return "border border-line-strong bg-transparent"
    case "two":
      return "bg-[var(--heat-4)]"
    case "one":
      return "bg-[var(--heat-2)]"
    default:
      return "bg-[var(--heat-0)]"
  }
}

function tileTitle(day: ConsistencyDay): string {
  if (day.level === "before") return `${day.date}: before tracking started`
  if (day.level === "future") return `${day.date}: hasn't happened yet`
  if (day.level === "none") return `${day.date}: nothing logged`
  const parts = [day.food && "food", day.sleep && "sleep", day.workout && "workout"].filter(Boolean)
  const suffix = day.level === "diamond" ? " — full day" : ""
  return `${day.date}: ${parts.join(" + ")}${suffix}`
}

/**
 * A complete day's cell. The stone itself is drawn by the WebGL field laid
 * over the grid; this keeps the cell's place (and its tooltip). The CSS gem
 * inside is the fallback for browsers without WebGL and is hidden otherwise.
 */
function GemCell({ title, delayMs }: { title: string; delayMs: number }) {
  return (
    <span
      className="gem-cell relative"
      title={title}
      style={{ "--gem-delay": `${delayMs}ms` } as React.CSSProperties}
    >
      <span className="gem gem-fallback">
        <span className="gem-body" />
      </span>
    </span>
  )
}

/** Stable per-day seed so each stone keeps its own character between renders. */
function seedFor(date: string): number {
  let h = 2166136261
  for (let i = 0; i < date.length; i++) h = Math.imul(h ^ date.charCodeAt(i), 16777619)
  return ((h >>> 0) % 1000) / 10
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
const TILE_SIZE = 30
const GAP = 6
const COL_WIDTH = TILE_SIZE + GAP
/** How many weeks past today stay visible after the initial auto-scroll. */
const FUTURE_PEEK_WEEKS = 3

export function ConsistencyTracker() {
  const { foodLog, workoutLog, cardioLog, sleepLog, settings } = useStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // Tilt the opals as the page moves. Scroll sets a target; a damped spring
  // chases it each frame, so the colour play glides while you scroll and
  // settles with a little overshoot when you stop, instead of snapping.
  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    const STIFFNESS = 0.08
    const DAMPING = 0.78
    let target = 0
    let value = 0
    let velocity = 0
    let raf = 0

    const readTarget = () =>
      window.scrollY * 0.18 + (scrollRef.current?.scrollLeft ?? 0) * 0.12

    const step = () => {
      raf = 0
      const force = (target - value) * STIFFNESS
      velocity = (velocity + force) * DAMPING
      value += velocity
      card.style.setProperty("--opal-shift", `${value.toFixed(2)}px`)
      if (Math.abs(target - value) > 0.05 || Math.abs(velocity) > 0.05) {
        raf = requestAnimationFrame(step)
      }
    }
    const onScroll = () => {
      target = readTarget()
      if (!raf) raf = requestAnimationFrame(step)
    }

    target = readTarget()
    value = target
    card.style.setProperty("--opal-shift", `${value.toFixed(2)}px`)
    window.addEventListener("scroll", onScroll, { passive: true })
    const grid = scrollRef.current
    grid?.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      grid?.removeEventListener("scroll", onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

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

  // Every complete day becomes a stone for the WebGL field, placed on the
  // same grid coordinates its cell occupies.
  const gems = useMemo<OpalGem[]>(() => {
    const out: OpalGem[] = []
    weeks.forEach((week, wi) =>
      week.forEach((day, di) => {
        if (day.level !== "diamond") return
        out.push({
          x: wi * COL_WIDTH,
          y: di * (TILE_SIZE + GAP),
          size: TILE_SIZE,
          tier: day.steps ? 2 : 1,
          seed: seedFor(day.date),
          delayMs: Math.max(0, wi - todayCol + 12) * 55 + di * 20,
          title: tileTitle(day),
        })
      })
    )
    return out
  }, [weeks, todayCol])
  const gridWidth = weeks.length * COL_WIDTH - GAP
  const gridHeight = 7 * TILE_SIZE + 6 * GAP

  return (
    <Card ref={cardRef} className="gap-4 py-5">
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

          <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto">
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
                className="relative grid"
                style={{
                  marginTop: 4,
                  gridTemplateColumns: `repeat(${weeks.length}, ${TILE_SIZE}px)`,
                  gridTemplateRows: `repeat(7, ${TILE_SIZE}px)`,
                  gridAutoFlow: "column",
                  gap: GAP,
                }}
              >
                <OpalField gems={gems} width={gridWidth} height={gridHeight} />
                {weeks.flatMap((week, wi) =>
                  week.map((day, di) =>
                    day.level === "diamond" ? (
                      <GemCell
                        key={`${wi}-${di}`}
                        title={tileTitle(day)}
                        // sweep left → right across the visible weeks
                        delayMs={Math.max(0, wi - todayCol + 12) * 55 + di * 20}
                      />
                    ) : (
                      <span
                        key={`${wi}-${di}`}
                        className={cn("rounded-[6px]", tileClass(day.level))}
                        title={tileTitle(day)}
                      />
                    )
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span>
            {stats.trackedDays} day{stats.trackedDays === 1 ? "" : "s"} tracked in{" "}
            {weekCount} week{weekCount === 1 ? "" : "s"} · longest streak{" "}
            {stats.longestStreak} day{stats.longestStreak === 1 ? "" : "s"}
          </span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="size-[11px] rounded-[3px] bg-[var(--heat-2)]" /> one logged
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-[11px] rounded-[3px] bg-[var(--heat-4)]" /> two
            </span>
            <span className="flex items-center gap-1.5">
              <LegendStone tier={1} /> food + sleep + workout
            </span>
            <span className="flex items-center gap-1.5">
              <LegendStone tier={2} /> + steps
            </span>
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

/** A single stone for the legend — the same component as the demo stone. */
function LegendStone({ tier }: { tier: 1 | 2 }) {
  return <Opal size={24} tier={tier} seed={tier * 17} className="align-middle" />
}
