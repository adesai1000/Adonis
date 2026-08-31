// Shared Upstash Redis (REST) helper for the serverless functions.
//
// The Vercel ⇄ Upstash integration injects credentials with a configurable
// prefix (KV_* by default). Several names are accepted so reconnecting a new
// database under a different prefix never requires a code change.

export interface RedisCreds {
  url: string
  token: string
}

/** Env-var name pairs, most specific first. URL and token always come from the same pair. */
const CRED_PAIRS: [string, string][] = [
  ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
  ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ["REDIS_REST_API_URL", "REDIS_REST_API_TOKEN"],
  ["STORAGE_REST_API_URL", "STORAGE_REST_API_TOKEN"],
]

function env(key: string): string | undefined {
  const v = process.env[key]
  return v && v.trim() ? v.trim() : undefined
}

/** Credentials for the sync store, or null when no complete pair is configured. */
export function redisCreds(): RedisCreds | null {
  for (const [urlKey, tokenKey] of CRED_PAIRS) {
    const url = env(urlKey)
    const token = env(tokenKey)
    if (url && token) return { url, token }
  }
  return null
}

/** Error raised for any storage-side failure; `status` is the HTTP status to return. */
export class RedisError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "RedisError"
    this.status = status
  }
}

const UNREACHABLE_HINT =
  "If the Upstash database was archived or deleted, create a new one in the " +
  "Vercel dashboard (Storage), connect it to this project and redeploy."

/** Run one Redis command through the Upstash REST API and return its result. */
export async function redisCommand(
  creds: RedisCreds,
  command: (string | number)[]
): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(creds.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${creds.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(command),
    })
  } catch (e) {
    // Raw fetch errors can embed the upstream host; keep them in the server
    // logs (Vercel → Logs) and give the caller a clean message.
    console.error("sync storage unreachable:", e instanceof Error ? e.message : e)
    throw new RedisError(`Could not reach sync storage. ${UNREACHABLE_HINT}`, 502)
  }

  const text = await res.text()
  let data: unknown = undefined
  try {
    data = JSON.parse(text)
  } catch {
    /* non-JSON body – rejected below */
  }

  // Upstash always answers with {"result": ...} on success or {"error": "..."}
  // on failure. Anything else (HTML maintenance page, empty body, proxy) must be
  // treated as a failure — never as "nothing stored" — or auto-sync would
  // happily push over data it could not read.
  const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : null
  const upstreamError = obj && typeof obj.error === "string" ? obj.error : null
  if (!res.ok || upstreamError !== null || !obj || !("result" in obj)) {
    // Upstash's own error strings ("Unauthorized", "WRONGTYPE …") are safe and
    // useful to show; arbitrary bodies (HTML error pages, proxies) are not.
    console.error("sync storage bad reply:", res.status, text.slice(0, 500))
    const detail = upstreamError ? `${res.status}: ${upstreamError}` : `${res.status}`
    throw new RedisError(
      `Sync storage returned an unexpected reply (${detail}). ${UNREACHABLE_HINT}`,
      502
    )
  }
  return obj.result
}

export function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  })
}
