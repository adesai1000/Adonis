import { useState } from "react"
import {
  ArrowRight,
  Dumbbell,
  HeartPulse,
  Loader2,
  Mail,
  MailCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isAuthConfigured } from "@/lib/supabase"
import { useAuth } from "@/store/auth"
import { useStore } from "@/store/store"

interface Feature {
  icon: LucideIcon
  title: string
  description: string
}

const FEATURES: Feature[] = [
  {
    icon: Dumbbell,
    title: "Workouts & nutrition",
    description: "Log lifts, cardio, meals and macros in seconds.",
  },
  {
    icon: TrendingUp,
    title: "Trends & history",
    description: "Body-weight trends, streaks and your full training history.",
  },
  {
    icon: Sparkles,
    title: "AI coaching",
    description: "Weekly insights that read your training, food and recovery.",
  },
  {
    icon: HeartPulse,
    title: "Whoop, Google Fit & Fitbit",
    description: "Recovery, sleep, strain and steps imported with one tap.",
  },
]

export function Welcome({ onDone }: { onDone: () => void }) {
  const { loadDemoData } = useStore()
  const { signInWithEmail, signInWithGoogle } = useAuth()
  const [view, setView] = useState<"main" | "signin">("main")
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState<null | "email" | "google">(null)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startDemo() {
    loadDemoData()
    onDone()
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setBusy("email")
    setError(null)
    try {
      await signInWithEmail(email.trim())
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the link")
    } finally {
      setBusy(null)
    }
  }

  async function googleSignIn() {
    setBusy("google")
    setError(null)
    try {
      await signInWithGoogle()
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start sign-in")
      setBusy(null)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background pt-safe pb-safe">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-10 px-6 py-12 animate-in fade-in-50 duration-500">
        <div className="space-y-5">
          <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-[0.25em] text-primary">
            ADONIS
          </span>
          <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight">
            Train. Eat. Recover. One private dashboard.
          </h1>
        </div>

        {view === "main" ? (
          <>
            <ul className="space-y-4">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <li key={title} className="flex items-start gap-3.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="size-5 text-primary" />
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold leading-tight">{title}</p>
                    <p className="text-sm leading-snug text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="space-y-3">
              <Button className="h-12 w-full gap-2 text-base" onClick={onDone}>
                Start tracking
                <ArrowRight className="size-4" />
              </Button>
              {isAuthConfigured && (
                <Button
                  variant="outline"
                  className="h-12 w-full text-base"
                  onClick={() => setView("signin")}
                >
                  Sign in
                </Button>
              )}
              <Button
                variant="ghost"
                className="h-12 w-full text-muted-foreground"
                onClick={startDemo}
              >
                Explore with demo data
              </Button>
            </div>
          </>
        ) : sent ? (
          <div className="space-y-5">
            <div className="flex items-start gap-3.5 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <MailCheck className="size-5 text-primary" />
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-semibold leading-tight">
                  Check your inbox
                </p>
                <p className="text-sm leading-snug text-muted-foreground">
                  We sent a sign-in link to{" "}
                  <span className="font-medium text-foreground">{email}</span>.
                  Open it on this device to finish signing in.
                </p>
              </div>
            </div>
            <Button className="h-12 w-full gap-2 text-base" onClick={onDone}>
              Continue to the app
              <ArrowRight className="size-4" />
            </Button>
          </div>
        ) : (
          <form onSubmit={sendMagicLink} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="welcome-email">Email</Label>
              <Input
                id="welcome-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-12"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <div className="space-y-3">
              <Button
                type="submit"
                className="h-12 w-full gap-2 text-base"
                disabled={busy !== null || !email.trim()}
              >
                {busy === "email" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Mail className="size-4" />
                )}
                Send magic link
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full gap-2 text-base"
                onClick={googleSignIn}
                disabled={busy !== null}
              >
                {busy === "google" && <Loader2 className="size-4 animate-spin" />}
                Continue with Google
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-12 w-full text-muted-foreground"
                onClick={() => {
                  setView("main")
                  setError(null)
                }}
              >
                Back
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Your data lives on this device. Sign in any time to sync it across
          devices.
        </p>
      </div>
    </div>
  )
}
