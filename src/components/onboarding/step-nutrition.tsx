import { Wand2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  suggestNutrition,
  type OnboardingDraft,
  type StepProps,
} from "./draft"

const FIELDS: {
  key: "calorieGoal" | "proteinGoal" | "carbsGoal" | "fatGoal"
  label: string
  unit: string
}[] = [
  { key: "calorieGoal", label: "Daily calories", unit: "kcal" },
  { key: "proteinGoal", label: "Protein", unit: "g" },
  { key: "carbsGoal", label: "Carbs", unit: "g" },
  { key: "fatGoal", label: "Fat", unit: "g" },
]

export function StepNutrition({ draft, onChange }: StepProps) {
  function applySuggestion() {
    const s = suggestNutrition(draft)
    if (!s) {
      toast.error("Add a goal or current weight in the last step first")
      return
    }
    onChange({
      calorieGoal: String(s.calories),
      proteinGoal: String(s.protein),
      carbsGoal: String(s.carbs),
      fatGoal: String(s.fat),
      nutritionTouched: true,
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Nutrition targets
        </h1>
        <p className="text-sm leading-snug text-muted-foreground">
          Daily goals for your dashboard rings. You can tweak these any time in
          Settings.
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        className="h-11 w-full gap-2"
        onClick={applySuggestion}
      >
        <Wand2 className="size-4" />
        Suggest for me
      </Button>

      <div className="grid grid-cols-2 gap-4">
        {FIELDS.map(({ key, label, unit }) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`ob-${key}`}>{label}</Label>
            <div className="relative">
              <Input
                id={`ob-${key}`}
                type="number"
                inputMode="numeric"
                min={0}
                className="h-11 pr-12"
                value={draft[key]}
                onChange={(e) =>
                  onChange({
                    [key]: e.target.value,
                    nutritionTouched: true,
                  } as Partial<OnboardingDraft>)
                }
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">
                {unit}
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        The suggestion is a simple estimate from your weight, height and goal —
        adjust it to fit how you actually eat.
      </p>
    </div>
  )
}
