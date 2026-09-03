import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-base text-foreground transition-[border-color,box-shadow] outline-none placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-green-deep focus-visible:ring-[3px] focus-visible:ring-green-deep/20 dark:focus-visible:border-green dark:focus-visible:ring-green/20",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
