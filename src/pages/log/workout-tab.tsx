import { useStore } from "@/store/store"
import { WorkoutSetup } from "./workout-setup"
import { WorkoutSession } from "./workout-session"

export function WorkoutTab() {
  const { activeSession } = useStore()
  if (!activeSession) return <WorkoutSetup />
  return <WorkoutSession />
}
