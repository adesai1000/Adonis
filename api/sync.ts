// Vercel Edge Function — tiny key/value sync backed by Upstash Redis.
// The whole app state is stored as one JSON blob under a user-chosen "sync code".
// Anyone with the code can read/write that blob — simple, low-security sync
// between your own devices.
//
// Credentials come from the Vercel ⇄ Upstash integration (KV_REST_API_URL /
// KV_REST_API_TOKEN by default; see api/_lib/redis.ts for the accepted names).
// Payloads above Vercel's 4.5 MB function limit are rejected with 413 before
// this code runs; the client turns that into a readable message.
import { json, redisCommand, redisCreds, RedisError } from "./_lib/redis"

export const config = { runtime: "edge" }

export default async function handler(req: Request): Promise<Response> {
  const creds = redisCreds()
  if (!creds) {
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
      const value = await redisCommand(creds, ["GET", key])
      if (value === null || value === undefined) return json({ data: null })
      if (typeof value !== "string") {
        return json({ error: "Stored sync data has an unexpected type." }, 502)
      }
      let data: unknown
      try {
        data = JSON.parse(value)
      } catch {
        // Never report a corrupt blob as "nothing stored": auto-sync would
        // overwrite it. Surface it so the user can push deliberately instead.
        return json(
          {
            error:
              "The data stored under this sync code is not readable. Tap Push to cloud on the device with the freshest data to replace it.",
          },
          502
        )
      }
      return json({ data })
    }

    if (req.method === "POST" || req.method === "PUT") {
      const body = await req.text()
      if (!body) return json({ error: "Empty sync payload." }, 400)
      try {
        JSON.parse(body)
      } catch {
        return json({ error: "Sync payload must be JSON." }, 400)
      }
      await redisCommand(creds, ["SET", key, body])
      return json({ ok: true })
    }

    return json({ error: "Method not allowed" }, 405)
  } catch (e) {
    if (e instanceof RedisError) return json({ error: e.message }, e.status)
    return json({ error: e instanceof Error ? e.message : "sync failed" }, 500)
  }
}
