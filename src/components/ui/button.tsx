import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-semibold whitespace-nowrap transition-[transform,box-shadow,background-color,color,opacity] duration-200 outline-none active:translate-y-0 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 aria-invalid:ring-2 aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /* btn-dark: the primary action */
        default:
          "bg-foreground text-background hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-8px_rgba(16,19,16,0.4)] dark:hover:shadow-[0_10px_24px_-8px_rgba(0,0,0,0.6)]",
        /* btn-green: the accent action */
        secondary:
          "bg-primary text-primary-foreground hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-8px_var(--green-glow)]",
        destructive:
          "bg-red-tint text-red hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)] focus-visible:ring-destructive/40",
        /* btn-ghost: white card with a hairline */
        outline:
          "border border-line-strong bg-card text-foreground hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]",
        ghost:
          "text-ink-2 hover:bg-muted hover:text-foreground",
        link: "text-green-deep underline-offset-4 hover:underline dark:text-green",
      },
      size: {
        default: "h-10 px-5 has-[>svg]:px-4",
        xs: "h-7 gap-1 px-3 text-xs has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-4 text-[13px] has-[>svg]:px-3.5",
        lg: "h-12 px-6 text-[15px] has-[>svg]:px-5",
        icon: "size-10",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
