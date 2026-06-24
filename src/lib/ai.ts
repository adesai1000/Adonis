import { subDays } from "date-fns"
import {
  cardioDistance,
  convertWeight,
  dateKey,
  exerciseVolume,
  inRange,
  round1,
  sessionSetCount,
  sessionVolume,
} from "./calc"
import type {
  CardioEntry,
  DistanceUnit,
  FoodEntry,
  Settings,
  WeightEntry,
  WeightUnit,
  WorkoutSession,
} from "./types"

// ───────────────────────────── Types ─────────────────────────────
export interface WeeklyStats {
  weekLabel: string
  heightInches: number
  height: string
  weightUnit: WeightUnit
  distanceUnit: DistanceUnit
  goals: {
    calories: number
    protein: number
    carbs: number
    fat: number
    goalWeight: number
  }
  nutrition: {
    daysLogged: number
    avgCalories: number
    avgProtein: number
    avgCarbs: number
    avgFat: number
  }
  training: {
    sessions: number
    totalVolume: number
    totalSets: number
    topExercises: { name: string; sets: number; topSet: string }[]
  }
  cardio: {
    sessions: number
    totalDistance: number
    totalMinutes: number
  }
  bodyweight: {
    entries: number
    start: number | null
    latest: number | null
    change: number | null
  }
}

export interface CoachSummary {
  headline: string
  overview: string
  highlights: string[]
  focus: string[]
  tips: string[]
  generatedAt: string
  weekLabel: string
}

export interface CoachInput {
  workoutLog: WorkoutSession[]
  foodLog: FoodEntry[]
  cardioLog: CardioEntry[]
  weightLog: WeightEntry[]
  settings: Settings
}

// ───────────────────────────── Build the weekly snapshot ─────────────────────────────
export function buildWeeklyStats(
  { workoutLog, foodLog, cardioLog, weightLog, settings }: CoachInput,
  now: Date = new Date()
): WeeklyStats {
  const from = subDays(now, 7)
  const wUnit = settings.weightUnit
  const dUnit = settings.distanceUnit

  // nutrition
  const food = foodLog.filter((e) => inRange(e.datetime, from, now))
  const dayKeys = new Set(food.map((e) => dateKey(e.datetime)))
  const daysLogged = dayKeys.size || 1
  const foodTotals = food.reduce(
    (a, e) => ({
      cal: a.cal + (e.calories || 0),
      p: a.p + (e.protein || 0),
      c: a.c + (e.carbs || 0),
      f: a.f + (e.fat || 0),
    }),
    { cal: 0, p: 0, c: 0, f: 0 }
  )

  // training
  const sessions = workoutLog.filter((s) => inRange(s.datetime, from, now))
  const totalVolume = sessions.reduce((v, s) => v + sessionVolume(s, wUnit), 0)
  const totalSets = sessions.reduce((n, s) => n + sessionSetCount(s), 0)

  const exAgg = new Map<string, { name: string; sets: number; volume: number; topW: number; topReps: number }>()
  for (const s of sessions) {
    for (const ex of s.exercises) {
      const cur = exAgg.get(ex.name) ?? {
        name: ex.name,
        sets: 0,
        volume: 0,
        topW: 0,
        topReps: 0,
      }
      cur.sets += ex.sets.length
      cur.volume += exerciseVolume(ex, wUnit)
      for (const st of ex.sets) {
        const w = convertWeight(st.weight, st.unit, wUnit)
        if (w > cur.topW) {
          cur.topW = w
          cur.topReps = st.reps
        }
      }
      exAgg.set(ex.name, cur)
    }
  }
  const topExercises = [...exAgg.values()]
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5)
    .map((e) => ({
      name: e.name,
      sets: e.sets,
      topSet: `${e.topReps} x ${round1(e.topW)} ${wUnit}`,
    }))

  // cardio
  const cardio = cardioLog.filter((e) => inRange(e.datetime, from, now))
  const totalDistance = cardio.reduce((d, e) => d + cardioDistance(e, dUnit), 0)
  const totalMinutes = cardio.reduce((m, e) => m + (e.durationSec || 0) / 60, 0)

  // bodyweight
  const weights = weightLog
    .filter((e) => inRange(e.datetime, from, now))
    .sort((a, b) => a.datetime.localeCompare(b.datetime))
    .map((e) => convertWeight(e.weight, e.unit, wUnit))
  const start = weights.length ? weights[0] : null
  const latest = weights.length ? weights[weights.length - 1] : null

  const hi = settings.heightInches || 0
  const height = hi > 0 ? `${Math.floor(hi / 12)} ft ${hi % 12} in` : "not set"

  return {
    weekLabel: "last 7 days",
    heightInches: hi,
    height,
    weightUnit: wUnit,
    distanceUnit: dUnit,
    goals: {
      calories: settings.calorieGoal,
      protein: settings.proteinGoal,
      carbs: settings.carbsGoal,
      fat: settings.fatGoal,
      goalWeight: settings.goalWeight,
    },
    nutrition: {
      daysLogged: dayKeys.size,
      avgCalories: round1(foodTotals.cal / daysLogged),
      avgProtein: round1(foodTotals.p / daysLogged),
      avgCarbs: round1(foodTotals.c / daysLogged),
      avgFat: round1(foodTotals.f / daysLogged),
    },
    training: {
      sessions: sessions.length,
      totalVolume: round1(totalVolume),
      totalSets,
      topExercises,
    },
    cardio: {
      sessions: cardio.length,
      totalDistance: round1(totalDistance),
      totalMinutes: round1(totalMinutes),
    },
    bodyweight: {
      entries: weights.length,
      start: start != null ? round1(start) : null,
      latest: latest != null ? round1(latest) : null,
      change: start != null && latest != null ? round1(latest - start) : null,
    },
  }
}

