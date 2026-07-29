import { useCallback, useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { Activity, Footprints, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { UpgradeDialog } from "@/components/account/upgrade-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { IntegrationSyncResult } from "@/lib/types"
import { useAuth } from "@/store/auth"
import { useStore } from "@/store/store"

type Provider = "whoop" | "googlefit"

const PROVIDERS: {
  id: Provider
  label: string
  description: string
  icon: typeof Activity
}[] = [
  {
    id: "whoop",
    label: "Whoop",
    description: "Recovery, strain, sleep and workouts",
    icon: Activity,
  },
  {
    id: "googlefit",
    label: "Google Fit & Fitbit",
    description: "Steps, weight and workouts from your Google account",
    icon: Footprints,
  },
]

const LABELS: Record<Provider, string> = {
  whoop: "Whoop",
  googlefit: "Google Fit & Fitbit",
}

// Server error codes → human messages (the API contract returns codes like
// "not_connected", not sentences). Unknown codes fall back to a generic
// message; full-sentence server messages (e.g. "… not configured …") pass
// through unchanged.
const ERROR_MESSAGES: Record<string, string> = {
  not_connected: "Not connected yet — connect it first.",
  whoop_error: "Whoop is having trouble right now — try again in a few minutes.",
  googlefit_error:
    "Google is having trouble right now — try again in a few minutes.",
  provider_unavailable:
    "The provider rejected the request — try again later or reconnect.",
  auth_required: "Your session expired — sign in again and retry.",
}

function humanError(code: string | undefined, fallback: string): string {
  if (!code) return fallback
  if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  return code.includes(" ") ? code : fallback
}

interface ProviderStatus {
  connected: boolean
  lastSyncedAt: string | null
}

type ProviderBusy = null | "connect" | "sync" | "disconnect"

export function IntegrationsSection() {
  const { isAuthConfigured, session, isPro, profileUnknown, authFetch } =
    useAuth()
  const { mergeIntegrationData } = useStore()

  const [statuses, setStatuses] = useState<
    Record<Provider, ProviderStatus | null>
  >({ whoop: null, googlefit: null })
  const [busy, setBusy] = useState<Record<Provider, ProviderBusy>>({
    whoop: null,
    googlefit: null,
  })
  // Set when a sync answered 401 reconnect_required — the stored grant is
  // dead (routine for Google in Testing mode) and the row needs a reconnect.
  const [needsReconnect, setNeedsReconnect] = useState<
    Record<Provider, boolean>
  >({ whoop: false, googlefit: false })
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  const setProviderBusy = useCallback((provider: Provider, b: ProviderBusy) => {
    setBusy((prev) => ({ ...prev, [provider]: b }))
  }, [])

  const fetchStatus = useCallback(
    async (provider: Provider) => {
      try {
        const res = await authFetch(`/api/${provider}?action=status`)
        if (!res.ok) return
        const j = (await res.json()) as ProviderStatus
        setStatuses((prev) => ({ ...prev, [provider]: j }))
      } catch {
        /* tolerated — row shows "Not connected" */
      }
    },
    [authFetch]
  )

  const syncNow = useCallback(
    async (provider: Provider) => {
      setProviderBusy(provider, "sync")
      try {
        const res = await authFetch(`/api/${provider}?action=sync`, {
          method: "POST",
        })
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as {
            error?: string
          } | null
          if (res.status === 403 && j?.error === "pro_required") {
            setUpgradeOpen(true)
            return
          }
          if (res.status === 401 && j?.error === "reconnect_required") {
            setNeedsReconnect((prev) => ({ ...prev, [provider]: true }))
            toast.error(`${LABELS[provider]} needs to be reconnected`)
            return
          }
          if (res.status === 400 && j?.error === "not_connected") {
            // The server has no integration row — reflect that in the UI so
            // the Connect button comes back.
            setStatuses((prev) => ({
              ...prev,
              [provider]: { connected: false, lastSyncedAt: null },
            }))
          }
          throw new Error(humanError(j?.error, `${LABELS[provider]} sync failed`))
        }
        const result = (await res.json()) as IntegrationSyncResult
        const { added, updated } = mergeIntegrationData(result)
        setNeedsReconnect((prev) => ({ ...prev, [provider]: false }))
        toast.success(
          `${LABELS[provider]}: ${added} imported, ${updated} updated`
        )
        void fetchStatus(provider)
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : `${LABELS[provider]} sync failed`
        )
      } finally {
        setProviderBusy(provider, null)
      }
    },
    [authFetch, mergeIntegrationData, fetchStatus, setProviderBusy]
  )

  async function connect(provider: Provider) {
    // When the profile fetch failed, pro status is unknown — don't gate
    // client-side; the server still answers 403 pro_required if needed.
    if (!isPro && !profileUnknown) {
      setUpgradeOpen(true)
      return
    }
    setProviderBusy(provider, "connect")
    try {
      const res = await authFetch(`/api/${provider}?action=connect`)
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        if (res.status === 403 && j?.error === "pro_required") {
          setUpgradeOpen(true)
          setProviderBusy(provider, null)
          return
        }
        throw new Error(
          humanError(j?.error, `Could not connect ${LABELS[provider]}`)
        )
      }
      const { url } = (await res.json()) as { url: string }
      window.location.href = url
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : `Could not connect ${LABELS[provider]}`
      )
      setProviderBusy(provider, null)
    }
  }

  async function disconnect(provider: Provider) {
    setProviderBusy(provider, "disconnect")
    try {
      const res = await authFetch(`/api/${provider}?action=disconnect`, {
        method: "POST",
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(
          humanError(j?.error, `Could not disconnect ${LABELS[provider]}`)
        )
      }
      setStatuses((prev) => ({
        ...prev,
        [provider]: { connected: false, lastSyncedAt: null },
      }))
      setNeedsReconnect((prev) => ({ ...prev, [provider]: false }))
      toast.success(`${LABELS[provider]} disconnected`)
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : `Could not disconnect ${LABELS[provider]}`
      )
    } finally {
      setProviderBusy(provider, null)
    }
  }

  useEffect(() => {
    if (!session) return
    void fetchStatus("whoop")
    void fetchStatus("googlefit")
  }, [session, fetchStatus])

  // The ?connected= / ?connect_error= redirect params are handled by the
  // always-mounted useConnectResult hook in Gate (src/App.tsx) — the OAuth
  // return can land while this Settings section isn't mounted at all.

  if (!isAuthConfigured) return null

  const signedIn = !!session

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Integrations
          <Badge className="px-1.5 text-[0.65rem]">Pro</Badge>
        </CardTitle>
        <CardDescription>
          Automatically import recovery and activity data from your devices.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!signedIn && (
          <p className="text-xs text-muted-foreground">
            Sign in above to connect your devices.
          </p>
        )}

        {PROVIDERS.map(({ id, label, description, icon: Icon }) => {
          const status = statuses[id]
          const b = busy[id]
          const isConnected = !!status?.connected

          return (
            <div key={id} className="rounded-lg border p-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-4.5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                  {signedIn && (
                    <p className="text-xs text-muted-foreground">
                      {isConnected ? (
                        <>
                          <span className="font-medium text-foreground">
                            Connected
                          </span>
                          {status?.lastSyncedAt
                            ? ` · last synced ${formatDistanceToNow(
                                new Date(status.lastSyncedAt),
                                { addSuffix: true }
                              )}`
                            : " · never synced"}
                        </>
                      ) : (
                        "Not connected"
                      )}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {isConnected ? (
                    <>
                      {needsReconnect[id] ? (
                        // The callback upserts the existing integration row,
                        // so reconnecting doesn't require disconnecting first.
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={() => void connect(id)}
                          disabled={b !== null}
                        >
                          {b === "connect" && (
                            <Loader2 className="size-3.5 animate-spin" />
                          )}
                          Reconnect
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => void syncNow(id)}
                          disabled={b !== null}
                        >
                          {b === "sync" ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="size-3.5" />
                          )}
                          Sync now
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground"
                            disabled={b !== null}
                          >
                            {b === "disconnect" ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : null}
                            Disconnect
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Disconnect {label}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Adonis stops importing new data from {label}.
                              Everything already imported stays on your device.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => void disconnect(id)}
                            >
                              Disconnect
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => void connect(id)}
                      disabled={!signedIn || b !== null}
                    >
                      {b === "connect" && (
                        <Loader2 className="size-3.5 animate-spin" />
                      )}
                      Connect
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </Card>
  )
}
