// ───────────────────────────── Demo data generator ─────────────────────────────
// Generates ~2 months of realistic IMPERIAL-UNIT (lbs, miles) sample fitness
// data for the localStorage-only tracker. This is normal browser source, so
// `new Date()` and `Math.random()` are fine here.

import { round1, uid } from "@/lib/calc"
import { seedExercises, seedMeals } from "@/lib/seed"
import type {
  CardioActivity,
  CardioEntry,
  Exercise,
  FoodEntry,
  LoggedExercise,
  Meal,
  Routine,
  RoutineExercise,
  WeightEntry,
  WorkoutSession,
  WorkoutSet,
} from "@/lib/types"

export interface DemoData {
  weightLog: WeightEntry[]
  workoutLog: WorkoutSession[]
  foodLog: FoodEntry[]
  cardioLog: CardioEntry[]
  routines: Routine[]
}

// ───────────────────────────── small helpers ─────────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000
const SPAN_DAYS = 63

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randInt(min: number, max: number): number {
  return Math.floor(randBetween(min, max + 1))
}

function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)]
}

function chance(p: number): boolean {
  return Math.random() < p
}

/** A date `daysAgo` days before `now`, at the given hour/minute (local time). */
function dayAt(now: Date, daysAgo: number, hour: number, minute: number): Date {
  const d = new Date(now.getTime() - daysAgo * DAY_MS)
  d.setHours(hour, minute, randInt(0, 59), 0)
  return d
}

/** Smooth eased progress 0→1 across the whole span (week index based). */
function progress(daysAgo: number): number {
  // daysAgo === SPAN_DAYS-1 is the earliest day (0), daysAgo === 0 is "now" (1)
  return 1 - daysAgo / (SPAN_DAYS - 1)
}

// ───────────────────────────── exercise lookup ─────────────────────────────
// Resolve a built-in exercise by its exact name; undefined if not found.
function exByName(
  exercises: Exercise[],
  name: string
): Exercise | undefined {
  return exercises.find((e) => e.name === name)
}

function mealByName(meals: Meal[], name: string): Meal | undefined {
  return meals.find((m) => m.name === name)
}

// ───────────────────────────── progression model ─────────────────────────────
// Per-exercise base/top working weights (lbs) and rep ranges. Weight ramps
// linearly from `start` → `end` across the span with small per-session noise.
interface Lift {
  name: string
  start: number
  end: number
  repMin: number
  repMax: number
  notes?: string[]
}

function liftWeight(l: Lift, p: number): number {
  const base = l.start + (l.end - l.start) * p
  const noise = randBetween(-5, 5)
  // round to nearest 5 lbs to look like real plate math
  return Math.max(5, Math.round((base + noise) / 5) * 5)
}

function buildSets(
  l: Lift,
  p: number,
  unit: "lbs"
): WorkoutSet[] {
  const setCount = randInt(3, 4)
  const sets: WorkoutSet[] = []
  const topWeight = liftWeight(l, p)
  for (let i = 0; i < setCount; i++) {
    // reps drift down slightly as weight is constant across sets (fatigue)
    const reps = randInt(l.repMin, l.repMax) - (i >= 2 ? randInt(0, 1) : 0)
    sets.push({
      reps: Math.max(l.repMin - 1, reps),
      weight: topWeight,
      unit,
    })
  }
  return sets
}

function loggedExercise(
  exercises: Exercise[],
  lift: Lift,
  p: number
): LoggedExercise | null {
  const ex = exByName(exercises, lift.name)
  if (!ex) return null // skip safely if the seed name changed
  const le: LoggedExercise = {
    exerciseId: ex.id,
    name: ex.name,
    muscleGroup: ex.muscleGroup,
    sets: buildSets(lift, p, "lbs"),
  }
  if (lift.notes && chance(0.3)) {
    le.notes = pick(lift.notes)
  }
  return le
}

// ───────────────────────────── split definitions ─────────────────────────────
// A 4-day rotation: Push / Pull / Legs / Upper.
interface DayTemplate {
  routineName: string
  startHour: [number, number] // [min, max] hour of day
  lifts: Lift[]
}

const PUSH: DayTemplate = {
  routineName: "Push Day",
  startHour: [17, 19],
  lifts: [
    { name: "Bench Press (Flat)", start: 135, end: 160, repMin: 5, repMax: 8, notes: ["felt strong", "paused last set"] },
    { name: "Overhead Press (Barbell)", start: 75, end: 95, repMin: 6, repMax: 9 },
    { name: "Bench Press (Incline)", start: 95, end: 120, repMin: 8, repMax: 10 },
    { name: "Lateral Raise (Dumbbell)", start: 15, end: 25, repMin: 10, repMax: 12 },
    { name: "Tricep Pushdown (Rope)", start: 40, end: 60, repMin: 10, repMax: 12 },
    { name: "Cable Fly (High)", start: 25, end: 40, repMin: 10, repMax: 12 },
  ],
}

