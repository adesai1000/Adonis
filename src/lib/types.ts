// ───────────────────────────── Core primitives ─────────────────────────────
export type ID = string

export type Theme = "light" | "dark" | "system"
export type WeightUnit = "kg" | "lbs"
export type DistanceUnit = "km" | "miles"

export type DataSource = "manual" | "whoop" | "googlefit"

// ───────────────────────────── User ─────────────────────────────
export interface UserProfile {
  theme: Theme
}

// ───────────────────────────── Exercises ─────────────────────────────
export const MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Legs",
  "Core",
  "Compound / Olympic",
  "Cardio Machines",
] as const
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export interface Exercise {
  id: ID
  name: string
  muscleGroup: string
  equipment?: string
  builtIn: boolean
}

// ───────────────────────────── Meals + Food log ─────────────────────────────
export interface Meal {
  id: ID
  name: string
  serving: string
  calories: number
  protein: number
  carbs: number
  fat: number
  sodium?: number // mg (optional for backward compatibility)
  builtIn?: boolean
}

export interface FoodEntry {
  id: ID
  datetime: string // ISO
  mealId: ID | null
  name: string // snapshot of meal name
  serving: string
  quantity: number
  calories: number // totals AFTER quantity multiplier
  protein: number
  carbs: number
  fat: number
  sodium?: number // mg, total AFTER quantity multiplier (optional for back-compat)
  notes?: string
}

// ───────────────────────────── Workouts ─────────────────────────────
export interface WorkoutSet {
  reps: number
  weight: number
  unit: WeightUnit
}

export interface LoggedExercise {
  exerciseId: ID
  name: string // snapshot
  muscleGroup: string // snapshot
  sets: WorkoutSet[]
  notes?: string
}

export interface WorkoutSession {
  id: ID
  datetime: string // start time ISO
  routineId: ID | null
  routineName?: string
  exercises: LoggedExercise[]
  durationSec: number
  source?: DataSource
  externalId?: string
}

// In-progress, crash-recoverable session
export interface ActiveSession {
  startedAt: string // ISO - anchor for the elapsed timer
  datetime: string // chosen session start datetime ISO
  routineId: ID | null
  routineName?: string
  currentIndex: number
  exercises: LoggedExercise[]
}

// ───────────────────────────── Cardio ─────────────────────────────
export const CARDIO_ACTIVITIES = [
  "Run",
  "Walk",
  "Cycle",
  "Swim",
  "Row",
  "Jump Rope",
  "Stair Climber",
  "HIIT",
  "Steps",
  "Other",
] as const
export type CardioActivity = (typeof CARDIO_ACTIVITIES)[number]

export interface CardioEntry {
  id: ID
  datetime: string
  activity: CardioActivity
  distance?: number // in distanceUnit
  distanceUnit?: DistanceUnit
  durationSec: number
  steps?: number // for the "Steps" activity
  avgHeartRate?: number
  caloriesBurned?: number
  notes?: string
  source?: DataSource
  externalId?: string
}

// ───────────────────────────── Body weight ─────────────────────────────
export interface WeightEntry {
  id: ID
  datetime: string
  weight: number // in `unit`
  unit: WeightUnit
  notes?: string
  source?: DataSource
  externalId?: string
}

// ───────────────────────────── Recovery / integrations ─────────────────────────────
// Daily recovery/readiness metrics, one entry per (source, date).
export interface RecoveryEntry {
  id: ID
  date: string // yyyy-MM-dd
  source: DataSource
  recoveryScore?: number // 0–100 (Whoop)
  hrvMs?: number // HRV RMSSD in ms
  restingHeartRate?: number
  sleepPerformance?: number // 0–100
  sleepDurationSec?: number
  dayStrain?: number // Whoop 0–21
  steps?: number // Google Fit daily steps
  caloriesOut?: number // active energy burned
}

export interface IntegrationSyncResult {
  provider: "whoop" | "googlefit"
  recovery: RecoveryEntry[] // ids generated server-side as `${provider}-${date}`
  cardio: CardioEntry[] // ids `${provider}-${externalId}`; source+externalId set
  weights: WeightEntry[] // ids `${provider}-${externalId}`
  lastSyncedAt: string // ISO
}

// ───────────────────────────── Routines ─────────────────────────────
export interface RoutineExercise {
  exerciseId: ID
  targetSets: number
  notes?: string
}

export interface Routine {
  id: ID
  name: string
  exercises: RoutineExercise[]
}

// ───────────────────────────── Settings ─────────────────────────────
export type TrendRange = 7 | 14 | 30

export interface Settings {
  calorieGoal: number
  proteinGoal: number
  carbsGoal: number
  fatGoal: number
  goalWeight: number
  goalWeightDate: string // yyyy-MM-dd or ""
  heightInches: number // total height in inches (0 = unset)
  weightUnit: WeightUnit
  distanceUnit: DistanceUnit
  trendRange: TrendRange
}

// ───────────────────────────── Dashboard UI prefs ─────────────────────────────
export type CardKey =
  | "recovery"
  | "volume"
  | "reps"
  | "calories"
  | "protein"
  | "carbs"
  | "fat"
  | "sodium"
  | "cardio"
  | "bodyweight"
export type GraphTab = "bodyweight" | "calories" | "protein"

export interface UiPrefs {
  cardOrder: CardKey[]
  cardVisibility: Record<CardKey, boolean>
  graphTabOrder: GraphTab[]
  graphTabVisibility: Record<GraphTab, boolean>
}

// ───────────────────────────── Full backup shape ─────────────────────────────
export interface BackupData {
  user: UserProfile
  meals: Meal[]
  foodLog: FoodEntry[]
  workoutLog: WorkoutSession[]
  cardioLog: CardioEntry[]
  weightLog: WeightEntry[]
  recoveryLog?: RecoveryEntry[]
  exercises: Exercise[]
  routines: Routine[]
  settings: Settings
  uiPrefs: UiPrefs
  exportedAt?: string
  version?: number
}
