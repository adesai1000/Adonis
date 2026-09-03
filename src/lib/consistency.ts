import {
  addDays,
  endOfWeek,
  format,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns"
import { dateKey } from "./calc"
import type { CardioEntry, FoodEntry, WorkoutSession } from "./types"

/**
 * 0 = tracked day, nothing logged · 1 = calories logged · 2 = calories + a
 * workout of any kind · 3 = future day (hasn't happened yet) · 4 = before the
 * tracking start date (drawn faintly so the start date reads as a boundary).
 */
export type ConsistencyLevel = 0 | 1 | 2 | 3 | 4

export interface ConsistencyDay {
  date: string // yyyy-MM-dd
  level: ConsistencyLevel
}

export interface ConsistencyStats {
  /** Every calendar day in the grid window, Monday-aligned, oldest first. Always a multiple of 7. */
  days: ConsistencyDay[]
  /** Index into `days` of today. */
  todayIndex: number
  trackStart: string // yyyy-MM-dd
  currentStreak: number
  longestStreak: number
  /** Days with calories logged, from the tracking start through today. */
  trackedDays: number
  /** Calendar days from the tracking start through today. */
  totalDays: number
}

export interface ConsistencyInput {
  foodLog: FoodEntry[]
  workoutLog: WorkoutSession[]
  cardioLog: CardioEntry[]
}

const WEEK = { weekStartsOn: 1 as const } // Monday

/**
 * When no future goal date is set, the grid still looks ahead this far from
 * the tracking start (as hollow squares) so a fresh start isn't one lonely column.
 */
export const MIN_SPAN_WEEKS = 26

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

/**
 * Builds the grid window: from the week of the tracking start date through
 * the goal date (when one is set in the future), or at least MIN_SPAN_WEEKS
 * ahead of the start otherwise. Days after today render hollow; the few days
 * before the start date in its first week render faint so columns stay
 * Monday-aligned. Streaks and counts only consider start → today.
 */
export function buildConsistency(
  input: ConsistencyInput,
  trackStartDate: Date | null,
  goalDate: Date | null,
  now: Date = new Date()
): ConsistencyStats {
  const today = startOfDay(now)
  const trackStart = startOfDay(trackStartDate ?? today)
  const gridStart = startOfWeek(trackStart, WEEK)

  const futureGoal =
    goalDate && startOfDay(goalDate) > today ? startOfDay(goalDate) : null
  const minEnd = addDays(trackStart, MIN_SPAN_WEEKS * 7)
  const rangeEnd = futureGoal ?? (minEnd > today ? minEnd : today)
  const gridEnd = startOfDay(endOfWeek(rangeEnd, WEEK))

  const foodDays = new Set(input.foodLog.map((e) => dateKey(e.datetime)))
  const workoutDays = new Set<string>()
  for (const e of input.workoutLog) workoutDays.add(dateKey(e.datetime))
  for (const e of input.cardioLog) workoutDays.add(dateKey(e.datetime))

  const todayKey = format(today, "yyyy-MM-dd")
  const days: ConsistencyDay[] = []
  let todayIndex = -1
  for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 1)) {
    const key = format(cursor, "yyyy-MM-dd")
    let level: ConsistencyLevel
    if (cursor > today) {
      level = 3
    } else if (cursor < trackStart) {
      level = 4
    } else {
      const hasFood = foodDays.has(key)
      const hasWorkout = workoutDays.has(key)
      level = !hasFood ? 0 : hasWorkout ? 2 : 1
    }
    if (key === todayKey) todayIndex = days.length
    days.push({ date: key, level })
  }

  // Stats only over the tracked range (levels 0–2, which are contiguous).
  let longestStreak = 0
  let run = 0
  let trackedDays = 0
  let totalDays = 0
  for (const d of days) {
    if (d.level > 2) continue
    totalDays++
    if (d.level >= 1) {
      trackedDays++
      run++
      if (run > longestStreak) longestStreak = run
    } else {
      run = 0
    }
  }

  let currentStreak = 0
  for (let i = todayIndex; i >= 0; i--) {
    const lvl = days[i].level
    if (lvl === 1 || lvl === 2) currentStreak++
    else break
  }

  return {
    days,
    todayIndex,
    trackStart: format(trackStart, "yyyy-MM-dd"),
    currentStreak,
    longestStreak,
    trackedDays,
    totalDays,
  }
}

/** Chunks the Monday-aligned day list into week columns of 7 for the grid. */
export function buildConsistencyWeeks(days: ConsistencyDay[]): ConsistencyDay[][] {
  const weeks: ConsistencyDay[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }
  return weeks
}
