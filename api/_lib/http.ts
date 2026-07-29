// Shared HTTP helpers for the Edge API functions.

export function json(
  obj: unknown,
  status = 200,
  headers?: Record<string, string>
): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

// Read one cookie from the request (used for the OAuth nonce binding).
export function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie") || ""
  for (const part of header.split(";")) {
    const idx = part.indexOf("=")
    if (idx < 0) continue
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim())
    }
  }
  return null
}

// Set-Cookie value for a short-lived, browser-bound token. SameSite=Lax so
// the cookie still rides the top-level GET redirect back from the provider.
export function serializeCookie(
  name: string,
  value: string,
  maxAgeSec: number
): string {
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSec}; Path=/; HttpOnly; Secure; SameSite=Lax`
}

// Safe JSON body parse — returns null on empty/invalid bodies instead of throwing.
export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T
  } catch {
    return null
  }
}

// Tiny query-param router helper: `/api/whoop?action=sync` → "sync".
export function getAction(req: Request): string {
  return new URL(req.url).searchParams.get("action") || ""
}
