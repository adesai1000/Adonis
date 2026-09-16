import { useEffect, useState } from "react"
import { Pause, Play, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { HMSInput } from "@/components/common/bits"
import {
  cardioSeconds,
  durationToHMS,
  formatDuration,
  formatPace,
  hmsToSeconds,
  isoNow,
} from "@/lib/calc"
import type { DistanceUnit, ExerciseCardio } from "@/lib/types"

function toNum(v: string): number {
  const n = parseFloat(v)
  return isFinite(n) ? n : 0
}

/**
 * Logging surface for a cardio-machine exercise inside a workout session:
 * a start/pause timer that survives reloads (the start timestamp lives on
 * the active session), or manual duration + distance entry.
 */
export function CardioExercisePanel({
  cardio,
  distanceUnit,
  onChange,
}: {
  cardio: ExerciseCardio
  distanceUnit: DistanceUnit
  onChange: (next: ExerciseCardio) => void
}) {
  const running = !!cardio.timerStartedAt
  const [, setTick] = useState(0)

  // Re-render once a second while the timer runs.
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [running])

  const seconds = cardioSeconds(cardio)
  const distance = cardio.distance ?? 0
  const unitLabel = distanceUnit === "km" ? "km" : "mi"
  const { h, m, s } = durationToHMS(cardio.durationSec)

  function start() {
    onChange({ ...cardio, timerStartedAt: isoNow() })
  }
  function pause() {
    onChange({ ...cardio, durationSec: seconds, timerStartedAt: null })
  }
  function reset() {
    onChange({ ...cardio, durationSec: 0, timerStartedAt: null })
  }
  function setManual(hh: string, mm: string, ss: string) {
    onChange({
      ...cardio,
      durationSec: hmsToSeconds(toNum(hh), toNum(mm), toNum(ss)),
      timerStartedAt: null,
    })
  }
  function setDistance(v: string) {
    const d = Math.max(0, toNum(v))
    onChange({
      ...cardio,
      distance: d > 0 ? d : undefined,
      distanceUnit: d > 0 ? distanceUnit : undefined,
    })
  }

  return (
    <div className="space-y-4">
      {/* Timer */}
      <div className="rounded-[18px] border border-line bg-muted/50 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="microlabel">Timer</p>
            <p className="display-num mt-1 text-[34px] tabular-nums">
              {formatDuration(seconds)}
            </p>
          </div>
          <div className="flex gap-2">
            {running ? (
              <Button
                type="button"
                variant="outline"
                className="h-11 px-4"
                onClick={pause}
              >
                <Pause className="size-4" />
                Pause
              </Button>
            ) : (
              <Button type="button" className="h-11 px-4" onClick={start}>
                <Play className="size-4" />
                {seconds > 0 ? "Resume" : "Start"}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11"
              onClick={reset}
              disabled={running || seconds === 0}
              aria-label="Reset timer"
            >
              <RotateCcw className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Manual entry */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          Or enter the duration
        </Label>
        <div className="grid grid-cols-3 gap-2">
          <HMSInput
            label="hrs"
            value={h === 0 ? "" : String(h)}
            onChange={(v) => setManual(v, String(m), String(s))}
            disabled={running}
          />
          <HMSInput
            label="min"
            value={m === 0 ? "" : String(m)}
            onChange={(v) => setManual(String(h), v, String(s))}
            max={59}
            disabled={running}
          />
          <HMSInput
            label="sec"
            value={s === 0 ? "" : String(s)}
            onChange={(v) => setManual(String(h), String(m), v)}
            max={59}
            disabled={running}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          Distance ({unitLabel})
        </Label>
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          placeholder="0"
          className="h-11"
          value={distance === 0 ? "" : String(distance)}
          onChange={(e) => setDistance(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-between rounded-[14px] border border-line bg-muted/50 px-4 py-3">
        <span className="text-sm text-muted-foreground">Pace</span>
        <span className="text-base font-semibold tabular-nums">
          {formatPace(distance > 0 ? distance : undefined, seconds, distanceUnit)}
        </span>
      </div>
    </div>
  )
}
