import { useMemo } from "react"
import { Apple, UtensilsCrossed } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Combobox, type ComboOption } from "@/components/common/combobox"
import { DateTimePicker } from "@/components/common/datetime-picker"
import { EmptyState, FieldError, Stepper } from "@/components/common/bits"
import { fmt, isoNow, round1 } from "@/lib/calc"
import { useDraft } from "@/lib/storage"
import { useStore } from "@/store/store"

interface FoodDraft {
  datetime: string
  mealId: string | null
  quantity: number
  notes: string
}

const initialDraft = (): FoodDraft => ({
  datetime: isoNow(),
  mealId: null,
  quantity: 1,
  notes: "",
})

export function FoodTab() {
  const { meals, addFood } = useStore()
  const [draft, setDraft] = useDraft<FoodDraft>(
    "wt_draft_food",
    initialDraft()
  )

  const options = useMemo<ComboOption[]>(
    () =>
      meals.map((m) => ({
        value: m.id,
        label: m.name,
        sublabel: m.serving,
        keywords: [m.name, m.serving],
      })),
    [meals]
  )

  const meal = useMemo(
    () => meals.find((m) => m.id === draft.mealId) ?? null,
    [meals, draft.mealId]
  )

  const qty = draft.quantity > 0 ? draft.quantity : 1
  const totals = meal
    ? {
        calories: round1(meal.calories * qty),
        protein: round1(meal.protein * qty),
        carbs: round1(meal.carbs * qty),
        fat: round1(meal.fat * qty),
      }
    : null

  const showMealError = !draft.mealId

  function handleSubmit() {
    if (!meal) {
      toast.error("Pick a meal first")
      return
    }
    addFood({
      datetime: draft.datetime,
      mealId: meal.id,
      name: meal.name,
      serving: meal.serving,
      quantity: qty,
      calories: round1(meal.calories * qty),
      protein: round1(meal.protein * qty),
      carbs: round1(meal.carbs * qty),
      fat: round1(meal.fat * qty),
      notes: draft.notes.trim() || undefined,
    })
    toast.success("Food logged")
    setDraft(initialDraft())
  }

  if (meals.length === 0) {
    return (
      <EmptyState
        icon={<UtensilsCrossed className="size-8" />}
        title="No meals yet"
        hint="Create meals on the Meals page to log food here."
      />
    )
  }

  return (
    <div className="space-y-4">
      <DateTimePicker
        value={draft.datetime}
        onChange={(datetime) => setDraft((d) => ({ ...d, datetime }))}
      />

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Meal</Label>
        <Combobox
          options={options}
          value={draft.mealId}
          onChange={(mealId) => setDraft((d) => ({ ...d, mealId }))}
          placeholder="Select a meal"
          searchPlaceholder="Search meals…"
          emptyText="No meals found."
        />
        {showMealError && <FieldError>Select a meal to log.</FieldError>}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          Quantity (servings)
        </Label>
        <Stepper
          value={qty}
          onChange={(quantity) => setDraft((d) => ({ ...d, quantity }))}
          step={0.25}
          min={0.25}
          format={(v) => `${fmt(v, 2)}×`}
        />
        {meal && (
          <p className="text-xs text-muted-foreground">
            {meal.serving} per serving
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Note</Label>
        <Input
          placeholder="Optional (e.g. post-workout, cheat meal)"
          className="h-11"
          value={draft.notes}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
        />
      </div>

      {totals && (
        <Card className="gap-0 py-4 animate-in fade-in-50 duration-200">
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Calories</span>
              <span className="text-lg font-semibold tabular-nums">
                {fmt(totals.calories)} kcal
              </span>
            </div>
            <Separator />
            <div className="grid grid-cols-3 gap-2 text-center">
              <Macro label="Protein" value={totals.protein} />
              <Macro label="Carbs" value={totals.carbs} />
              <Macro label="Fat" value={totals.fat} />
            </div>
          </CardContent>
        </Card>
      )}

      <Button
        type="button"
        className="h-11 w-full"
        onClick={handleSubmit}
        disabled={!meal}
      >
        <Apple className="size-4" />
        Log food
      </Button>
    </div>
  )
}

function Macro({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-0.5">
      <p className="text-base font-semibold tabular-nums">{fmt(value)} g</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
