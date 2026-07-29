import { useState } from "react"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { convertWeight, isoNow } from "@/lib/calc"
import { useDraft } from "@/lib/storage"
import { isAuthConfigured } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import type { Settings } from "@/lib/types"
import { useAuth } from "@/store/auth"
import { useStore } from "@/store/store"
import {
  draftHeightInches,
  makeInitialDraft,
  num,
  type OnboardingDraft,
} from "./draft"
import { StepBasics } from "./step-basics"
import { StepNutrition } from "./step-nutrition"
import { StepAccount } from "./step-account"
import { StepConnect } from "./step-connect"

type StepId = "basics" | "nutrition" | "account" | "connect"

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { settings, updateSettings, addWeight } = useStore()
  const { session } = useAuth()
  // Frozen at mount: an OAuth sign-in reloads the page and remounts anyway.
  const [steps] = useState<StepId[]>(() => [
    "basics",
    "nutrition",
    ...(isAuthConfigured && !session ? (["account"] as StepId[]) : []),
    "connect",
  ])
  const [draft, setDraft, clearDraft] = useDraft<OnboardingDraft>(
    "wt_draft_onboarding",
    makeInitialDraft(settings)
  )

  const step = Math.min(Math.max(draft.step, 0), steps.length - 1)
  const stepId = steps[step]
  const isLast = step === steps.length - 1

  function patch(p: Partial<OnboardingDraft>) {
    setDraft((d) => {
      const next = { ...d, ...p }
      // Switching the unit converts the entered weights along with it — the
      // draft is prefilled in lbs (defaultSettings), so leaving "180" as-is
      // after a switch to kg would suggest macros for a 180 kg goal.
      const newUnit = p.weightUnit
      if (newUnit && newUnit !== d.weightUnit) {
        const convert = (text: string): string => {
          const value = num(text)
          if (value == null || value <= 0) return text
          return String(
            Math.round(convertWeight(value, d.weightUnit, newUnit) * 10) / 10
          )
        }
        next.currentWeight = convert(d.currentWeight)
        next.goalWeight = convert(d.goalWeight)
      }
      return next
    })
  }

  function finish() {
    const settingsPatch: Partial<Settings> = {
      weightUnit: draft.weightUnit,
      distanceUnit: draft.distanceUnit,
      goalWeightDate: draft.goalDate,
    }
    const height = draftHeightInches(draft)
    if (height != null) settingsPatch.heightInches = height
    const goal = num(draft.goalWeight)
    if (goal != null && goal > 0) settingsPatch.goalWeight = goal
    if (draft.nutritionTouched) {
      const calories = num(draft.calorieGoal)
      const protein = num(draft.proteinGoal)
      const carbs = num(draft.carbsGoal)
      const fat = num(draft.fatGoal)
      if (calories != null) settingsPatch.calorieGoal = calories
      if (protein != null) settingsPatch.proteinGoal = protein
      if (carbs != null) settingsPatch.carbsGoal = carbs
      if (fat != null) settingsPatch.fatGoal = fat
    }
    updateSettings(settingsPatch)
    const weight = num(draft.currentWeight)
    if (weight != null && weight > 0) {
      addWeight({ datetime: isoNow(), weight, unit: draft.weightUnit })
    }
    clearDraft()
    onDone()
  }

  function advance(complete: boolean) {
    if (isLast) {
      finish()
      return
    }
    patch({
      step: step + 1,
      ...(complete && stepId === "nutrition" ? { nutritionTouched: true } : {}),
    })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background pt-safe pb-safe">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              {steps.map((id, i) => (
                <span
                  key={id}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    i === step && "w-6 bg-primary",
                    i < step && "w-1.5 bg-primary/40",
                    i > step && "w-1.5 bg-muted"
                  )}
                />
              ))}
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              Step {step + 1} of {steps.length}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2 text-muted-foreground"
            onClick={() => advance(false)}
          >
            Skip
          </Button>
        </header>

        <div
          key={stepId}
          className="flex-1 py-8 animate-in fade-in-50 duration-300"
        >
          {stepId === "basics" && (
            <StepBasics draft={draft} onChange={patch} />
          )}
          {stepId === "nutrition" && (
            <StepNutrition draft={draft} onChange={patch} />
          )}
          {stepId === "account" && <StepAccount />}
          {stepId === "connect" && <StepConnect />}
        </div>

        <div className="flex items-center gap-3">
          {step > 0 && (
            <Button
              variant="ghost"
              className="h-12 gap-2 px-4"
              onClick={() => patch({ step: step - 1 })}
            >
              <ArrowLeft className="size-4" />
              Back
            </Button>
          )}
          <Button
            className="h-12 flex-1 gap-2 text-base"
            onClick={() => advance(true)}
          >
            {isLast ? "Open Adonis" : "Continue"}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
