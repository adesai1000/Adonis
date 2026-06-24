import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { StoreProvider } from "@/store/store"
import { NavProvider, useNav } from "@/store/nav"
import { SyncProvider } from "@/store/sync"
import { ThemeProvider } from "@/components/theme-provider"
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
    <div className="min-h-dvh bg-background">
      <Sidebar />
      <div className="flex min-h-dvh flex-col md:pl-56">
        <Header />
        <ResumeBanner />
        <main className="mx-auto w-full max-w-screen-2xl flex-1 overflow-x-clip px-4 pb-24 pt-5 md:px-8 md:pb-14 md:pt-7 lg:px-10">
          <PullToRefresh>
            <div key={section} className="animate-in fade-in-50 duration-300">
              <CurrentPage />
            </div>
          </PullToRefresh>
        </main>
      </div>
      <BottomNav />
      {section === "home" && <QuickLogFab />}
      <Toaster position="bottom-center" richColors />
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
