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
 * Stickshift's segmented "barcode" meter, reading progress from the first-ever
 * weigh-in to the goal weight: ink for ground covered, green at the leading
 * edge, hairline for what's left.
 */
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
  const lastFilled = Math.ceil(filledUnits) - 1

  return (
    <div
      className="flex shrink-0 items-end gap-[3px]"
      role="img"
      aria-label={`Weight goal progress: ${Math.round(progress * 100)}%`}
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
