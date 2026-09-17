import { useEffect, useMemo, useState } from "react"
import { Apple, ScanBarcode, Search, UtensilsCrossed } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Combobox, type ComboOption } from "@/components/common/combobox"
import { DateTimePicker } from "@/components/common/datetime-picker"
import { EmptyState, FieldError, Stepper } from "@/components/common/bits"
import {
  ProductScanFlow,
  type ProductLookupMode,
} from "@/components/common/product-scan-flow"
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
  const { meals, foodLog, addFood, addMeal } = useStore()
  const [draft, setDraft] = useDraft<FoodDraft>(
    "wt_draft_food",
    initialDraft()
  )
  const [lookup, setLookup] = useState<ProductLookupMode | null>(null)

  // Keep an abandoned draft's date/time from going stale across visits —
  // always start a fresh visit to this tab at the current moment.
  useEffect(() => {
    setDraft((d) => ({ ...d, datetime: isoNow() }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // How often and how recently each meal has been logged. Older entries and
  // re-imported data can lose their mealId, so fall back to matching by name.
  const usage = useMemo(() => {
    const ids = new Set(meals.map((m) => m.id))
    const idByName = new Map<string, string>()
    for (const m of meals) {
      const key = m.name.trim().toLowerCase()
      if (!idByName.has(key)) idByName.set(key, m.id)
    }
    const map = new Map<string, { count: number; last: string }>()
    for (const e of foodLog) {
      const id =
        e.mealId && ids.has(e.mealId)
          ? e.mealId
          : idByName.get((e.name ?? "").trim().toLowerCase())
      if (!id) continue
      const u = map.get(id)
      if (!u) map.set(id, { count: 1, last: e.datetime })
      else {
        u.count += 1
        if (e.datetime > u.last) u.last = e.datetime
      }
    }
    return map
  }, [meals, foodLog])

  // Regulars first: most logged, then most recently logged, then A→Z.
  const options = useMemo<ComboOption[]>(() => {
    const sorted = [...meals].sort((a, b) => {
      const ua = usage.get(a.id)
      const ub = usage.get(b.id)
      const byCount = (ub?.count ?? 0) - (ua?.count ?? 0)
      if (byCount !== 0) return byCount
      const byRecency = (ub?.last ?? "").localeCompare(ua?.last ?? "")
      if (byRecency !== 0) return byRecency
      return a.name.localeCompare(b.name)
    })
    return sorted.map((m) => {
      const count = usage.get(m.id)?.count ?? 0
      return {
        value: m.id,
        label: m.name,
        sublabel: m.serving,
        badge: count > 0 ? `${count}×` : undefined,
        keywords: [m.name, m.serving],
      }
    })
  }, [meals, usage])

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
        sodium: round1((meal.sodium ?? 0) * qty),
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
      sodium: round1((meal.sodium ?? 0) * qty),
      notes: draft.notes.trim() || undefined,
    })
    toast.success("Food logged")
    setDraft(initialDraft())
  }

  const scanButton = (
    <div className="grid grid-cols-2 gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-11"
        onClick={() => setLookup("scan")}
      >
        <ScanBarcode className="size-4" />
        Scan barcode
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        onClick={() => setLookup("search")}
      >
        <Search className="size-4" />
        Search foods
      </Button>
    </div>
  )

  const scanFlow = (
    <ProductScanFlow
      mode={lookup}
      onOpenChange={(o) => {
        if (!o) setLookup(null)
      }}
      meals={meals}
      confirmLabel="Add & select"
      onExisting={(m) => {
        setDraft((d) => ({ ...d, mealId: m.id }))
        toast.success(`Selected ${m.name}`)
      }}
      onNew={(data) => {
        const id = addMeal(data)
        setDraft((d) => ({ ...d, mealId: id }))
        toast.success(`Added ${data.name} to your meals`)
      }}
    />
  )

  if (meals.length === 0) {
    return (
      <>
        <EmptyState
          icon={<UtensilsCrossed className="size-8" />}
          title="No meals yet"
          hint="Create meals on the Meals page, or scan a product barcode to add one."
          action={scanButton}
        />
        {scanFlow}
      </>
    )
  }

  return (
    <div className="space-y-4">
      {scanFlow}
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
        {scanButton}
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
            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <Macro label="Protein" value={totals.protein} />
              <Macro label="Carbs" value={totals.carbs} />
              <Macro label="Fat" value={totals.fat} />
              <Macro label="Sodium" value={totals.sodium} unit="mg" />
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

function Macro({
  label,
  value,
  unit = "g",
}: {
  label: string
  value: number
  unit?: string
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-base font-semibold tabular-nums">
        {fmt(value)} {unit}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
