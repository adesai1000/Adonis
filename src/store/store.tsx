import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react"
import { uid } from "@/lib/calc"
import {
  STORAGE_KEYS,
  storageBytes as computeStorageBytes,
  removeKey,
  usePersistentState,
} from "@/lib/storage"
import {
  defaultSettings,
  defaultUiPrefs,
  defaultUser,
  seedExercises,
  seedMeals,
} from "@/lib/seed"
import { generateDemoData } from "@/lib/demo"
import type {
  ActiveSession,
  BackupData,
  CardKey,
  CardioEntry,
  DataSource,
  Exercise,
  FoodEntry,
  GraphTab,
  IntegrationSyncResult,
  Meal,
  RecoveryEntry,
  Routine,
  Settings,
  UiPrefs,
  UserProfile,
  WeightEntry,
  WorkoutSession,
} from "@/lib/types"

const ALL_CARD_KEYS = defaultUiPrefs.cardOrder as CardKey[]
const ALL_GRAPH_TABS = defaultUiPrefs.graphTabOrder as GraphTab[]

/**
 * Pure, idempotent upsert-by-key of imported entries into a list. Returns the
 * SAME `list` reference when nothing changed (React bails out of the update).
 * Used inside functional setState updaters, so it must be side-effect free:
 * two providers can sync concurrently and each updater re-runs against the
 * latest state instead of a stale render snapshot.
 */
function mergeListPure<T>(
  list: T[],
  incoming: T[],
  keyOf: (entry: T) => string | null
): T[] {
  let next: T[] | null = null
  const index = new Map<string, number>()
  list.forEach((entry, i) => {
    const k = keyOf(entry)
    if (k) index.set(k, i)
  })
  for (const entry of incoming) {
    const k = keyOf(entry)
    if (!k) continue
    const at = index.get(k)
    if (at === undefined) {
      next = next ?? [...list]
      index.set(k, next.length)
      next.push(entry)
    } else if (JSON.stringify((next ?? list)[at]) !== JSON.stringify(entry)) {
      next = next ?? [...list]
      next[at] = entry
    }
  }
  return next ?? list
}

/** Ensure stored prefs include every card/graph key (forward-compatible migration). */
function normalizeUiPrefs(p: UiPrefs): UiPrefs {
  const cardOrder = [
    ...p.cardOrder.filter((k) => ALL_CARD_KEYS.includes(k)),
    ...ALL_CARD_KEYS.filter((k) => !p.cardOrder.includes(k)),
  ]
  const cardVisibility = { ...defaultUiPrefs.cardVisibility }
  for (const k of ALL_CARD_KEYS) {
    if (p.cardVisibility[k] !== undefined) cardVisibility[k] = p.cardVisibility[k]
  }
  const graphTabOrder = [
    ...p.graphTabOrder.filter((t) => ALL_GRAPH_TABS.includes(t)),
    ...ALL_GRAPH_TABS.filter((t) => !p.graphTabOrder.includes(t)),
  ]
  const graphTabVisibility = { ...defaultUiPrefs.graphTabVisibility }
  for (const t of ALL_GRAPH_TABS) {
    if (p.graphTabVisibility[t] !== undefined)
      graphTabVisibility[t] = p.graphTabVisibility[t]
  }
  return { cardOrder, cardVisibility, graphTabOrder, graphTabVisibility }
}

export interface Store {
  // ── data ──
  user: UserProfile
  meals: Meal[]
  foodLog: FoodEntry[]
  workoutLog: WorkoutSession[]
  cardioLog: CardioEntry[]
  weightLog: WeightEntry[]
  recoveryLog: RecoveryEntry[]
  exercises: Exercise[]
  routines: Routine[]
  settings: Settings
  uiPrefs: UiPrefs
  activeSession: ActiveSession | null

  // ── user ──
  updateUser: (patch: Partial<UserProfile>) => void

  // ── meals ──
  addMeal: (data: Omit<Meal, "id">) => string
  updateMeal: (id: string, patch: Partial<Meal>) => void
  deleteMeal: (id: string) => void

  // ── food log ──
  addFood: (data: Omit<FoodEntry, "id">) => string
  deleteFood: (id: string) => void

  // ── workout log ──
  addWorkout: (data: Omit<WorkoutSession, "id">) => string
  deleteWorkout: (id: string) => void

  // ── cardio log ──
  addCardio: (data: Omit<CardioEntry, "id">) => string
  deleteCardio: (id: string) => void

  // ── weight log ──
  addWeight: (data: Omit<WeightEntry, "id">) => string
  deleteWeight: (id: string) => void

  // ── recovery log ──
  addRecovery: (data: Omit<RecoveryEntry, "id">) => string
  deleteRecovery: (id: string) => void
  mergeIntegrationData: (
    result: IntegrationSyncResult
  ) => { added: number; updated: number }

