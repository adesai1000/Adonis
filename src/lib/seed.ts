import type {
  Exercise,
  Meal,
  Settings,
  UiPrefs,
  UserProfile,
} from "./types"

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

// ───────────────────────────── Exercises ─────────────────────────────
const EXERCISE_GROUPS: Record<string, string[]> = {
  Chest: [
    "Bench Press (Flat)",
    "Bench Press (Incline)",
    "Bench Press (Decline)",
    "Push-Ups",
    "Wide Push-Ups",
    "Diamond Push-Ups",
    "Dumbbell Fly",
    "Cable Fly (Low)",
    "Cable Fly (High)",
    "Machine Chest Press",
    "Machine Fly (Pec Deck)",
    "Chest Dip",
    "Landmine Press",
    "Svend Press",
  ],
  Back: [
    "Deadlift",
    "Romanian Deadlift",
    "Sumo Deadlift",
    "Pull-Ups",
    "Chin-Ups",
    "Neutral Grip Pull-Ups",
    "Lat Pulldown (Wide)",
    "Lat Pulldown (Close)",
    "Seated Cable Row",
    "Bent-Over Row (Barbell)",
    "Bent-Over Row (Dumbbell)",
    "Single Arm Dumbbell Row",
    "T-Bar Row",
    "Chest Supported Row",
    "Inverted Row",
    "Face Pull",
    "Straight Arm Pulldown",
    "Good Morning",
    "Hyperextension",
    "Shrugs (Barbell)",
    "Shrugs (Dumbbell)",
  ],
  Shoulders: [
    "Overhead Press (Barbell)",
    "Overhead Press (Dumbbell)",
    "Seated Dumbbell Press",
    "Arnold Press",
    "Lateral Raise (Dumbbell)",
    "Lateral Raise (Cable)",
    "Front Raise (Dumbbell)",
    "Front Raise (Barbell)",
    "Upright Row",
    "Rear Delt Fly (Dumbbell)",
    "Rear Delt Fly (Machine)",
    "Cable Rear Delt Fly",
    "Landmine Lateral Raise",
    "Bradford Press",
  ],
  Biceps: [
    "Barbell Curl",
    "EZ Bar Curl",
    "Dumbbell Curl (Alternating)",
    "Dumbbell Curl (Both)",
    "Hammer Curl",
    "Preacher Curl (Barbell)",
    "Preacher Curl (Dumbbell)",
    "Cable Curl",
    "Concentration Curl",
    "Incline Dumbbell Curl",
    "Spider Curl",
    "Reverse Curl",
    "Zottman Curl",
  ],
  Triceps: [
    "Tricep Pushdown (Rope)",
    "Tricep Pushdown (Bar)",
    "Skull Crushers (EZ Bar)",
    "Skull Crushers (Dumbbell)",
    "Overhead Tricep Extension (Cable)",
    "Overhead Tricep Extension (Dumbbell)",
    "Close-Grip Bench Press",
    "Tricep Dips",
    "Tricep Kickback",
    "Diamond Push-Ups",
    "Tate Press",
  ],
  Legs: [
    "Back Squat",
    "Front Squat",
    "Goblet Squat",
    "Bulgarian Split Squat",
    "Leg Press",
    "Hack Squat",
    "Romanian Deadlift",
    "Leg Curl (Lying)",
    "Leg Curl (Seated)",
    "Leg Extension",
    "Calf Raise (Standing)",
    "Calf Raise (Seated)",
    "Calf Raise (Leg Press)",
    "Hip Thrust (Barbell)",
    "Hip Thrust (Machine)",
    "Glute Bridge",
    "Lunges (Walking)",
    "Lunges (Reverse)",
    "Lateral Lunges",
    "Step-Ups",
    "Nordic Curl",
    "Sumo Squat",
    "Leg Abduction",
    "Leg Adduction",
    "Box Jump",
    "Wall Sit",
  ],
  Core: [
    "Plank",
    "Side Plank",
    "Crunches",
    "Bicycle Crunches",
    "Reverse Crunch",
    "Hanging Leg Raise",
    "Hanging Knee Raise",
    "Cable Crunch",
    "Ab Wheel Rollout",
    "Russian Twist",
    "Dragon Flag",
    "Hollow Body Hold",
    "V-Ups",
    "Dead Bug",
    "Mountain Climbers",
    "Toe Touches",
    "Flutter Kicks",
    "L-Sit",
  ],
  "Compound / Olympic": [
    "Clean and Jerk",
    "Snatch",
    "Power Clean",
    "Hang Clean",
    "Push Press",
    "Farmer's Carry",
    "Suitcase Carry",
    "Trap Bar Deadlift",
    "Zercher Squat",
    "Overhead Squat",
    "Turkish Get-Up",
    "Kettlebell Swing",
    "Kettlebell Clean",
    "Kettlebell Snatch",
  ],
  "Cardio Machines": [
    "Treadmill",
    "Stationary Bike",
    "Assault Bike",
    "Rowing Machine",
    "Ski Erg",
    "Stair Climber",
    "Elliptical",
  ],
}

