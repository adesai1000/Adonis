import { format, parseISO, subDays } from "date-fns"
import { dateKey } from "./calc"
import { strainForDay } from "./strain"
import type {
  CardioEntry,
  FoodEntry,
  Settings,
  SleepEntry,
  WorkoutSession,
} from "./types"

// ───────────────────────────── Sleep ─────────────────────────────
// A sleep entry belongs to the day it ENDS: Tuesday 23:00 → Wednesday 07:00
// is Wednesday's sleep, which is what recovery on Wednesday should look at.

/** Naps restore less than the same time in bed overnight. */
const NAP_WEIGHT = 0.5

export function sleepEndsOn(e: SleepEntry): string {
  try {
    const end = parseISO(e.datetime).getTime() + (e.durationSec || 0) * 1000
    return format(new Date(end), "yyyy-MM-dd")
  } catch {
    return dateKey(e.datetime)
  }
}

export interface SleepDay {
  sleepSec: number
  napSec: number
  totalSec: number
  /** Sleep plus half-weighted naps, in hours. */
  effectiveHours: number
  entries: SleepEntry[]
}

export function sleepForDay(sleepLog: SleepEntry[], day: string): SleepDay {
  let sleepSec = 0
  let napSec = 0
  const entries: SleepEntry[] = []
  for (const e of sleepLog) {
    if (sleepEndsOn(e) !== day) continue
    entries.push(e)
    if (e.kind === "nap") napSec += e.durationSec || 0
    else sleepSec += e.durationSec || 0
  }
  return {
    sleepSec,
    napSec,
    totalSec: sleepSec + napSec,
    effectiveHours: (sleepSec + napSec * NAP_WEIGHT) / 3600,
    entries: entries.sort((a, b) => a.datetime.localeCompare(b.datetime)),
  }
}

// ───────────────────────────── Recovery ─────────────────────────────
// How restored you are this morning, 0–100. Sleep drives it; yesterday's
// strain and yesterday's nutrition (what your body actually had to rebuild
// with overnight) shift it. Components that weren't logged drop out and the
// rest are re-weighted, but with no sleep logged there is no score at all.

const W_SLEEP = 0.5
const W_STRAIN = 0.2
const W_NUTRITION = 0.3

/** Strain up to this level asks nothing extra of recovery. */
const STRAIN_FREE = 8
/** Recovery credit left after an all-out (21) day. */
const STRAIN_FLOOR = 0.4

export interface RecoveryInput {
  sleepLog: SleepEntry[]
  workoutLog: WorkoutSession[]
  cardioLog: CardioEntry[]
  foodLog: FoodEntry[]
  settings: Settings
}

