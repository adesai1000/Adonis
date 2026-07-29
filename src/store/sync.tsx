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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { uid } from "@/lib/calc"
import { defaultUser } from "@/lib/seed"
import {
  STORAGE_KEYS,
  readJSON,
  removeKey,
  usePersistentState,
  writeJSON,
} from "@/lib/storage"
import { isAuthConfigured, supabase } from "@/lib/supabase"
import { pullRemote, pushRemote, type SyncBlob } from "@/lib/sync"
import { useAuth } from "./auth"
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

export type SyncMode = "account" | "code" | "off"

// Blocking choice raised instead of silently overwriting a dataset:
// - "first-signin": this device has real local data AND the account already
//   holds a doc (e.g. it was first synced from another device).
// - "owner-mismatch": this device's data last synced with a DIFFERENT
//   account — pushing would leak/copy it into the new account.
type SyncConflict =
  | { kind: "first-signin"; blob: SyncBlob }
  | { kind: "owner-mismatch" }

interface SyncContextValue {
  /** Where sync data goes: signed-in account, legacy sync code, or nowhere. */
  syncMode: SyncMode
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
  /** True once the pull-on-open (account/auto-code) has finished (or is off). */
  initialPullSettled: boolean
}

const SyncContext = createContext<SyncContextValue | null>(null)

