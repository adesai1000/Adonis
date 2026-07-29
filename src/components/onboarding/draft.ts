import { convertWeight } from "@/lib/calc"
import type { DistanceUnit, Settings, WeightUnit } from "@/lib/types"

export interface OnboardingDraft {
  step: number
  weightUnit: WeightUnit
  distanceUnit: DistanceUnit
  heightFt: string
  heightIn: string
  heightCm: string
  currentWeight: string
  goalWeight: string
  goalDate: string
  calorieGoal: string
  proteinGoal: string
  carbsGoal: string
  fatGoal: string
  nutritionTouched: boolean
}

export interface StepProps {
  draft: OnboardingDraft
  onChange: (patch: Partial<OnboardingDraft>) => void
}

export function makeInitialDraft(settings: Settings): OnboardingDraft {
  const h = settings.heightInches || 0
  return {
    step: 0,
    weightUnit: settings.weightUnit,
    distanceUnit: settings.distanceUnit,
    heightFt: h ? String(Math.floor(h / 12)) : "",
    heightIn: h ? String(h % 12) : "",
    heightCm: h ? String(Math.round(h * 2.54)) : "",
    currentWeight: "",
    goalWeight: settings.goalWeight ? String(settings.goalWeight) : "",
    goalDate: settings.goalWeightDate,
    calorieGoal: String(settings.calorieGoal),
    proteinGoal: String(settings.proteinGoal),
    carbsGoal: String(settings.carbsGoal),
    fatGoal: String(settings.fatGoal),
    nutritionTouched: false,
  }
}

export function num(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  const n = Number(t)
  return isFinite(n) && n >= 0 ? n : null
}

/** Height from the draft as total inches (per the active unit mode), null when unset. */
export function draftHeightInches(draft: OnboardingDraft): number | null {
  if (draft.weightUnit === "kg") {
    const cm = num(draft.heightCm)
    if (cm == null || cm <= 0) return null
    return Math.round(cm / 2.54)
  }
  const ft = num(draft.heightFt)
  const inch = num(draft.heightIn)
  if (ft == null && inch == null) return null
  const total = Math.round((ft ?? 0) * 12 + (inch ?? 0))
  return total > 0 ? total : null
}

/**
 * Smart macro suggestion: protein at 0.8 g/lb of goal weight, calories from a
 * Mifflin-St Jeor estimate (assumed age 30, sex-neutral, activity 1.4) with a
 * cut/bulk adjustment, fat at 25% of calories, carbs from the remainder.
 */
export function suggestNutrition(
  draft: OnboardingDraft
): { calories: number; protein: number; carbs: number; fat: number } | null {
  const goal = num(draft.goalWeight)
  const current = num(draft.currentWeight)
  const ref = goal ?? current
  if (ref == null || ref <= 0) return null
  const goalLbs = convertWeight(ref, draft.weightUnit, "lbs")
  const protein = Math.round(0.8 * goalLbs)
  const weightKg = convertWeight(current ?? ref, draft.weightUnit, "kg")
  const heightCm = (draftHeightInches(draft) ?? 67) * 2.54
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * 30
  let calories = bmr * 1.4
  calories += goal != null && current != null && goal < current ? -300 : 200
  calories = Math.round(calories / 50) * 50
  const fat = Math.round((0.25 * calories) / 9)
  const carbs = Math.round(Math.max(0, calories - protein * 4 - fat * 9) / 4)
  return { calories, protein, carbs, fat }
}
