import { subDays } from "date-fns"
import {
  cardioDistance,
  computeTrend,
  convertWeight,
  dateKey,
  fmt,
  inRange,
  sessionVolume,
  type Trend,
} from "@/lib/calc"
import type {
  CardioEntry,
  CardKey,
  DistanceUnit,
  FoodEntry,
  Settings,
  WeightEntry,
  WorkoutSession,
} from "@/lib/types"

export interface CardMetric {
  /** Headline value formatted with its inline unit, e.g. "1,240.0 kg". */
  display: string
  /** Trend across this period vs the previous equal-length window. */
  trend: Trend
  /** Tone for the TrendIndicator (good/bad/neutral). */
  tone: "good" | "bad" | "neutral"
  /** Text shown beside the trend arrow, e.g. "12.4%" or "−1.4 kg". */
  trendText: string
  /** Whether there is any data in the current period. */
  hasData: boolean
}

export const CARD_TITLES: Record<CardKey, string> = {
  volume: "Avg Weight Lifted",
  reps: "Avg Reps / Set",
  calories: "Avg Calories",
  protein: "Avg Protein",
  carbs: "Avg Carbs",
  fat: "Avg Fat",
  cardio: "Cardio",
  bodyweight: "Body Weight",
}

/** A signed percentage string, e.g. "+12.4%" / "−3.0%" / "0.0%". */
function pctText(trend: Trend): string {
  const v = trend.pct
  if (!isFinite(v) || Math.abs(v) < 1e-9) return "0.0%"
  const sign = v > 0 ? "+" : "−"
  return `${sign}${fmt(Math.abs(v))}%`
}

/** Tone where a higher value is "good" (more volume, more reps, more cardio). */
function higherIsBetterTone(trend: Trend): "good" | "bad" | "neutral" {
  if (trend.direction === "flat") return "neutral"
  return trend.direction === "up" ? "good" : "bad"
}

interface TrendWindow {
  curStart: Date
  curEnd: Date
  prevStart: Date
  prevEnd: Date
}

function buildWindow(range: number): TrendWindow {
  const now = new Date()
  const curStart = subDays(now, range)
  const prevEnd = curStart
  const prevStart = subDays(now, range * 2)
  return { curStart, curEnd: now, prevStart, prevEnd }
}

function inWindow(iso: string, start: Date, end: Date): boolean {
  return inRange(iso, start, end)
}

// ───────────────────────────── volume ─────────────────────────────
function volumeMetric(
  workoutLog: WorkoutSession[],
  settings: Settings,
  w: TrendWindow
): CardMetric {
  const unit = settings.weightUnit
  const avg = (start: Date, end: Date): number => {
    const sessions = workoutLog.filter((s) => inWindow(s.datetime, start, end))
    if (sessions.length === 0) return 0
    const total = sessions.reduce((sum, s) => sum + sessionVolume(s, unit), 0)
    return total / sessions.length
  }
  const cur = avg(w.curStart, w.curEnd)
  const prev = avg(w.prevStart, w.prevEnd)
  const trend = computeTrend(cur, prev)
  const curCount = workoutLog.filter((s) =>
    inWindow(s.datetime, w.curStart, w.curEnd)
  ).length
  return {
    display: `${fmt(cur)} ${unit}`,
    trend,
    tone: higherIsBetterTone(trend),
    trendText: pctText(trend),
    hasData: curCount > 0,
  }
}

// ───────────────────────────── reps ─────────────────────────────
function repsMetric(workoutLog: WorkoutSession[], w: TrendWindow): CardMetric {
  const avg = (start: Date, end: Date): number => {
    let reps = 0
    let sets = 0
    for (const s of workoutLog) {
      if (!inWindow(s.datetime, start, end)) continue
      for (const ex of s.exercises) {
        sets += ex.sets.length
        for (const st of ex.sets) reps += st.reps
      }
    }
    return sets > 0 ? reps / sets : 0
  }
  const cur = avg(w.curStart, w.curEnd)
  const prev = avg(w.prevStart, w.prevEnd)
  const trend = computeTrend(cur, prev)
  return {
    display: `${fmt(cur)} reps`,
    trend,
    tone: higherIsBetterTone(trend),
    trendText: pctText(trend),
    hasData: cur > 0,
  }
}

