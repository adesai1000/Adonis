import {
  differenceInCalendarDays,
  format,
  isWithinInterval,
  parseISO,
} from "date-fns"
import type {
  CardioEntry,
  DistanceUnit,
  ExerciseCardio,
  FoodEntry,
  LoggedExercise,
  WeightUnit,
  WorkoutSession,
} from "./types"

// ───────────────────────────── ids ─────────────────────────────
export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// ───────────────────────────── number formatting ─────────────────────────────
export function round1(n: number): number {
  if (!isFinite(n)) return 0
  return Math.round(n * 10) / 10
}

/** Fixed decimal places with thousands separators (e.g. 45040 → "45,040.0"). Safe against NaN/undefined. */
export function fmt(n: number | null | undefined, decimals = 1): string {
  const v = typeof n === "number" && isFinite(n) ? n : 0
  return v.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Compact integer-ish formatting with thousands separators, 1 decimal. */
export function fmtNum(n: number | null | undefined): string {
  return fmt(n, 1)
}

/** Whole numbers without a trailing ".0"; otherwise 1 decimal (e.g. 625, 4.5). */
export function fmtCompact(n: number | null | undefined): string {
  const v = typeof n === "number" && isFinite(n) ? n : 0
  return Number.isInteger(Math.round(v * 10) / 10) ? fmt(v, 0) : fmt(v, 1)
}

export function signed(n: number, decimals = 1): string {
  const v = isFinite(n) ? n : 0
  return `${v > 0 ? "+" : ""}${fmt(v, decimals)}`
}

// ───────────────────────────── unit conversion ─────────────────────────────
export const KG_PER_LB = 0.45359237
export const KM_PER_MILE = 1.609344

export function convertWeight(
  value: number,
  from: WeightUnit,
  to: WeightUnit
): number {
  if (from === to) return value
  return from === "kg" ? value / KG_PER_LB : value * KG_PER_LB
}

export function convertDistance(
  value: number,
  from: DistanceUnit,
  to: DistanceUnit
): number {
  if (from === to) return value
  return from === "km" ? value / KM_PER_MILE : value * KM_PER_MILE
}

/**
 * Fraction (0-1) of the way from a starting body weight to a goal weight,
 * given the current weight. Works regardless of whether the goal is a loss
 * or a gain. Returns null when there's no meaningful direction to measure
 * (no goal set, or the goal equals the starting weight).
 */
export function goalProgressFraction(
  start: number,
  current: number,
  goal: number
): number | null {
  if (!isFinite(start) || !isFinite(current) || !isFinite(goal)) return null
  if (goal <= 0 || start === goal) return null
  const raw = (current - start) / (goal - start)
  return Math.min(1, Math.max(0, raw))
}

// ───────────────────────────── workout math ─────────────────────────────
/** Volume of one logged exercise, in the requested unit. */
export function exerciseVolume(ex: LoggedExercise, unit: WeightUnit): number {
  return ex.sets.reduce(
    (sum, s) => sum + s.reps * convertWeight(s.weight, s.unit, unit),
    0
  )
}

/** Total session volume (sets × reps × weight), in the requested unit. */
export function sessionVolume(s: WorkoutSession, unit: WeightUnit): number {
  return s.exercises.reduce((sum, ex) => sum + exerciseVolume(ex, unit), 0)
}

export function sessionSetCount(s: WorkoutSession): number {
  return s.exercises.reduce((n, ex) => n + ex.sets.length, 0)
}

export function sessionRepCount(s: WorkoutSession): number {
  return s.exercises.reduce(
    (n, ex) => n + ex.sets.reduce((r, st) => r + st.reps, 0),
    0
  )
}

// ───────────────────────────── in-workout cardio ─────────────────────────────
export const CARDIO_MUSCLE_GROUP = "Cardio Machines"

/** Exercises in this group are logged by time/distance instead of sets. */
export function isCardioExercise(muscleGroup: string): boolean {
  return muscleGroup === CARDIO_MUSCLE_GROUP
}

/** A fresh, unlogged exercise entry for a session. */
export function newLoggedExercise(
  ex: { id: string; name: string; muscleGroup: string },
  weightUnit: WeightUnit
): LoggedExercise {
  const base = { exerciseId: ex.id, name: ex.name, muscleGroup: ex.muscleGroup }
  return isCardioExercise(ex.muscleGroup)
    ? { ...base, sets: [], cardio: { durationSec: 0 } }
    : { ...base, sets: [{ reps: 0, weight: 0, unit: weightUnit }] }
}

/** Seconds on the clock, including a currently running timer. */
export function cardioSeconds(c: ExerciseCardio | undefined, now = Date.now()): number {
  if (!c) return 0
  let sec = c.durationSec || 0
  if (c.timerStartedAt) {
    const t = new Date(c.timerStartedAt).getTime()
    if (isFinite(t)) sec += Math.max(0, (now - t) / 1000)
  }
  return Math.floor(sec)
}

export function sessionCardioSeconds(s: WorkoutSession): number {
  return s.exercises.reduce((n, ex) => n + cardioSeconds(ex.cardio), 0)
}

export function sessionCardioDistance(s: WorkoutSession, unit: DistanceUnit): number {
  return s.exercises.reduce((n, ex) => {
    const c = ex.cardio
    if (!c || !c.distance) return n
    return n + convertDistance(c.distance, c.distanceUnit ?? unit, unit)
  }, 0)
}

/** Whether anything real was logged: a non-empty set, time on the clock, or distance. */
export function hasLoggedWork(ex: LoggedExercise): boolean {
  if (ex.sets.some((st) => st.reps > 0 || st.weight > 0)) return true
  return cardioSeconds(ex.cardio) > 0 || (ex.cardio?.distance ?? 0) > 0
}

/** Ready-to-save copy: empty sets dropped, running timer folded into the duration. */
export function finalizeLoggedExercise(ex: LoggedExercise): LoggedExercise {
  const sets = ex.sets.filter((st) => st.reps > 0 || st.weight > 0)
  if (!ex.cardio) return { ...ex, sets }
  const { timerStartedAt: _running, ...rest } = ex.cardio
  void _running
  return { ...ex, sets, cardio: { ...rest, durationSec: cardioSeconds(ex.cardio) } }
}

// ───────────────────────────── duration / time ─────────────────────────────
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number) => n.toString().padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function durationToHMS(totalSec: number): {
  h: number
  m: number
  s: number
} {
  const sec = Math.max(0, Math.floor(totalSec))
  return {
    h: Math.floor(sec / 3600),
    m: Math.floor((sec % 3600) / 60),
    s: sec % 60,
  }
}

