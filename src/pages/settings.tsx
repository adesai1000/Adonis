import { DisplaySection } from "@/pages/settings/display-section"
import { DashboardSection } from "@/pages/settings/dashboard-section"
import { GoalsSection } from "@/pages/settings/goals-section"
import { ExerciseLibrarySection } from "@/pages/settings/exercise-library-section"
import { RoutineManagerSection } from "@/pages/settings/routine-manager-section"
import { SyncSection } from "@/pages/settings/sync-section"
import { DataManagementSection } from "@/pages/settings/data-management-section"

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <DisplaySection />
      <DashboardSection />
      <GoalsSection />
      <ExerciseLibrarySection />
      <RoutineManagerSection />
      <SyncSection />
      <DataManagementSection />
    </div>
  )
}
