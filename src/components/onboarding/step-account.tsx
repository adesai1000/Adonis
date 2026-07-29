import { useState } from "react"
import { CheckCircle2, Loader2, Mail, MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/store/auth"

export function StepAccount() {
  const { session, user, signInWithEmail, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState<null | "email" | "google">(null)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start sign-in")
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Sync across devices
        </h1>
        <p className="text-sm leading-snug text-muted-foreground">
          A free account backs up your data and keeps every device in sync. No
          card required.
        </p>
      </div>

      {session ? (
        <div className="flex items-start gap-3.5 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <CheckCircle2 className="size-5 text-primary" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-semibold leading-tight">
              You&apos;re signed in
            </p>
            <p className="text-sm leading-snug text-muted-foreground">
              {user?.email ? (
                <>
                  Syncing to{" "}
                  <span className="font-medium text-foreground">
                    {user.email}
                  </span>
                  .
                </>
              ) : (
                "Your data now syncs across devices."
              )}
            </p>
          </div>
        </div>
      ) : sent ? (
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
              Open it on this device, then continue.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={sendMagicLink} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ob-email">Email</Label>
            <Input
              id="ob-email"
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
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      )}
    </div>
  )
}
