import {
  differenceInCalendarDays,
  format,
  isWithinInterval,
  parseISO,
} from "date-fns"
import type {
  CardioEntry,
  DistanceUnit,
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

/** Always 1 decimal place. Safe against NaN/undefined. */
export function fmt(n: number | null | undefined, decimals = 1): string {
  const v = typeof n === "number" && isFinite(n) ? n : 0
  return v.toFixed(decimals)
}

/** Compact integer-ish formatting with thousands separators, 1 decimal. */
export function fmtNum(n: number | null | undefined): string {
  const v = typeof n === "number" && isFinite(n) ? n : 0
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

export function signed(n: number, decimals = 1): string {
  const v = isFinite(n) ? n : 0
  return `${v > 0 ? "+" : ""}${v.toFixed(decimals)}`
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
}

export function sumMacros(entries: FoodEntry[]): MacroTotals {
  return entries.reduce<MacroTotals>(
    (acc, e) => ({
      calories: acc.calories + (e.calories || 0),
      protein: acc.protein + (e.protein || 0),
      carbs: acc.carbs + (e.carbs || 0),
      fat: acc.fat + (e.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
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
