import { useMemo } from "react"
import { parseISO } from "date-fns"
import { Scale, Trash2 } from "lucide-react"
import { toast } from "sonner"
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
import { convertWeight, fmt, formatDate, formatTime, signed } from "@/lib/calc"
import { useStore } from "@/store/store"
import type { WeightEntry } from "@/lib/types"

interface Point {
  ts: number
  weight: number
}

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
  const unit = settings.weightUnit

  // All entries oldest → newest, converted to the display unit.
  const allSorted = useMemo(
    () =>
      [...weightLog]
        .sort(
          (a, b) =>
            safeDate(a.datetime).getTime() - safeDate(b.datetime).getTime()
        )
        .map<Point>((e) => ({
          ts: safeDate(e.datetime).getTime(),
          weight: convertWeight(e.weight, e.unit, unit),
        })),
    [weightLog, unit]
  )

  // ── Stats over the full history ──
  const hasData = allSorted.length > 0
  const first = allSorted.length ? allSorted[0] : null
  const latest = allSorted.length ? allSorted[allSorted.length - 1] : null
  const current = latest?.weight ?? 0
  const starting = first?.weight ?? 0
  const netChange = first && latest ? latest.weight - first.weight : 0
  const daysSpanned = first && latest ? (latest.ts - first.ts) / 86_400_000 : 0
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

  return (
    <div className="space-y-6">
      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Current">
          <span className="text-xl font-semibold tabular-nums">
            {hasData ? `${fmt(current)} ${unit}` : "-"}
          </span>
        </StatCard>
        <StatCard label="Starting">
          <span className="text-xl font-semibold tabular-nums">
            {hasData ? `${fmt(starting)} ${unit}` : "-"}
          </span>
        </StatCard>
        <StatCard label="Net change">
          <span className="text-xl font-semibold tabular-nums">
            {hasData ? `${signed(netChange)} ${unit}` : "-"}
          </span>
          {hasData && (
            <TrendIndicator
              direction={changeDir(netChange)}
              tone={changeTone(netChange)}
              text={`${signed(netChange)} ${unit}`}
            />
          )}
        </StatCard>
        <StatCard label="Avg / week">
          <span className="text-xl font-semibold tabular-nums">
            {hasData ? `${signed(avgWeekly)} ${unit}` : "-"}
          </span>
          {hasData && (
            <TrendIndicator
              direction={changeDir(avgWeekly)}
              tone={changeTone(avgWeekly)}
              text={`${signed(avgWeekly)} ${unit}/wk`}
            />
          )}
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
            />
          ) : (
            <ScrollArea className="h-[360px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="hidden sm:table-cell">Time</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead className="hidden sm:table-cell">Note</TableHead>
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
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {formatTime(entry.datetime)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {fmt(w)} {unit}
                        </TableCell>
                        <TableCell className="hidden max-w-[12rem] truncate text-muted-foreground sm:table-cell">
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