  // ── exercises ──
  addExercise: (data: Omit<Exercise, "id" | "builtIn">) => string
  deleteExercise: (id: string) => void

  // ── routines ──
  addRoutine: (data: Omit<Routine, "id">) => string
  updateRoutine: (id: string, patch: Partial<Routine>) => void
  deleteRoutine: (id: string) => void

  // ── settings ──
  updateSettings: (patch: Partial<Settings>) => void

  // ── ui prefs ──
  updateUiPrefs: (patch: Partial<UiPrefs>) => void

  // ── active session (crash-recoverable) ──
  setActiveSession: React.Dispatch<React.SetStateAction<ActiveSession | null>>
  clearActiveSession: () => void

  // ── data management ──
  exportAll: () => BackupData
  importAll: (data: Partial<BackupData>) => void
  clearAll: () => void
  loadDemoData: () => void
  storageBytes: () => number
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = usePersistentState<UserProfile>(
    STORAGE_KEYS.user,
    defaultUser
  )
  const [meals, setMeals] = usePersistentState<Meal[]>(
    STORAGE_KEYS.meals,
    seedMeals
  )
  const [foodLog, setFoodLog] = usePersistentState<FoodEntry[]>(
    STORAGE_KEYS.foodLog,
    []
  )
  const [workoutLog, setWorkoutLog] = usePersistentState<WorkoutSession[]>(
    STORAGE_KEYS.workoutLog,
    []
  )
  const [cardioLog, setCardioLog] = usePersistentState<CardioEntry[]>(
    STORAGE_KEYS.cardioLog,
    []
  )
  const [weightLog, setWeightLog] = usePersistentState<WeightEntry[]>(
    STORAGE_KEYS.weightLog,
    []
  )
  const [recoveryLog, setRecoveryLog] = usePersistentState<RecoveryEntry[]>(
    STORAGE_KEYS.recoveryLog,
    []
  )
  const [exercises, setExercises] = usePersistentState<Exercise[]>(
    STORAGE_KEYS.exercises,
    seedExercises
  )
  const [routines, setRoutines] = usePersistentState<Routine[]>(
    STORAGE_KEYS.routines,
    []
  )
  const [settings, setSettings] = usePersistentState<Settings>(
    STORAGE_KEYS.settings,
    defaultSettings
  )
  const [uiPrefs, setUiPrefs] = usePersistentState<UiPrefs>(
    STORAGE_KEYS.uiPrefs,
    defaultUiPrefs
  )
  const [activeSession, setActiveSession] =
    usePersistentState<ActiveSession | null>(STORAGE_KEYS.activeSession, null)

  // ── user ──
  const updateUser = useCallback(
    (patch: Partial<UserProfile>) => setUser((u) => ({ ...u, ...patch })),
    [setUser]
  )

  // ── meals ──
  const addMeal = useCallback(
    (data: Omit<Meal, "id">) => {
      const id = uid()
      setMeals((m) => [...m, { ...data, id }])
      return id
    },
    [setMeals]
  )
  const updateMeal = useCallback(
    (id: string, patch: Partial<Meal>) =>
      setMeals((m) => m.map((x) => (x.id === id ? { ...x, ...patch } : x))),
    [setMeals]
  )
  const deleteMeal = useCallback(
    (id: string) => setMeals((m) => m.filter((x) => x.id !== id)),
    [setMeals]
  )

  // ── food log ──
  const addFood = useCallback(
    (data: Omit<FoodEntry, "id">) => {
      const id = uid()
      setFoodLog((l) => [...l, { ...data, id }])
      return id
    },
    [setFoodLog]
  )
  const deleteFood = useCallback(
    (id: string) => setFoodLog((l) => l.filter((x) => x.id !== id)),
    [setFoodLog]
  )

  // ── workout log ──
  const addWorkout = useCallback(
    (data: Omit<WorkoutSession, "id">) => {
      const id = uid()
      setWorkoutLog((l) => [...l, { ...data, id }])
      return id
    },
    [setWorkoutLog]
  )
  const deleteWorkout = useCallback(
    (id: string) => setWorkoutLog((l) => l.filter((x) => x.id !== id)),
    [setWorkoutLog]
  )

  // ── cardio log ──
  const addCardio = useCallback(
    (data: Omit<CardioEntry, "id">) => {
      const id = uid()
      setCardioLog((l) => [...l, { ...data, id }])
      return id
    },
    [setCardioLog]
  )
  const deleteCardio = useCallback(
    (id: string) => setCardioLog((l) => l.filter((x) => x.id !== id)),
    [setCardioLog]
  )

