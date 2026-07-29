// Supabase server-side helpers — raw fetch against the Auth + PostgREST
// endpoints with the service-role key (no SDK; Edge-runtime safe).
// See docs/RESEARCH.md "Supabase" for the endpoint reference.

import { supabaseAnonKey, supabaseServiceRoleKey, supabaseUrl } from "./env"

export interface Profile {
  user_id: string
  email: string | null
  stripe_customer_id: string | null
  plan: string // "free" | "pro"
  plan_status: string | null // stripe subscription status
  price_id: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  created_at: string
  updated_at: string
}

export interface IntegrationRow {
  user_id: string
  provider: string // "whoop" | "googlefit"
  access_token: string
  refresh_token: string | null
  expires_at: string | null
  scopes: string | null
  external_user_id: string | null
  last_synced_at: string | null
  created_at?: string
}

// Verify a Supabase user access token (Authorization: Bearer <token>) via the
// Auth endpoint. Returns null for missing/invalid tokens — never throws for
// auth failures so callers can map null → 401.
export async function getUserFromToken(
  req: Request
): Promise<{ id: string; email: string } | null> {
  const header = req.headers.get("authorization") || ""
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (!token) return null
  const res = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey(),
      authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) return null
  const user = (await res.json()) as { id?: string; email?: string }
  if (!user.id) return null
  return { id: user.id, email: user.email || "" }
}

// PostgREST request with the service-role key. Throws on non-2xx with a terse
// message (never includes keys or row contents).
async function rest(
  path: string,
  init: { method?: string; body?: string; prefer?: string } = {}
): Promise<Response> {
  const key = supabaseServiceRoleKey()
  const headers: Record<string, string> = {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  }
  if (init.prefer) headers.prefer = init.prefer
  const res = await fetch(`${supabaseUrl()}/rest/v1${path}`, {
    method: init.method || "GET",
    headers,
    body: init.body,
  })
  if (!res.ok) throw new Error(`supabase ${res.status}`)
  return res
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const res = await rest(
    `/profiles?user_id=eq.${encodeURIComponent(userId)}&select=*`
  )
  const rows = (await res.json()) as Profile[]
  return rows[0] || null
}

export async function getProfileByCustomer(
  stripeCustomerId: string
): Promise<Profile | null> {
  const res = await rest(
    `/profiles?stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}&select=*`
  )
  const rows = (await res.json()) as Profile[]
  return rows[0] || null
}

// Pro check: plan === "pro" AND (no status yet OR a status that keeps access).
export function isProProfile(profile: Profile | null): boolean {
  if (!profile || profile.plan !== "pro") return false
  const status = profile.plan_status
  if (status == null) return true
  return status === "trialing" || status === "active" || status === "past_due"
}

export async function updateProfile(
  userId: string,
  patch: Partial<Profile>
): Promise<void> {
  await rest(`/profiles?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    prefer: "return=minimal",
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  })
}

// Conditional write for the checkout customer-creation race: only fills the
// column while it is still NULL, so of two concurrent requests exactly one
// writer wins (atomic under READ COMMITTED) — callers re-read the profile.
export async function setCustomerIfNull(
  userId: string,
  customerId: string
): Promise<void> {
  await rest(
    `/profiles?user_id=eq.${encodeURIComponent(userId)}&stripe_customer_id=is.null`,
    {
      method: "PATCH",
      prefer: "return=minimal",
      body: JSON.stringify({
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      }),
    }
  )
}

// Upsert-on-first-touch in case the auth.users → profiles trigger is missing.
export async function ensureProfile(
  userId: string,
  email: string
): Promise<Profile> {
  const existing = await getProfile(userId)
  if (existing) return existing
  const res = await rest(`/profiles?on_conflict=user_id`, {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: JSON.stringify({ user_id: userId, email: email || null }),
  })
  const rows = (await res.json()) as Profile[]
  if (!rows[0]) throw new Error("supabase profile upsert failed")
  return rows[0]
}

export async function getIntegration(
  userId: string,
  provider: string
): Promise<IntegrationRow | null> {
  const res = await rest(
    `/integrations?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}&select=*`
  )
  const rows = (await res.json()) as IntegrationRow[]
  return rows[0] || null
}

export async function upsertIntegration(row: IntegrationRow): Promise<void> {
  await rest(`/integrations?on_conflict=user_id,provider`, {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: JSON.stringify(row),
  })
}

export async function deleteIntegration(
  userId: string,
  provider: string
): Promise<void> {
  await rest(
    `/integrations?user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}`,
    { method: "DELETE" }
  )
}
