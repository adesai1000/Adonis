import { useCallback, useEffect, useRef, useState } from "react"

export const STORAGE_KEYS = {
  user: "wt_user",
  meals: "wt_meals",
  foodLog: "wt_food_log",
  workoutLog: "wt_workout_log",
  cardioLog: "wt_cardio_log",
  weightLog: "wt_weight_log",
  exercises: "wt_exercises",
  routines: "wt_routines",
  settings: "wt_settings",
  activeSession: "wt_active_session",
  uiPrefs: "wt_ui_prefs",
  nav: "wt_nav",
  aiSummary: "wt_ai_summary",
  demoLoaded: "wt_demo_loaded",
  syncCode: "wt_sync_code",
  syncAuto: "wt_sync_auto",
  syncLast: "wt_sync_last",
  syncEvents: "wt_sync_events",
} as const

/** All app-owned keys (used for storage-size estimate + clear). */
export const ALL_STORAGE_KEYS: string[] = Object.values(STORAGE_KEYS)

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota / private mode - ignore */
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** Bytes used by all app keys in localStorage. */
export function storageBytes(): number {
  let total = 0
  for (const key of ALL_STORAGE_KEYS) {
    const v = localStorage.getItem(key)
    if (v != null) total += key.length + v.length
  }
  return total * 2 // UTF-16 code units → bytes (approx)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * State backed by localStorage. Persists on every change and syncs across
 * tabs via the `storage` event. Returns [value, setValue, reset].
 */
export function usePersistentState<T>(
  key: string,
  initial: T | (() => T)
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const initialRef = useRef(initial)
  const [value, setValue] = useState<T>(() => {
    const fallback =
      typeof initialRef.current === "function"
        ? (initialRef.current as () => T)()
        : initialRef.current
    return readJSON<T>(key, fallback)
  })

  // Persist on change
  useEffect(() => {
    writeJSON(key, value)
  }, [key, value])

  // Cross-tab sync
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== key) return
      if (e.newValue == null) return
      try {
        setValue(JSON.parse(e.newValue) as T)
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [key])

  const reset = useCallback(() => {
    const fallback =
      typeof initialRef.current === "function"
        ? (initialRef.current as () => T)()
        : initialRef.current
    setValue(fallback)
    removeKey(key)
  }, [key])

  return [value, setValue, reset]
}

/**
 * Draft form state that survives tab switches, lock/unlock and backgrounding.
 * Same as usePersistentState but with a `clear()` that resets to the initial
 * value (used after a successful submit).
 */
export function useDraft<T>(
  key: string,
  initial: T
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  return usePersistentState<T>(key, initial)
}
