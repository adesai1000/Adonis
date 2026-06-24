// Vercel Edge Function — tiny key/value sync backed by Upstash Redis (Vercel KV).
// The whole app state is stored as one JSON blob under a user-chosen "sync code".
// Anyone with the code can read/write that blob — simple, low-security sync
// between your own devices.
//
// Needs these env vars (set automatically when you add Vercel KV / Upstash):
//   KV_REST_API_URL      (or UPSTASH_REDIS_REST_URL)
//   KV_REST_API_TOKEN    (or UPSTASH_REDIS_REST_TOKEN)
export const config = { runtime: "edge" }

function creds() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  return { url, token }
}

async function redis(command: unknown[]): Promise<unknown> {
  const { url, token } = creds()
  const res = await fetch(url as string, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(command),
  })
  if (!res.ok) throw new Error(`storage error ${res.status}`)
  const data = (await res.json()) as { result?: unknown }
  return data.result
}

export default async function handler(req: Request): Promise<Response> {
  const { url, token } = creds()
  if (!url || !token) {
    return json({ error: "Sync storage is not configured on the server." }, 503)
  }

  const reqUrl = new URL(req.url)
  const code = (reqUrl.searchParams.get("code") || "").trim()
  if (!code || code.length < 4) {
    return json({ error: "A sync code of at least 4 characters is required." }, 400)
  }
  const key = `adonis:${code}`

  try {
    if (req.method === "GET") {
      const value = await redis(["GET", key])
      const data = typeof value === "string" ? JSON.parse(value) : null
      return json({ data })
    }
    if (req.method === "POST" || req.method === "PUT") {
      const body = await req.text()
      await redis(["SET", key, body])
      return json({ ok: true })
    }
    return json({ error: "Method not allowed" }, 405)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "sync failed" }, 500)
  }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  })
}
