import logoUrl from "@/assets/logo-mark.png"
import { cn } from "@/lib/utils"

/** The knot mark, recolorable via `color` (defaults to currentColor). */
export function Logo({
  size = 16,
  color = "currentColor",
  className,
}: {
  size?: number
  color?: string
  className?: string
}) {
  const mask = `url(${logoUrl})`
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0", className)}
      style={{
        width: size,
        height: Math.round(size * (176 / 192)),
        background: color,
        WebkitMaskImage: mask,
        maskImage: mask,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  )
}

/** Black rounded tile with the white mark — the app icon, at UI size. */
export function BrandMark({
  size = 38,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("grid shrink-0 place-items-center bg-black", className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.34) }}
    >
      <Logo size={Math.round(size * 0.53)} color="#fff" />
    </span>
  )
}

/** "Adonis" set in the display face. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display text-[17px] font-semibold tracking-[-0.01em] text-foreground",
        className
      )}
    >
      Adonis
    </span>
  )
}
