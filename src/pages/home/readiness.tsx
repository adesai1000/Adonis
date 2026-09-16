import { useEffect, useMemo, useState } from "react"
import { Gauge, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { fmt, todayKey } from "@/lib/calc"
import { readinessForDay, type ReadinessZone } from "@/lib/recovery"
import { useNav } from "@/store/nav"
import { useStore } from "@/store/store"
import { cn } from "@/lib/utils"

const ZONE_CHIP: Record<ReadinessZone, string> = {
  push: "bg-green-tint text-green-ink",
  train: "bg-green-tint text-green-ink",
  easy: "bg-amber-tint text-amber",
  rest: "bg-red-tint text-red",
}

const ZONE_BAR: Record<ReadinessZone, string> = {
  push: "bg-green",
  train: "bg-green",
  easy: "bg-amber",
  rest: "bg-red",
}

/** Today's readiness with the "how hard should I push" call and what fed it. */
export function ReadinessSection() {
  const { sleepLog, workoutLog, cardioLog, foodLog, settings } = useStore()
  const { goLog } = useNav()
  const today = todayKey()

  const r = useMemo(
    () =>
      readinessForDay({ sleepLog, workoutLog, cardioLog, foodLog, settings }, today),
    [sleepLog, workoutLog, cardioLog, foodLog, settings, today]
  )
  const rec = r.recovery

  // Fill the bar and count the number up from zero whenever the score lands.
  const target = r.score ?? 0
  const [drawn, setDrawn] = useState(0)
  const [shown, setShown] = useState(0)
  useEffect(() => {
    setDrawn(0)
    setShown(0)
    if (target <= 0) return
    const raf = requestAnimationFrame(() => setDrawn(target))
    const start = performance.now()
    const DURATION = 900
    let id = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION)
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(Math.round(target * eased))
      if (t < 1) id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(id)
    }
  }, [target])

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-5">
        <div className="flex items-center gap-3">
          <span className="grid size-6 place-items-center rounded-lg bg-muted text-ink-2">
            <Gauge className="size-3.5" />
          </span>
          <span className="text-[13px] font-semibold">Readiness</span>
        </div>
        {r.zone && (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold",
              ZONE_CHIP[r.zone]
            )}
          >
            {r.label}
          </span>
        )}
      </CardHeader>

      <CardContent className="px-5">
        {r.score == null ? (
          <div className="flex flex-col gap-3 rounded-[18px] border border-dashed border-line-strong bg-muted/40 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">{r.label}</p>
              <p className="mt-0.5 text-xs text-ink-3">{r.advice}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0"
              onClick={() => goLog("sleep")}
            >
              <Moon className="size-4" />
              Log sleep
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
            <div className="shrink-0">
              <div className="display-num text-[44px] tabular-nums">
                {shown}
                <span className="ml-1 text-[18px] text-muted-foreground">/ 100</span>
              </div>
              <div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full motion-safe:[transition:width_900ms_cubic-bezier(0.22,1,0.36,1)]",
                    r.zone && ZONE_BAR[r.zone]
                  )}
                  style={{ width: `${drawn}%` }}
                />
              </div>
              {r.targetStrain && (
                <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                  Aim for strain{" "}
                  <span className="font-semibold text-foreground">
                    {r.targetStrain[0]}–{r.targetStrain[1]}
                  </span>{" "}
                  today
                </p>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <p className="text-sm leading-relaxed">{r.advice}</p>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <Stat
                  label="Recovery"
                  value={rec.score != null ? `${rec.score}` : "-"}
                  sub="of 100"
                />
                <Stat
                  label="Sleep"
                  value={rec.sleep ? `${fmt(rec.sleep.hours)} h` : "-"}
                  sub={rec.sleep ? `goal ${fmt(rec.sleep.goal, 0)} h` : "not logged"}
                />
                <Stat
                  label="Strain yesterday"
                  value={fmt(rec.strain.yesterday)}
                  sub={rec.strain.yesterday > 0 ? "of 21" : "rest day"}
                />
                <Stat
                  label="Protein yesterday"
                  value={rec.nutrition ? `${fmt(rec.nutrition.protein, 0)} g` : "-"}
                  sub={
                    rec.nutrition
                      ? `goal ${fmt(rec.nutrition.proteinGoal, 0)} g`
                      : "no food logged"
                  }
                />
              </div>

              {(r.loadRatio != null && r.loadRatio > 1.1) || r.streak >= 4 ? (
                <p className="text-xs text-muted-foreground">
                  {r.streak >= 4 && `${r.streak} training days in a row. `}
                  {r.loadRatio != null &&
                    r.loadRatio > 1.1 &&
                    `Your last 3 days ran ${Math.round((r.loadRatio - 1) * 100)}% above your 2-week average.`}
                </p>
              ) : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="microlabel">{label}</div>
      <div className="display-num mt-1 truncate text-[20px]">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}
