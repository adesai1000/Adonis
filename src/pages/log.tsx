import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useNav } from "@/store/nav"
import { FoodTab } from "./log/food-tab"
import { WorkoutTab } from "./log/workout-tab"
import { CardioTab } from "./log/cardio-tab"
import { WeightTab } from "./log/weight-tab"

export default function LogPage() {
  const { logTab, setLogTab } = useNav()

  return (
    <div className="space-y-6">
      <Tabs
        value={logTab}
        onValueChange={(v) => setLogTab(v as typeof logTab)}
        className="gap-6"
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="food">Food</TabsTrigger>
          <TabsTrigger value="workout">Workout</TabsTrigger>
          <TabsTrigger value="cardio">Cardio</TabsTrigger>
          <TabsTrigger value="weight">Body Weight</TabsTrigger>
        </TabsList>

        <TabsContent
          value="food"
          className="animate-in fade-in-50 duration-200"
        >
          <FoodTab />
        </TabsContent>
        <TabsContent
          value="workout"
          className="animate-in fade-in-50 duration-200"
        >
          <WorkoutTab />
        </TabsContent>
        <TabsContent
          value="cardio"
          className="animate-in fade-in-50 duration-200"
        >
          <CardioTab />
        </TabsContent>
        <TabsContent
          value="weight"
          className="animate-in fade-in-50 duration-200"
        >
          <WeightTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
