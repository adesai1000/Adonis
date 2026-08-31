// Vercel Edge Function — daily keep-alive for the Upstash sync store.
//
// Upstash archives free databases after ~30 days without a single command,
// which silently breaks "Push to cloud". A Vercel Cron Job (see vercel.json)
// hits this endpoint once a day and writes a timestamp so the database never
// goes idle long enough to be archived.
import { json, redisCommand, redisCreds, RedisError } from "./_lib/redis"

export const config = { runtime: "edge" }

/** Deliberately outside the `adonis:<code>` namespace used for user blobs. */
const KEEPALIVE_KEY = "adonis-keepalive"

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405)

  // Only accept invocations from Vercel Cron. When CRON_SECRET is set Vercel
  // sends it as a bearer token; otherwise fall back to the cron schedule header
  // Vercel attaches to every cron request.
  const secret = process.env.CRON_SECRET
  const authorized = secret
    ? req.headers.get("authorization") === `Bearer ${secret}`
    : req.headers.has("x-vercel-cron-schedule")
  if (!authorized) return json({ error: "Unauthorized" }, 401)

  const creds = redisCreds()
  if (!creds) {
    return json({ error: "Sync storage is not configured on the server." }, 503)
  }

  try {
    const at = new Date().toISOString()
    await redisCommand(creds, ["SET", KEEPALIVE_KEY, at])
    return json({ ok: true, at })
  } catch (e) {
    if (e instanceof RedisError) return json({ error: e.message }, e.status)
    return json({ error: e instanceof Error ? e.message : "keepalive failed" }, 500)
  }
}
