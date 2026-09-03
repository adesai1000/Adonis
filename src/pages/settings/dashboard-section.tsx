import { format, parseISO } from "date-fns"
import { CalendarIcon, GripVertical, X } from "lucide-react"
import { toast } from "sonner"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { DragList, type DragHandleProps } from "@/components/common/drag-list"
import { useStore } from "@/store/store"
import type { CardKey, GraphTab, HomeSection, TrendRange } from "@/lib/types"

const CARD_LABELS: Record<CardKey, string> = {
  volume: "Volume",
  reps: "Reps",
  calories: "Calories",
  protein: "Protein",
  carbs: "Carbs",
  fat: "Fat",
  sodium: "Sodium",
  cardio: "Cardio",
  bodyweight: "Body weight",
}

const GRAPH_LABELS: Record<GraphTab, string> = {
  bodyweight: "Body weight",
  calories: "Calories",
  protein: "Protein",
}

const HOME_SECTION_LABELS: Record<HomeSection, string> = {
  cards: "Trend cards",
  graph: "Trends graph",
  tracker: "Consistency tracker",
  aicoach: "AI Coach",
}

const RANGES: TrendRange[] = [7, 14, 30]

function SectionRow({
  label,
  handle,
}: {
  label: string
  handle: DragHandleProps
}) {
  return (
    <div className="mb-2 flex items-center gap-3 rounded-[14px] border border-line bg-card px-3 py-2.5">
      <button
        type="button"
        aria-label="Drag to reorder"
        {...handle}
        className="-m-1 flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
      >
        <GripVertical className="size-4" />
      </button>
      <span className="flex-1 text-sm font-medium">{label}</span>
    </div>
  )
}

function TrackingStartDate() {
  const { settings, updateSettings } = useStore()
  const value = settings.trackingStartDate

  let selected: Date | undefined
  if (value) {
    try {
      const d = parseISO(value)
      if (!isNaN(d.getTime())) selected = d
    } catch {
      selected = undefined
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>Consistency tracker start date</Label>
      <p className="text-xs text-muted-foreground">
        Defaults to your earliest logged entry if left unset.
      </p>
      <div className="flex gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-11 flex-1 justify-start gap-2 font-normal"
            >
              <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {selected ? format(selected, "EEE, MMM d, yyyy") : "Auto-detect"}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={(d) => {
                if (d) {
                  updateSettings({ trackingStartDate: format(d, "yyyy-MM-dd") })
                  toast.success("Tracking start date saved")
                }
              }}
              autoFocus
            />
          </PopoverContent>
        </Popover>
        {value && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0"
            aria-label="Clear tracking start date"
            onClick={() => {
              updateSettings({ trackingStartDate: "" })
              toast.success("Tracking start date cleared")
            }}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

function ReorderRow({
  label,
  visible,
  onToggle,
  handle,
}: {
  label: string
  visible: boolean
  onToggle: (v: boolean) => void
  handle: DragHandleProps
}) {
  return (
    <div className="mb-2 flex items-center gap-3 rounded-[14px] border border-line bg-card px-3 py-2.5">
      <button
        type="button"
        aria-label="Drag to reorder"
        {...handle}
        className="-m-1 flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
      >
        <GripVertical className="size-4" />
      </button>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <Switch
        checked={visible}
        onCheckedChange={onToggle}
        aria-label={`Toggle ${label}`}
      />
    </div>
  )
}

export function DashboardSection() {
  const { settings, updateSettings, uiPrefs, updateUiPrefs } = useStore()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dashboard</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Home layout */}
        <div className="space-y-2">
          <div className="space-y-0.5">
            <Label>Home layout</Label>
            <p className="text-xs text-muted-foreground">
              Drag to reorder the sections on your Home page.
            </p>
          </div>
          <DragList
            items={uiPrefs.homeSectionOrder}
            getKey={(key) => key}
            onReorder={(next) => updateUiPrefs({ homeSectionOrder: next })}
            renderItem={(key, handle) => (
              <SectionRow label={HOME_SECTION_LABELS[key]} handle={handle} />
            )}
          />
        </div>

        <Separator />

        <TrackingStartDate />

        <Separator />

        {/* Trend range */}
        <div className="space-y-1.5">
          <Label>Trend range</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={String(settings.trendRange)}
            onValueChange={(v) => {
              if (v) updateSettings({ trendRange: Number(v) as TrendRange })
            }}
            className="w-full"
          >
            {RANGES.map((r) => (
              <ToggleGroupItem
                key={r}
                value={String(r)}
                className="h-11 flex-1"
              >
                Last {r} days
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <Separator />

        {/* Trend cards */}
        <div className="space-y-2">
          <div className="space-y-0.5">
            <Label>Trend cards</Label>
            <p className="text-xs text-muted-foreground">
              Toggle and drag to reorder.
            </p>
          </div>
          <DragList
            items={uiPrefs.cardOrder}
            getKey={(key) => key}
            onReorder={(next) => updateUiPrefs({ cardOrder: next })}
            renderItem={(key, handle) => (
              <ReorderRow
                label={CARD_LABELS[key]}
                visible={uiPrefs.cardVisibility[key]}
                onToggle={(v) =>
                  updateUiPrefs({
                    cardVisibility: { ...uiPrefs.cardVisibility, [key]: v },
                  })
                }
                handle={handle}
              />
            )}
          />
        </div>

        <Separator />

        {/* Graph tabs */}
        <div className="space-y-2">
          <div className="space-y-0.5">
            <Label>Graph tabs</Label>
            <p className="text-xs text-muted-foreground">
              Toggle and drag to reorder.
            </p>
          </div>
          <DragList
            items={uiPrefs.graphTabOrder}
            getKey={(key) => key}
            onReorder={(next) => updateUiPrefs({ graphTabOrder: next })}
            renderItem={(key, handle) => (
              <ReorderRow
                label={GRAPH_LABELS[key]}
                visible={uiPrefs.graphTabVisibility[key]}
                onToggle={(v) =>
                  updateUiPrefs({
                    graphTabVisibility: {
                      ...uiPrefs.graphTabVisibility,
                      [key]: v,
                    },
                  })
                }
                handle={handle}
              />
            )}
          />
        </div>
      </CardContent>
    </Card>
  )
}
