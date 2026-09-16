import { useEffect, useMemo, useState } from "react"
import { convertWeight, goalProgressFraction } from "@/lib/calc"
import { useStore } from "@/store/store"

const SEGMENTS = 16
// Any nonzero progress still shows a visible sliver in the first segment,
// rather than rounding away to nothing.
const MIN_VISIBLE_FRACTION = 0.12
/** The leading filled segments glow green (Stickshift `.segmeter i.hot`). */
const HOT_SEGMENTS = 3
/**
 * Front-load the fill so the first few pounds register: a linear meter
 * shows 2 lb of a 52 lb goal as 4%, which rounds away to nothing. With this
 * exponent it reads ~17%, and the curve still lands exactly on 100% at goal.
 */
const EASE_EXPONENT = 0.55

/**
 * Stickshift's segmented "barcode" meter, reading progress from your
 * furthest-from-goal weigh-in to the goal weight: ink for ground covered,
 * green at the leading edge, hairline for what's left.
 */
export function WeightGoalProgress() {
  const { weightLog, settings } = useStore()
  const unit = settings.weightUnit

  const state = useMemo(() => {
    if (settings.goalWeight <= 0 || weightLog.length === 0) return null
    const sorted = [...weightLog].sort((a, b) =>
      a.datetime.localeCompare(b.datetime)
    )
    const weights = sorted.map((e) => convertWeight(e.weight, e.unit, unit))
    const current = weights[weights.length - 1]
    const goal = settings.goalWeight
    // Baseline is the worst point on record, not the first entry: if you
    // started at 245, drifted to 252 and are now heading down, progress is
    // measured from 252. A single weigh-in above goal is 0% but still a bar.
    const losing = current >= goal
    const start = losing ? Math.max(...weights) : Math.min(...weights)
    const raw = goalProgressFraction(start, current, goal)
    if (raw === null) {
      // start === goal only happens once you've hit it
      return Math.abs(current - goal) < 1e-9 ? { progress: 1, current, goal, start } : null
    }
    return { progress: Math.pow(raw, EASE_EXPONENT), current, goal, start }
  }, [weightLog, settings.goalWeight, unit])
  const progress = state?.progress ?? null

  // Play a fill-in animation whenever the progress value (first) loads or changes.
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (progress === null) return
    setLoaded(false)
    const raf = requestAnimationFrame(() => setLoaded(true))
    return () => cancelAnimationFrame(raf)
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
      className="flex shrink-0 items-end gap-[3px]"
      role="img"
      aria-label={`Weight goal progress: ${Math.round(progress * 100)}%. ${summary}`}
      title={summary}
    >
      {Array.from({ length: SEGMENTS }).map((_, i) => {
        let fraction = Math.max(0, Math.min(1, filledUnits - i))
        if (i === 0 && progress > 0 && fraction < MIN_VISIBLE_FRACTION) {
          fraction = MIN_VISIBLE_FRACTION
        }
        const hot = fraction > 0 && i > lastFilled - HOT_SEGMENTS
        return (
          <span
            key={i}
            className="relative h-3.5 w-[5px] shrink-0 overflow-hidden rounded-[2px] bg-line-strong"
          >
            <span
              className={
                "absolute inset-y-0 left-0 rounded-[2px] transition-[width] duration-300 ease-out " +
                (hot ? "bg-green" : "bg-foreground")
              }
              style={{
                width: loaded ? `${fraction * 100}%` : "0%",
                transitionDelay: `${i * 30}ms`,
              }}
            />
          </span>
        )
      })}
    </div>
  )
}