// ───────────────────────────── cardio ─────────────────────────────
function cardioMetric(
  cardioLog: CardioEntry[],
  unit: DistanceUnit,
  w: TrendWindow
): CardMetric {
  // Prefer average distance per session; fall back to duration when no
  // session in the current period logged a distance.
  const sessionsCur = cardioLog.filter((e) =>
    inWindow(e.datetime, w.curStart, w.curEnd)
  )
  const useDistance = sessionsCur.some((e) => (e.distance ?? 0) > 0)

  const avg = (start: Date, end: Date): number => {
    const sessions = cardioLog.filter((e) => inWindow(e.datetime, start, end))
    if (sessions.length === 0) return 0
    const total = sessions.reduce(
      (sum, e) =>
        sum + (useDistance ? cardioDistance(e, unit) : e.durationSec / 60),
      0
    )
    return total / sessions.length
  }
  const cur = avg(w.curStart, w.curEnd)
  const prev = avg(w.prevStart, w.prevEnd)
  const trend = computeTrend(cur, prev)
  const display = useDistance
    ? `${fmt(cur)} ${unit === "km" ? "km" : "mi"}`
    : `${fmt(cur)} min`
  return {
    display,
    trend,
    tone: higherIsBetterTone(trend),
    trendText: pctText(trend),
    hasData: sessionsCur.length > 0,
  }
}

// ───────────────────────────── bodyweight ─────────────────────────────
function bodyweightMetric(
  weightLog: WeightEntry[],
  settings: Settings,
  w: TrendWindow
): CardMetric {
  const unit = settings.weightUnit
  const inCur = weightLog
    .filter((e) => inWindow(e.datetime, w.curStart, w.curEnd))
    .slice()
    .sort((a, b) => a.datetime.localeCompare(b.datetime))

  const toUnit = (e: WeightEntry): number =>
    convertWeight(e.weight, e.unit, unit)

  if (inCur.length === 0) {
    const trend = computeTrend(0, 0)
    return {
      display: `0.0 ${unit}`,
      trend,
      tone: "neutral",
      trendText: `0.0 ${unit}`,
      hasData: false,
    }
  }

  const first = toUnit(inCur[0])
  const latest = toUnit(inCur[inCur.length - 1])
  const net = latest - first
  const trend = computeTrend(latest, first)

  // Tone vs goal: moving toward the goal weight is "good".
  const goal = settings.goalWeight
  let tone: "good" | "bad" | "neutral" = "neutral"
  if (Math.abs(net) >= 1e-9 && goal > 0) {
    const distBefore = Math.abs(goal - first)
    const distAfter = Math.abs(goal - latest)
    tone = distAfter < distBefore ? "good" : "bad"
  }

  const sign = net > 0 ? "+" : net < 0 ? "−" : ""
  return {
    display: `${fmt(latest)} ${unit}`,
    trend,
    tone,
    trendText: `${sign}${fmt(Math.abs(net))} ${unit}`,
    hasData: true,
  }
}

// ───────────────────────────── nutrition (avg per logged day) ─────────────────────────────
function macroMetric(
  foodLog: FoodEntry[],
  w: TrendWindow,
  pick: (e: FoodEntry) => number,
  unitLabel: string,
  preferHigher: boolean
): CardMetric {
  const avgPerDay = (start: Date, end: Date): number => {
    const days = new Map<string, number>()
    for (const e of foodLog) {
      if (!inWindow(e.datetime, start, end)) continue
      const k = dateKey(e.datetime)
      days.set(k, (days.get(k) ?? 0) + (pick(e) || 0))
    }
    if (days.size === 0) return 0
    let total = 0
    for (const v of days.values()) total += v
    return total / days.size
  }
  const cur = avgPerDay(w.curStart, w.curEnd)
  const prev = avgPerDay(w.prevStart, w.prevEnd)
  const trend = computeTrend(cur, prev)

  const curDays = new Set<string>()
  for (const e of foodLog) {
    if (inWindow(e.datetime, w.curStart, w.curEnd)) curDays.add(dateKey(e.datetime))
  }
  return {
    display: `${fmt(cur)} ${unitLabel}`,
    trend,
    tone: preferHigher ? higherIsBetterTone(trend) : "neutral",
    trendText: pctText(trend),
    hasData: curDays.size > 0,
  }
}

export function computeCardMetric(
  key: CardKey,
  data: {
    workoutLog: WorkoutSession[]
    cardioLog: CardioEntry[]
    weightLog: WeightEntry[]
    foodLog: FoodEntry[]
    settings: Settings
  }
): CardMetric {
  const w = buildWindow(data.settings.trendRange)
  switch (key) {
    case "volume":
      return volumeMetric(data.workoutLog, data.settings, w)
    case "reps":
      return repsMetric(data.workoutLog, w)
    case "calories":
      return macroMetric(data.foodLog, w, (e) => e.calories, "kcal", false)
    case "protein":
      return macroMetric(data.foodLog, w, (e) => e.protein, "g", true)
    case "carbs":
      return macroMetric(data.foodLog, w, (e) => e.carbs, "g", false)
    case "fat":
      return macroMetric(data.foodLog, w, (e) => e.fat, "g", false)
    case "cardio":
      return cardioMetric(data.cardioLog, data.settings.distanceUnit, w)
    case "bodyweight":
      return bodyweightMetric(data.weightLog, data.settings, w)
  }
}
