import { useEffect, useMemo, useRef } from "react"
import { format, parseISO } from "date-fns"
import { Grid3x3 } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card"
import { EmptyState } from "@/components/common/bits"
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
    case 2:
      return "bg-blue-600 dark:bg-blue-500"
    case 1:
      return "bg-sky-300 dark:bg-sky-800"
    default:
      return "bg-muted"
  }
}

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""]

export function ConsistencyTracker() {
  const { foodLog, workoutLog, cardioLog, settings } = useStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  const stats = useMemo(() => {
    const input = { foodLog, workoutLog, cardioLog }
    let start: Date | null = null
    if (settings.trackingStartDate) {
      try {
        const d = parseISO(settings.trackingStartDate)
        if (!isNaN(d.getTime())) start = d
      } catch {
        start = null
      }
    }
    if (!start) start = earliestLogDate(input)
    return buildConsistency(input, start)
  }, [foodLog, workoutLog, cardioLog, settings.trackingStartDate])

  const weeks = useMemo(() => buildConsistencyWeeks(stats.days), [stats.days])

  const monthLabels = useMemo(() => {
    let prevMonth = ""
    return weeks.map((week) => {
      const firstDay = week.find((d) => d !== null)
      if (!firstDay) return ""
      const month = format(parseISO(firstDay.date), "MMM")
      const label = month !== prevMonth ? month : ""
      prevMonth = month
      return label
    })
  }, [weeks])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [weeks.length])

  const hasData = stats.trackedDays > 0
  const weekCount = Math.max(1, Math.round(stats.totalDays / 7))

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="flex flex-row items-center gap-3 px-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-md bg-muted text-foreground">
            <Grid3x3 className="size-4" />
          </span>
          <span className="text-sm font-semibold">Consistency</span>
        </div>
      </CardHeader>

      <CardContent className="px-5">
        {!hasData ? (
          <EmptyState
            icon={<Grid3x3 className="size-8" />}
            title="No consistency data yet"
            hint="Log calories (and workouts) to start building a streak."
          />
        ) : (
          <>
            <div className="flex gap-2">
              <div className="flex shrink-0 flex-col gap-[3px] pt-[18px] text-[10px] leading-3 text-muted-foreground">
                {DAY_LABELS.map((label, i) => (
                  <span key={i} className="h-3">
                    {label}
                  </span>
                ))}
              </div>

              <div ref={scrollRef} className="overflow-x-auto">
                <div className="inline-flex flex-col gap-1">
                  <div className="flex gap-[3px]">
                    {weeks.map((_, wi) => (
                      <span
                        key={wi}
                        className="w-3 shrink-0 text-[10px] leading-3 text-muted-foreground"
                      >
                        {monthLabels[wi]}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-[3px]">
                    {weeks.map((week, wi) => (
                      <div key={wi} className="flex flex-col gap-[3px]">
                        {week.map((day, di) => (
                          <span
                            key={di}
                            className={cn(
                              "size-3 rounded-[3px]",
                              day ? tileClass(day.level) : "bg-transparent"
                            )}
                            title={
                              day
                                ? `${day.date}: ${
                                    day.level === 2
                                      ? "calories + workout"
                                      : day.level === 1
                                        ? "calories logged"
                                        : "nothing logged"
                                  }`
                                : undefined
                            }
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 text-xs text-muted-foreground">
              {stats.trackedDays} day{stats.trackedDays === 1 ? "" : "s"}{" "}
              tracked in {weekCount} week{weekCount === 1 ? "" : "s"} ·
              longest streak {stats.longestStreak} day
              {stats.longestStreak === 1 ? "" : "s"}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
