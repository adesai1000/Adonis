import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/** Stickshift `.chip`: pill, 12px semibold, tinted by tone. */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border border-transparent px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-green-tint text-green-ink [a&]:hover:brightness-95",
        secondary: "bg-muted text-ink-2 [a&]:hover:brightness-95",
        destructive: "bg-red-tint text-red [a&]:hover:brightness-95",
        outline:
          "border-line-strong bg-card text-foreground [a&]:hover:bg-muted",
        ghost: "text-ink-2 [a&]:hover:bg-muted",
        link: "text-green-deep underline-offset-4 [a&]:hover:underline dark:text-green",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
