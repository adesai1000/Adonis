import { Timer } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
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

  const durationSec = hmsToSeconds(toNum(draft.h), toNum(draft.m), toNum(draft.s))
  const distance = toNum(draft.distance)
  const pace = formatPace(
    distance > 0 ? distance : undefined,
    durationSec,
    settings.distanceUnit
  )
  const distanceLabel = settings.distanceUnit === "km" ? "km" : "mi"

  const durationInvalid = durationSec <= 0

  function handleSubmit() {
    if (durationInvalid) {
      toast.error("Enter a duration")
      return
    }
    addCardio({
      datetime: draft.datetime,
      activity: draft.activity,
      distance: distance > 0 ? distance : undefined,
      distanceUnit: distance > 0 ? settings.distanceUnit : undefined,
      durationSec,
      avgHeartRate:
        toNum(draft.avgHeartRate) > 0 ? toNum(draft.avgHeartRate) : undefined,
      caloriesBurned:
        toNum(draft.caloriesBurned) > 0
          ? toNum(draft.caloriesBurned)
          : undefined,
      notes: draft.notes.trim() || undefined,
    })
    toast.success("Cardio logged")
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
          onChange={(e) => setDraft((d) => ({ ...d, distance: e.target.value }))}
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
        {durationInvalid && <FieldError>Enter a duration above zero.</FieldError>}
      </div>

      <div className="grid grid-cols-2 gap-3">
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

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Notes</Label>
        <Textarea
          placeholder="Optional"
          value={draft.notes}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
        <span className="text-sm text-muted-foreground">Pace</span>
        <span className="text-base font-semibold tabular-nums">{pace}</span>
      </div>

      <Button
        type="button"
        className="h-11 w-full"
        onClick={handleSubmit}
        disabled={durationInvalid}
      >
        <Timer className="size-4" />
        Log cardio
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
