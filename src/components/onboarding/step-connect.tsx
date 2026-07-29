import { useState } from "react"
import { Footprints, HeartPulse, Loader2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { UpgradeDialog } from "@/components/account/upgrade-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { isAuthConfigured } from "@/lib/supabase"
import { useAuth } from "@/store/auth"

type Provider = "whoop" | "googlefit"

const INTEGRATIONS: {
  provider: Provider
  name: string
  icon: LucideIcon
  description: string
}[] = [
  {
    provider: "whoop",
    name: "Whoop",
    icon: HeartPulse,
    description: "Recovery, strain, sleep and workouts, imported with one tap.",
  },
  {
    provider: "googlefit",
    name: "Google Fit & Fitbit",
    icon: Footprints,
    description: "Steps, weight and workouts from your Google account.",
  },
]

export function StepConnect() {
  const { session, isPro, authFetch } = useAuth()
  const [busy, setBusy] = useState<Provider | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const canConnect = isAuthConfigured && session !== null

  async function connect(provider: Provider) {
    if (!isPro) {
      setUpgradeOpen(true)
      return
    }
    setBusy(provider)
    try {
      const res = await authFetch(`/api/${provider}?action=connect`)
      const j = (await res.json().catch(() => null)) as {
        url?: string
        error?: string
      } | null
      if (res.status === 403 && j?.error === "pro_required") {
        setUpgradeOpen(true)
        setBusy(null)
        return
      }
      if (!res.ok || !j?.url) {
        throw new Error(j?.error ?? `Connect failed (${res.status})`)
      }
      window.location.href = j.url
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not connect")
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Connect your devices
        </h1>
        <p className="text-sm leading-snug text-muted-foreground">
          Adonis Pro imports recovery, sleep, steps and workouts with one
          tap.
        </p>
      </div>

      <div className="space-y-4">
        {INTEGRATIONS.map(({ provider, name, icon: Icon, description }) => (
          <div
            key={provider}
            className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
          >
            <div className="flex items-start gap-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="size-5 text-primary" />
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="flex items-center gap-2 text-sm font-semibold leading-tight">
                  {name}
                  <Badge className="px-1.5 text-[0.65rem]">Pro</Badge>
                </p>
                <p className="text-sm leading-snug text-muted-foreground">
                  {description}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="mt-3.5 h-10 w-full gap-2"
              disabled={!canConnect || busy !== null}
              onClick={() => connect(provider)}
            >
              {busy === provider && <Loader2 className="size-4 animate-spin" />}
              Connect {name}
            </Button>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {canConnect
          ? "Connecting opens the provider's sign-in — you'll come straight back here."
          : "Connect anytime in Settings → Integrations."}
      </p>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </div>
  )
}
