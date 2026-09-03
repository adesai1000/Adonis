import { useEffect, useMemo, useState } from "react"
import { convertWeight, goalProgressFraction } from "@/lib/calc"
import { cn } from "@/lib/utils"
import { useStore } from "@/store/store"

const SEGMENTS = 10

/** Compact segmented indicator of progress from starting to goal body weight. */
export function WeightGoalProgress() {
  const { weightLog, settings } = useStore()
  const unit = settings.weightUnit

  const progress = useMemo(() => {
    if (settings.goalWeight <= 0 || weightLog.length === 0) return null
    const sorted = [...weightLog].sort((a, b) =>
      a.datetime.localeCompare(b.datetime)
    )
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

  const filled = Math.round(progress * SEGMENTS)

  return (
    <div
      className="flex shrink-0 items-center gap-[3px]"
      role="img"
      aria-label={`Weight goal progress: ${Math.round(progress * 100)}%`}
    >
      {Array.from({ length: SEGMENTS }).map((_, i) => {
        const isFilled = i < filled
        return (
          <span
            key={i}
            className={cn(
              "h-2.5 w-1.5 rounded-full transition-all duration-300 ease-out",
              isFilled
                ? loaded
                  ? "scale-100 bg-primary opacity-100"
                  : "scale-50 bg-primary opacity-0"
                : "scale-100 border border-muted-foreground/25 bg-muted-foreground/10 opacity-100"
            )}
            style={isFilled ? { transitionDelay: `${i * 45}ms` } : undefined}
          />
        )
      })}
    </div>
  )
}
