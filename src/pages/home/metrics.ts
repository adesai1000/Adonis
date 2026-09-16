import { format, subDays } from "date-fns"
import {
  cardioDistance,
  convertWeight,
  dateKey,
  fmt,
  sessionCardioDistance,
  sessionCardioSeconds,
  sessionVolume,
  signed,
} from "@/lib/calc"
import { STRAIN_MAX, strainForDay } from "@/lib/strain"
import { readinessForDay, recoveryForDay, sleepForDay } from "@/lib/recovery"
import type {
  CardioEntry,
  CardKey,
  FoodEntry,
  Settings,
  SleepEntry,
  WeightEntry,
  WorkoutSession,
} from "@/lib/types"

export interface CardMetric {
  /** Today's value formatted with its inline unit, or "-" when nothing today. */
  display: string
  /** Signed change vs yesterday, e.g. "+150.0 kcal" / "-0.4 lbs". */
  trendText: string
  direction: "up" | "down" | "flat"
  tone: "good" | "bad" | "neutral"
  /** Whether there is any data for today. */
  hasData: boolean
  /** Whether yesterday had data to compare against. */
  hasPrev: boolean
}

export const CARD_TITLES: Record<CardKey, string> = {
  strain: "Strain",
  recovery: "Recovery",
  readiness: "Readiness",
  sleep: "Sleep",
  volume: "Weight Lifted",
  reps: "Reps / Set",
  calories: "Calories",
  protein: "Protein",
  carbs: "Carbs",
  fat: "Fat",
  sodium: "Sodium",
  cardio: "Cardio",
  bodyweight: "Body Weight",
}

function higherIsBetterTone(direction: CardMetric["direction"]): CardMetric["tone"] {
  if (direction === "flat") return "neutral"
  return direction === "up" ? "good" : "bad"
}

interface DayValue {
  value: number
  has: boolean
}

// ───────────────────────────── per-day aggregates ─────────────────────────────
function foodDay(
  foodLog: FoodEntry[],
  day: string,
  pick: (e: FoodEntry) => number
): DayValue {
  let value = 0
  let has = false
  for (const e of foodLog) {
    if (dateKey(e.datetime) === day) {
      value += pick(e) || 0
      has = true
    }
  }
  return { value, has }
}

function volumeDay(
  workoutLog: WorkoutSession[],
  day: string,
  unit: Settings["weightUnit"]
): DayValue {
  let value = 0
  let has = false
  for (const s of workoutLog) {
    if (dateKey(s.datetime) === day) {
      value += sessionVolume(s, unit)
      has = true
    }
  }
  return { value, has }
}

function repsDay(workoutLog: WorkoutSession[], day: string): DayValue {
  let reps = 0
  let sets = 0
  for (const s of workoutLog) {
    if (dateKey(s.datetime) !== day) continue
    for (const ex of s.exercises) {
      for (const st of ex.sets) {
        sets++
        reps += st.reps
      }
    }
  }
  return { value: sets > 0 ? reps / sets : 0, has: sets > 0 }
}

function cardioDay(
  cardioLog: CardioEntry[],
  workoutLog: WorkoutSession[],
  day: string,
  unit: Settings["distanceUnit"],
  useDistance: boolean
): DayValue {
  let value = 0
  let has = false
  for (const e of cardioLog) {
    if (dateKey(e.datetime) !== day) continue
    has = true
    value += useDistance ? cardioDistance(e, unit) : (e.durationSec || 0) / 60
  }
  // Cardio machines logged inside a workout session count here too.
  for (const s of workoutLog) {
    if (dateKey(s.datetime) !== day) continue
    const sec = sessionCardioSeconds(s)
    const dist = sessionCardioDistance(s, unit)
    if (sec <= 0 && dist <= 0) continue
    has = true
    value += useDistance ? dist : sec / 60
  }
  return { value, has }
}

function weightDay(
  weightLog: WeightEntry[],
  day: string,
  unit: Settings["weightUnit"]
): DayValue {
  const entries = weightLog
    .filter((e) => dateKey(e.datetime) === day)
    .sort((a, b) => a.datetime.localeCompare(b.datetime))
  if (entries.length === 0) return { value: 0, has: false }
  const latest = entries[entries.length - 1]
  return { value: convertWeight(latest.weight, latest.unit, unit), has: true }
}

function build(
  today: DayValue,
  prev: DayValue,
  unit: string,
  tone: (d: CardMetric["direction"]) => CardMetric["tone"]
): CardMetric {
  const delta = today.value - prev.value
  const direction: CardMetric["direction"] =
    Math.abs(delta) < 1e-9 ? "flat" : delta > 0 ? "up" : "down"
  return {
    display: today.has ? `${fmt(today.value)} ${unit}` : "-",
    trendText: `${signed(delta)} ${unit}`,
    direction,
    tone: tone(direction),
    hasData: today.has,
    hasPrev: prev.has,
  }
}

