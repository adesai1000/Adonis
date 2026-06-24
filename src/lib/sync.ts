import type { BackupData } from "./types"

export interface SyncBlob extends BackupData {
  updatedAt: string
}

/** Fetch the remote copy for a sync code (null when nothing is stored yet). */
export async function pullRemote(code: string): Promise<SyncBlob | null> {
  const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}`)
  if (!res.ok) {
    const msg = await safeError(res)
    throw new Error(msg)
  }
  const json = (await res.json()) as { data: SyncBlob | null }
  return json.data ?? null
}

/** Upload the current state for a sync code. */
export async function pushRemote(code: string, blob: SyncBlob): Promise<void> {
  const res = await fetch(`/api/sync?code=${encodeURIComponent(code)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(blob),
  })
  if (!res.ok) {
    const msg = await safeError(res)
    throw new Error(msg)
  }
}

async function safeError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string }
    if (j.error) return j.error
  } catch {
    /* ignore */
  }
  if (res.status === 503)
    return "Sync isn't set up on the server yet. Deploy with a KV store to enable it."
  return `Sync request failed (${res.status}).`
}
