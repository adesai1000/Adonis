import { Monitor, Moon, Sun } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { useStore } from "@/store/store"
import type { Theme } from "@/lib/types"

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

export function DisplaySection() {
  const { user, updateUser } = useStore()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Display</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          <Label>Theme</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={user.theme}
            onValueChange={(v) => {
              if (v) updateUser({ theme: v as Theme })
            }}
            className="w-full"
          >
            {THEMES.map(({ value, label, icon: Icon }) => (
              <ToggleGroupItem
                key={value}
                value={value}
                aria-label={label}
                className="h-11 flex-1 gap-2"
              >
                <Icon className="size-4" />
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </CardContent>
    </Card>
  )
}