  // ── weight log ──
  const addWeight = useCallback(
    (data: Omit<WeightEntry, "id">) => {
      const id = uid()
      setWeightLog((l) => [...l, { ...data, id }])
      return id
    },
    [setWeightLog]
  )
  const deleteWeight = useCallback(
    (id: string) => setWeightLog((l) => l.filter((x) => x.id !== id)),
    [setWeightLog]
  )

  // ── recovery log ──
  const addRecovery = useCallback(
    (data: Omit<RecoveryEntry, "id">) => {
      const id = uid()
      setRecoveryLog((l) => [...l, { ...data, id }])
      return id
    },
    [setRecoveryLog]
  )
  const deleteRecovery = useCallback(
    (id: string) => setRecoveryLog((l) => l.filter((x) => x.id !== id)),
    [setRecoveryLog]
  )

  const mergeIntegrationData = useCallback(
    (result: IntegrationSyncResult): { added: number; updated: number } => {
      // Counts (toast only) come from a synchronous pre-pass against this
      // render's lists — React runs the updaters below later, and StrictMode
      // double-invokes them, so they must stay pure and count nothing.
      let added = 0
      let updated = 0
      function count<T extends { source?: DataSource }>(
        list: T[],
        incoming: T[],
        keyOf: (entry: T) => string | null
      ): void {
        const existing = new Map<string, T>()
        for (const entry of list) {
          const k = keyOf(entry)
          if (k) existing.set(k, entry)
        }
        for (const entry of incoming) {
          const k = keyOf(entry)
          if (!k) continue
          const prev = existing.get(k)
          if (prev === undefined) added += 1
          else if (JSON.stringify(prev) !== JSON.stringify(entry)) updated += 1
        }
      }

      const recoveryKey = (e: RecoveryEntry) =>
        e.source && e.source !== "manual" ? `${e.source}|${e.date}` : null
      const cardioKey = (e: CardioEntry) =>
        e.source && e.source !== "manual" && e.externalId
          ? `${e.source}|${e.externalId}`
          : null
      const weightKey = (e: WeightEntry) =>
        e.source && e.source !== "manual" && e.externalId
          ? `${e.source}|${e.externalId}`
          : null

      count(recoveryLog, result.recovery, recoveryKey)
      count(cardioLog, result.cardio, cardioKey)
      count(weightLog, result.weights, weightKey)

      // Functional updates: concurrent provider syncs (e.g. the post-connect
      // auto-sync racing a manual "Sync now") each merge into the latest
      // state instead of overwriting each other's imports.
      setRecoveryLog((prev) => mergeListPure(prev, result.recovery, recoveryKey))
      setCardioLog((prev) => mergeListPure(prev, result.cardio, cardioKey))
      setWeightLog((prev) => mergeListPure(prev, result.weights, weightKey))

      return { added, updated }
    },
    [recoveryLog, cardioLog, weightLog, setRecoveryLog, setCardioLog, setWeightLog]
  )

  // ── exercises ──
  const addExercise = useCallback(
    (data: Omit<Exercise, "id" | "builtIn">) => {
      const id = uid()
      setExercises((l) => [...l, { ...data, id, builtIn: false }])
      return id
    },
    [setExercises]
  )
  const deleteExercise = useCallback(
    (id: string) => setExercises((l) => l.filter((x) => x.id !== id)),
    [setExercises]
  )

