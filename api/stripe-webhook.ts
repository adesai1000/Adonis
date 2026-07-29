// Vercel Edge Function — Stripe webhook: mirrors subscription state onto
// public.profiles (looked up by stripe_customer_id). Signature-verified raw
// body; unhandled event types are acknowledged with 200, but processing
// failures (e.g. a transient Supabase blip) return 500 so Stripe redelivers
// with backoff — the profile patch is an idempotent mirror of subscription
// state, so retries are safe.
export const config = { runtime: "edge" }

import {
  stripeConfigured,
  stripeWebhookSecret,
  supabaseConfigured,
} from "./_lib/env"
import { json } from "./_lib/http"
import {
  getCustomer,
  getSubscription,
  listSubscriptions,
  subscriptionToProfilePatch,
  verifyStripeSignature,
} from "./_lib/stripe"
import type { StripeSubscription } from "./_lib/stripe"
import { getProfileByCustomer, updateProfile } from "./_lib/supa"

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405)
  }
  const secret = stripeWebhookSecret()
  if (!secret || !stripeConfigured() || !supabaseConfigured()) {
    return json({ error: "Stripe webhook is not configured on the server." }, 503)
  }

  // Raw body must be read BEFORE any JSON parsing for signature verification.
  const rawBody = await req.text()
  const valid = await verifyStripeSignature(
    rawBody,
    req.headers.get("stripe-signature"),
    secret
  )
  if (!valid) return json({ error: "invalid_signature" }, 400)

  // A signed-but-unparseable body can't be processed — acknowledge it,
  // since redelivering the same bytes can't help.
  let event: { type?: string; data?: { object?: Record<string, unknown> } }
  try {
    event = JSON.parse(rawBody) as typeof event
  } catch {
    return json({ received: true })
  }

  try {
    const type = event.type || ""
    const object = event.data?.object

    if (type === "checkout.session.completed" && object) {
      // The session only carries ids — fetch the subscription for full state.
      const customer =
        typeof object.customer === "string" ? object.customer : ""
      const subscriptionId =
        typeof object.subscription === "string" ? object.subscription : ""
      if (customer && subscriptionId) {
        const sub = await getSubscription(subscriptionId)
        await applyToProfile(customer, sub)
      }
    } else if (
      (type === "customer.subscription.created" ||
        type === "customer.subscription.updated" ||
        type === "customer.subscription.deleted") &&
      object
    ) {
      const sub = object as unknown as StripeSubscription
      if (typeof sub.customer === "string" && sub.customer) {
        // Stripe does not guarantee delivery order — a retried `updated`
        // arriving after `deleted` would resurrect Pro forever. Ignore the
        // payload's state and mirror the customer's CURRENT subscriptions.
        const current = await currentSubscription(sub.customer)
        await applyToProfile(sub.customer, current ?? sub)
      }
    }
    // Everything else: acknowledged and ignored.
  } catch (e) {
    // 5xx so Stripe retries with backoff — without it a transient Supabase
    // failure would permanently drop e.g. checkout.session.completed and
    // leave a paying customer on the free plan.
    console.error(
      "stripe-webhook error:",
      e instanceof Error ? e.message : "unknown error"
    )
    return json({ error: "processing_failed" }, 500)
  }

  return json({ received: true })
}

const ACCESS_STATUSES = new Set(["trialing", "active", "past_due"])

// The subscription that should drive the profile: any access-granting one
// wins; otherwise the most recently created (e.g. all canceled → the newest).
async function currentSubscription(
  customer: string
): Promise<StripeSubscription | null> {
  const { data } = await listSubscriptions(customer)
  if (!data || data.length === 0) return null
  return (
    data.find((sub) => ACCESS_STATUSES.has(sub.status)) ??
    [...data].sort((a, b) => (b.created || 0) - (a.created || 0))[0]
  )
}

async function applyToProfile(
  customer: string,
  sub: StripeSubscription
): Promise<void> {
  const profile = await getProfileByCustomer(customer)
  if (profile) {
    await updateProfile(profile.user_id, subscriptionToProfilePatch(sub))
    return
  }
  // The profile may point at a different customer (lost create-customer race
  // in /api/stripe checkout) — resolve the user from the Stripe customer's
  // metadata and adopt the customer id that actually holds the subscription,
  // so later subscription webhooks and the billing portal resolve correctly.
  const stripeCustomer = await getCustomer(customer)
  const userId = stripeCustomer.metadata?.supabase_user_id || ""
  if (!userId) {
    // Permanent (not transient) — log and acknowledge; retrying won't help.
    console.error("stripe-webhook: no profile for customer")
    return
  }
  await updateProfile(userId, {
    stripe_customer_id: customer,
    ...subscriptionToProfilePatch(sub),
  })
}