export function hmsToSeconds(h: number, m: number, s: number): number {
  return Math.max(0, (h || 0) * 3600 + (m || 0) * 60 + (s || 0))
}

/** Pace as m:ss per distance unit. Returns "-" when not computable. */
export function formatPace(
  distance: number | undefined,
  durationSec: number,
  unit: DistanceUnit
): string {
  if (!distance || distance <= 0 || !durationSec || durationSec <= 0) return "-"
  const secPerUnit = durationSec / distance
  const m = Math.floor(secPerUnit / 60)
  const s = Math.round(secPerUnit % 60)
  const ss = s.toString().padStart(2, "0")
  return `${m}:${ss} /${unit === "km" ? "km" : "mi"}`
}

// ───────────────────────────── dates ─────────────────────────────
export function isoNow(): string {
  return new Date().toISOString()
}

/** Convert an ISO string to a yyyy-MM-dd key in local time. */
export function dateKey(iso: string): string {
  try {
    return format(parseISO(iso), "yyyy-MM-dd")
  } catch {
    return ""
  }
}

export function todayKey(): string {
  return format(new Date(), "yyyy-MM-dd")
}

export function formatDate(iso: string): string {
  try {
    return format(parseISO(iso), "EEE, MMM d, yyyy")
  } catch {
    return "-"
  }
}

export function formatTime(iso: string): string {
  try {
    return format(parseISO(iso), "h:mm a")
  } catch {
    return "-"
  }
}

export function formatDateTime(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d, yyyy · h:mm a")
  } catch {
    return "-"
  }
}

export function inRange(iso: string, from: Date, to: Date): boolean {
  try {
    const d = parseISO(iso)
    return isWithinInterval(d, {
      start: from < to ? from : to,
      end: from < to ? to : from,
    })
  } catch {
    return false
  }
}

export function daysBetween(aIso: string, bIso: string): number {
  return Math.abs(differenceInCalendarDays(parseISO(aIso), parseISO(bIso)))
}

// ───────────────────────────── macros / food ─────────────────────────────
export interface MacroTotals {
  calories: number
  protein: number
  carbs: number
  fat: number
  sodium: number // mg
}

export function sumMacros(entries: FoodEntry[]): MacroTotals {
  return entries.reduce<MacroTotals>(
    (acc, e) => ({
      calories: acc.calories + (e.calories || 0),
      protein: acc.protein + (e.protein || 0),
      carbs: acc.carbs + (e.carbs || 0),
      fat: acc.fat + (e.fat || 0),
      sodium: acc.sodium + (e.sodium || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 0 }
  )
}

// ───────────────────────────── cardio ─────────────────────────────
/** Distance of a cardio entry expressed in the requested unit. */
export function cardioDistance(e: CardioEntry, unit: DistanceUnit): number {
  if (e.distance == null) return 0
  return convertDistance(e.distance, e.distanceUnit ?? unit, unit)
}

// ───────────────────────────── trend helpers ─────────────────────────────
export interface Trend {
  value: number // current period aggregate
  prev: number // previous period aggregate
  delta: number // value - prev
  pct: number // percent change vs prev (0 when prev is 0)
  direction: "up" | "down" | "flat"
}

export function computeTrend(value: number, prev: number): Trend {
  const delta = value - prev
  const pct = prev !== 0 ? (delta / Math.abs(prev)) * 100 : value !== 0 ? 100 : 0
  const direction =
    Math.abs(delta) < 1e-9 ? "flat" : delta > 0 ? "up" : "down"
  return { value, prev, delta, pct, direction }
}
