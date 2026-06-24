import { useMemo } from "react"
import { Scale } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { DateTimePicker } from "@/components/common/datetime-picker"
import { EmptyState, FieldError } from "@/components/common/bits"
import { convertWeight, fmt, formatDateTime, isoNow, round1 } from "@/lib/calc"
import { useDraft } from "@/lib/storage"
import { useStore } from "@/store/store"

interface WeightDraft {
  datetime: string
  weight: string
  notes: string
}

const initialDraft = (): WeightDraft => ({
  datetime: isoNow(),
  weight: "",
  notes: "",
})

export function WeightTab() {
  const { settings, weightLog, addWeight } = useStore()
  const [draft, setDraft] = useDraft<WeightDraft>(
    "wt_draft_weight",
    initialDraft()
  )

  const unit = settings.weightUnit
  const weightNum = parseFloat(draft.weight)
  const invalid = !isFinite(weightNum) || weightNum <= 0

  const recent = useMemo(
    () =>
      [...weightLog]
        .sort((a, b) => (a.datetime < b.datetime ? 1 : -1))
        .slice(0, 5),
    [weightLog]
  )

  function handleSubmit() {
    if (invalid) {
      toast.error("Enter a valid weight")
      return
    }
    addWeight({
      datetime: draft.datetime,
      weight: round1(weightNum),
      unit,
      notes: draft.notes.trim() || undefined,
    })
    toast.success("Weight logged")
    setDraft(initialDraft())
  }

  return (
    <div className="space-y-4">
      <DateTimePicker
        value={draft.datetime}
        onChange={(datetime) => setDraft((d) => ({ ...d, datetime }))}
      />

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Weight</Label>
        <div className="relative">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.1"
            placeholder="0"
            className="h-11 pr-14 tabular-nums"
            value={draft.weight}
            onChange={(e) => setDraft((d) => ({ ...d, weight: e.target.value }))}
          />
          <Badge
            variant="secondary"
            className="absolute right-2 top-1/2 -translate-y-1/2"
          >
            {unit}
          </Badge>
        </div>
        {invalid && draft.weight !== "" && (
          <FieldError>Weight must be greater than zero.</FieldError>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Notes</Label>
        <Input
          placeholder="e.g. morning fasted"
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
        <Scale className="size-4" />
        Log weight
      </Button>

      <Separator />

      <div className="space-y-2">
        <p className="text-sm font-medium">Recent</p>
        {recent.length === 0 ? (
          <EmptyState
            icon={<Scale className="size-8" />}
            title="No weight entries yet"
            hint="Your latest entries will show here."
          />
        ) : (
          <ul className="divide-y rounded-lg border">
            {recent.map((e) => {
              const display = round1(convertWeight(e.weight, e.unit, unit))
              return (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {formatDateTime(e.datetime)}
                    </p>
                    {e.notes && (
                      <p className="truncate text-xs text-muted-foreground">
                        {e.notes}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {fmt(display)} {unit}
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
