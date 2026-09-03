import { addDays, format, parseISO, startOfDay } from "date-fns"
import { dateKey } from "./calc"
import type { CardioEntry, FoodEntry, WorkoutSession } from "./types"

/** 0 = nothing logged, 1 = calories logged, 2 = calories + a workout of any kind. */
export type ConsistencyLevel = 0 | 1 | 2

export interface ConsistencyDay {
  date: string // yyyy-MM-dd
  level: ConsistencyLevel
}

export interface ConsistencyStats {
  /** One entry per calendar day from the start date through today, oldest first. */
  days: ConsistencyDay[]
  startDate: string // yyyy-MM-dd
  currentStreak: number
  longestStreak: number
  trackedDays: number
  totalDays: number
}

export interface ConsistencyInput {
  foodLog: FoodEntry[]
  workoutLog: WorkoutSession[]
  cardioLog: CardioEntry[]
}

/** Earliest logged entry across food/workout/cardio, or null if nothing is logged yet. */
export function earliestLogDate(input: ConsistencyInput): Date | null {
  let earliest: string | null = null
  for (const e of input.foodLog) {
    if (!earliest || e.datetime < earliest) earliest = e.datetime
  }
  for (const e of input.workoutLog) {
    if (!earliest || e.datetime < earliest) earliest = e.datetime
  }
  for (const e of input.cardioLog) {
    if (!earliest || e.datetime < earliest) earliest = e.datetime
  }
  if (!earliest) return null
  try {
    const d = parseISO(earliest)
    return isNaN(d.getTime()) ? null : startOfDay(d)
  } catch {
    return null
  }
}

const DEFAULT_WEEKS = 26

export function buildConsistency(
  input: ConsistencyInput,
  startDate: Date | null,
  now: Date = new Date()
): ConsistencyStats {
  const end = startOfDay(now)
  const start =
    startDate ?? addDays(end, -DEFAULT_WEEKS * 7 + 1)

  const foodDays = new Set(input.foodLog.map((e) => dateKey(e.datetime)))
  const workoutDays = new Set<string>()
  for (const e of input.workoutLog) workoutDays.add(dateKey(e.datetime))
  for (const e of input.cardioLog) workoutDays.add(dateKey(e.datetime))

  const days: ConsistencyDay[] = []
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const key = format(cursor, "yyyy-MM-dd")
    const hasFood = foodDays.has(key)
    const hasWorkout = workoutDays.has(key)
    const level: ConsistencyLevel = !hasFood ? 0 : hasWorkout ? 2 : 1
    days.push({ date: key, level })
  }

  let longestStreak = 0
  let run = 0
  for (const d of days) {
    if (d.level >= 1) {
      run++
      if (run > longestStreak) longestStreak = run
    } else {
      run = 0
    }
  }

  let currentStreak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].level >= 1) currentStreak++
    else break
  }

  const trackedDays = days.reduce((n, d) => n + (d.level >= 1 ? 1 : 0), 0)

  return {
    days,
    startDate: format(start, "yyyy-MM-dd"),
    currentStreak,
    longestStreak,
    trackedDays,
    totalDays: days.length,
  }
}

/**
 * Chunks a flat day list into Monday-first weeks (columns) for a GitHub-style
 * grid, padding the first/last week with nulls so every column has 7 rows.
 */
export function buildConsistencyWeeks(
  days: ConsistencyDay[]
): (ConsistencyDay | null)[][] {
  if (days.length === 0) return []
  const first = parseISO(days[0].date)
  const firstDow = (first.getDay() + 6) % 7 // Monday = 0 ... Sunday = 6
  const padded: (ConsistencyDay | null)[] = [
    ...Array(firstDow).fill(null),
    ...days,
  ]
  const weeks: (ConsistencyDay | null)[][] = []
  for (let i = 0; i < padded.length; i += 7) {
    const chunk = padded.slice(i, i + 7)
    while (chunk.length < 7) chunk.push(null)
    weeks.push(chunk)
  }
  return weeks
}
