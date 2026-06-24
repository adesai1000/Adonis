import { useMemo, useState } from "react"
import {
  endOfDay,
  format,
  parseISO,
  startOfDay,
  subDays,
} from "date-fns"
import {
  CalendarIcon,
  Plus,
  Scale,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart"
import { Calendar } from "@/components/ui/calendar"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState, TrendIndicator } from "@/components/common/bits"
import {
  convertWeight,
  fmt,
  formatDate,
  formatTime,
  signed,
} from "@/lib/calc"
import { useNav } from "@/store/nav"
import { useStore } from "@/store/store"
import type { WeightEntry } from "@/lib/types"

interface ChartPoint {
  iso: string
  ts: number
  weight: number
}

const chartConfig = {
  weight: {
    label: "Weight",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

function safeDate(iso: string): Date {
  try {
    const d = parseISO(iso)
    return isNaN(d.getTime()) ? new Date() : d
  } catch {
    return new Date()
  }
}

export default function Page() {
  const { weightLog, settings, deleteWeight } = useStore()
  const { goLog } = useNav()
  const unit = settings.weightUnit

  // Chart-only date range. Default to the last 90 days (covers most logs).
  const [from, setFrom] = useState<Date | undefined>(() => subDays(new Date(), 90))
  const [to, setTo] = useState<Date | undefined>(() => new Date())
  const [fromOpen, setFromOpen] = useState(false)
  const [toOpen, setToOpen] = useState(false)

  // All entries sorted oldest → newest, converted to the display unit.
  const allSorted = useMemo(() => {
    return [...weightLog]
      .sort(
        (a, b) =>
          safeDate(a.datetime).getTime() - safeDate(b.datetime).getTime()
      )
      .map<ChartPoint>((e) => ({
        iso: e.datetime,
        ts: safeDate(e.datetime).getTime(),
        weight: convertWeight(e.weight, e.unit, unit),
      }))
  }, [weightLog, unit])

  // Range bounds (inclusive of the whole day).
  const rangeStart = from ? startOfDay(from).getTime() : -Infinity
  const rangeEnd = to ? endOfDay(to).getTime() : Infinity
  const lo = Math.min(rangeStart, rangeEnd)
  const hi = Math.max(rangeStart, rangeEnd)

  const inRangePoints = useMemo(
    () => allSorted.filter((p) => p.ts >= lo && p.ts <= hi),
    [allSorted, lo, hi]
  )

  // ── Stats ──
  const latest = allSorted.length ? allSorted[allSorted.length - 1] : null
  const firstInRange = inRangePoints.length ? inRangePoints[0] : null
  const lastInRange = inRangePoints.length
    ? inRangePoints[inRangePoints.length - 1]
    : null

  const current = latest?.weight ?? 0
  const starting = firstInRange?.weight ?? 0
  const netChange =
    firstInRange && lastInRange ? lastInRange.weight - firstInRange.weight : 0

  const daysSpanned =
    firstInRange && lastInRange
      ? (lastInRange.ts - firstInRange.ts) / 86_400_000
      : 0
  const weeksSpanned = daysSpanned / 7
  const avgWeekly = weeksSpanned > 0 ? netChange / weeksSpanned : 0

  // Goal direction: if goal < current we want to lose (down is good), else gain.
  const goalWeight = settings.goalWeight
  const hasGoal = goalWeight > 0
  const goalDir: "down" | "up" | "none" = !hasGoal
    ? "none"
    : current > goalWeight
      ? "down"
      : current < goalWeight
        ? "up"
        : "none"

  function changeTone(delta: number): "good" | "bad" | "neutral" {
    if (Math.abs(delta) < 1e-9 || goalDir === "none") return "neutral"
    const movingDown = delta < 0
    if (goalDir === "down") return movingDown ? "good" : "bad"
    return movingDown ? "bad" : "good"
  }

  function changeDir(delta: number): "up" | "down" | "flat" {
    if (Math.abs(delta) < 1e-9) return "flat"
    return delta > 0 ? "up" : "down"
  }

  // Most recent first for the table.
  const tableEntries = useMemo(
    () =>
      [...weightLog].sort(
        (a, b) =>
          safeDate(b.datetime).getTime() - safeDate(a.datetime).getTime()
      ),
    [weightLog]
  )

  function handleDelete(entry: WeightEntry) {
    deleteWeight(entry.id)
    toast.success("Entry deleted")
  }

  const resetRange = () => {
    setFrom(subDays(new Date(), 90))
    setTo(new Date())
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-11 gap-1.5"
          onClick={() => goLog("weight")}
        >
          <Plus className="size-4" />
          Add via Log
        </Button>
      </div>

      {/* ── Chart ── */}
      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Trend ({unit})</CardTitle>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Popover open={fromOpen} onOpenChange={setFromOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-11 justify-start gap-2 font-normal"
                  >
                    <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {from ? format(from, "MMM d, yyyy") : "Start"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={from}
                    onSelect={(d) => {
                      setFrom(d)
                      setFromOpen(false)
                    }}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Popover open={toOpen} onOpenChange={setToOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-11 justify-start gap-2 font-normal"
                  >
                    <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {to ? format(to, "MMM d, yyyy") : "End"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={to}
                    onSelect={(d) => {
                      setTo(d)
                      setToOpen(false)
                    }}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-11 gap-1.5 text-muted-foreground"
              onClick={resetRange}
            >
              <X className="size-4" />
              Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {inRangePoints.length === 0 ? (
            <EmptyState
              icon={<Scale className="size-8" />}
              title="No weight entries"
              hint={
                allSorted.length === 0
                  ? "Log your weight from the Log page to see your trend."
                  : "No entries fall in the selected date range."
              }
            />
          ) : (
            <ChartContainer config={chartConfig} className="h-[260px] w-full">
              <LineChart
                accessibilityLayer
                data={inRangePoints}
                margin={{ left: 4, right: 12, top: 8, bottom: 4 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                  tickFormatter={(v: number) => format(new Date(v), "MMM d")}
                />
                <YAxis
                  width={44}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => fmt(v, 0)}
                />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const p = payload[0].payload as ChartPoint
                    return (
                      <div className="grid gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                        <span className="font-medium">{formatDate(p.iso)}</span>
                        <span className="text-muted-foreground">
                          {formatTime(p.iso)}
                        </span>
                        <span className="font-mono font-medium tabular-nums">
                          {fmt(p.weight)} {unit}
                        </span>
                      </div>
                    )
                  }}
                />
                {hasGoal && (
                  <ReferenceLine
                    y={goalWeight}
                    stroke="var(--chart-1)"
                    strokeDasharray="4 4"
                    strokeOpacity={0.6}
                    label={{
                      value: `Goal ${fmt(goalWeight)} ${unit}`,
                      position: "insideTopRight",
                      fill: "var(--muted-foreground)",
                      fontSize: 11,
                    }}
                  />
                )}
                <Line
                  dataKey="weight"
                  type="monotone"
                  stroke="var(--color-weight)"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: "var(--color-weight)" }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Current">
          <span className="text-xl font-semibold tabular-nums">
            {fmt(current)} {unit}
          </span>
        </StatCard>
        <StatCard label="Starting (range)">
          <span className="text-xl font-semibold tabular-nums">
            {fmt(starting)} {unit}
          </span>
        </StatCard>
        <StatCard label="Net change">
          <span className="text-xl font-semibold tabular-nums">
            {signed(netChange)} {unit}
          </span>
          <TrendIndicator
            direction={changeDir(netChange)}
            tone={changeTone(netChange)}
            text={`${signed(netChange)} ${unit}`}
          />
        </StatCard>
        <StatCard label="Avg / week">
          <span className="text-xl font-semibold tabular-nums">
            {signed(avgWeekly)} {unit}
          </span>
          <TrendIndicator
            direction={changeDir(avgWeekly)}
            tone={changeTone(avgWeekly)}
            text={`${signed(avgWeekly)} ${unit}/wk`}
          />
        </StatCard>
      </div>

      {/* ── Table ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All entries</CardTitle>
        </CardHeader>
        <CardContent>
          {tableEntries.length === 0 ? (
            <EmptyState
              icon={<Scale className="size-8" />}
              title="No entries logged"
              hint="Your logged weights will appear here."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 gap-1.5"
                  onClick={() => goLog("weight")}
                >
                  <Plus className="size-4" />
                  Add via Log
                </Button>
              }
            />
          ) : (
            <ScrollArea className="h-[360px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableEntries.map((entry) => {
                    const w = convertWeight(entry.weight, entry.unit, unit)
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">
                          {formatDate(entry.datetime)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatTime(entry.datetime)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {fmt(w)} {unit}
                        </TableCell>
                        <TableCell className="max-w-[12rem] truncate text-muted-foreground">
                          {entry.notes || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <DeleteButton entry={entry} onConfirm={handleDelete} />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="flex flex-col gap-1 px-4">
        <span className="text-xs text-muted-foreground">{label}</span>
        {children}
      </CardContent>
    </Card>
  )
}

function DeleteButton({
  entry,
  onConfirm,
}: {
  entry: WeightEntry
  onConfirm: (entry: WeightEntry) => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 text-muted-foreground hover:text-destructive"
          aria-label="Delete entry"
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete entry?</AlertDialogTitle>
          <AlertDialogDescription>
            {fmt(entry.weight)} {entry.unit} on {formatDate(entry.datetime)}{" "}
            will be removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => onConfirm(entry)}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