export interface RecoveryBreakdown {
  /** 0–100, or null when no sleep was logged for the day. */
  score: number | null
  sleep: { hours: number; effectiveHours: number; goal: number; score: number } | null
  strain: { yesterday: number; score: number }
  nutrition: {
    calories: number
    calorieGoal: number
    protein: number
    proteinGoal: number
    score: number
  } | null
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

function foodTotals(foodLog: FoodEntry[], day: string) {
  let calories = 0
  let protein = 0
  let any = false
  for (const e of foodLog) {
    if (dateKey(e.datetime) !== day) continue
    any = true
    calories += e.calories || 0
    protein += e.protein || 0
  }
  return any ? { calories, protein } : null
}

export function recoveryForDay(input: RecoveryInput, day: string): RecoveryBreakdown {
  const { settings } = input
  const yesterday = format(subDays(parseISO(day), 1), "yyyy-MM-dd")

  // Sleep
  const s = sleepForDay(input.sleepLog, day)
  const goal = settings.sleepGoalHours > 0 ? settings.sleepGoalHours : 8
  const sleep =
    s.entries.length > 0
      ? {
          hours: s.totalSec / 3600,
          effectiveHours: s.effectiveHours,
          goal,
          score: clamp01(s.effectiveHours / goal),
        }
      : null

  // Yesterday's strain: nothing to recover from below STRAIN_FREE, and even
  // an all-out day leaves STRAIN_FLOOR of the credit.
  const yStrain = strainForDay(input.workoutLog, input.cardioLog, yesterday)
  const over = Math.max(0, yStrain - STRAIN_FREE) / (21 - STRAIN_FREE)
  const strain = { yesterday: yStrain, score: 1 - over * (1 - STRAIN_FLOOR) }

  // Yesterday's nutrition: protein carries most of it; a deep calorie
  // deficit costs, a surplus doesn't (within reason).
  const totals = foodTotals(input.foodLog, yesterday)
  let nutrition: RecoveryBreakdown["nutrition"] = null
  if (totals) {
    const calGoal = settings.calorieGoal > 0 ? settings.calorieGoal : 2000
    const protGoal = settings.proteinGoal > 0 ? settings.proteinGoal : 120
    const ratio = totals.calories / calGoal
    let calScore = 1
    if (ratio < 0.85) calScore = clamp01(1 - (0.85 - ratio) / 0.35)
    else if (ratio > 1.3) calScore = 0.85
    const protScore = clamp01(totals.protein / protGoal)
    nutrition = {
      calories: totals.calories,
      calorieGoal: calGoal,
      protein: totals.protein,
      proteinGoal: protGoal,
      score: 0.4 * calScore + 0.6 * protScore,
    }
  }

  if (!sleep) return { score: null, sleep, strain, nutrition }

  let weighted = W_SLEEP * sleep.score + W_STRAIN * strain.score
  let weights = W_SLEEP + W_STRAIN
  if (nutrition) {
    weighted += W_NUTRITION * nutrition.score
    weights += W_NUTRITION
  }
  return {
    score: Math.round((weighted / weights) * 100),
    sleep,
    strain,
    nutrition,
  }
}

// ───────────────────────────── Readiness ─────────────────────────────
// Recovery answers "how restored am I"; readiness answers "how hard should
// I go today". It starts from recovery and pulls back when the last few
// days' load has ramped above what your body is used to.

/** Recent training window vs. the baseline it's compared against, in days. */
const ACUTE_DAYS = 3
const CHRONIC_DAYS = 14
/** Acute:chronic ratio that starts costing readiness, and where the cost maxes. */
const RATIO_FREE = 1.1
const RATIO_MAX = 1.6
const RATIO_FLOOR = 0.7
/** Training days needed in the chronic window before the ratio means anything. */
const RATIO_MIN_TRAINING_DAYS = 4
/** Training days in a row before a small fatigue penalty applies. */
const STREAK_LIMIT = 4
const STREAK_PENALTY = 5
const STREAK_MIN_STRAIN = 5

export type ReadinessZone = "push" | "train" | "easy" | "rest"

export interface ReadinessResult {
  /** 0–100, or null without a recovery score. */
  score: number | null
  zone: ReadinessZone | null
  /** Suggested strain range for today. */
  targetStrain: [number, number] | null
  label: string
  advice: string
  loadRatio: number | null
  streak: number
  recovery: RecoveryBreakdown
}

const ZONES: Record<ReadinessZone, { label: string; advice: string; target: [number, number] }> = {
  push: {
    label: "Green light",
    advice: "Fully recovered. Go heavy, go long, or chase a PR — aim for a high-strain day.",
    target: [14, 18],
  },
  train: {
    label: "Train as planned",
    advice: "Good to go. Run your normal session; no need to hold back or overreach.",
    target: [10, 14],
  },
  easy: {
    label: "Take it easy",
    advice: "Recovery is lagging. Keep it light: technique work, mobility, or easy cardio.",
    target: [6, 10],
  },
  rest: {
    label: "Rest day",
    advice: "Your body is asking for a break. A walk and an early night will pay off tomorrow.",
    target: [0, 6],
  },
}

export function readinessZone(score: number): ReadinessZone {
  if (score >= 80) return "push"
  if (score >= 65) return "train"
  if (score >= 45) return "easy"
  return "rest"
}

function meanStrain(
  workoutLog: WorkoutSession[],
  cardioLog: CardioEntry[],
  from: Date,
  days: number
): { mean: number; trainingDays: number } {
  let total = 0
  let trainingDays = 0
  for (let i = 1; i <= days; i++) {
    const s = strainForDay(workoutLog, cardioLog, format(subDays(from, i), "yyyy-MM-dd"))
    total += s
    if (s > 0) trainingDays++
  }
  return { mean: total / days, trainingDays }
}

export function readinessForDay(input: RecoveryInput, day: string): ReadinessResult {
  const recovery = recoveryForDay(input, day)
  const date = parseISO(day)

  const acute = meanStrain(input.workoutLog, input.cardioLog, date, ACUTE_DAYS)
  const chronic = meanStrain(input.workoutLog, input.cardioLog, date, CHRONIC_DAYS)
  // A baseline built from a handful of sessions isn't a baseline; a new user
  // shouldn't be told they're overreaching after their second workout.
  const loadRatio =
    chronic.trainingDays >= RATIO_MIN_TRAINING_DAYS && chronic.mean > 0.5
      ? acute.mean / chronic.mean
      : null
  let factor = 1
  if (loadRatio != null && loadRatio > RATIO_FREE) {
    const t = clamp01((loadRatio - RATIO_FREE) / (RATIO_MAX - RATIO_FREE))
    factor = 1 - t * (1 - RATIO_FLOOR)
  }

  let streak = 0
  for (let i = 1; i <= 14; i++) {
    const d = format(subDays(date, i), "yyyy-MM-dd")
    if (strainForDay(input.workoutLog, input.cardioLog, d) >= STREAK_MIN_STRAIN) streak++
    else break
  }

  if (recovery.score == null) {
    return {
      score: null,
      zone: null,
      targetStrain: null,
      label: "Log your sleep",
      advice: "Readiness needs last night's sleep. Log it and this fills in.",
      loadRatio,
      streak,
      recovery,
    }
  }

  let score = recovery.score * factor
  if (streak >= STREAK_LIMIT) score -= STREAK_PENALTY
  score = Math.round(Math.max(0, Math.min(100, score)))
  const zone = readinessZone(score)
  const z = ZONES[zone]
  return {
    score,
    zone,
    targetStrain: z.target,
    label: z.label,
    advice: z.advice,
    loadRatio,
    streak,
    recovery,
  }
}
