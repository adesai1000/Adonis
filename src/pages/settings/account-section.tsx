import { useState, type FormEvent } from "react"
import { differenceInCalendarDays, format } from "date-fns"
import { CreditCard, Loader2, LogOut, MailCheck, Send, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { UpgradeDialog } from "@/components/account/upgrade-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/store/auth"

export function AccountSection() {
  const {
    isAuthConfigured,
    user,
    profile,
    isPro,
    signInWithEmail,
    signInWithGoogle,
    signOut,
    authFetch,
  } = useAuth()
  // ?checkout= handling lives in Gate (App.tsx) — it must run on any screen.

  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState<null | "email" | "google" | "portal">(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  if (!isAuthConfigured) return null

  async function sendMagicLink(e: FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!value) {
      toast.error("Enter your email address")
      return
    }
    setBusy("email")
    try {
      await signInWithEmail(value)
      setSent(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the link")
    } finally {
      setBusy(null)
    }
  }

  async function continueWithGoogle() {
    setBusy("google")
    try {
      await signInWithGoogle()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed")
      setBusy(null)
    }
  }

  async function manageBilling() {
    setBusy("portal")
    try {
      const res = await authFetch("/api/stripe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "portal" }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(j?.error ?? `Billing portal failed (${res.status})`)
      }
      const { url } = (await res.json()) as { url: string }
      window.location.href = url
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not open billing portal"
      )
      setBusy(null)
    }
  }

  async function doSignOut() {
    try {
      await signOut()
      toast.success("Signed out")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign out failed")
    }
  }

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Sign in to back up your data and sync it across all your devices —
            free.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sent ? (
            <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3">
              <MailCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-sm leading-snug">
                Check your inbox — we sent a sign-in link to{" "}
                <span className="font-medium">{email.trim()}</span>.
              </p>
            </div>
          ) : (
            <form onSubmit={sendMagicLink} className="space-y-1.5">
              <Label htmlFor="account-email">Email</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="account-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="h-11"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Button
                  type="submit"
                  className="h-11 gap-2"
                  disabled={busy !== null}
                >
                  {busy === "email" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Send magic link
                </Button>
              </div>
            </form>
          )}

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            onClick={continueWithGoogle}
            disabled={busy !== null}
          >
            {busy === "google" && <Loader2 className="size-4 animate-spin" />}
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    )
  }

  const trialing = profile?.plan_status === "trialing"
  const periodEnd = profile?.current_period_end
    ? new Date(profile.current_period_end)
    : null
  const validEnd = periodEnd && !isNaN(periodEnd.getTime()) ? periodEnd : null

  let planBadge = (
    <Badge variant="secondary" className="px-1.5 text-[0.65rem]">
      Free
    </Badge>
  )
  if (trialing) {
    const daysLeft = validEnd
      ? Math.max(0, differenceInCalendarDays(validEnd, new Date()))
      : null
    planBadge = (
      <Badge className="px-1.5 text-[0.65rem]">
        Trial
        {daysLeft !== null &&
          ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
      </Badge>
    )
  } else if (isPro) {
    planBadge = <Badge className="px-1.5 text-[0.65rem]">Pro</Badge>
  }

  let renewal: string | null = null
  if (validEnd) {
    const dateStr = format(validEnd, "MMM d, yyyy")
    if (trialing) renewal = `Trial ends ${dateStr}`
    else if (profile?.cancel_at_period_end) renewal = `Pro ends ${dateStr}`
    else if (profile?.plan_status === "active") renewal = `Renews ${dateStr}`
  }

  const hasBillingHistory = isPro || !!profile?.plan_status

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 truncate text-sm font-medium">
              {user.email}
            </span>
            {planBadge}
          </div>
          {renewal && (
            <p className="text-xs text-muted-foreground">{renewal}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {!isPro && (
            <Button
              className="h-11 gap-2"
              onClick={() => setUpgradeOpen(true)}
            >
              <Sparkles className="size-4" />
              Upgrade to Pro
            </Button>
          )}
          {hasBillingHistory && (
            <Button
              variant="outline"
              className="h-11 gap-2"
              onClick={manageBilling}
              disabled={busy !== null}
            >
              {busy === "portal" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CreditCard className="size-4" />
              )}
              Manage billing
            </Button>
          )}
          <Button
            variant="outline"
            className="h-11 gap-2"
            onClick={doSignOut}
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </CardContent>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </Card>
  )
}
