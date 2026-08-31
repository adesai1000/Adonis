import type { BackupData } from "./types"

export interface SyncBlob extends BackupData {
  updatedAt: string
}

/** Fetch the remote copy for a sync code (null when nothing is stored yet). */
export async function pullRemote(code: string): Promise<SyncBlob | null> {
  const res = await syncFetch(`/api/sync?code=${encodeURIComponent(code)}`)
  if (!res.ok) {
    const msg = await safeError(res)
    throw new Error(msg)
  }
  const json = (await res.json()) as { data: SyncBlob | null }
  return json.data ?? null
}

/** Upload the current state for a sync code. */
export async function pushRemote(code: string, blob: SyncBlob): Promise<void> {
  const res = await syncFetch(`/api/sync?code=${encodeURIComponent(code)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(blob),
  })
  if (!res.ok) {
    const msg = await safeError(res)
    throw new Error(msg)
  }
}

/** fetch() that turns "TypeError: Failed to fetch" into something a human can act on. */
async function syncFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, { ...init, cache: "no-store" })
  } catch {
    throw new Error(
      typeof navigator !== "undefined" && navigator.onLine === false
        ? "You're offline — sync will work again once you're back online."
        : "Couldn't reach the sync server. Check your connection and try again."
    )
  }
}

async function safeError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: unknown }
    const msg = errorMessage(j.error)
    if (msg) return msg
  } catch {
    /* ignore */
  }
  if (res.status === 503)
    return "Sync isn't set up on the server yet. Deploy with a KV store to enable it."
  if (res.status === 401 || res.status === 403)
    return "The server refused the sync request (not signed in to this deployment?)."
  if (res.status === 413)
    return "Your data is too large for one sync upload (4.5 MB limit). Export a backup, then clear old history to keep syncing."
  return `Sync request failed (${res.status}).`
}

/** Pull a readable message out of whatever shape the server put in `error`. */
function errorMessage(err: unknown): string | null {
  if (typeof err === "string") return err
  if (err && typeof err === "object") {
    const o = err as { message?: unknown; code?: unknown }
    if (typeof o.message === "string") return o.message
    if (typeof o.code === "string") return o.code
  }
  return null
}
