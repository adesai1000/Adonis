import { useEffect, useMemo, useState } from "react"
import { convertWeight, goalProgressFraction } from "@/lib/calc"
import { useStore } from "@/store/store"

const SEGMENTS = 16
// Any nonzero progress still shows a visible sliver in the first segment,
// rather than rounding away to nothing.
const MIN_VISIBLE_FRACTION = 0.12

/** Compact segmented indicator of progress from starting to goal body weight. */
export function WeightGoalProgress() {
  const { weightLog, settings } = useStore()
  const unit = settings.weightUnit

  const progress = useMemo(() => {
    if (settings.goalWeight <= 0 || weightLog.length === 0) return null
    const sorted = [...weightLog].sort((a, b) =>
      a.datetime.localeCompare(b.datetime)
    )
    // First-ever entry = starting weight, most recent = current weight.
    const start = convertWeight(sorted[0].weight, sorted[0].unit, unit)
    const current = convertWeight(
      sorted[sorted.length - 1].weight,
      sorted[sorted.length - 1].unit,
      unit
    )
    return goalProgressFraction(start, current, settings.goalWeight)
  }, [weightLog, settings.goalWeight, unit])

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

  return (
    <div
      className="flex shrink-0 items-center gap-[3px]"
      role="img"
      aria-label={`Weight goal progress: ${Math.round(progress * 100)}%`}
    >
      {Array.from({ length: SEGMENTS }).map((_, i) => {
        let fraction = Math.max(0, Math.min(1, filledUnits - i))
        if (i === 0 && progress > 0 && fraction < MIN_VISIBLE_FRACTION) {
          fraction = MIN_VISIBLE_FRACTION
        }
        return (
          <span
            key={i}
            className="relative h-2.5 w-1.5 shrink-0 overflow-hidden rounded-full border border-muted-foreground/25 bg-muted-foreground/10"
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-300 ease-out"
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
