import { useMemo, useState } from "react"
import { subDays } from "date-fns"
import {
  Activity,
  Beef,
  Droplet,
  Dumbbell,
  Flame,
  LineChart as LineChartIcon,
  Repeat,
  Scale,
  Wheat,
  X,
} from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EmptyState, TrendIndicator } from "@/components/common/bits"
import { cn } from "@/lib/utils"
import type { CardKey, GraphTab } from "@/lib/types"
import { useStore } from "@/store/store"
import { CARD_TITLES, computeCardMetric } from "./home/metrics"
import {
  buildGraphSeries,
  formatGraphValue,
  GRAPH_TITLES,
} from "./home/graph-data"
import { ManageCards } from "./home/manage-cards"
import { AICoach } from "./home/ai-coach"

const CARD_ICONS: Record<CardKey, React.ReactNode> = {
  volume: <Dumbbell className="size-4" />,
  reps: <Repeat className="size-4" />,
  calories: <Flame className="size-4" />,
  protein: <Beef className="size-4" />,
  carbs: <Wheat className="size-4" />,
  fat: <Droplet className="size-4" />,
  cardio: <Activity className="size-4" />,
  bodyweight: <Scale className="size-4" />,
}

const chartConfig = {
  value: { label: "Value", color: "var(--chart-1)" },
} satisfies ChartConfig

type RangeKey = "7d" | "30d" | "90d"
const RANGE_OPTIONS: { value: RangeKey; label: string; days: number }[] = [
  { value: "90d", label: "Last 3 months", days: 90 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "7d", label: "Last 7 days", days: 7 },
]

