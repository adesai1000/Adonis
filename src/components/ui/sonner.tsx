"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/** Stickshift `.toast`: an ink pill, centered, floating. */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-green" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4 text-amber" />,
        error: <OctagonXIcon className="size-4 text-red" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-full !border-0 !px-5 !py-3 !text-[12.5px] !font-medium !shadow-[var(--shadow-float)]",
        },
      }}
      style={
        {
          "--normal-bg": "var(--ink)",
          "--normal-text": "var(--canvas)",
          "--normal-border": "transparent",
          "--success-bg": "var(--ink)",
          "--success-text": "var(--canvas)",
          "--success-border": "transparent",
          "--error-bg": "var(--ink)",
          "--error-text": "var(--canvas)",
          "--error-border": "transparent",
          "--border-radius": "999px",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
