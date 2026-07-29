// Vercel Edge Function — Stripe billing for Adonis Pro.
// POST JSON (auth required via Authorization: Bearer <supabase access token>):
//   { action: "checkout", interval: "monthly" | "yearly" } → { url }  (Checkout Session, 14-day trial)
//   { action: "portal" }                                   → { url }  (customer billing portal)
export const config = { runtime: "edge" }

import {
  appUrl,
  stripeConfigured,
  stripePriceMonthly,
  stripePriceYearly,
  supabaseConfigured,
} from "./_lib/env"
import { json, readJson } from "./_lib/http"
import {
  createCheckoutSession,
  createCustomer,
  createPortalSession,
  listSubscriptions,
} from "./_lib/stripe"
import {
  ensureProfile,
  getProfile,
  getUserFromToken,
  isProProfile,
  setCustomerIfNull,
} from "./_lib/supa"

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405)
  }
  if (!stripeConfigured() || !supabaseConfigured()) {
    return json({ error: "Billing is not configured on the server." }, 503)
  }

  try {
    const user = await getUserFromToken(req)
    if (!user) return json({ error: "auth_required" }, 401)

    const body = await readJson<{ action?: string; interval?: string }>(req)
    const profile = await ensureProfile(user.id, user.email)
    const origin = appUrl(req)

    if (body?.action === "checkout") {
      const interval = body.interval
      if (interval !== "monthly" && interval !== "yearly") {
        return json({ error: "unknown_interval" }, 400)
      }
      const price =
        interval === "monthly" ? stripePriceMonthly() : stripePriceYearly()
      if (!price) {
        return json(
          { error: "Billing prices are not configured on the server." },
          503
        )
      }

      // Never create a second subscription. The profile mirror is checked
      // first (cheap), but it lags the webhook right after checkout — so an
      // existing customer's live subscriptions are checked with Stripe too.
      if (isProProfile(profile)) {
        return json({ error: "already_subscribed" }, 400)
      }
      let customer = profile.stripe_customer_id
      if (customer) {
        const subs = await listSubscriptions(customer)
        const active = (subs.data || []).some(
          (s) =>
            s.status === "trialing" ||
            s.status === "active" ||
            s.status === "past_due"
        )
        if (active) return json({ error: "already_subscribed" }, 400)
      } else {
        const created = await createCustomer(user.email, user.id)
        // Conditional write: with two concurrent checkouts only one customer
        // id lands; re-read so both requests continue with the winner —
        // otherwise the webhook's lookup by customer id can miss.
        await setCustomerIfNull(user.id, created.id)
        customer = (await getProfile(user.id))?.stripe_customer_id || created.id
      }

      const session = await createCheckoutSession(customer, price, {
        success: `${origin}/?checkout=success`,
        cancel: `${origin}/?checkout=cancelled`,
      })
      return json({ url: session.url })
    }

    if (body?.action === "portal") {
      if (!profile.stripe_customer_id) {
        return json({ error: "no_billing_history" }, 400)
      }
      const session = await createPortalSession(
        profile.stripe_customer_id,
        `${origin}/`
      )
      return json({ url: session.url })
    }

    return json({ error: "unknown_action" }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "stripe failed" }, 500)
  }
}
