import { format, parseISO } from "date-fns"
import { convertWeight, dateKey, fmt } from "@/lib/calc"
import type { FoodEntry, GraphTab, Settings, WeightEntry } from "@/lib/types"

export interface GraphPoint {
  /** Sort key (ms epoch). */
  ts: number
  /** Short axis label, e.g. "Jun 3". */
  label: string
  value: number
}

export interface GraphSeries {
  points: GraphPoint[]
  /** Formats a value with its inline unit for the tooltip. */
  unit: string
}

export const GRAPH_TITLES: Record<GraphTab, string> = {
  bodyweight: "Body Weight",
  calories: "Calories",
  protein: "Protein",
}

function within(iso: string, from: Date, to: Date): boolean {
  try {
    const d = parseISO(iso).getTime()
    const lo = Math.min(from.getTime(), to.getTime())
    const hi = Math.max(from.getTime(), to.getTime())
    return d >= lo && d <= hi
  } catch {
    return false
  }
}

function axisLabel(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d")
  } catch {
    return "-"
  }
}

/** Sum a food macro per calendar day → chart points. */
function dailySum(
  foodLog: FoodEntry[],
  from: Date,
  to: Date,
  pick: (e: FoodEntry) => number
): GraphPoint[] {
  const byDay = new Map<string, number>()
  for (const e of foodLog) {
    if (!within(e.datetime, from, to)) continue
    const k = dateKey(e.datetime)
    byDay.set(k, (byDay.get(k) ?? 0) + (pick(e) || 0))
  }
  return Array.from(byDay.entries())
    .map<GraphPoint>(([day, value]) => {
      const ts = new Date(`${day}T00:00:00`).getTime()
      return { ts, label: format(new Date(ts), "MMM d"), value }
    })
    .sort((a, b) => a.ts - b.ts)
}

export function buildGraphSeries(
  tab: GraphTab,
  data: {
    weightLog: WeightEntry[]
    foodLog: FoodEntry[]
    settings: Settings
  },
  from: Date,
  to: Date
): GraphSeries {
  const { settings } = data

  if (tab === "bodyweight") {
    const unit = settings.weightUnit
    const points = data.weightLog
      .filter((e) => within(e.datetime, from, to))
      .map<GraphPoint>((e) => ({
        ts: parseISO(e.datetime).getTime(),
        label: axisLabel(e.datetime),
        value: convertWeight(e.weight, e.unit, unit),
      }))
      .sort((a, b) => a.ts - b.ts)
    return { points, unit }
  }

  if (tab === "calories") {
    return {
      points: dailySum(data.foodLog, from, to, (e) => e.calories),
      unit: "kcal",
    }
  }

  // protein (g per day)
  return {
    points: dailySum(data.foodLog, from, to, (e) => e.protein),
    unit: "g",
  }
}

/** Formatted value + unit for tooltips / labels. */
export function formatGraphValue(value: number, unit: string): string {
  return `${fmt(value)} ${unit}`
}