export function SyncProvider({ children }: { children: ReactNode }) {
  const store = useStore()
  const { exportAll, importAll, clearAll } = store
  const { session } = useAuth()

  const userId = session?.user.id ?? null
  const accountMode = isAuthConfigured && !!session

  const [code, setCode] = usePersistentState<string>(STORAGE_KEYS.syncCode, "")
  const [auto, setAuto] = usePersistentState<boolean>(STORAGE_KEYS.syncAuto, false)
  const [last, setLast] = usePersistentState<string>(STORAGE_KEYS.syncLast, "")
  const [events, setEvents] = usePersistentState<SyncEvent[]>(
    STORAGE_KEYS.syncEvents,
    []
  )
  const [status, setStatus] = useState<SyncStatus>("idle")
  const [phase, setPhaseState] = useState<SyncPhase>("idle")
  const [initialPullSettled, setInitialPullSettled] = useState(false)
  const [conflict, setConflict] = useState<SyncConflict | null>(null)

  const syncMode: SyncMode = accountMode ? "account" : code ? "code" : "off"

  const pulledRef = useRef(false)
  const skipPushRef = useRef(false)
  const timerRef = useRef<number | undefined>(undefined)
  const phaseTimerRef = useRef<number | undefined>(undefined)
  // Mirrors `conflict` synchronously — pushes can fire before a re-render.
  const conflictRef = useRef<SyncConflict | null>(null)
  const storeRef = useRef(store)
  storeRef.current = store
  // Which remote the debounced auto-push targets — persisted alongside the
  // dirty marker so a pull can tell whether unsent edits belong to it.
  const dirtyTarget =
    accountMode && userId ? `account:${userId}` : code ? `code:${code}` : ""
  const dirtyTargetRef = useRef(dirtyTarget)
  dirtyTargetRef.current = dirtyTarget

  // "Meaningful" = anything beyond the seeded defaults of a fresh install
  // (seeded meals/exercises and default settings don't count).
  const hasMeaningfulLocalData = useCallback((): boolean => {
    const s = storeRef.current
    return (
      s.foodLog.length > 0 ||
      s.workoutLog.length > 0 ||
      s.cardioLog.length > 0 ||
      s.weightLog.length > 0 ||
      s.recoveryLog.length > 0 ||
      s.routines.length > 0 ||
      JSON.stringify(s.user) !== JSON.stringify(defaultUser)
    )
  }, [])

  const raiseConflict = useCallback((next: SyncConflict) => {
    if (!conflictRef.current) {
      conflictRef.current = next
      setConflict(next)
    }
  }, [])

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
    if (accountMode && supabase && userId) {
      // Never upload another account's data: if this device last synced with
      // a different user and still holds real data, make the user choose.
      const owner = readJSON<string | null>(STORAGE_KEYS.syncOwner, null)
      if (owner && owner !== userId && hasMeaningfulLocalData()) {
        raiseConflict({ kind: "owner-mismatch" })
        throw new Error("This device holds data from a different account")
      }
      if (conflictRef.current) {
        throw new Error("Choose which copy to keep before syncing")
      }
      setStatus("syncing")
      setPhase("syncing")
      try {
        const blob: SyncBlob = {
          ...exportAll(),
          updatedAt: new Date().toISOString(),
        }
        const { error } = await supabase.from("user_docs").upsert({
          user_id: userId,
          doc: blob,
          updated_at: new Date().toISOString(),
        })
        if (error) throw new Error(error.message)
        writeJSON(STORAGE_KEYS.syncOwner, userId)
        removeKey(STORAGE_KEYS.syncDirty)
        setLast(new Date().toISOString())
        setStatus("ok")
        setPhase("synced")
        logEvent("push", "Pushed to your account")
      } catch (e) {
        setStatus("error")
        setPhase("error")
        logEvent("error", `Push failed: ${e instanceof Error ? e.message : "error"}`)
        throw e
      }
      return
    }
    if (!code) return
    setStatus("syncing")
    setPhase("syncing")
    try {
      const blob: SyncBlob = {
        ...exportAll(),
        updatedAt: new Date().toISOString(),
      }
      await pushRemote(code, blob)
      removeKey(STORAGE_KEYS.syncDirty)
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
  }, [
    accountMode,
    userId,
    code,
    exportAll,
    setLast,
    setPhase,
    logEvent,
    hasMeaningfulLocalData,
    raiseConflict,
  ])

  // Unsent local edits (debounce window, offline/failed pushes) must reach
  // the cloud before an import overwrites them. Returns false when the flush
  // failed — the caller must then abort the pull.
  const flushDirty = useCallback(async (target: string): Promise<boolean> => {
    if (readJSON<string>(STORAGE_KEYS.syncDirty, "") !== target) return true
    if (timerRef.current) window.clearTimeout(timerRef.current)
    try {
      await pushRef.current()
      return true
    } catch {
      return false
    }
  }, [])

  const pullNow = useCallback(async (): Promise<boolean> => {
    if (accountMode && supabase && userId) {
      setStatus("syncing")
      setPhase("syncing")
      try {
        if (!(await flushDirty(`account:${userId}`))) {
          setStatus("error")
          setPhase("error")
          return false
        }
        const { data, error } = await supabase
          .from("user_docs")
          .select("doc")
          .eq("user_id", userId)
          .maybeSingle()
        if (error) throw new Error(error.message)
        const blob = (data?.doc as SyncBlob | undefined) ?? null
        if (blob) {
          const owner = readJSON<string | null>(STORAGE_KEYS.syncOwner, null)
          if (owner !== userId && hasMeaningfulLocalData()) {
            // Real local data on one side, an account doc on the other —
            // never auto-import; let the user pick which copy survives.
            raiseConflict(
              owner ? { kind: "owner-mismatch" } : { kind: "first-signin", blob }
            )
            setStatus("ok")
            setPhase("synced")
            return true // a doc exists — don't rescue-push over it
          }
          skipPushRef.current = true
          importAll(blob)
          writeJSON(STORAGE_KEYS.syncOwner, userId)
          setLast(new Date().toISOString())
          logEvent("pull", "Pulled latest from your account")
        } else {
          logEvent("info", "Nothing stored in your account yet")
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
    }
    if (!code) return false
    setStatus("syncing")
    setPhase("syncing")
    try {
      if (!(await flushDirty(`code:${code}`))) {
        setStatus("error")
        setPhase("error")
        return false
      }
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
  }, [
    accountMode,
    userId,
    code,
    importAll,
    setLast,
    setPhase,
    logEvent,
    flushDirty,
    hasMeaningfulLocalData,
    raiseConflict,
  ])

  const refresh = useCallback(async () => {
    if (accountMode || code) {
      try {
        await pullNow()
      } catch {
        /* surfaced via phase + audit */
      }
      return
    }
    // Nothing to fetch — show a brief local confirmation.
    setPhase("syncing")
    await new Promise((r) => window.setTimeout(r, 450))
    setPhase("synced")
  }, [accountMode, code, pullNow, setPhase])

  // keep latest fns in refs so the sync effects don't re-fire on every edit
  const pushRef = useRef(pushNow)
  pushRef.current = pushNow
  const pullRef = useRef(pullNow)
  pullRef.current = pullNow

  // Auto-sync is always on in account mode; code mode keeps the opt-in toggle.
  const autoEnabled = accountMode || (auto && !!code)

  // Auto pull on sign-in/open, when sync is enabled or the code changes
  useEffect(() => {
    if (!autoEnabled) {
      pulledRef.current = true
      setInitialPullSettled(true)
      return
    }
    pulledRef.current = false
    setInitialPullSettled(false)
    let cancelled = false
    void (async () => {
      try {
        const applied = await pullRef.current()
        if (!cancelled && !applied) await pushRef.current()
      } catch {
        /* offline / not configured — manual buttons surface errors */
      } finally {
        pulledRef.current = true
        if (!cancelled) setInitialPullSettled(true)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEnabled, accountMode, userId, auto, code])

  // Auto push (debounced) whenever any slice of data changes
  const dataSig = [
    store.user,
    store.meals,
    store.foodLog,
    store.workoutLog,
    store.cardioLog,
    store.weightLog,
    store.recoveryLog,
    store.exercises,
    store.routines,
    store.settings,
    store.uiPrefs,
  ]
  useEffect(() => {
    if (!autoEnabled) return
    if (!pulledRef.current) return
    if (skipPushRef.current) {
      skipPushRef.current = false
      return
    }
    if (timerRef.current) window.clearTimeout(timerRef.current)
    // Persisted so a pull (even after a reload) knows there are unsent edits
    // to flush first; cleared only by a successful push.
    if (dirtyTargetRef.current) {
      writeJSON(STORAGE_KEYS.syncDirty, dirtyTargetRef.current)
    }
    timerRef.current = window.setTimeout(() => {
      void pushRef.current().catch(() => {})
    }, 1500)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEnabled, ...dataSig])

  // Conflict resolution — "keep remote": first sign-in applies the account
  // doc; owner mismatch wipes the previous account's data first, then pulls.
  const resolveKeepRemote = useCallback(() => {
    const current = conflictRef.current
    conflictRef.current = null
    setConflict(null)
    if (!userId) return
    removeKey(STORAGE_KEYS.syncDirty)
    writeJSON(STORAGE_KEYS.syncOwner, userId)
    if (current?.kind === "first-signin") {
      skipPushRef.current = true
      importAll(current.blob)
      setLast(new Date().toISOString())
      logEvent("pull", "Applied your account's copy")
    } else {
      skipPushRef.current = true
      clearAll()
      logEvent("info", "Cleared the previous account's data from this device")
      void pullRef.current().catch(() => {})
    }
  }, [userId, importAll, clearAll, setLast, logEvent])

  // "Keep local": adopt this device's data into the signed-in account.
  const resolveKeepLocal = useCallback(() => {
    conflictRef.current = null
    setConflict(null)
    if (!userId) return
    writeJSON(STORAGE_KEYS.syncOwner, userId)
    void pushRef.current().catch(() => {})
  }, [userId])

  const value = useMemo<SyncContextValue>(
    () => ({
      syncMode,
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
      initialPullSettled,
    }),
    [
      syncMode,
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
      initialPullSettled,
    ]
  )

  const ownerMismatch = conflict?.kind === "owner-mismatch"

  return (
    <SyncContext.Provider value={value}>
      {children}
      <AlertDialog open={conflict !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ownerMismatch
                ? "This device has another account's data"
                : "Use your account copy?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {ownerMismatch
                ? "The data on this device was last synced with a different account. Replace it with this account's copy, or keep it and back it up to this account instead."
                : "This account already has data backed up, and this device has its own local data. Pick which copy to keep — the other one is replaced."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={resolveKeepLocal}>
              {ownerMismatch
                ? "Keep it in this account"
                : "Keep this device's data"}
            </AlertDialogCancel>
            <AlertDialogAction onClick={resolveKeepRemote}>
              {ownerMismatch
                ? "Replace with this account's data"
                : "Use account copy"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SyncContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error("useSync must be used within <SyncProvider>")
  return ctx
}
