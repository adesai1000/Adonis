import { useState } from "react"
import { GripVertical, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { DragList } from "@/components/common/drag-list"
import { cn } from "@/lib/utils"
import type { CardKey } from "@/lib/types"
import { CARD_TITLES } from "./metrics"

interface ManageCardsProps {
  order: CardKey[]
  visibility: Record<CardKey, boolean>
  onChange: (patch: {
    cardOrder?: CardKey[]
    cardVisibility?: Record<CardKey, boolean>
  }) => void
}

export function ManageCards({ order, visibility, onChange }: ManageCardsProps) {
  const [open, setOpen] = useState(false)

  function toggle(key: CardKey, value: boolean) {
    onChange({ cardVisibility: { ...visibility, [key]: value } })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-11 gap-2">
          <SlidersHorizontal className="size-4" />
          Manage cards
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stat cards</DialogTitle>
          <DialogDescription>
            Reorder and show or hide your trend cards.
          </DialogDescription>
        </DialogHeader>

        <DragList
          items={order}
          getKey={(k) => k}
          onReorder={(next) => onChange({ cardOrder: next })}
          className="gap-2"
          renderItem={(key, handle) => (
            <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
              <button
                type="button"
                aria-label="Drag to reorder"
                onPointerDown={handle.onPointerDown}
                style={handle.style}
                className={cn(
                  handle.className,
                  "flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <GripVertical className="size-4" />
              </button>
              <span className="flex-1 text-sm font-medium">
                {CARD_TITLES[key]}
              </span>
              <Switch
                checked={visibility[key]}
                onCheckedChange={(v) => toggle(key, v)}
                aria-label={`Show ${CARD_TITLES[key]}`}
              />
            </div>
          )}
        />

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