const PULL: DayTemplate = {
  routineName: "Pull Day",
  startHour: [17, 19],
  lifts: [
    { name: "Deadlift", start: 225, end: 295, repMin: 4, repMax: 6, notes: ["belt on", "touch-and-go"] },
    { name: "Pull-Ups", start: 0, end: 25, repMin: 6, repMax: 10, notes: ["bodyweight + added"] },
    { name: "Bent-Over Row (Barbell)", start: 115, end: 145, repMin: 6, repMax: 9 },
    { name: "Seated Cable Row", start: 100, end: 130, repMin: 8, repMax: 12 },
    { name: "Face Pull", start: 30, end: 45, repMin: 12, repMax: 12 },
    { name: "Barbell Curl", start: 55, end: 75, repMin: 8, repMax: 10 },
  ],
}

const LEGS: DayTemplate = {
  routineName: "Leg Day",
  startHour: [17, 19],
  lifts: [
    { name: "Back Squat", start: 185, end: 230, repMin: 5, repMax: 8, notes: ["depth check ok", "felt heavy"] },
    { name: "Romanian Deadlift", start: 135, end: 185, repMin: 8, repMax: 10 },
    { name: "Leg Press", start: 270, end: 360, repMin: 10, repMax: 12 },
    { name: "Leg Curl (Lying)", start: 70, end: 100, repMin: 10, repMax: 12 },
    { name: "Leg Extension", start: 80, end: 120, repMin: 10, repMax: 12 },
    { name: "Calf Raise (Standing)", start: 135, end: 185, repMin: 12, repMax: 12 },
  ],
}

const UPPER: DayTemplate = {
  routineName: "Upper Body",
  startHour: [17, 19],
  lifts: [
    { name: "Bench Press (Incline)", start: 95, end: 120, repMin: 6, repMax: 9 },
    { name: "Lat Pulldown (Wide)", start: 110, end: 145, repMin: 8, repMax: 10 },
    { name: "Seated Dumbbell Press", start: 40, end: 55, repMin: 8, repMax: 10 },
    { name: "Single Arm Dumbbell Row", start: 55, end: 75, repMin: 8, repMax: 10 },
    { name: "Hammer Curl", start: 25, end: 35, repMin: 10, repMax: 12 },
    { name: "Skull Crushers (EZ Bar)", start: 50, end: 70, repMin: 10, repMax: 12 },
  ],
}

// Rotation order, repeated week after week.
const ROTATION: DayTemplate[] = [PUSH, PULL, LEGS, UPPER]

// Training days within each 7-day block (Mon/Tue/Thu/Fri style indices).
const TRAINING_OFFSETS = [0, 1, 3, 4]

// ───────────────────────────── routines ─────────────────────────────
function buildRoutines(exercises: Exercise[]): {
  routines: Routine[]
  byName: Map<string, Routine>
} {
  const routines: Routine[] = []
  const byName = new Map<string, Routine>()
  for (const tpl of ROTATION) {
    const rexs: RoutineExercise[] = []
    for (const lift of tpl.lifts) {
      const ex = exByName(exercises, lift.name)
      if (!ex) continue // skip missing safely
      const re: RoutineExercise = {
        exerciseId: ex.id,
        targetSets: randInt(3, 4),
      }
      if (lift.notes && chance(0.25)) re.notes = pick(lift.notes)
      rexs.push(re)
    }
    const routine: Routine = {
      id: uid(),
      name: tpl.routineName,
      exercises: rexs,
    }
    routines.push(routine)
    byName.set(tpl.routineName, routine)
  }
  return { routines, byName }
}

// ───────────────────────────── weight log ─────────────────────────────
function buildWeightLog(now: Date): WeightEntry[] {
  const out: WeightEntry[] = []
  const startW = 190
  const endW = 182
  // walk earliest → latest so the array is chronological
  for (let daysAgo = SPAN_DAYS - 1; daysAgo >= 0; daysAgo--) {
    // log ~85% of days for a believable daily-ish cut (~53 entries)
    if (!chance(0.85)) continue
    const p = progress(daysAgo)
    const trend = startW + (endW - startW) * p
    const noise = randBetween(-0.6, 0.6)
    const weight = round1(trend + noise)
    const when = dayAt(now, daysAgo, 7, randInt(0, 40))
    const entry: WeightEntry = {
      id: uid(),
      datetime: when.toISOString(),
      weight,
      unit: "lbs",
    }
    if (chance(0.25)) {
      entry.notes = pick([
        "morning fasted",
        "after gym",
        "feeling lean",
        "high sodium yesterday",
      ])
    }
    out.push(entry)
  }
  return out
}

