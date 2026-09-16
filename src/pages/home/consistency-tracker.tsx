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
import {
  Opal,
  OpalField,
  opalCanvasMargin,
  type OpalGem,
} from "@/components/common/opal-field"

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
 * over the grid; this keeps the cell's place (and its tooltip). The disc
 * inside is the fallback for browsers without WebGL and is hidden otherwise.
 */
function GemCell({ title }: { title: string }) {
  return (
    <span className="gem-cell relative" title={title}>
      <span className="gem-fallback">
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
const TILE_SIZE = 36
const GAP = 7
const COL_WIDTH = TILE_SIZE + GAP
/** How many weeks past today stay visible after the initial auto-scroll. */
const FUTURE_PEEK_WEEKS = 3
/**
 * How far a stone's halo is still visible past its cell, in CSS px. The grid
 * keeps this much room on its left and right inside the scrolled content, so
 * it scrolls with the grid instead of letting scrolled-in tiles paint over
 * the day labels. (The OpalField canvas reaches further, but that fringe is
 * transparent and the scroll box simply clips it sideways.)
 */
const HALO_ROOM = 8
/**
 * Below the grid the scroll box must fit the whole canvas, or the overflow
 * would make the box scrollable vertically; that padding doubles as the gap
 * to the legend. The canvas's top edge already sits inside the month row.
 */
const CANVAS_PAD = opalCanvasMargin(TILE_SIZE)

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
  // showing. Land on a column boundary: the first visible column sits just
  // past the previous one's right edge with its own halo room showing, so no
  // sliver of a half-scrolled tile sits beside the day labels.
  const todayCol = Math.floor(Math.max(0, stats.todayIndex) / 7)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const raf = requestAnimationFrame(() => {
      const fit = Math.floor(el.clientWidth / COL_WIDTH)
      const first = Math.max(0, todayCol + FUTURE_PEEK_WEEKS + 1 - fit)
      el.scrollLeft = first === 0 ? 0 : HALO_ROOM + first * COL_WIDTH - GAP
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
    <Card className="gap-4 py-5">
      <CardHeader className="flex flex-row items-center gap-3 px-5">
        <span className="grid size-6 place-items-center rounded-lg bg-muted text-ink-2">
          <Grid3x3 className="size-3.5" />
        </span>
        <span className="text-[13px] font-semibold">Consistency</span>
      </CardHeader>

      <CardContent className="px-5">
        {/* no flex gap: the grid's own halo room is the gap to the labels */}
        <div className="flex">
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
          <div
            ref={scrollRef}
            className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
            style={{ paddingBottom: CANVAS_PAD }}
          >
            <div
              style={{
                width: gridWidth + 2 * HALO_ROOM,
                paddingLeft: HALO_ROOM,
                paddingRight: HALO_ROOM,
              }}
            >
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
                      <GemCell key={`${wi}-${di}`} title={tileTitle(day)} />
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
              <span className="size-[11px] rounded-[3px] bg-[var(--heat-4)]" /> 2 logged
            </span>
            <span
              className="flex items-center gap-1.5"
              title="Food, sleep and a workout all logged (food and sleep on a weekend)"
            >
              <LegendStone tier={1} /> full day
            </span>
            <span className="flex items-center gap-1.5" title="A full day with steps logged too">
              <LegendStone tier={2} /> full day + steps
            </span>
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

/** A single stone for the legend — the same component as the demo stone. */
function LegendStone({ tier }: { tier: 1 | 2 }) {
  return <Opal size={30} tier={tier} seed={tier * 17} className="align-middle" />
}
