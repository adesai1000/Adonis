import { useEffect, useRef } from "react"
import { toast } from "sonner"
import type { IntegrationSyncResult } from "@/lib/types"
import { useAuth } from "@/store/auth"
import { useStore } from "@/store/store"

type Provider = "whoop" | "googlefit"

const LABELS: Record<Provider, string> = {
  whoop: "Whoop",
  googlefit: "Google Fit & Fitbit",
}

/**
 * Handles the `?connected=` / `?connect_error=` redirect back from a provider
 * OAuth flow (api/whoop.ts, api/googlefit.ts). The redirect can land on ANY
 * screen — Settings, onboarding, Home — so mount this exactly once at Gate
 * level. Toasts the result, runs the first sync (merging the imported
 * entries into the store), and strips the params.
 */
export function useConnectResult(): void {
  const { loading, authFetch } = useAuth()
  const { mergeIntegrationData } = useStore()

  // Refs keep the effect single-run while always using the latest deps.
  const authFetchRef = useRef(authFetch)
  authFetchRef.current = authFetch
  const mergeRef = useRef(mergeIntegrationData)
  mergeRef.current = mergeIntegrationData
  const handledRef = useRef(false)

  useEffect(() => {
    // authFetch needs the restored session before the sync can run.
    if (loading || handledRef.current) return
    const params = new URLSearchParams(window.location.search)
    const connected = params.get("connected")
    const connectError = params.get("connect_error")
    if (!connected && !connectError) return
    handledRef.current = true

    if (connected === "whoop" || connected === "googlefit") {
      toast.success(`${LABELS[connected]} connected`)
      void (async () => {
        try {
          const res = await authFetchRef.current(
            `/api/${connected}?action=sync`,
            { method: "POST" }
          )
          if (!res.ok) {
            const j = (await res.json().catch(() => null)) as {
              error?: string
            } | null
            if (res.status === 403 && j?.error === "pro_required") {
              toast.error(
                "Syncing needs an active Pro plan — upgrade in Settings → Account."
              )
              return
            }
            throw new Error(j?.error ?? `Sync failed (${res.status})`)
          }
          const result = (await res.json()) as IntegrationSyncResult
          const { added, updated } = mergeRef.current(result)
          toast.success(
            `${LABELS[connected]}: ${added} imported, ${updated} updated`
          )
        } catch {
          toast.error(
            `${LABELS[connected]} sync failed — use Sync now in Settings → Integrations.`
          )
        }
      })()
    }
    if (connectError) {
      const label =
        connectError === "whoop" || connectError === "googlefit"
          ? LABELS[connectError]
          : connectError
      toast.error(`Could not connect ${label} — please try again`)
    }

    params.delete("connected")
    params.delete("connect_error")
    const qs = params.toString()
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`
    )
  }, [loading])
}
