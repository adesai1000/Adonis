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
export interface FoodItemSummary {
  name: string
  serving: string
  quantity: number
  calories: number
  protein: number
  carbs: number
  fat: number
  sodium: number // mg
  notes?: string
}

export interface FoodDaySummary {
  date: string
  isToday: boolean
  calories: number
  protein: number
  carbs: number
  fat: number
  sodium: number // mg
  items: FoodItemSummary[]
}

export interface WorkoutHistorySet {
  reps: number
  weight: number
  unit: WeightUnit
}

export interface WorkoutHistoryExercise {
  name: string
  sets: WorkoutHistorySet[]
}

export interface WorkoutHistorySession {
  /** ISO datetime the session took place. */
  datetime: string
  routineName?: string
  exercises: WorkoutHistoryExercise[]
}

export interface WeeklyStats {
  weekLabel: string
  today: string
  /** Rough part of the current day, e.g. "afternoon" — the day is NOT over yet. */
  nowTimeOfDay: string
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
    avgCaloriesPerLoggedDay: number
    avgProteinPerLoggedDay: number
    avgCarbsPerLoggedDay: number
    avgFatPerLoggedDay: number
    avgSodiumPerLoggedDay: number // mg
    /** Per-day breakdown of exactly what was eaten (last 7 days). */
    days: FoodDaySummary[]
  }
  training: {
    sessions: number
    totalVolume: number
    totalSets: number
    topExercises: { name: string; sets: number; topSet: string }[]
  }
  /**
   * The athlete's ENTIRE lifetime training log (not just the last 7 days) —
   * every session with when it happened, and every exercise with every set's
   * weight and reps. Use this for long-term progress context.
   */
  workoutHistory: WorkoutHistorySession[]
  cardio: {
    sessions: number
    totalDistance: number
    totalMinutes: number
    totalSteps: number
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

/** One piece of free-text context the athlete has typed in for the coach, dated. */
export interface CoachNoteEntry {
  /** ISO datetime the note was submitted. */
  date: string
  text: string
}

export interface CoachInput {
  workoutLog: WorkoutSession[]
  foodLog: FoodEntry[]
  cardioLog: CardioEntry[]
  weightLog: WeightEntry[]
  settings: Settings
}

function timeOfDayLabel(d: Date): string {
  const h = d.getHours()
  if (h < 5) return "late night"
  if (h < 12) return "morning"
  if (h < 17) return "afternoon"
  if (h < 21) return "evening"
  return "night"
}

// ───────────────────────────── Build the weekly snapshot ─────────────────────────────
export function buildWeeklyStats(
  { workoutLog, foodLog, cardioLog, weightLog, settings }: CoachInput,
  now: Date = new Date()
): WeeklyStats {
  const from = subDays(now, 7)
  const wUnit = settings.weightUnit
  const dUnit = settings.distanceUnit

  // nutrition — per-day breakdown with the actual items eaten
  const todayKey = dateKey(now.toISOString())
  const food = foodLog.filter((e) => inRange(e.datetime, from, now))
  const dayMap = new Map<string, FoodDaySummary>()
  for (const e of food) {
    const k = dateKey(e.datetime)
    let day = dayMap.get(k)
    if (!day) {
      day = {
        date: k,
        isToday: k === todayKey,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        sodium: 0,
        items: [],
      }
      dayMap.set(k, day)
    }
    day.calories += e.calories || 0
    day.protein += e.protein || 0
    day.carbs += e.carbs || 0
    day.fat += e.fat || 0
    day.sodium += e.sodium || 0
    day.items.push({
      name: e.name,
      serving: e.serving,
      quantity: e.quantity,
      calories: round1(e.calories || 0),
      protein: round1(e.protein || 0),
      carbs: round1(e.carbs || 0),
      fat: round1(e.fat || 0),
      sodium: round1(e.sodium || 0),
      ...(e.notes ? { notes: e.notes } : {}),
    })
  }
  const foodDays = [...dayMap.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      ...d,
      calories: round1(d.calories),
      protein: round1(d.protein),
      carbs: round1(d.carbs),
      fat: round1(d.fat),
      sodium: round1(d.sodium),
    }))
  const daysLogged = foodDays.length
  const denom = daysLogged || 1
  const sumOf = (pick: (d: FoodDaySummary) => number) =>
    round1(foodDays.reduce((s, d) => s + pick(d), 0) / denom)

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

  // full lifetime workout history — every session, exercise and set, with
  // when it happened, the weight used and the reps performed
  const workoutHistory: WorkoutHistorySession[] = [...workoutLog]
    .sort((a, b) => a.datetime.localeCompare(b.datetime))
    .map((s) => ({
      datetime: s.datetime,
      ...(s.routineName ? { routineName: s.routineName } : {}),
      exercises: s.exercises.map((ex) => ({
        name: ex.name,
        sets: ex.sets.map((st) => ({
          reps: st.reps,
          weight: round1(convertWeight(st.weight, st.unit, wUnit)),
          unit: wUnit,
        })),
      })),
    }))

  // cardio
  const cardio = cardioLog.filter((e) => inRange(e.datetime, from, now))
  const totalDistance = cardio.reduce((d, e) => d + cardioDistance(e, dUnit), 0)
  const totalMinutes = cardio.reduce((m, e) => m + (e.durationSec || 0) / 60, 0)
  const totalSteps = cardio.reduce((s, e) => s + (e.steps || 0), 0)

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
    today: todayKey,
    nowTimeOfDay: timeOfDayLabel(now),
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
      daysLogged,
      avgCaloriesPerLoggedDay: sumOf((d) => d.calories),
      avgProteinPerLoggedDay: sumOf((d) => d.protein),
      avgCarbsPerLoggedDay: sumOf((d) => d.carbs),
      avgFatPerLoggedDay: sumOf((d) => d.fat),
      avgSodiumPerLoggedDay: sumOf((d) => d.sodium),
      days: foodDays,
    },
    training: {
      sessions: sessions.length,
      totalVolume: round1(totalVolume),
      totalSets,
      topExercises,
    },
    workoutHistory,
    cardio: {
      sessions: cardio.length,
      totalDistance: round1(totalDistance),
      totalMinutes: round1(totalMinutes),
      totalSteps,
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

Read the data carefully:
- "nutrition.days" lists exactly what was eaten each day (item names, servings, quantities, macros, and any notes). Use these real food choices for specific feedback — not just the averages.
- "today" is the current date, and "nowTimeOfDay" tells you what part of the day it is right now (morning / afternoon / evening / night). A day with "isToday": true is STILL IN PROGRESS — the athlete has not finished eating yet. If "nowTimeOfDay" is morning, afternoon, or evening, the day is NOT over: do NOT tell the athlete they are under-eating or need to eat more just because today's partial total looks low — more meals are likely still coming before the day ends. Only judge full daily intake as low or high on a day that has actually finished (any date other than "today"), or on "today" once "nowTimeOfDay" is "night" / "late night".
- "daysLogged" tells you how many days were actually logged. If only 1-2 days exist, treat this as early/limited data: emphasize building consistent logging and training habits rather than declaring intake "dangerously low." Never alarm the athlete based on a single partial day.
- Sodium is tracked in mg (per item and as "avgSodiumPerLoggedDay"). Note notably high sodium given cardiovascular and blood-pressure health, but do not alarm over a single day, and treat 0 mg as "not recorded" rather than truly sodium-free.
- "training.topExercises" summarizes the last 7 days only. "workoutHistory" is the athlete's ENTIRE lifetime training log — every session (with the date/time it happened), every exercise, and every set's weight and reps. Use it for long-term context: strength progress, plateaus, PRs, and training consistency over time, not just this week.
- After the JSON data you may see a dated log titled "Context I've given my coach over time" — free-text notes the athlete has typed in themselves across past and current sessions (e.g. an injury, a stressful week, travel, a specific goal), oldest first. Read the WHOLE log, not just the most recent entry — an older note can still be relevant (e.g. a shoulder tweak from two weeks ago that is still healing). Factor all of it into your coaching and prioritize it over assumptions you'd otherwise make from the numbers alone.

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
  noteHistory: CoachNoteEntry[] = [],
  now: Date = new Date()
): Promise<CoachSummary> {
  const noteBlock = noteHistory.length
    ? "\n\nContext I've given my coach over time (oldest first):\n" +
      noteHistory
        .map((n) => `- [${n.date.slice(0, 10)}] ${n.text}`)
        .join("\n")
    : ""
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
            JSON.stringify(stats, null, 2) +
            noteBlock,
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
