import { useEffect, useRef } from "react"
import { format, parseISO } from "date-fns"
import { CalendarIcon, X } from "lucide-react"
import { toast } from "sonner"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { FieldError } from "@/components/common/bits"
import { useDraft } from "@/lib/storage"
import { useStore } from "@/store/store"
import type {
  DistanceUnit,
  Settings,
  WeightUnit,
} from "@/lib/types"

type NumericGoalKey =
  | "calorieGoal"
  | "proteinGoal"
  | "carbsGoal"
  | "fatGoal"
  | "goalWeight"

function NumericGoal({
  field,
  label,
  unit,
}: {
  field: NumericGoalKey
  label: string
  unit: string
}) {
  const { settings, updateSettings } = useStore()
  // Draft mirror survives backgrounding; seeded from the store value.
  const [text, setText] = useDraft<string>(
    `wt_draft_goal_${field}`,
    String(settings[field])
  )

  const trimmed = text.trim()
  const num = Number(trimmed)
  const invalid = trimmed === "" || !isFinite(num) || num < 0

  // Re-sync from the store when it changes externally (import / clear-all),
  // i.e. when the stored value no longer matches the field's parsed number.
  const storeVal = settings[field]
  const focusedRef = useRef(false)
  useEffect(() => {
    if (focusedRef.current) return
    if (invalid || num !== storeVal) {
      setText(String(storeVal))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeVal])

  function commit() {
    if (invalid) {
      // Restore the last valid value on blur.
      setText(String(settings[field]))
      return
    }
    if (num !== settings[field]) {
      updateSettings({ [field]: num } as Partial<Settings>)
      toast.success(`${label} saved`)
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`goal-${field}`}>{label}</Label>
      <div className="relative">
        <Input
          id={`goal-${field}`}
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          className="h-11 pr-12"
          value={text}
          aria-invalid={invalid}
          onFocus={() => {
            focusedRef.current = true
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            focusedRef.current = false
            commit()
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
          }}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
          {unit}
        </span>
      </div>
      {invalid && (
        <FieldError>Enter a number ≥ 0.</FieldError>
      )}
    </div>
  )
}

function GoalDate() {
  const { settings, updateSettings } = useStore()
  const value = settings.goalWeightDate

  let selected: Date | undefined
  if (value) {
    try {
      const d = parseISO(value)
      if (!isNaN(d.getTime())) selected = d
    } catch {
      selected = undefined
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>Target date</Label>
      <div className="flex gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-11 flex-1 justify-start gap-2 font-normal"
            >
              <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {selected
                  ? format(selected, "EEE, MMM d, yyyy")
                  : "No target date"}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={(d) => {
                if (d) {
                  updateSettings({ goalWeightDate: format(d, "yyyy-MM-dd") })
                  toast.success("Target date saved")
                }
              }}
              autoFocus
            />
          </PopoverContent>
        </Popover>
        {value && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            aria-label="Clear target date"
            onClick={() => {
              updateSettings({ goalWeightDate: "" })
              toast.success("Target date cleared")
            }}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

function HeightField() {
  const { settings, updateSettings } = useStore()
  const total = settings.heightInches || 0
  const feet = Math.floor(total / 12)
  const inches = total % 12

  function set(ft: number, inch: number) {
    const f = isFinite(ft) ? Math.max(0, Math.round(ft)) : 0
    const i = isFinite(inch) ? Math.max(0, Math.round(inch)) : 0
    updateSettings({ heightInches: f * 12 + i })
  }

  return (
    <div className="space-y-1.5">
      <Label>Height</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            className="h-11 pr-8"
            value={feet || ""}
            placeholder="0"
            aria-label="Height feet"
            onChange={(e) => set(Number(e.target.value), inches)}
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
            ft
          </span>
        </div>
        <div className="relative flex-1">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={11}
            className="h-11 pr-8"
            value={inches || ""}
            placeholder="0"
            aria-label="Height inches"
            onChange={(e) => set(feet, Number(e.target.value))}
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
            in
          </span>
        </div>
      </div>
    </div>
  )
}

export function GoalsSection() {
  const { settings, updateSettings } = useStore()
  const wUnit = settings.weightUnit

  return (
    <Card>
      <CardHeader>
        <CardTitle>Goals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumericGoal field="calorieGoal" label="Daily calories" unit="kcal" />
          <NumericGoal field="proteinGoal" label="Protein" unit="g" />
          <NumericGoal field="carbsGoal" label="Carbs" unit="g" />
          <NumericGoal field="fatGoal" label="Fat" unit="g" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumericGoal field="goalWeight" label="Goal body weight" unit={wUnit} />
          <GoalDate />
          <HeightField />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Weight unit</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={settings.weightUnit}
              onValueChange={(v) => {
                if (v) {
                  updateSettings({ weightUnit: v as WeightUnit })
                  toast.success("Weight unit saved")
                }
              }}
              className="w-full"
            >
              <ToggleGroupItem value="kg" className="h-11 flex-1">
                kg
              </ToggleGroupItem>
              <ToggleGroupItem value="lbs" className="h-11 flex-1">
                lbs
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="space-y-1.5">
            <Label>Distance unit</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={settings.distanceUnit}
              onValueChange={(v) => {
                if (v) {
                  updateSettings({ distanceUnit: v as DistanceUnit })
                  toast.success("Distance unit saved")
                }
              }}
              className="w-full"
            >
              <ToggleGroupItem value="km" className="h-11 flex-1">
                km
              </ToggleGroupItem>
              <ToggleGroupItem value="miles" className="h-11 flex-1">
                miles
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
