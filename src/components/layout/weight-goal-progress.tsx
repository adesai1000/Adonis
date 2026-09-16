import { useEffect, useMemo, useState } from "react"
import { convertWeight, fmtCompact, goalProgressFraction, startingWeightEntry } from "@/lib/calc"
import { useStore } from "@/store/store"

const SEGMENTS = 16
// Any nonzero progress still shows a clear sliver in the first segment
// (about a third of it), rather than rounding away to nothing.
const MIN_VISIBLE_FRACTION = 0.3
/** The leading filled segments stay green (Stickshift `.segmeter i.hot`). */
const HOT_SEGMENTS = 3
/** How long the pour runs before the water "settles" to ink. */
const POUR_MS = 1100

/**
 * Stickshift's segmented "barcode" meter, reading progress from your
 * starting weigh-in (first entry on/after the tracking start date) to the
 * goal weight: ink for ground covered, green at the leading edge, hairline
 * for what's left. Linear, so every pound is worth the same width.
 */
export function WeightGoalProgress() {
  const { weightLog, settings } = useStore()
  const unit = settings.weightUnit

  const state = useMemo(() => {
    if (settings.goalWeight <= 0 || weightLog.length === 0) return null
    const startEntry = startingWeightEntry(weightLog, settings.trackingStartDate)
    const latest = [...weightLog].sort((a, b) => a.datetime.localeCompare(b.datetime)).at(-1)
    if (!startEntry || !latest) return null
    const start = convertWeight(startEntry.weight, startEntry.unit, unit)
    const current = convertWeight(latest.weight, latest.unit, unit)
    const goal = settings.goalWeight
    const raw = goalProgressFraction(start, current, goal)
    if (raw === null) {
      // start === goal only happens once you've hit it
      return Math.abs(current - goal) < 1e-9 ? { progress: 1, current, goal, start } : null
    }
    return { progress: raw, current, goal, start }
  }, [weightLog, settings.goalWeight, settings.trackingStartDate, unit])
  const progress = state?.progress ?? null

  // Pour on (re)load: segments surge in green with a little overshoot, then
  // the water settles and everything but the leading edge turns to ink.
  const [loaded, setLoaded] = useState(false)
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (progress === null) return
    setLoaded(false)
    setSettled(false)
    const raf = requestAnimationFrame(() => setLoaded(true))
    const t = window.setTimeout(() => setSettled(true), POUR_MS)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(t)
    }
  }, [progress])

  if (progress === null) return null

  const filledUnits = progress * SEGMENTS
  const lastFilled = Math.ceil(filledUnits) - 1

  const covered = state ? Math.abs(state.start - state.current) : 0
  const left = state ? Math.abs(state.goal - state.current) : 0
  const summary = state
    ? `${covered.toFixed(1)} ${unit} down from ${state.start.toFixed(1)}, ${left.toFixed(1)} ${unit} to ${state.goal}`
    : ""

  return (
    <div
      className="flex shrink-0 items-center gap-2"
      role="img"
      aria-label={`Weight goal progress: ${Math.round(progress * 100)}%. ${summary}`}
      title={summary}
    >
      {/* current weight leads, goal trails, the meter reads between them */}
      <span className="text-[11.5px] font-semibold text-foreground tabular-nums">
        {state ? fmtCompact(state.current) : ""}
      </span>
      <div className="flex items-end gap-[3px]">
      {Array.from({ length: SEGMENTS }).map((_, i) => {
        let fraction = Math.max(0, Math.min(1, filledUnits - i))
        if (i === 0 && progress > 0 && fraction < MIN_VISIBLE_FRACTION) {
          fraction = MIN_VISIBLE_FRACTION
        }
        const hot = fraction > 0 && i > lastFilled - HOT_SEGMENTS
        // green while pouring, ink once settled (leading edge stays green)
        const green = hot || !settled
        return (
          <span
            key={i}
            className="relative h-3.5 w-[5px] shrink-0 overflow-hidden rounded-[2px] bg-line-strong"
          >
            <span
              className={
                "absolute inset-y-0 left-0 rounded-[2px] " +
                "motion-safe:[transition:width_650ms_cubic-bezier(0.34,1.45,0.64,1),background-color_600ms_ease] " +
                (green ? "bg-green" : "bg-foreground")
              }
              style={{
                width: loaded ? `${fraction * 100}%` : "0%",
                transitionDelay: settled ? "0ms" : `${i * 45}ms`,
              }}
            />
          </span>
        )
      })}
      </div>
      <span className="text-[11.5px] font-semibold text-ink-3 tabular-nums">
        {state ? `${fmtCompact(state.goal)} ${unit}` : ""}
      </span>
    </div>
  )
}
