import { useEffect, useRef, useState } from "react"
import { Check, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useAuth } from "@/store/auth"

type BillingInterval = "monthly" | "yearly"

const PRO_FEATURES = [
  "AI Coach — weekly insights from your training",
  "Whoop integration — recovery, sleep & strain",
  "Google Fit & Fitbit integration — steps, weight & workouts",
  "Recovery card on your dashboard",
]

const PLANS: {
  interval: BillingInterval
  label: string
  price: string
  per: string
  note?: string
}[] = [
  {
    interval: "yearly",
    label: "Yearly",
    price: "$59.99",
    per: "/yr",
    note: "Save 37%",
  },
  { interval: "monthly", label: "Monthly", price: "$7.99", per: "/mo" },
]

interface UpgradeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UpgradeDialog({ open, onOpenChange }: UpgradeDialogProps) {
  const { session, authFetch } = useAuth()
  const [interval, setInterval] = useState<BillingInterval>("yearly")
  const [busy, setBusy] = useState(false)

  async function startCheckout() {
    setBusy(true)
    try {
      const res = await authFetch("/api/stripe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "checkout", interval }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        if (j?.error === "already_subscribed") {
          throw new Error(
            "You already have an active subscription — manage it in Settings → Account."
          )
        }
        throw new Error(j?.error ?? `Checkout failed (${res.status})`)
      }
      const { url } = (await res.json()) as { url: string }
      window.location.href = url
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start checkout")
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4.5 text-primary" />
            Adonis Pro
          </DialogTitle>
          <DialogDescription>
            AI coaching and automatic recovery data, on top of everything in
            Free.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2.5">
          {PRO_FEATURES.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              <span className="leading-snug">{feature}</span>
            </li>
          ))}
        </ul>

        {session ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              {PLANS.map((plan) => {
                const selected = interval === plan.interval
                return (
                  <button
                    key={plan.interval}
                    type="button"
                    onClick={() => setInterval(plan.interval)}
                    aria-pressed={selected}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition-all",
                      selected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                        : "border-border hover:bg-accent"
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="text-sm font-medium">{plan.label}</span>
                      {plan.note && (
                        <Badge className="px-1.5 text-[0.65rem]">
                          {plan.note}
                        </Badge>
                      )}
                    </span>
                    <span className="text-lg font-semibold tracking-tight">
                      {plan.price}
                      <span className="text-xs font-normal text-muted-foreground">
                        {plan.per}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="space-y-2">
              <Button
                className="h-11 w-full gap-2"
                onClick={startCheckout}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Start 14-day free trial
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                No charge until the trial ends. Cancel anytime.
              </p>
            </div>
          </>
        ) : (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Sign in from Settings to start your free trial — your subscription
            is tied to your account.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Handles the `?checkout=success|cancelled` redirect back from Stripe.
 * Mount once at Gate level (checkout is started from Settings, Home AND
 * onboarding, so the redirect can land anywhere). The param is captured and
 * stripped immediately; the profile refresh waits for the session — on a
 * fresh page load it is still null, and refreshProfile would no-op.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useCheckoutResult(): void {
  const { session, refreshProfile } = useAuth()

  // Captured once on mount (pure — StrictMode double-invokes initializers);
  // the param is stripped and toasted in the guarded effect below.
  const [result] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("checkout")
  )

  const toastedRef = useRef(false)
  useEffect(() => {
    if (!result || toastedRef.current) return
    toastedRef.current = true
    if (result === "success") {
      toast.success("Welcome to Adonis Pro — your trial has started.")
    } else if (result === "cancelled") {
      toast.info("Checkout cancelled — you can upgrade any time.")
    }
    const params = new URLSearchParams(window.location.search)
    params.delete("checkout")
    const qs = params.toString()
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`
    )
  }, [result])

  const refreshedRef = useRef(false)
  useEffect(() => {
    if (result !== "success" || !session || refreshedRef.current) return
    refreshedRef.current = true
    void refreshProfile().catch(() => {})
    // The webhook can land after the first read — re-check shortly after so
    // the user isn't stuck gated until a manual reload.
    const timer = window.setTimeout(() => {
      void refreshProfile().catch(() => {})
    }, 4000)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, session])
}
