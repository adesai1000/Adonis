import { useMemo, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import {
  CheckCircle2,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useStore } from "@/store/store"
import { STORAGE_KEYS, usePersistentState } from "@/lib/storage"
import {
  buildWeeklyStats,
  generateCoachSummary,
  hasWeekData,
  type CoachNoteEntry,
  type CoachSummary,
} from "@/lib/ai"

const MAX_NOTE_HISTORY = 30

export function AICoach() {
  const { workoutLog, foodLog, cardioLog, weightLog, settings } = useStore()
  const [summary, setSummary] = usePersistentState<CoachSummary | null>(
    STORAGE_KEYS.aiSummary,
    null
  )
  const [draftNote, setDraftNote] = usePersistentState<string>(
    STORAGE_KEYS.aiCoachNotes,
    ""
  )
  const [noteHistory, setNoteHistory] = usePersistentState<CoachNoteEntry[]>(
    STORAGE_KEYS.aiCoachNoteHistory,
    []
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stats = useMemo(
    () => buildWeeklyStats({ workoutLog, foodLog, cardioLog, weightLog, settings }),
    [workoutLog, foodLog, cardioLog, weightLog, settings]
  )
  const canGenerate = hasWeekData(stats)

  async function run() {
    setLoading(true)
    setError(null)
    const trimmed = draftNote.trim()
    const pendingHistory = trimmed
      ? [...noteHistory, { date: new Date().toISOString(), text: trimmed }].slice(
          -MAX_NOTE_HISTORY
        )
      : noteHistory
    try {
      const result = await generateCoachSummary(stats, pendingHistory)
      setSummary(result)
      if (trimmed) {
        setNoteHistory(pendingHistory)
        setDraftNote("")
      }
      toast.success("Coach summary ready")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
      toast.error("Could not generate summary")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <span className="grid size-6 place-items-center rounded-lg bg-muted text-ink-2">
                <Sparkles className="size-3.5" />
              </span>
              AI Coach
            </CardTitle>
            <CardDescription>
              A coach&apos;s read on your last 7 days of training and nutrition.
            </CardDescription>
          </div>
          <Button
            onClick={run}
            disabled={loading || !canGenerate}
            className="gap-2 self-start sm:self-auto"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : summary ? (
              <RefreshCw className="size-4" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {loading ? "Generating" : summary ? "Regenerate" : "Generate"}
          </Button>
        </div>

        <div className="space-y-1.5 pt-1">
          <Label
            htmlFor="ai-coach-notes"
            className="text-xs text-muted-foreground"
          >
            Anything to add before generating? (optional)
          </Label>
          <Textarea
            id="ai-coach-notes"
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            placeholder="e.g. I tweaked my shoulder this week, or I'm cutting for a wedding in a month…"
            disabled={loading}
            className="min-h-16 resize-none text-sm"
          />
          {noteHistory.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Your coach remembers {noteHistory.length}{" "}
              {noteHistory.length === 1 ? "earlier note" : "earlier notes"} you've
              sent — new ones you add here are saved alongside them.
            </p>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : summary ? (
          <SummaryView summary={summary} />
        ) : (
          <EmptyState canGenerate={canGenerate} />
        )}
      </CardContent>
    </Card>
  )
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  )
}

function EmptyState({ canGenerate }: { canGenerate: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
      <Sparkles className="size-8 text-muted-foreground/60" />
      <p className="text-sm font-medium">
        {canGenerate ? "No summary yet" : "Nothing to analyze yet"}
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {canGenerate
          ? "Generate a personalized coaching summary of your training, nutrition and bodyweight from the last 7 days."
          : "Log some workouts, food or weigh-ins this week, then generate your coaching summary."}
      </p>
    </div>
  )
}

function SummaryView({ summary }: { summary: CoachSummary }) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h3 className="font-display text-[22px] leading-snug font-medium tracking-[-0.015em]">
          {summary.headline}
        </h3>
        {summary.overview && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {summary.overview}
          </p>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryList
          icon={
            <CheckCircle2 className="size-4 text-green-deep dark:text-green" />
          }
          title="What's working"
          items={summary.highlights}
        />
        <SummaryList
          icon={<Target className="size-4 text-amber" />}
          title="Focus on"
          items={summary.focus}
        />
        <SummaryList
          icon={<Lightbulb className="size-4 text-green-deep dark:text-green" />}
          title="Coach's tips"
          items={summary.tips}
          className="sm:col-span-2 lg:col-span-1"
        />
      </div>

      <Separator />
      <p className="text-xs text-muted-foreground">
        Generated {formatDistanceToNow(new Date(summary.generatedAt), { addSuffix: true })}
      </p>
    </div>
  )
}

function SummaryList({
  icon,
  title,
  items,
  className,
}: {
  icon: React.ReactNode
  title: string
  items: string[]
  className?: string
}) {
  if (!items.length) return null
  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
          >
            <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/40" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
