import { useEffect, useMemo } from "react"
import { BedDouble, Moon } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { DateTimePicker } from "@/components/common/datetime-picker"
import { EmptyState, FieldError, HMSInput } from "@/components/common/bits"
import { fmt, formatDateTime, formatTime, isoNow } from "@/lib/calc"
import { sleepForDay } from "@/lib/recovery"
import { useDraft } from "@/lib/storage"
import { useStore } from "@/store/store"
import type { SleepKind } from "@/lib/types"
import { cn } from "@/lib/utils"
import { format, subDays } from "date-fns"

interface SleepDraft {
  datetime: string
  kind: SleepKind
  h: string
  m: string
  notes: string
}

const initialDraft = (): SleepDraft => ({
  datetime: isoNow(),
  kind: "sleep",
  h: "",
  m: "",
  notes: "",
})

/** One-tap durations, in minutes. */
const PRESETS: Record<SleepKind, number[]> = {
  sleep: [360, 420, 450, 480, 510, 540],
  nap: [20, 30, 45, 60, 90],
}

function toNum(v: string): number {
  const n = parseFloat(v)
  return isFinite(n) ? n : 0
}

function hoursLabel(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

export function SleepTab() {
  const { sleepLog, addSleep, settings } = useStore()
  const [draft, setDraft] = useDraft<SleepDraft>("wt_draft_sleep", initialDraft())

  // Keep an abandoned draft's date/time from going stale across visits —
  // always start a fresh visit to this tab at the current moment.
  useEffect(() => {
    setDraft((d) => ({ ...d, datetime: isoNow() }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isNap = draft.kind === "nap"
  const durationSec = Math.round((toNum(draft.h) * 60 + toNum(draft.m)) * 60)
  const invalid = durationSec <= 0
  const presetMin = Math.round(durationSec / 60)

  const recent = useMemo(
    () =>
      [...sleepLog]
        .sort((a, b) => (a.datetime < b.datetime ? 1 : -1))
        .slice(0, 5),
    [sleepLog]
  )

  // Average overnight sleep across the last 7 days that have any.
  const weekAvgHours = useMemo(() => {
    let total = 0
    let days = 0
    for (let i = 0; i < 7; i++) {
      const day = format(subDays(new Date(), i), "yyyy-MM-dd")
      const s = sleepForDay(sleepLog, day)
      if (s.sleepSec > 0) {
        total += s.sleepSec
        days++
      }
    }
    return days > 0 ? total / days / 3600 : null
  }, [sleepLog])

  function setPreset(min: number) {
    setDraft((d) => ({
      ...d,
      h: String(Math.floor(min / 60)),
      m: String(min % 60),
    }))
  }

  function handleSubmit() {
    if (invalid) {
      toast.error("Enter how long you slept")
      return
    }
    addSleep({
      datetime: draft.datetime,
      kind: draft.kind,
      durationSec,
      notes: draft.notes.trim() || undefined,
    })
    toast.success(isNap ? "Nap logged" : "Sleep logged")
    setDraft({ ...initialDraft(), kind: draft.kind })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Type</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          value={draft.kind}
          onValueChange={(v) => {
            if (v === "sleep" || v === "nap") setDraft((d) => ({ ...d, kind: v }))
          }}
          className="grid w-full grid-cols-2"
        >
          <ToggleGroupItem value="sleep" className="h-11">
            <Moon className="size-4" />
            Sleep
          </ToggleGroupItem>
          <ToggleGroupItem value="nap" className="h-11">
            <BedDouble className="size-4" />
            Nap
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <DateTimePicker
        label={isNap ? "Nap started" : "Went to bed"}
        value={draft.datetime}
        onChange={(datetime) => setDraft((d) => ({ ...d, datetime }))}
      />

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Duration</Label>
        <div className="grid grid-cols-2 gap-2">
          <HMSInput
            label="hrs"
            value={draft.h}
            onChange={(h) => setDraft((d) => ({ ...d, h }))}
          />
          <HMSInput
            label="min"
            value={draft.m}
            onChange={(m) => setDraft((d) => ({ ...d, m }))}
            max={59}
          />
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {PRESETS[draft.kind].map((min) => (
            <button
              key={min}
              type="button"
              onClick={() => setPreset(min)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                presetMin === min
                  ? "bg-foreground text-background dark:bg-white/15 dark:text-foreground"
                  : "bg-muted text-ink-2 hover:text-foreground"
              )}
            >
              {hoursLabel(min * 60)}
            </button>
          ))}
        </div>
        {invalid && (draft.h !== "" || draft.m !== "") && (
          <FieldError>Duration must be above zero.</FieldError>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Notes</Label>
        <Input
          placeholder="Optional (e.g. woke up twice, late caffeine)"
          className="h-11"
          value={draft.notes}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
        />
      </div>

      <Button
        type="button"
        className="h-11 w-full"
        onClick={handleSubmit}
        disabled={invalid}
      >
        {isNap ? <BedDouble className="size-4" /> : <Moon className="size-4" />}
        {isNap ? "Log nap" : "Log sleep"}
      </Button>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium">Recent</p>
          {weekAvgHours != null && (
            <p className="text-xs text-muted-foreground tabular-nums">
              7-day avg {fmt(weekAvgHours)} h · goal {fmt(settings.sleepGoalHours, 0)} h
            </p>
          )}
        </div>
        {recent.length === 0 ? (
          <EmptyState
            icon={<Moon className="size-8" />}
            title="No sleep logged yet"
            hint="Log last night to unlock recovery and readiness scores."
          />
        ) : (
          <ul className="divide-y divide-line rounded-[14px] border border-line">
            {recent.map((e) => {
              const wake = new Date(new Date(e.datetime).getTime() + e.durationSec * 1000)
              return (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{formatDateTime(e.datetime)}</p>
                      <Badge variant="secondary" className="font-normal">
                        {e.kind === "nap" ? "Nap" : "Sleep"}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      up at {formatTime(wake.toISOString())}
                      {e.notes ? ` · ${e.notes}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {hoursLabel(e.durationSec)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
