import { Footprints, Timer } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DateTimePicker } from "@/components/common/datetime-picker"
import { FieldError } from "@/components/common/bits"
import { formatPace, hmsToSeconds, isoNow } from "@/lib/calc"
import { useDraft } from "@/lib/storage"
import { useStore } from "@/store/store"
import { CARDIO_ACTIVITIES, type CardioActivity } from "@/lib/types"

interface CardioDraft {
  datetime: string
  activity: CardioActivity
  distance: string
  h: string
  m: string
  s: string
  steps: string
  avgHeartRate: string
  caloriesBurned: string
  notes: string
}

const initialDraft = (): CardioDraft => ({
  datetime: isoNow(),
  activity: "Run",
  distance: "",
  h: "",
  m: "",
  s: "",
  steps: "",
  avgHeartRate: "",
  caloriesBurned: "",
  notes: "",
})

function toNum(v: string): number {
  const n = parseFloat(v)
  return isFinite(n) ? n : 0
}

export function CardioTab() {
  const { settings, addCardio } = useStore()
  const [draft, setDraft] = useDraft<CardioDraft>(
    "wt_draft_cardio",
    initialDraft()
  )

  const isSteps = draft.activity === "Steps"
  const durationSec = hmsToSeconds(toNum(draft.h), toNum(draft.m), toNum(draft.s))
  const distance = toNum(draft.distance)
  const steps = toNum(draft.steps)
  const pace = formatPace(
    distance > 0 ? distance : undefined,
    durationSec,
    settings.distanceUnit
  )
  const distanceLabel = settings.distanceUnit === "km" ? "km" : "mi"

  const durationInvalid = durationSec <= 0
  const stepsInvalid = steps <= 0
  const invalid = isSteps ? stepsInvalid : durationInvalid

  function handleSubmit() {
    if (invalid) {
      toast.error(isSteps ? "Enter your step count" : "Enter a duration")
      return
    }
    addCardio({
      datetime: draft.datetime,
      activity: draft.activity,
      distance: !isSteps && distance > 0 ? distance : undefined,
      distanceUnit: !isSteps && distance > 0 ? settings.distanceUnit : undefined,
      durationSec: isSteps ? 0 : durationSec,
      steps: isSteps && steps > 0 ? Math.round(steps) : undefined,
      avgHeartRate:
        !isSteps && toNum(draft.avgHeartRate) > 0
          ? toNum(draft.avgHeartRate)
          : undefined,
      caloriesBurned:
        !isSteps && toNum(draft.caloriesBurned) > 0
          ? toNum(draft.caloriesBurned)
          : undefined,
      notes: draft.notes.trim() || undefined,
    })
    toast.success(isSteps ? "Steps logged" : "Cardio logged")
    setDraft(initialDraft())
  }

  return (
    <div className="space-y-4">
      <DateTimePicker
        value={draft.datetime}
        onChange={(datetime) => setDraft((d) => ({ ...d, datetime }))}
      />

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Activity</Label>
        <Select
          value={draft.activity}
          onValueChange={(activity) =>
            setDraft((d) => ({ ...d, activity: activity as CardioActivity }))
          }
        >
          <SelectTrigger className="h-11 w-full">
            <SelectValue placeholder="Select activity" />
          </SelectTrigger>
          <SelectContent>
            {CARDIO_ACTIVITIES.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isSteps ? (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Steps</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            placeholder="e.g. 8000"
            className="h-11"
            value={draft.steps}
            onChange={(e) => setDraft((d) => ({ ...d, steps: e.target.value }))}
          />
          {stepsInvalid && <FieldError>Enter your step count.</FieldError>}
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Distance ({distanceLabel})
            </Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="0"
              className="h-11"
              value={draft.distance}
              onChange={(e) =>
                setDraft((d) => ({ ...d, distance: e.target.value }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Duration</Label>
            <div className="grid grid-cols-3 gap-2">
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
              <HMSInput
                label="sec"
                value={draft.s}
                onChange={(s) => setDraft((d) => ({ ...d, s }))}
                max={59}
              />
            </div>
            {durationInvalid && (
              <FieldError>Enter a duration above zero.</FieldError>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Avg heart rate (bpm)
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="0"
                className="h-11"
                value={draft.avgHeartRate}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, avgHeartRate: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Calories (kcal)
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="0"
                className="h-11"
                value={draft.caloriesBurned}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, caloriesBurned: e.target.value }))
                }
              />
            </div>
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Notes</Label>
        <Input
          placeholder="Optional"
          className="h-11"
          value={draft.notes}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
        />
      </div>

      {!isSteps && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
          <span className="text-sm text-muted-foreground">Pace</span>
          <span className="text-base font-semibold tabular-nums">{pace}</span>
        </div>
      )}

      <Button
        type="button"
        className="h-11 w-full"
        onClick={handleSubmit}
        disabled={invalid}
      >
        {isSteps ? <Footprints className="size-4" /> : <Timer className="size-4" />}
        {isSteps ? "Log steps" : "Log cardio"}
      </Button>
    </div>
  )
}

function HMSInput({
  label,
  value,
  onChange,
  max,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  max?: number
}) {
  return (
    <div className="relative">
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        placeholder="0"
        className="h-11 pr-9 text-center tabular-nums"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
        {label}
      </span>
    </div>
  )
}
