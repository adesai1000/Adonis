import { differenceInCalendarDays, format, parseISO } from "date-fns"
import { HeartPulse, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { fmt, todayKey } from "@/lib/calc"
import type { DataSource, RecoveryEntry } from "@/lib/types"

const SOURCE_LABELS: Record<DataSource, string> = {
  manual: "Manual",
  whoop: "Whoop",
  googlefit: "Google Fit & Fitbit",
}

const MAX_AGE_DAYS = 3

function isFresh(e: RecoveryEntry): boolean {
  try {
    const age = differenceInCalendarDays(new Date(), parseISO(e.date))
    return age >= 0 && age <= MAX_AGE_DAYS
  } catch {
    return false
  }
}

/**
 * Latest fresh (≤3 days old) day of recovery data, with same-date entries from
 * multiple sources merged (e.g. Whoop recovery + Google Fit steps).
 */
function latestMerged(
  entries: RecoveryEntry[]
): { entry: RecoveryEntry; sources: DataSource[] } | null {
  const fresh = entries.filter(isFresh)
  if (fresh.length === 0) return null
  // prefer the latest day that actually has a recovery score
  const pool = fresh.some((e) => e.recoveryScore != null)
    ? fresh.filter((e) => e.recoveryScore != null)
    : fresh
  const date = pool.reduce((max, e) => (e.date > max ? e.date : max), pool[0].date)
  const day = entries.filter((e) => e.date === date)
  const entry: RecoveryEntry = { ...day[0] }
  for (const e of day.slice(1)) {
    entry.recoveryScore ??= e.recoveryScore
    entry.hrvMs ??= e.hrvMs
    entry.restingHeartRate ??= e.restingHeartRate
    entry.sleepPerformance ??= e.sleepPerformance
    entry.sleepDurationSec ??= e.sleepDurationSec
    entry.dayStrain ??= e.dayStrain
    entry.steps ??= e.steps
    entry.caloriesOut ??= e.caloriesOut
  }
  const sources = [...new Set(day.map((e) => e.source))]
  return { entry, sources }
}

function sleepText(e: RecoveryEntry): string | null {
  if (e.sleepDurationSec == null) return null
  const sec = Math.max(0, Math.floor(e.sleepDurationSec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const duration = `${h}:${m.toString().padStart(2, "0")}`
  return e.sleepPerformance != null
    ? `${duration} · ${Math.round(e.sleepPerformance)}%`
    : duration
}

function ringColorClass(score: number | undefined): string {
  if (score == null) return "text-muted-foreground/50"
  if (score > 66) return "text-[var(--chart-2)]"
  if (score >= 34) return "text-[var(--chart-5)] dark:text-[var(--chart-3)]"
  return "text-destructive"
}

function ScoreRing({ score }: { score?: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, score ?? 0))
  const color = ringColorClass(score)
  return (
    <div className="relative size-16 shrink-0">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          className="stroke-muted"
        />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={`${(clamped / 100) * c} ${c}`}
          className={cn("transition-all duration-500", color)}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("text-sm font-semibold tabular-nums", color)}>
          {score != null ? `${Math.round(clamped)}%` : "-"}
        </span>
      </div>
    </div>
  )
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

function HideButton({ onHide }: { onHide: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="absolute right-2 top-2 hidden text-muted-foreground hover:text-foreground sm:inline-flex"
      onClick={onHide}
      aria-label="Hide Recovery"
    >
      <X className="size-3.5" />
    </Button>
  )
}

function CardLabel() {
  return (
    <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground sm:pr-6">
      <span className="text-primary">
        <HeartPulse className="size-4" />
      </span>
      <span className="truncate">Recovery</span>
    </div>
  )
}

export function RecoveryCard({
  entries,
  onHide,
}: {
  entries: RecoveryEntry[]
  onHide: () => void
}) {
  const latest = latestMerged(entries)

  if (!latest) {
    // generic-style card, same layout as its siblings
    return (
      <Card className="relative gap-0 py-0">
        <HideButton onHide={onHide} />
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:block sm:px-5 sm:py-5">
          <CardLabel />
          <div className="flex flex-col items-end sm:mt-2.5 sm:items-start">
            <div className="text-xl font-semibold tabular-nums sm:text-3xl">
              -
            </div>
            <div className="mt-0.5 sm:mt-1.5">
              <span className="text-xs text-muted-foreground">
                {entries.length === 0
                  ? "Connect Whoop or Google Fit & Fitbit in Settings to see recovery here"
                  : "No recovery data in the last few days"}
              </span>
            </div>
          </div>
        </div>
      </Card>
    )
  }

  const { entry, sources } = latest
  const isToday = entry.date === todayKey()
  const sleep = sleepText(entry)

  return (
    <Card className="relative gap-0 py-0">
      <HideButton onHide={onHide} />
      <div className="px-4 py-3.5 sm:px-5 sm:py-5">
        <CardLabel />
        <div className="mt-2.5 flex items-center gap-4">
          <ScoreRing score={entry.recoveryScore} />
          <div className="min-w-0 flex-1 space-y-1">
            {entry.hrvMs != null && (
              <MetricRow label="HRV" value={`${Math.round(entry.hrvMs)} ms`} />
            )}
            {entry.restingHeartRate != null && (
              <MetricRow
                label="RHR"
                value={`${Math.round(entry.restingHeartRate)} bpm`}
              />
            )}
            {entry.dayStrain != null && (
              <MetricRow label="Strain" value={fmt(entry.dayStrain)} />
            )}
            {sleep && <MetricRow label="Sleep" value={sleep} />}
            {entry.steps != null && (
              <MetricRow label="Steps" value={entry.steps.toLocaleString()} />
            )}
            {entry.caloriesOut != null && (
              <MetricRow
                label="Active"
                value={`${Math.round(entry.caloriesOut)} kcal`}
              />
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {sources.map((s) => SOURCE_LABELS[s]).join(" · ")}
          {!isToday && ` · ${format(parseISO(entry.date), "EEE, MMM d")}`}
        </p>
      </div>
    </Card>
  )
}
