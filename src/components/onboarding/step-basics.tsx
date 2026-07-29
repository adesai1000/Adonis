import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import type { DistanceUnit, WeightUnit } from "@/lib/types"
import type { StepProps } from "./draft"

export function StepBasics({ draft, onChange }: StepProps) {
  const metric = draft.weightUnit === "kg"

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Let&apos;s set you up
        </h1>
        <p className="text-sm leading-snug text-muted-foreground">
          Units, height and goals. Everything can be changed later in Settings.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Weight unit</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={draft.weightUnit}
            onValueChange={(v) => {
              if (v) onChange({ weightUnit: v as WeightUnit })
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
            value={draft.distanceUnit}
            onValueChange={(v) => {
              if (v) onChange({ distanceUnit: v as DistanceUnit })
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

      {metric ? (
        <div className="space-y-1.5">
          <Label htmlFor="ob-height-cm">Height</Label>
          <div className="relative">
            <Input
              id="ob-height-cm"
              type="number"
              inputMode="numeric"
              min={0}
              className="h-11 pr-10"
              value={draft.heightCm}
              placeholder="175"
              onChange={(e) => onChange({ heightCm: e.target.value })}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
              cm
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="ob-height-ft">Height</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="ob-height-ft"
                type="number"
                inputMode="numeric"
                min={0}
                className="h-11 pr-8"
                value={draft.heightFt}
                placeholder="5"
                aria-label="Height feet"
                onChange={(e) => onChange({ heightFt: e.target.value })}
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
                value={draft.heightIn}
                placeholder="10"
                aria-label="Height inches"
                onChange={(e) => onChange({ heightIn: e.target.value })}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                in
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="ob-current-weight">Current body weight</Label>
        <div className="relative">
          <Input
            id="ob-current-weight"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            className="h-11 pr-12"
            value={draft.currentWeight}
            placeholder={metric ? "80" : "175"}
            onChange={(e) => onChange({ currentWeight: e.target.value })}
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
            {draft.weightUnit}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Logged as your first weigh-in when you finish.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="ob-goal-weight">Goal weight</Label>
          <div className="relative">
            <Input
              id="ob-goal-weight"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              className="h-11 pr-12"
              value={draft.goalWeight}
              placeholder={metric ? "75" : "165"}
              onChange={(e) => onChange({ goalWeight: e.target.value })}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
              {draft.weightUnit}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ob-goal-date">Target date</Label>
          <Input
            id="ob-goal-date"
            type="date"
            className="h-11"
            value={draft.goalDate}
            onChange={(e) => onChange({ goalDate: e.target.value })}
          />
        </div>
      </div>
    </div>
  )
}
