import { useEffect, useRef } from "react"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useConnectResult } from "@/lib/connect-result"
import { STORAGE_KEYS, usePersistentState } from "@/lib/storage"
import { useCheckoutResult } from "@/components/account/upgrade-dialog"
import { StoreProvider, useStore } from "@/store/store"
import { NavProvider, useNav } from "@/store/nav"
import { AuthProvider, useAuth } from "@/store/auth"
import { SyncProvider, useSync } from "@/store/sync"
import { ThemeProvider } from "@/components/theme-provider"
import { Welcome } from "@/components/welcome"
import { Onboarding } from "@/components/onboarding/onboarding"
import { Header } from "@/components/layout/header"
import { Sidebar, BottomNav } from "@/components/layout/navigation"
import { ResumeBanner } from "@/components/layout/resume-banner"
import { QuickLogFab } from "@/components/layout/quick-log-fab"
import { PullToRefresh } from "@/components/layout/pull-to-refresh"
import HomePage from "@/pages/home"
import LogPage from "@/pages/log"
import MealsPage from "@/pages/meals"
import HistoryPage from "@/pages/history"
import WeightPage from "@/pages/weight"
import SettingsPage from "@/pages/settings"

function CurrentPage() {
  const { section } = useNav()
  switch (section) {
    case "home":
      return <HomePage />
    case "log":
      return <LogPage />
    case "meals":
      return <MealsPage />
    case "history":
      return <HistoryPage />
    case "weight":
      return <WeightPage />
    case "settings":
      return <SettingsPage />
    default:
      return <HomePage />
  }
}

function Shell() {
  const { section } = useNav()
  return (
    <div className="min-h-dvh">
      <Sidebar />
      <div className="flex min-h-dvh flex-col md:pl-56">
        <Header />
        <ResumeBanner />
        <main className="mx-auto w-full max-w-screen-2xl flex-1 overflow-x-clip px-4 pb-28 pt-5 md:px-8 md:pb-14 md:pt-7 lg:px-10">
          <PullToRefresh>
            <div key={section} className="animate-in fade-in-50 duration-300">
              <CurrentPage />
            </div>
          </PullToRefresh>
        </main>
      </div>
      <BottomNav />
      {section === "home" && <QuickLogFab />}
    </div>
  )
}

function Gate() {
  const { foodLog, workoutLog, weightLog, cardioLog, recoveryLog, routines } =
    useStore()
  const { session, loading } = useAuth()
  const { syncMode, initialPullSettled } = useSync()
  // OAuth/Stripe redirects can land on any screen (Home, onboarding,
  // Settings) — the return-param handlers live here so they always run once.
  useConnectResult()
  useCheckoutResult()
  const [welcomeDone, setWelcomeDone] = usePersistentState<boolean>(
    STORAGE_KEYS.welcomeDone,
    false
  )
  const [onboardingDone, setOnboardingDone] = usePersistentState<boolean>(
    STORAGE_KEYS.onboardingDone,
    false
  )
  // Once onboarding is on screen, keep it there: data arriving mid-flow (an
  // account pull or a post-connect integration sync) must not yank the user
  // out before finish() applies their answers.
  const onboardingActiveRef = useRef(false)

  const hasData =
    workoutLog.length > 0 ||
    foodLog.length > 0 ||
    weightLog.length > 0 ||
    cardioLog.length > 0 ||
    recoveryLog.length > 0 ||
    routines.length > 0

  // Any existing data (demo load, account pull, returning user) skips setup for good.
  useEffect(() => {
    if (hasData && !onboardingDone && !onboardingActiveRef.current) {
      setOnboardingDone(true)
    }
  }, [hasData, onboardingDone, setOnboardingDone])

  if (
    (!hasData || onboardingActiveRef.current) &&
    (!welcomeDone || !onboardingDone)
  ) {
    if (loading) return null
    if (!welcomeDone && !session) {
      return <Welcome onDone={() => setWelcomeDone(true)} />
    }
    if (!onboardingDone) {
      // Wait for the account pull before deciding: a returning user's data
      // may still be in flight, and dropping them into onboarding now would
      // overwrite the pulled settings (and lose their first weigh-in) when
      // they finish.
      if (
        !onboardingActiveRef.current &&
        syncMode === "account" &&
        !initialPullSettled
      ) {
        return null
      }
      onboardingActiveRef.current = true
      return (
        <Onboarding
          onDone={() => {
            onboardingActiveRef.current = false
            setWelcomeDone(true)
            setOnboardingDone(true)
          }}
        />
      )
    }
  }
  return <Shell />
}

export default function App() {
  return (
    <StoreProvider>
      <ThemeProvider>
        <NavProvider>
          <AuthProvider>
            <SyncProvider>
              <TooltipProvider delayDuration={200}>
                <Gate />
                {/* Mounted here (not in Shell) so toasts from the OAuth /
                    checkout return handlers also show during onboarding. */}
                <Toaster
                  position="top-center"
                  richColors
                  offset={{ top: "calc(env(safe-area-inset-top) + 16px)" }}
                  mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
                />
              </TooltipProvider>
            </SyncProvider>
          </AuthProvider>
        </NavProvider>
      </ThemeProvider>
    </StoreProvider>
  )
}
