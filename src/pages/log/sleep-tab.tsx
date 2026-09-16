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
import { EmptyState, FieldError } from "@/components/common/bits"
import { fmt, formatDateTime, formatTime, isoNow } from "@/lib/calc"
import { sleepForDay } from "@/lib/recovery"
import { useDraft } from "@/lib/storage"
import { useStore } from "@/store/store"
import type { SleepKind } from "@/lib/types"
import { format, subDays } from "date-fns"

interface SleepDraft {
  /** Went to bed / nap started (ISO). */
  datetime: string
  /** Woke up (ISO). */
  wakeAt: string
  kind: SleepKind
  notes: string
}

/** Typical spans used to pre-fill the pair: 8 h overnight, a 30 min nap. */
const DEFAULT_SPAN_SEC: Record<SleepKind, number> = { sleep: 8 * 3600, nap: 30 * 60 }

/** "Woke up just now" after a typical span, so the form is valid on arrival. */
function defaultTimes(kind: SleepKind): { datetime: string; wakeAt: string } {
  const now = Date.now()
  return {
    datetime: new Date(now - DEFAULT_SPAN_SEC[kind] * 1000).toISOString(),
    wakeAt: new Date(now).toISOString(),
  }
}

const initialDraft = (kind: SleepKind = "sleep"): SleepDraft => ({
  ...defaultTimes(kind),
  kind,
  notes: "",
})

function spanSec(bed: string, wake: string): number {
  const sec = (new Date(wake).getTime() - new Date(bed).getTime()) / 1000
  return isFinite(sec) ? Math.round(sec) : 0
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

  // Keep an abandoned draft's times from going stale across visits — a
  // fresh visit assumes you just woke up.
  useEffect(() => {
    setDraft((d) => ({ ...d, ...defaultTimes(d.kind) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isNap = draft.kind === "nap"
  const durationSec = spanSec(draft.datetime, draft.wakeAt)
  const invalid = durationSec <= 0
  const tooLong = durationSec > 20 * 3600

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

  function setKind(kind: SleepKind) {
    setDraft((d) => ({ ...d, kind, ...defaultTimes(kind) }))
  }

  function handleSubmit() {
    if (invalid) {
      toast.error("Wake-up time must be after you went to bed")
      return
    }
    addSleep({
      datetime: draft.datetime,
      kind: draft.kind,
      durationSec,
      notes: draft.notes.trim() || undefined,
    })
    toast.success(isNap ? "Nap logged" : "Sleep logged")
    setDraft(initialDraft(draft.kind))
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
            if (v === "sleep" || v === "nap") setKind(v)
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

      <DateTimePicker
        label="Woke up at"
        value={draft.wakeAt}
        onChange={(wakeAt) => setDraft((d) => ({ ...d, wakeAt }))}
      />

      <div className="flex items-center justify-between rounded-[14px] border border-line bg-muted/50 px-4 py-3">
        <span className="text-sm text-muted-foreground">Duration</span>
        <span className="text-base font-semibold tabular-nums">
          {invalid ? "-" : hoursLabel(durationSec)}
        </span>
      </div>
      {invalid && <FieldError>Wake-up time must be after you went to bed.</FieldError>}
      {!invalid && tooLong && (
        <FieldError>That's over 20 hours — double-check the dates.</FieldError>
      )}

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
