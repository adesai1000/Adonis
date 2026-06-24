import type { ReactNode } from "react"
import { ArrowDown, ArrowUp, Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ───────────────────────────── EmptyState ─────────────────────────────
export function EmptyState({
  icon,
  title,
  hint,
  className,
  action,
}: {
  icon?: ReactNode
  title: string
  hint?: string
  className?: string
  action?: ReactNode
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center",
        className
      )}
    >
      {icon && <div className="text-muted-foreground/60">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

// ───────────────────────────── FieldError ─────────────────────────────
export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null
  return <p className="text-xs font-medium text-destructive">{children}</p>
}

// ───────────────────────────── TrendIndicator ─────────────────────────────
export function TrendIndicator({
  direction,
  text,
  tone = "neutral",
  className,
}: {
  direction: "up" | "down" | "flat"
  text: string
  tone?: "good" | "bad" | "neutral"
  className?: string
}) {
  const Icon =
    direction === "up" ? ArrowUp : direction === "down" ? ArrowDown : Minus
  const color =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
        ? "text-destructive"
        : "text-muted-foreground"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        color,
        className
      )}
    >
      <Icon className="size-3" />
      {text}
    </span>
  )
}

// ───────────────────────────── Stepper ─────────────────────────────
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = Infinity,
  format = (v) => String(v),
  className,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  format?: (v: number) => string
  className?: string
}) {
  const dec = () => onChange(Math.max(min, Math.round((value - step) * 100) / 100))
  const inc = () => onChange(Math.min(max, Math.round((value + step) * 100) / 100))
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11 shrink-0"
        onClick={dec}
        disabled={value <= min}
        aria-label="Decrease"
      >
        <Minus className="size-4" />
      </Button>
      <div className="min-w-[3.5rem] flex-1 text-center text-lg font-semibold tabular-nums">
        {format(value)}
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11 shrink-0"
        onClick={inc}
        disabled={value >= max}
        aria-label="Increase"
      >
        <Plus className="size-4" />
      </Button>
    </div>
  )
}