// ───────────────────────────── workout log ─────────────────────────────
function buildWorkoutLog(
  now: Date,
  exercises: Exercise[],
  byName: Map<string, Routine>
): WorkoutSession[] {
  const out: WorkoutSession[] = []
  let rotIdx = 0
  const weeks = Math.ceil(SPAN_DAYS / 7)
  for (let w = 0; w < weeks; w++) {
    for (const offset of TRAINING_OFFSETS) {
      const daysAgo = SPAN_DAYS - 1 - (w * 7 + offset)
      if (daysAgo < 0) continue // beyond "now"
      // occasionally miss a session (~12%) for realism
      if (chance(0.12)) {
        rotIdx++
        continue
      }
      const tpl = ROTATION[rotIdx % ROTATION.length]
      rotIdx++
      const p = progress(daysAgo)

      // pick 4-6 of the day's lifts (keep the first as the main movement)
      const count = randInt(4, Math.min(6, tpl.lifts.length))
      const chosen = [tpl.lifts[0], ...shuffle(tpl.lifts.slice(1)).slice(0, count - 1)]

      const logged: LoggedExercise[] = []
      for (const lift of chosen) {
        const le = loggedExercise(exercises, lift, p)
        if (le) logged.push(le)
      }
      if (logged.length === 0) continue // nothing resolved, skip session

      const routine = byName.get(tpl.routineName)
      const [hMin, hMax] = tpl.startHour
      const when = dayAt(now, daysAgo, randInt(hMin, hMax), randInt(0, 59))

      const session: WorkoutSession = {
        id: uid(),
        datetime: when.toISOString(),
        routineId: routine ? routine.id : null,
        exercises: logged,
        durationSec: randInt(2700, 4500),
      }
      if (routine) session.routineName = routine.name
      out.push(session)
    }
  }
  // chronological order
  out.sort((a, b) => a.datetime.localeCompare(b.datetime))
  return out
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ───────────────────────────── food log ─────────────────────────────
// Slot → candidate meal names + serving-quantity ranges, tuned so a day lands
// around 2100-2600 kcal across 3-5 entries.
interface Slot {
  hour: [number, number]
  candidates: { meal: string; qty: number[] }[]
}

const BREAKFAST: Slot = {
  hour: [7, 9],
  candidates: [
    { meal: "Oatmeal", qty: [0.5, 1] },
    { meal: "Scrambled Eggs", qty: [1, 1.5] },
    { meal: "Greek Yogurt", qty: [1, 1.5] },
    { meal: "Banana", qty: [1] },
    { meal: "Whole Milk", qty: [1] },
  ],
}

const LUNCH: Slot = {
  hour: [12, 14],
  candidates: [
    { meal: "Grilled Chicken Breast", qty: [1, 1.5] },
    { meal: "Brown Rice", qty: [1.5, 2] },
    { meal: "Sweet Potato", qty: [1, 1.5] },
    { meal: "Avocado", qty: [0.5, 1] },
  ],
}

const DINNER: Slot = {
  hour: [18, 20],
  candidates: [
    { meal: "Salmon Fillet", qty: [1, 1.5] },
    { meal: "Grilled Chicken Breast", qty: [1, 1.5] },
    { meal: "Brown Rice", qty: [1, 2] },
    { meal: "Sweet Potato", qty: [1] },
  ],
}

const SNACK: Slot = {
  hour: [15, 16],
  candidates: [
    { meal: "Whey Protein Shake", qty: [1, 2] },
    { meal: "Almonds", qty: [0.5, 1] },
    { meal: "Banana", qty: [1] },
    { meal: "Greek Yogurt", qty: [1] },
  ],
}

function snapQty(steps: number[]): number {
  // steps is the allowed set of half-step values (e.g. [0.5, 1, 1.5, 2]);
  // expand a [lo, hi] hint into discrete 0.5 steps and pick one.
  if (steps.length === 1) return steps[0]
  const lo = steps[0]
  const hi = steps[steps.length - 1]
  const options: number[] = []
  for (let v = lo; v <= hi + 1e-9; v += 0.5) options.push(round1(v))
  return pick(options)
}

function foodEntryFromSlot(
  meals: Meal[],
  slot: Slot,
  now: Date,
  daysAgo: number
): FoodEntry | null {
  const cand = pick(slot.candidates)
  const meal = mealByName(meals, cand.meal)
  if (!meal) return null // skip safely if seed meal name changed
  const quantity = snapQty(cand.qty)
  const [hMin, hMax] = slot.hour
  const when = dayAt(now, daysAgo, randInt(hMin, hMax), randInt(0, 59))
  return {
    id: uid(),
    datetime: when.toISOString(),
    mealId: meal.id,
    name: meal.name,
    serving: meal.serving,
    quantity,
    calories: round1(meal.calories * quantity),
    protein: round1(meal.protein * quantity),
    carbs: round1(meal.carbs * quantity),
    fat: round1(meal.fat * quantity),
  }
}

function buildFoodLog(now: Date, meals: Meal[]): FoodEntry[] {
  const out: FoodEntry[] = []
  for (let daysAgo = SPAN_DAYS - 1; daysAgo >= 0; daysAgo--) {
    // always breakfast/lunch/dinner; snack sometimes; double-snack rarely
    const slots: Slot[] = [BREAKFAST, LUNCH, DINNER]
    if (chance(0.7)) slots.push(SNACK)
    if (chance(0.25)) slots.push(SNACK)
    for (const slot of slots) {
      const entry = foodEntryFromSlot(meals, slot, now, daysAgo)
      if (entry) out.push(entry)
    }
  }
  out.sort((a, b) => a.datetime.localeCompare(b.datetime))
  return out
}

// ───────────────────────────── cardio log ─────────────────────────────
const CARDIO_ACTIVITIES: ("Run" | "Walk" | "Cycle")[] = ["Run", "Walk", "Cycle"]

// rough seconds-per-mile pace by activity for realistic durations
const PACE_SEC_PER_MILE: Record<"Run" | "Walk" | "Cycle", [number, number]> = {
  Run: [480, 600], // ~8-10 min/mi
  Walk: [840, 1080], // ~14-18 min/mi
  Cycle: [200, 280], // ~12-18 mph
}

function buildCardioLog(now: Date): CardioEntry[] {
  const out: CardioEntry[] = []
  const weeks = Math.ceil(SPAN_DAYS / 7)
  for (let w = 0; w < weeks; w++) {
    // ~2 sessions per week
    const sessions = chance(0.85) ? 2 : chance(0.5) ? 1 : 3
    const usedOffsets = new Set<number>()
    for (let s = 0; s < sessions; s++) {
      let offset = randInt(0, 6)
      let guard = 0
      while (usedOffsets.has(offset) && guard < 7) {
        offset = randInt(0, 6)
        guard++
      }
      usedOffsets.add(offset)
      const daysAgo = SPAN_DAYS - 1 - (w * 7 + offset)
      if (daysAgo < 0) continue

      const activity = pick(CARDIO_ACTIVITIES)
      const distance = round1(randBetween(2, 6))
      const [pMin, pMax] = PACE_SEC_PER_MILE[activity]
      const durationSec = Math.round(distance * randBetween(pMin, pMax))
      const when = dayAt(now, daysAgo, randInt(6, 19), randInt(0, 59))

      const entry: CardioEntry = {
        id: uid(),
        datetime: when.toISOString(),
        activity,
        distance,
        distanceUnit: "miles",
        durationSec,
      }
      if (chance(0.8)) entry.avgHeartRate = randInt(120, 165)
      if (chance(0.8)) {
        // ~80-110 kcal per mile depending on activity/effort
        const perMile = activity === "Cycle" ? randBetween(40, 70) : randBetween(80, 110)
        entry.caloriesBurned = Math.min(
          600,
          Math.max(200, Math.round(distance * perMile))
        )
      }
      if (chance(0.3)) {
        entry.notes = pick([
          "easy zone 2",
          "negative split",
          "windy out",
          "felt great",
          "recovery pace",
        ])
      }
      out.push(entry)
    }
  }
  out.sort((a, b) => a.datetime.localeCompare(b.datetime))
  return out
}

// ───────────────────────────── public API ─────────────────────────────
export function generateDemoData(): DemoData {
  const now = new Date()
  const exercises = seedExercises()
  const meals = seedMeals()

  const { routines, byName } = buildRoutines(exercises)

  return {
    weightLog: buildWeightLog(now),
    workoutLog: buildWorkoutLog(now, exercises, byName),
    foodLog: buildFoodLog(now, meals),
    cardioLog: buildCardioLog(now),
    routines,
  }
}
