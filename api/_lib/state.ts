// HMAC-signed OAuth `state` parameter (WebCrypto, Edge-runtime safe).
// Format: base64url(JSON {u, p, n, t}) + "." + base64url(HMAC-SHA256 signature).
// `n` is a per-flow nonce that the callback matches against a browser cookie,
// so a state issued to one browser cannot complete the flow in another.
// Key = SHA-256 of SUPABASE_SERVICE_ROLE_KEY; states older than 10 min or with
// a bad signature are rejected.

import { supabaseServiceRoleKey } from "./env"

const MAX_AGE_MS = 10 * 60 * 1000

function base64urlEncode(bytes: Uint8Array): string {
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64urlDecode(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const b64 = text.replace(/-/g, "+").replace(/_/g, "/")
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4))
    const bin = atob(b64 + pad)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = new TextEncoder().encode(supabaseServiceRoleKey())
  const digest = await crypto.subtle.digest("SHA-256", secret)
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  )
}

export async function signState(payload: {
  u: string
  p: string
  n: string
}): Promise<string> {
  const body = new TextEncoder().encode(
    JSON.stringify({ u: payload.u, p: payload.p, n: payload.n, t: Date.now() })
  )
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), body)
  return `${base64urlEncode(body)}.${base64urlEncode(new Uint8Array(sig))}`
}

export async function verifyState(
  state: string
): Promise<{ u: string; p: string; n: string } | null> {
  const [bodyPart, sigPart] = state.split(".")
  if (!bodyPart || !sigPart) return null
  const body = base64urlDecode(bodyPart)
  const sig = base64urlDecode(sigPart)
  if (!body || !sig) return null
  // crypto.subtle.verify is constant-time internally.
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(), sig, body)
  if (!ok) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(body)) as {
      u?: string
      p?: string
      n?: string
      t?: number
    }
    if (!payload.u || !payload.p || !payload.n || typeof payload.t !== "number") {
      return null
    }
    if (Date.now() - payload.t > MAX_AGE_MS) return null
    return { u: payload.u, p: payload.p, n: payload.n }
  } catch {
    return null
  }
}
