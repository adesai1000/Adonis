import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { StoreProvider } from "@/store/store"
import { NavProvider, useNav } from "@/store/nav"
import { SyncProvider } from "@/store/sync"
import { ThemeProvider } from "@/components/theme-provider"
import { Header } from "@/components/layout/header"
import { BottomNav } from "@/components/layout/navigation"
import { PageHead } from "@/components/layout/page-head"
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
    <div className="flex min-h-dvh flex-col">
      <Header />
      <ResumeBanner />
      <main className="mx-auto w-full max-w-[1760px] flex-1 overflow-x-clip px-4 pb-32 md:px-[clamp(18px,3.2vw,64px)] md:pb-16">
        <PullToRefresh>
          <PageHead />
          <div key={section} className="animate-in fade-in-50 duration-300">
            <CurrentPage />
          </div>
        </PullToRefresh>
      </main>
      <BottomNav />
      {section === "home" && <QuickLogFab />}
      <Toaster
        position="bottom-center"
        offset={{ bottom: "28px" }}
        mobileOffset={{ bottom: "calc(env(safe-area-inset-bottom) + 92px)" }}
      />
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <ThemeProvider>
        <NavProvider>
          <SyncProvider>
            <TooltipProvider delayDuration={200}>
              <Shell />
            </TooltipProvider>
          </SyncProvider>
        </NavProvider>
      </ThemeProvider>
    </StoreProvider>
  )
}
