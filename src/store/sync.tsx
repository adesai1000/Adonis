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
import { uid } from "@/lib/calc"
import { STORAGE_KEYS, usePersistentState } from "@/lib/storage"
import { pullRemote, pushRemote, type SyncBlob } from "@/lib/sync"
import { useStore } from "./store"

export type SyncStatus = "idle" | "syncing" | "ok" | "error"
/** Transient UI phase for the sync indicator (auto-reverts to idle). */
export type SyncPhase = "idle" | "syncing" | "synced" | "error"

export type SyncEventKind = "push" | "pull" | "info" | "error"
export interface SyncEvent {
  id: string
  at: string
  kind: SyncEventKind
  message: string
}

interface SyncContextValue {
  code: string
  setCode: (c: string) => void
  auto: boolean
  setAuto: (a: boolean) => void
  last: string
  status: SyncStatus
  /** Transient phase used by the header chip / pull-to-refresh indicator. */
  phase: SyncPhase
  events: SyncEvent[]
  clearEvents: () => void
  /** Upload current state. Resolves on success, throws on failure. */
  pushNow: () => Promise<void>
  /** Download + apply remote state. Returns true if remote data was applied. */
  pullNow: () => Promise<boolean>
  /** Pull-to-refresh: re-pull from cloud (or a local confirm when no code). */
  refresh: () => Promise<void>
}

const SyncContext = createContext<SyncContextValue | null>(null)

export function SyncProvider({ children }: { children: ReactNode }) {
  const store = useStore()
  const { exportAll, importAll } = store

  const [code, setCode] = usePersistentState<string>(STORAGE_KEYS.syncCode, "")
  const [auto, setAuto] = usePersistentState<boolean>(STORAGE_KEYS.syncAuto, false)
  const [last, setLast] = usePersistentState<string>(STORAGE_KEYS.syncLast, "")
  const [events, setEvents] = usePersistentState<SyncEvent[]>(
    STORAGE_KEYS.syncEvents,
    []
  )
  const [status, setStatus] = useState<SyncStatus>("idle")
  const [phase, setPhaseState] = useState<SyncPhase>("idle")

  const pulledRef = useRef(false)
  const skipPushRef = useRef(false)
  const timerRef = useRef<number | undefined>(undefined)
  const phaseTimerRef = useRef<number | undefined>(undefined)

  const logEvent = useCallback(
    (kind: SyncEventKind, message: string) => {
      setEvents((prev) =>
        [
          { id: uid(), at: new Date().toISOString(), kind, message },
          ...prev,
        ].slice(0, 60)
      )
    },
    [setEvents]
  )

  const clearEvents = useCallback(() => setEvents([]), [setEvents])

  // Transient phase that auto-reverts to idle so the indicator fades away.
  const setPhase = useCallback((p: SyncPhase) => {
    if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current)
    setPhaseState(p)
    if (p === "synced") {
      phaseTimerRef.current = window.setTimeout(() => setPhaseState("idle"), 1800)
    } else if (p === "error") {
      phaseTimerRef.current = window.setTimeout(() => setPhaseState("idle"), 4000)
    }
  }, [])

  const pushNow = useCallback(async () => {
    if (!code) return
    setStatus("syncing")
    setPhase("syncing")
    try {
      const blob: SyncBlob = {
        ...exportAll(),
        updatedAt: new Date().toISOString(),
      }
      await pushRemote(code, blob)
      setLast(new Date().toISOString())
      setStatus("ok")
      setPhase("synced")
      logEvent("push", "Pushed changes to cloud")
    } catch (e) {
      setStatus("error")
      setPhase("error")
      logEvent("error", `Push failed: ${e instanceof Error ? e.message : "error"}`)
      throw e
    }
  }, [code, exportAll, setLast, setPhase, logEvent])

  const pullNow = useCallback(async (): Promise<boolean> => {
    if (!code) return false
    setStatus("syncing")
    setPhase("syncing")
    try {
      const blob = await pullRemote(code)
      if (blob) {
        skipPushRef.current = true
        importAll(blob)
        setLast(new Date().toISOString())
        logEvent("pull", "Pulled latest from cloud")
      } else {
        logEvent("info", "Nothing stored under this code yet")
      }
      setStatus("ok")
      setPhase("synced")
      return !!blob
    } catch (e) {
      setStatus("error")
      setPhase("error")
      logEvent("error", `Pull failed: ${e instanceof Error ? e.message : "error"}`)
      throw e
    }
  }, [code, importAll, setLast, setPhase, logEvent])

  const refresh = useCallback(async () => {
    if (code) {
      try {
        await pullNow()
      } catch {
        /* surfaced via phase + audit */
      }
      return
    }
    // No sync code — nothing to fetch; show a brief local confirmation.
    setPhase("syncing")
    await new Promise((r) => window.setTimeout(r, 450))
    setPhase("synced")
  }, [code, pullNow, setPhase])

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
    () => ({
      code,
      setCode,
      auto,
      setAuto,
      last,
      status,
      phase,
      events,
      clearEvents,
      pushNow,
      pullNow,
      refresh,
    }),
    [
      code,
      setCode,
      auto,
      setAuto,
      last,
      status,
      phase,
      events,
      clearEvents,
      pushNow,
      pullNow,
      refresh,
    ]
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error("useSync must be used within <SyncProvider>")
  return ctx
}
