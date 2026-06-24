import { useState } from "react"
import { format, parseISO } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface DateTimePickerProps {
  value: string // ISO
  onChange: (iso: string) => void
  label?: string
  className?: string
}

function safeDate(iso: string): Date {
  try {
    const d = parseISO(iso)
    if (isNaN(d.getTime())) return new Date()
    return d
  } catch {
    return new Date()
  }
}

export function DateTimePicker({
  value,
  onChange,
  label = "Date & time",
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false)
  const date = safeDate(value)
  const timeStr = format(date, "HH:mm")

  function setDatePart(d: Date | undefined) {
    if (!d) return
    const next = new Date(date)
    next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate())
    onChange(next.toISOString())
  }

  function setTimePart(t: string) {
    const [h, m] = t.split(":").map((x) => parseInt(x, 10))
    const next = new Date(date)
    next.setHours(isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0)
    onChange(next.toISOString())
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-11 min-w-0 flex-1 justify-start gap-2 font-normal"
            >
              <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{format(date, "EEE, MMM d, yyyy")}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => {
                setDatePart(d)
                setOpen(false)
              }}
              autoFocus
            />
          </PopoverContent>
        </Popover>
        <Input
          type="time"
          value={timeStr}
          onChange={(e) => setTimePart(e.target.value)}
          className="h-11 w-[7.5rem] shrink-0 justify-center tabular-nums"
        />
      </div>
    </div>
  )
}
