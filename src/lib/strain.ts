import { dateKey, sessionCardioSeconds, sessionSetCount, sessionVolume } from "./calc"
import type { CardioActivity, CardioEntry, WorkoutSession } from "./types"

// ───────────────────────────── Strain score ─────────────────────────────
// A single 0–21 number for "how hard did today hit". Every workout and cardio
// entry is turned into *effort-minutes* (minutes at a moderate effort), those
// are summed into a raw load, and the load is squashed onto the 0–21 scale
// with a saturating curve so back-to-back sessions add up but never blow past
// the ceiling. Calibration targets:
//   • 60 min lift, 20 sets, ~8 t moved   → ~12.5 (moderate)
//   • 30 min run at ~150 bpm             → ~8    (light)
//   • both in one day                    → ~16   (high)

export const STRAIN_MAX = 21
/** Raw load at which the curve reaches ~63% of STRAIN_MAX. */
const SATURATION_LOAD = 104

/** Minutes assumed per set when a session has no logged duration. */
const MINUTES_PER_SET_FALLBACK = 2.5
/** Walking cadence used to estimate time for step-only entries. */
const STEPS_PER_MINUTE = 100

export type StrainZone = "rest" | "light" | "moderate" | "high" | "allout"

export const STRAIN_ZONE_LABELS: Record<StrainZone, string> = {
  rest: "Rest day",
  light: "Light",
  moderate: "Moderate",
  high: "High",
  allout: "All out",
}

export function strainZone(score: number): StrainZone {
  if (score <= 0) return "rest"
  if (score < 10) return "light"
  if (score < 14) return "moderate"
  if (score < 18) return "high"
  return "allout"
}

/** Effort multiplier by activity, used when no heart rate was logged. */
const ACTIVITY_INTENSITY: Record<CardioActivity, number> = {
  Steps: 0.25,
  Walk: 0.5,
  Other: 1.0,
  Cycle: 1.2,
  Swim: 1.5,
  Row: 1.5,
  "Stair Climber": 1.5,
  Run: 1.6,
  "Jump Rope": 1.8,
  HIIT: 2.0,
}

function cardioIntensity(e: CardioEntry): number {
  const hr = e.avgHeartRate ?? 0
  if (hr > 0) {
    if (hr < 110) return 0.7
    if (hr < 130) return 1.0
    if (hr < 145) return 1.3
    if (hr < 160) return 1.7
    if (hr < 175) return 2.1
    return 2.5
  }
  return ACTIVITY_INTENSITY[e.activity] ?? 1.0
}

function cardioMinutes(e: CardioEntry): number {
  if (e.durationSec > 0) return e.durationSec / 60
  if (e.activity === "Steps" && (e.steps ?? 0) > 0)
    return (e.steps ?? 0) / STEPS_PER_MINUTE
  return 0
}

/** Extra effort per minute on a cardio machine, on top of the session's base minute rate. */
const IN_WORKOUT_CARDIO_BONUS = 0.4

/** Effort-minutes for one workout session (sets plus any cardio machines). */
export function liftLoad(s: WorkoutSession): number {
  const sets = sessionSetCount(s)
  const cardioMin = sessionCardioSeconds(s) / 60
  // The session clock already covers cardio time; only estimate when unlogged.
  const minutes =
    s.durationSec > 0
      ? s.durationSec / 60
      : sets * MINUTES_PER_SET_FALLBACK + cardioMin
  const tonnes = sessionVolume(s, "kg") / 1000
  return minutes + tonnes * 3 + sets * 0.6 + cardioMin * IN_WORKOUT_CARDIO_BONUS
}

/** Effort-minutes for one cardio entry. */
export function cardioLoad(e: CardioEntry): number {
  return cardioMinutes(e) * cardioIntensity(e)
}

/** Squash raw effort-minutes onto the 0–21 scale. */
export function loadToStrain(load: number): number {
  if (!isFinite(load) || load <= 0) return 0
  const raw = STRAIN_MAX * (1 - Math.exp(-load / SATURATION_LOAD))
  return Math.round(raw * 10) / 10
}

// ───────────────────────────── Daily score ─────────────────────────────
/** Strain score for a single calendar day (yyyy-MM-dd). */
export function strainForDay(
  workoutLog: WorkoutSession[],
  cardioLog: CardioEntry[],
  day: string
): number {
  let load = 0
  for (const s of workoutLog) if (dateKey(s.datetime) === day) load += liftLoad(s)
  for (const e of cardioLog) if (dateKey(e.datetime) === day) load += cardioLoad(e)
  return loadToStrain(load)
}

export interface StrainBreakdown {
  score: number
  zone: StrainZone
  /** Total effort-minutes behind the score. */
  load: number
  /** Effort-minutes from workout sessions (sets, tonnage, in-session cardio). */
  liftLoad: number
  /** Effort-minutes from standalone cardio entries. */
  cardioLoad: number
  sessions: number
  cardioEntries: number
}

/** Where a day's strain came from, for the History page. */
export function strainBreakdown(
  workoutLog: WorkoutSession[],
  cardioLog: CardioEntry[],
  day: string
): StrainBreakdown {
  let lift = 0
  let sessions = 0
  for (const s of workoutLog) {
    if (dateKey(s.datetime) !== day) continue
    lift += liftLoad(s)
    sessions++
  }
  let cardio = 0
  let cardioEntries = 0
  for (const e of cardioLog) {
    if (dateKey(e.datetime) !== day) continue
    cardio += cardioLoad(e)
    cardioEntries++
  }
  const load = lift + cardio
  const score = loadToStrain(load)
  return {
    score,
    zone: strainZone(score),
    load,
    liftLoad: lift,
    cardioLoad: cardio,
    sessions,
    cardioEntries,
  }
}
