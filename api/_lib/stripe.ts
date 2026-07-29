// Minimal Stripe REST client — raw fetch, form-encoded, no SDK (Edge-safe).
// See docs/RESEARCH.md "Stripe" for the endpoint reference.

import { stripeSecretKey } from "./env"

const STRIPE_API = "https://api.stripe.com"
const STRIPE_VERSION = "2024-06-20" // pinned long-stable version

export interface StripeSubscription {
  id: string
  status: string // trialing | active | past_due | canceled | unpaid | incomplete | incomplete_expired
  customer: string
  cancel_at_period_end: boolean
  current_period_end: number // unix seconds
  created?: number // unix seconds
  items: { data: Array<{ price: { id: string } }> }
}

export async function stripeRequest<T>(
  path: string,
  params?: Record<string, string>,
  method = "POST"
): Promise<T> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${stripeSecretKey()}`,
    "stripe-version": STRIPE_VERSION,
  }
  let body: string | undefined
  if (params && method !== "GET") {
    headers["content-type"] = "application/x-www-form-urlencoded"
    body = new URLSearchParams(params).toString()
  }
  const res = await fetch(`${STRIPE_API}${path}`, { method, headers, body })
  const data = (await res.json()) as T & { error?: { message?: string } }
  if (!res.ok) {
    throw new Error(data?.error?.message || `stripe ${res.status}`)
  }
  return data
}

export async function createCustomer(
  email: string,
  userId: string
): Promise<{ id: string }> {
  const params: Record<string, string> = {
    "metadata[supabase_user_id]": userId,
  }
  if (email) params.email = email
  return stripeRequest("/v1/customers", params)
}

export async function createCheckoutSession(
  customer: string,
  price: string,
  urls: { success: string; cancel: string }
): Promise<{ url: string }> {
  return stripeRequest("/v1/checkout/sessions", {
    mode: "subscription",
    customer,
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    "subscription_data[trial_period_days]": "14",
    allow_promotion_codes: "true",
    success_url: urls.success,
    cancel_url: urls.cancel,
  })
}

export async function createPortalSession(
  customer: string,
  returnUrl: string
): Promise<{ url: string }> {
  return stripeRequest("/v1/billing_portal/sessions", {
    customer,
    return_url: returnUrl,
  })
}

export async function getSubscription(id: string): Promise<StripeSubscription> {
  return stripeRequest(`/v1/subscriptions/${encodeURIComponent(id)}`, undefined, "GET")
}

// All of a customer's subscriptions, any status. Query goes in the path —
// stripeRequest only form-encodes params into the body for non-GET requests.
export async function listSubscriptions(
  customer: string
): Promise<{ data: StripeSubscription[] }> {
  return stripeRequest(
    `/v1/subscriptions?customer=${encodeURIComponent(customer)}&status=all&limit=10`,
    undefined,
    "GET"
  )
}

export async function getCustomer(
  id: string
): Promise<{ id: string; metadata?: Record<string, string> }> {
  return stripeRequest(`/v1/customers/${encodeURIComponent(id)}`, undefined, "GET")
}

// Verify a Stripe webhook signature header: `t=<ts>,v1=<hex>[,v1=…]`.
// HMAC-SHA256 over `${t}.${rawBody}`, constant-time hex compare, and a
// 300-second timestamp tolerance against replay.
export async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!sigHeader || !secret) return false
  let timestamp = ""
  const candidates: string[] = []
  for (const part of sigHeader.split(",")) {
    const idx = part.indexOf("=")
    if (idx < 0) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (k === "t") timestamp = v
    else if (k === "v1" && v) candidates.push(v)
  }
  if (!timestamp || candidates.length === 0) return false
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 300) return false
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`)
  )
  const expected = hex(new Uint8Array(mac))
  let valid = false
  for (const candidate of candidates) {
    if (timingSafeEqual(candidate, expected)) valid = true
  }
  return valid
}

function hex(bytes: Uint8Array): string {
  let out = ""
  for (const b of bytes) out += b.toString(16).padStart(2, "0")
  return out
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Map a Stripe subscription to the profiles-table billing fields.
export function subscriptionToProfilePatch(sub: StripeSubscription): {
  plan: string
  plan_status: string
  price_id: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
} {
  const active =
    sub.status === "trialing" ||
    sub.status === "active" ||
    sub.status === "past_due"
  return {
    plan: active ? "pro" : "free",
    plan_status: sub.status,
    price_id: sub.items?.data?.[0]?.price?.id || null,
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
  }
}
