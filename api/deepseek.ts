// Vercel Edge Function — proxies the AI request to DeepSeek so the API key
// stays server-side (never shipped to the browser) and CORS is avoided.
// Set the DEEPSEEK_API environment variable in your Vercel project settings.
// When Supabase is configured, the AI Coach is a Pro feature: requests must
// carry a valid user token for a Pro-plan profile. Unconfigured installs keep
// the legacy open-proxy behavior.
export const config = { runtime: "edge" }

import { supabaseConfigured } from "./_lib/env"
import { getProfile, getUserFromToken, isProProfile } from "./_lib/supa"

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405)
  }

  if (supabaseConfigured()) {
    try {
      const user = await getUserFromToken(req)
      if (!user) return json({ error: "auth_required" }, 401)
      const profile = await getProfile(user.id)
      if (!isProProfile(profile)) return json({ error: "pro_required" }, 403)
    } catch (e) {
      return json(
        { error: e instanceof Error ? e.message : "auth check failed" },
        500
      )
    }
  }

  const key = process.env.DEEPSEEK_API || process.env.VITE_DEEPSEEK_API
  if (!key) {
    return json({ error: "DEEPSEEK_API is not configured on the server." }, 500)
  }

  const body = await req.text()
  const upstream = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body,
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  })
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  })
}