export function computeCardMetric(
  key: CardKey,
  data: {
    workoutLog: WorkoutSession[]
    cardioLog: CardioEntry[]
    weightLog: WeightEntry[]
    foodLog: FoodEntry[]
    sleepLog: SleepEntry[]
    settings: Settings
  }
): CardMetric {
  const { settings } = data
  const today = format(new Date(), "yyyy-MM-dd")
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd")
  const wUnit = settings.weightUnit

  switch (key) {
    case "sleep": {
      const t = sleepForDay(data.sleepLog, today)
      const y = sleepForDay(data.sleepLog, yesterday)
      const delta = (t.totalSec - y.totalSec) / 3600
      const direction: CardMetric["direction"] =
        Math.abs(delta) < 0.05 ? "flat" : delta > 0 ? "up" : "down"
      return {
        display: `${fmt(t.totalSec / 3600)} h`,
        trendText: `${signed(delta)} h`,
        direction,
        tone: higherIsBetterTone(direction),
        hasData: t.entries.length > 0,
        hasPrev: y.entries.length > 0,
      }
    }
    case "recovery":
    case "readiness": {
      const score = (day: string) =>
        key === "recovery"
          ? recoveryForDay(data, day).score
          : readinessForDay(data, day).score
      const t = score(today)
      const y = score(yesterday)
      const delta = (t ?? 0) - (y ?? 0)
      const direction: CardMetric["direction"] =
        Math.abs(delta) < 0.5 ? "flat" : delta > 0 ? "up" : "down"
      return {
        display: t != null ? `${t} / 100` : "-",
        trendText: signed(delta, 0),
        direction,
        tone: higherIsBetterTone(direction),
        hasData: t != null,
        hasPrev: y != null,
      }
    }
    case "strain": {
      const hasActivity = (day: string) =>
        data.workoutLog.some((s) => dateKey(s.datetime) === day) ||
        data.cardioLog.some((e) => dateKey(e.datetime) === day)
      const todayV = strainForDay(data.workoutLog, data.cardioLog, today)
      const prevV = strainForDay(data.workoutLog, data.cardioLog, yesterday)
      const delta = todayV - prevV
      const direction: CardMetric["direction"] =
        Math.abs(delta) < 0.05 ? "flat" : delta > 0 ? "up" : "down"
      return {
        display: `${fmt(todayV)} / ${STRAIN_MAX}`,
        trendText: signed(delta),
        direction,
        tone: "neutral",
        hasData: hasActivity(today),
        hasPrev: hasActivity(yesterday),
      }
    }
    case "volume":
      return build(
        volumeDay(data.workoutLog, today, wUnit),
        volumeDay(data.workoutLog, yesterday, wUnit),
        wUnit,
        higherIsBetterTone
      )
    case "reps":
      return build(
        repsDay(data.workoutLog, today),
        repsDay(data.workoutLog, yesterday),
        "reps",
        higherIsBetterTone
      )
    case "calories":
      return build(
        foodDay(data.foodLog, today, (e) => e.calories),
        foodDay(data.foodLog, yesterday, (e) => e.calories),
        "kcal",
        () => "neutral"
      )
    case "protein":
      return build(
        foodDay(data.foodLog, today, (e) => e.protein),
        foodDay(data.foodLog, yesterday, (e) => e.protein),
        "g",
        higherIsBetterTone
      )
    case "carbs":
      return build(
        foodDay(data.foodLog, today, (e) => e.carbs),
        foodDay(data.foodLog, yesterday, (e) => e.carbs),
        "g",
        () => "neutral"
      )
    case "fat":
      return build(
        foodDay(data.foodLog, today, (e) => e.fat),
        foodDay(data.foodLog, yesterday, (e) => e.fat),
        "g",
        () => "neutral"
      )
    case "sodium":
      return build(
        foodDay(data.foodLog, today, (e) => e.sodium ?? 0),
        foodDay(data.foodLog, yesterday, (e) => e.sodium ?? 0),
        "mg",
        () => "neutral"
      )
    case "cardio": {
      const dUnit = settings.distanceUnit
      const todayHasDist =
        data.cardioLog.some(
          (e) => dateKey(e.datetime) === today && (e.distance ?? 0) > 0
        ) ||
        data.workoutLog.some(
          (s) => dateKey(s.datetime) === today && sessionCardioDistance(s, dUnit) > 0
        )
      const unit = todayHasDist ? (dUnit === "km" ? "km" : "mi") : "min"
      return build(
        cardioDay(data.cardioLog, data.workoutLog, today, dUnit, todayHasDist),
        cardioDay(data.cardioLog, data.workoutLog, yesterday, dUnit, todayHasDist),
        unit,
        higherIsBetterTone
      )
    }
    case "bodyweight": {
      const todayV = weightDay(data.weightLog, today, wUnit)
      const prevV = weightDay(data.weightLog, yesterday, wUnit)
      const delta = todayV.value - prevV.value
      const goal = settings.goalWeight
      let tone: CardMetric["tone"] = "neutral"
      if (Math.abs(delta) >= 1e-9 && goal > 0 && prevV.has) {
        const before = Math.abs(goal - prevV.value)
        const after = Math.abs(goal - todayV.value)
        tone = after < before ? "good" : "bad"
      }
      const direction: CardMetric["direction"] =
        Math.abs(delta) < 1e-9 ? "flat" : delta > 0 ? "up" : "down"
      return {
        display: todayV.has ? `${fmt(todayV.value)} ${wUnit}` : "-",
        trendText: `${signed(delta)} ${wUnit}`,
        direction,
        tone,
        hasData: todayV.has,
        hasPrev: prevV.has,
      }
    }
  }
}