export function seedExercises(): Exercise[] {
  const seen = new Set<string>()
  const out: Exercise[] = []
  for (const [group, names] of Object.entries(EXERCISE_GROUPS)) {
    for (const name of names) {
      const key = name.toLowerCase()
      if (seen.has(key)) continue // dedupe shared movements (first group wins)
      seen.add(key)
      out.push({
        id: `ex_${slug(name)}`,
        name,
        muscleGroup: group,
        builtIn: true,
      })
    }
  }
  return out
}

// ───────────────────────────── Meals ─────────────────────────────
const MEAL_SEED: Omit<Meal, "id" | "builtIn">[] = [
  { name: "Oatmeal", serving: "100g", calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9 },
  { name: "Grilled Chicken Breast", serving: "150g", calories: 248, protein: 46.5, carbs: 0, fat: 5.4 },
  { name: "Whey Protein Shake", serving: "1 scoop", calories: 120, protein: 24, carbs: 3, fat: 1.5 },
  { name: "Brown Rice", serving: "100g cooked", calories: 123, protein: 2.7, carbs: 25.6, fat: 1 },
  { name: "Scrambled Eggs", serving: "2 eggs", calories: 182, protein: 12.6, carbs: 1.6, fat: 13.6 },
  { name: "Greek Yogurt", serving: "170g", calories: 100, protein: 17, carbs: 6, fat: 0.7 },
  { name: "Avocado", serving: "½ medium", calories: 161, protein: 2, carbs: 8.5, fat: 14.7 },
  { name: "Sweet Potato", serving: "1 medium", calories: 112, protein: 2, carbs: 26.2, fat: 0.1 },
  { name: "Banana", serving: "1 medium", calories: 105, protein: 1.3, carbs: 27, fat: 0.4 },
  { name: "Whole Milk", serving: "250ml", calories: 153, protein: 8, carbs: 12, fat: 8 },
  { name: "Almonds", serving: "30g", calories: 173, protein: 6.3, carbs: 6.1, fat: 14.9 },
  { name: "Salmon Fillet", serving: "150g", calories: 280, protein: 34, carbs: 0, fat: 16 },
]

export function seedMeals(): Meal[] {
  return MEAL_SEED.map((m) => ({ ...m, id: `meal_${slug(m.name)}`, builtIn: true }))
}

// ───────────────────────────── Defaults ─────────────────────────────
export const defaultUser: UserProfile = { theme: "system" }

export const defaultSettings: Settings = {
  calorieGoal: 2400,
  proteinGoal: 180,
  carbsGoal: 250,
  fatGoal: 80,
  goalWeight: 180,
  goalWeightDate: "",
  heightInches: 70,
  weightUnit: "lbs",
  distanceUnit: "miles",
  trendRange: 7,
}

export const defaultUiPrefs: UiPrefs = {
  cardOrder: [
    "calories",
    "protein",
    "volume",
    "bodyweight",
    "reps",
    "carbs",
    "fat",
    "cardio",
  ],
  cardVisibility: {
    calories: true,
    protein: true,
    volume: true,
    bodyweight: true,
    reps: false,
    carbs: false,
    fat: false,
    cardio: false,
  },
  graphTabOrder: ["bodyweight", "calories", "protein"],
  graphTabVisibility: { bodyweight: true, calories: true, protein: true },
}