export default function Page() {
  const s = useStore()
  const {
    workoutLog,
    cardioLog,
    weightLog,
    foodLog,
    settings,
    uiPrefs,
    updateUiPrefs,
  } = s

  // ── trend card metrics ──
  const metricData = useMemo(
    () => ({ workoutLog, cardioLog, weightLog, foodLog, settings }),
    [workoutLog, cardioLog, weightLog, foodLog, settings]
  )

  const visibleCards = uiPrefs.cardOrder.filter(
    (k) => uiPrefs.cardVisibility[k]
  )

  function hideCard(key: CardKey) {
    updateUiPrefs({
      cardVisibility: { ...uiPrefs.cardVisibility, [key]: false },
    })
  }

  // ── graph state ──
  const [activeTab, setActiveTab] = useState<GraphTab>(() => {
    const firstVisible = uiPrefs.graphTabOrder.find(
      (t) => GRAPH_TITLES[t] !== undefined && uiPrefs.graphTabVisibility[t]
    )
    return firstVisible ?? "bodyweight"
  })

  // Graph time range: last 7 days / 30 days / 3 months
  const [rangeKey, setRangeKey] = useState<RangeKey>("90d")
  const rangeLabel =
    RANGE_OPTIONS.find((o) => o.value === rangeKey)?.label.toLowerCase() ??
    "last 3 months"
  const { fromDate, toDate } = useMemo(() => {
    const to = new Date()
    const days = RANGE_OPTIONS.find((o) => o.value === rangeKey)?.days ?? 90
    return { fromDate: subDays(to, days), toDate: to }
  }, [rangeKey])

  // Guard against stale prefs from older versions (e.g. removed "volume"
  // tab) until the store migration cleans them up on mount.
  const visibleTabs = uiPrefs.graphTabOrder.filter(
    (t) => GRAPH_TITLES[t] !== undefined && uiPrefs.graphTabVisibility[t]
  )

  // Keep the active tab valid if its visibility was turned off elsewhere.
  const effectiveTab: GraphTab =
    visibleTabs.includes(activeTab) ? activeTab : visibleTabs[0] ?? "bodyweight"

  const series = useMemo(
    () =>
      buildGraphSeries(
        effectiveTab,
        { weightLog, foodLog, settings },
        fromDate,
        toDate
      ),
    [effectiveTab, weightLog, foodLog, settings, fromDate, toDate]
  )

  return (
    <div className="space-y-6 md:space-y-8">
      {/* ── Trend stat cards ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground md:text-base">
            Today
          </p>
          <ManageCards
            order={uiPrefs.cardOrder}
            visibility={uiPrefs.cardVisibility}
            onChange={updateUiPrefs}
          />
        </div>

        {visibleCards.length === 0 ? (
          <EmptyState
            icon={<LineChartIcon className="size-8" />}
            title="No cards shown"
            hint="Use Manage cards to show your trend stats."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
            {visibleCards.map((key) => {
              const m = computeCardMetric(key, metricData)
              const trend = !m.hasData ? (
                <span className="text-xs text-muted-foreground">
                  No data today
                </span>
              ) : !m.hasPrev ? (
                <span className="text-xs text-muted-foreground">
                  vs yesterday: n/a
                </span>
              ) : (
                <TrendIndicator
                  direction={m.direction}
                  text={m.trendText}
                  tone={m.tone}
                />
              )
              return (
                <Card key={key} className="relative gap-0 py-0">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="absolute right-2 top-2 hidden text-muted-foreground hover:text-foreground sm:inline-flex"
                    onClick={() => hideCard(key)}
                    aria-label={`Hide ${CARD_TITLES[key]}`}
                  >
                    <X className="size-3.5" />
                  </Button>
                  {/* phone: thin full-width row · sm+: stacked card */}
                  <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:block sm:px-5 sm:py-5">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground sm:pr-6">
                      <span className="text-primary">{CARD_ICONS[key]}</span>
                      <span className="truncate">{CARD_TITLES[key]}</span>
                    </div>
                    <div className="flex flex-col items-end sm:mt-2.5 sm:items-start">
                      <div className="text-xl font-semibold tabular-nums sm:text-3xl">
                        {m.hasData ? m.display : "-"}
                      </div>
                      <div className="mt-0.5 sm:mt-1.5">{trend}</div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Trends graph ── */}
      <Card className="gap-0 pt-0">
        <CardHeader className="flex flex-col gap-3 space-y-0 border-b py-5 sm:flex-row sm:items-center">
          <div className="grid flex-1 gap-1">
            <CardTitle>Trends</CardTitle>
            <CardDescription>
              {visibleTabs.length > 0
                ? `Showing ${GRAPH_TITLES[effectiveTab].toLowerCase()} for the ${rangeLabel}`
                : "All metrics are hidden"}
            </CardDescription>
          </div>
          <Select
            value={rangeKey}
            onValueChange={(v) => setRangeKey(v as RangeKey)}
          >
            <SelectTrigger
              className="w-[150px] rounded-lg sm:ml-auto"
              aria-label="Select time range"
            >
              <SelectValue placeholder="Last 3 months" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="rounded-lg">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>

        <CardContent className="px-2 pt-4 sm:px-6">
          {visibleTabs.length === 0 ? (
            <EmptyState
              icon={<LineChartIcon className="size-8" />}
              title="No metrics enabled"
              hint="All graph tabs are hidden."
            />
          ) : (
            <>
              <div className="mb-4 px-2 sm:px-0">
                <GraphTabs
                  tabs={visibleTabs}
                  active={effectiveTab}
                  onSelect={setActiveTab}
                />
              </div>
              {series.points.length === 0 ? (
                <EmptyState
                  icon={<LineChartIcon className="size-8" />}
                  title={`No ${GRAPH_TITLES[effectiveTab].toLowerCase()} data`}
                  hint="Log entries or pick a longer range to see your trend."
                />
              ) : (
                <div
                  key={effectiveTab}
                  className="animate-in fade-in-50 duration-300"
                >
                  <ChartContainer
                    config={chartConfig}
                    className="aspect-auto h-[260px] w-full sm:h-[340px] lg:h-[380px]"
                  >
                    <AreaChart
                      data={series.points}
                      margin={{ left: 12, right: 12, top: 8 }}
                    >
                      <defs>
                        <linearGradient id="homeFill" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="5%"
                            stopColor="var(--color-value)"
                            stopOpacity={0.8}
                          />
                          <stop
                            offset="95%"
                            stopColor="var(--color-value)"
                            stopOpacity={0.1}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        minTickGap={32}
                      />
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            labelKey="label"
                            indicator="dot"
                            formatter={(value) => (
                              <div className="flex w-full items-center justify-between gap-3">
                                <span className="text-muted-foreground">
                                  {GRAPH_TITLES[effectiveTab]}
                                </span>
                                <span className="font-mono font-medium tabular-nums">
                                  {formatGraphValue(
                                    typeof value === "number" ? value : 0,
                                    series.unit
                                  )}
                                </span>
                              </div>
                            )}
                          />
                        }
                      />
                      <Area
                        dataKey="value"
                        type="natural"
                        stroke="var(--color-value)"
                        strokeWidth={2}
                        fill="url(#homeFill)"
                        dot={false}
                        activeDot={{ r: 4 }}
                        isAnimationActive
                      />
                    </AreaChart>
                  </ChartContainer>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── AI Coach ── */}
      <AICoach />
    </div>
  )
}

// ───────────────────────────── Graph metric tabs (segmented control) ─────────────────────────────
// Order/visibility of these tabs is managed in Settings → Dashboard.
function GraphTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: GraphTab[]
  active: GraphTab
  onSelect: (t: GraphTab) => void
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
      {tabs.map((tab) => {
        const isActive = tab === active
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onSelect(tab)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-150 active:scale-95 md:text-[0.95rem]",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {GRAPH_TITLES[tab]}
          </button>
        )
      })}
    </div>
  )
}