  // ── routines ──
  const addRoutine = useCallback(
    (data: Omit<Routine, "id">) => {
      const id = uid()
      setRoutines((l) => [...l, { ...data, id }])
      return id
    },
    [setRoutines]
  )
  const updateRoutine = useCallback(
    (id: string, patch: Partial<Routine>) =>
      setRoutines((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x))),
    [setRoutines]
  )
  const deleteRoutine = useCallback(
    (id: string) => setRoutines((l) => l.filter((x) => x.id !== id)),
    [setRoutines]
  )

  // ── settings & prefs ──
  const updateSettings = useCallback(
    (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })),
    [setSettings]
  )
  const updateUiPrefs = useCallback(
    (patch: Partial<UiPrefs>) => setUiPrefs((p) => ({ ...p, ...patch })),
    [setUiPrefs]
  )

  // ── active session ──
  const clearActiveSession = useCallback(
    () => setActiveSession(null),
    [setActiveSession]
  )

  // ── data management ──
  const exportAll = useCallback(
    (): BackupData => ({
      user,
      meals,
      foodLog,
      workoutLog,
      cardioLog,
      weightLog,
      recoveryLog,
      exercises,
      routines,
      settings,
      uiPrefs,
      exportedAt: new Date().toISOString(),
      version: 1,
    }),
    [
      user,
      meals,
      foodLog,
      workoutLog,
      cardioLog,
      weightLog,
      recoveryLog,
      exercises,
      routines,
      settings,
      uiPrefs,
    ]
  )

  const importAll = useCallback(
    (data: Partial<BackupData>) => {
      if (data.user) setUser(data.user)
      if (data.meals) setMeals(data.meals)
      if (data.foodLog) setFoodLog(data.foodLog)
      if (data.workoutLog) setWorkoutLog(data.workoutLog)
      if (data.cardioLog) setCardioLog(data.cardioLog)
      if (data.weightLog) setWeightLog(data.weightLog)
      if (data.recoveryLog) setRecoveryLog(data.recoveryLog)
      if (data.exercises) setExercises(data.exercises)
      if (data.routines) setRoutines(data.routines)
      if (data.settings) setSettings({ ...defaultSettings, ...data.settings })
      if (data.uiPrefs)
        setUiPrefs(normalizeUiPrefs({ ...defaultUiPrefs, ...data.uiPrefs }))
    },
    [
      setUser,
      setMeals,
      setFoodLog,
      setWorkoutLog,
      setCardioLog,
      setWeightLog,
      setRecoveryLog,
      setExercises,
      setRoutines,
      setSettings,
      setUiPrefs,
    ]
  )

  const clearAll = useCallback(() => {
    setUser(defaultUser)
    setMeals(seedMeals())
    setFoodLog([])
    setWorkoutLog([])
    setCardioLog([])
    setWeightLog([])
    setRecoveryLog([])
    setExercises(seedExercises())
    setRoutines([])
    setSettings(defaultSettings)
    setUiPrefs(defaultUiPrefs)
    setActiveSession(null)
    // wipe any leftover draft + nav keys
    try {
      const toRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && (k.startsWith("wt_draft_") || k === STORAGE_KEYS.nav)) {
          toRemove.push(k)
        }
      }
      toRemove.forEach(removeKey)
      removeKey(STORAGE_KEYS.aiSummary)
    } catch {
      /* ignore */
    }
  }, [
    setUser,
    setMeals,
    setFoodLog,
    setWorkoutLog,
    setCardioLog,
    setWeightLog,
    setRecoveryLog,
    setExercises,
    setRoutines,
    setSettings,
    setUiPrefs,
    setActiveSession,
  ])

  const loadDemoData = useCallback(() => {
    const demo = generateDemoData()
    setFoodLog(demo.foodLog)
    setWorkoutLog(demo.workoutLog)
    setCardioLog(demo.cardioLog)
    setWeightLog(demo.weightLog)
    setRoutines((prev) => {
      const names = new Set(prev.map((r) => r.name))
      return [...prev, ...demo.routines.filter((r) => !names.has(r.name))]
    })
    // sample data is in US units; align settings so everything reads correctly
    setSettings((s) => ({ ...s, weightUnit: "lbs", distanceUnit: "miles" }))
  }, [setFoodLog, setWorkoutLog, setCardioLog, setWeightLog, setRoutines, setSettings])

  // One-time migration: make sure prefs include any newly-added card/graph keys.
  useEffect(() => {
    setUiPrefs((p) => normalizeUiPrefs(p))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = useMemo<Store>(
    () => ({
      user,
      meals,
      foodLog,
      workoutLog,
      cardioLog,
      weightLog,
      recoveryLog,
      exercises,
      routines,
      settings,
      uiPrefs,
      activeSession,
      updateUser,
      addMeal,
      updateMeal,
      deleteMeal,
      addFood,
      deleteFood,
      addWorkout,
      deleteWorkout,
      addCardio,
      deleteCardio,
      addWeight,
      deleteWeight,
      addRecovery,
      deleteRecovery,
      mergeIntegrationData,
      addExercise,
      deleteExercise,
      addRoutine,
      updateRoutine,
      deleteRoutine,
      updateSettings,
      updateUiPrefs,
      setActiveSession,
      clearActiveSession,
      exportAll,
      importAll,
      clearAll,
      loadDemoData,
      storageBytes: computeStorageBytes,
    }),
    [
      user,
      meals,
      foodLog,
      workoutLog,
      cardioLog,
      weightLog,
      recoveryLog,
      exercises,
      routines,
      settings,
      uiPrefs,
      activeSession,
      updateUser,
      addMeal,
      updateMeal,
      deleteMeal,
      addFood,
      deleteFood,
      addWorkout,
      deleteWorkout,
      addCardio,
      deleteCardio,
      addWeight,
      deleteWeight,
      addRecovery,
      deleteRecovery,
      mergeIntegrationData,
      addExercise,
      deleteExercise,
      addRoutine,
      updateRoutine,
      deleteRoutine,
      updateSettings,
      updateUiPrefs,
      setActiveSession,
      clearActiveSession,
      exportAll,
      importAll,
      clearAll,
      loadDemoData,
    ]
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore(): Store {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error("useStore must be used within <StoreProvider>")
  return ctx
}
