import { createContext, useCallback, useContext, type ReactNode } from "react"
import { STORAGE_KEYS, usePersistentState } from "@/lib/storage"

export type Section = "home" | "log" | "meals" | "history" | "weight" | "settings"
export type LogTab = "food" | "workout" | "cardio" | "weight"

interface NavState {
  section: Section
  logTab: LogTab
}

interface NavContextValue {
  section: Section
  logTab: LogTab
  setSection: (s: Section) => void
  setLogTab: (t: LogTab) => void
  /** Navigate to the Log page on a specific sub-tab. */
  goLog: (tab: LogTab) => void
}

const NavContext = createContext<NavContextValue | null>(null)

export function NavProvider({ children }: { children: ReactNode }) {
  const [state, setState] = usePersistentState<NavState>(STORAGE_KEYS.nav, {
    section: "home",
    logTab: "food",
  })

  const setSection = useCallback(
    (section: Section) => setState((s) => ({ ...s, section })),
    [setState]
  )
  const setLogTab = useCallback(
    (logTab: LogTab) => setState((s) => ({ ...s, logTab })),
    [setState]
  )
  const goLog = useCallback(
    (logTab: LogTab) => setState((s) => ({ ...s, section: "log", logTab })),
    [setState]
  )

  return (
    <NavContext.Provider
      value={{
        section: state.section,
        logTab: state.logTab,
        setSection,
        setLogTab,
        goLog,
      }}
    >
      {children}
    </NavContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNav(): NavContextValue {
  const ctx = useContext(NavContext)
  if (!ctx) throw new Error("useNav must be used within <NavProvider>")
  return ctx
}