export function hasWeekData(s: WeeklyStats): boolean {
  return (
    s.nutrition.daysLogged > 0 ||
    s.training.sessions > 0 ||
    s.cardio.sessions > 0 ||
    s.bodyweight.entries > 0
  )
}

// ───────────────────────────── DeepSeek request ─────────────────────────────
const SYSTEM_PROMPT = `You are an elite, supportive strength & physique coach reviewing an athlete's training and nutrition log for the past 7 days.

Speak directly to the athlete ("you"). Be specific and reference their actual numbers (height, bodyweight change, volume, calories, protein, top lifts). Use their height together with bodyweight and goal weight for body-composition context (e.g. whether calories/protein suit their frame and goal). Be encouraging but honest — call out what is working and what needs attention. Keep every string concise and punchy; no fluff, no medical disclaimers.

Use the athlete's units exactly as provided in the data (e.g. lbs, miles, kcal, g). All weights are already in their preferred unit.

Return ONLY a JSON object with EXACTLY these keys:
{
  "headline": string,        // short, motivating one-liner for the week
  "overview": string,        // 2-3 sentence read on the week overall
  "highlights": string[],    // 2-4 short bullet strings: what went well
  "focus": string[],         // 2-4 short bullet strings: what to improve
  "tips": string[]           // 3-5 concrete, actionable coaching tips for next week
}
Do not wrap the JSON in markdown. Do not add any keys beyond those five.`

export async function generateCoachSummary(
  stats: WeeklyStats,
  now: Date = new Date()
): Promise<CoachSummary> {
  const res = await fetch("/api/deepseek", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            "Here is my logged data for the past 7 days as JSON. Coach me.\n\n" +
            JSON.stringify(stats, null, 2),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 1500,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(
      res.status === 401 || res.status === 403
        ? "DeepSeek rejected the API key. Check DEEPSEEK_API in your .env and restart the dev server."
        : `DeepSeek request failed (${res.status}). ${text.slice(0, 160)}`
    )
  }

  const data = await res.json()
  const content: string | undefined = data?.choices?.[0]?.message?.content
  if (!content) throw new Error("DeepSeek returned an empty response.")

  let parsed: Partial<CoachSummary>
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error("Could not parse the coach response. Try regenerating.")
  }

  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string") : []

  return {
    headline: typeof parsed.headline === "string" ? parsed.headline : "Your week in review",
    overview: typeof parsed.overview === "string" ? parsed.overview : "",
    highlights: arr(parsed.highlights),
    focus: arr(parsed.focus),
    tips: arr(parsed.tips),
    generatedAt: now.toISOString(),
    weekLabel: stats.weekLabel,
  }
}
