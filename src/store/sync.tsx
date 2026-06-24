import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { STORAGE_KEYS, usePersistentState } from "@/lib/storage"
import { pullRemote, pushRemote, type SyncBlob } from "@/lib/sync"
import { useStore } from "./store"

export type SyncStatus = "idle" | "syncing" | "ok" | "error"

interface SyncContextValue {
  code: string
  setCode: (c: string) => void
  auto: boolean
  setAuto: (a: boolean) => void
  last: string
  status: SyncStatus
  /** Upload current state. Resolves on success, throws on failure. */
  pushNow: () => Promise<void>
  /** Download + apply remote state. Returns true if remote data was applied. */
  pullNow: () => Promise<boolean>
}

const SyncContext = createContext<SyncContextValue | null>(null)

export function SyncProvider({ children }: { children: ReactNode }) {
  const store = useStore()
  const { exportAll, importAll } = store

  const [code, setCode] = usePersistentState<string>(STORAGE_KEYS.syncCode, "")
  const [auto, setAuto] = usePersistentState<boolean>(STORAGE_KEYS.syncAuto, false)
  const [last, setLast] = usePersistentState<string>(STORAGE_KEYS.syncLast, "")
  const [status, setStatus] = useState<SyncStatus>("idle")

  const pulledRef = useRef(false)
  const skipPushRef = useRef(false)
  const timerRef = useRef<number | undefined>(undefined)

  const pushNow = useCallback(async () => {
    if (!code) return
    setStatus("syncing")
    try {
      const blob: SyncBlob = {
        ...exportAll(),
        updatedAt: new Date().toISOString(),
      }
      await pushRemote(code, blob)
      setLast(new Date().toISOString())
      setStatus("ok")
    } catch (e) {
      setStatus("error")
      throw e
    }
  }, [code, exportAll, setLast])

  const pullNow = useCallback(async (): Promise<boolean> => {
    if (!code) return false
    setStatus("syncing")
    try {
      const blob = await pullRemote(code)
      if (blob) {
        skipPushRef.current = true
        importAll(blob)
        setLast(new Date().toISOString())
      }
      setStatus("ok")
      return !!blob
    } catch (e) {
      setStatus("error")
      throw e
    }
  }, [code, importAll, setLast])

  // keep latest fns in refs so the sync effects don't re-fire on every edit
  const pushRef = useRef(pushNow)
  pushRef.current = pushNow
  const pullRef = useRef(pullNow)
  pullRef.current = pullNow

  // Auto pull when sync is enabled or the code changes
  useEffect(() => {
    if (!auto || !code) {
      pulledRef.current = true
      return
    }
    pulledRef.current = false
    let cancelled = false
    void (async () => {
      try {
        const applied = await pullRef.current()
        // nothing stored yet under this code → seed remote with our state
        if (!cancelled && !applied) await pushRef.current()
      } catch {
        /* offline / not configured — manual buttons surface errors */
      } finally {
        pulledRef.current = true
      }
    })()
    return () => {
      cancelled = true
    }
  }, [auto, code])

  // Auto push (debounced) whenever any slice of data changes
  const dataSig = [
    store.user,
    store.meals,
    store.foodLog,
    store.workoutLog,
    store.cardioLog,
    store.weightLog,
    store.exercises,
    store.routines,
    store.settings,
    store.uiPrefs,
  ]
  useEffect(() => {
    if (!auto || !code) return
    if (!pulledRef.current) return
    if (skipPushRef.current) {
      skipPushRef.current = false
      return
    }
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      void pushRef.current().catch(() => {})
    }, 1500)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, code, ...dataSig])

  const value = useMemo<SyncContextValue>(
    () => ({ code, setCode, auto, setAuto, last, status, pushNow, pullNow }),
    [code, setCode, auto, setAuto, last, status, pushNow, pullNow]
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error("useSync must be used within <SyncProvider>")
  return ctx
}
