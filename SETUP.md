# SETUP.md — Adonis go-live checklist

Ordered, do-once checklist to take Adonis from repo to a live SaaS.
Total time: ~1.5–2 hours. Everything is optional — with zero env vars the app
still runs as a local-only tracker. Each step turns on exactly one feature set.

Env var reference: [.env.example](./.env.example). Architecture contract:
[docs/SAAS-SPEC.md](./docs/SAAS-SPEC.md).

---

## 0. Prerequisites (~5 min)

- [ ] Code pushed to a GitHub repo.
- [ ] A Vercel account (free Hobby tier is fine to start).
- [ ] A domain — **optional at first**. You can launch on `https://<project>.vercel.app`
      and swap the domain in later (step 6 lists every place the URL is registered).

## 1. Supabase — accounts + cloud sync + billing state (~15 min)

- [ ] [supabase.com/dashboard](https://supabase.com/dashboard) → **New project** →
      name `adonis`, pick a region near your users, set a database password. Wait for provisioning.
- [ ] **SQL Editor → New query** → paste the entire contents of
      [`supabase/schema.sql`](./supabase/schema.sql) → **Run**. Creates `profiles`,
      `user_docs`, `integrations` with RLS and the signup trigger.
- [ ] **Authentication → Sign In / Providers**:
  - [ ] **Email** — enable. Magic-link sign-in is what the app uses; no extra config.
  - [ ] **Google** — optional. Needs a Google OAuth client (you can create it in the
        same Google Cloud project as step 4): paste client id + secret here, and add
        the callback URL Supabase shows (`https://<project-ref>.supabase.co/auth/v1/callback`)
        to that OAuth client's authorized redirect URIs.
- [ ] **Authentication → URL Configuration**:
  - [ ] **Site URL** = your production URL (Vercel URL for now; custom domain later).
  - [ ] **Redirect URLs** — add all of: `https://<project>.vercel.app`,
        `https://<your-domain>` (when you have one), `http://localhost:5173`
        (Vite dev), `http://localhost:3000` (`vercel dev`).
- [ ] **Project Settings → API** — copy three values for step 5:
      **Project URL**, **anon key**, **service_role key** (secret — server only).

## 2. Stripe — Pro subscriptions (~15 min, test mode first)

- [ ] [dashboard.stripe.com](https://dashboard.stripe.com) → toggle **Test mode** ON (top right).
- [ ] **Product catalog → + Add product**: name **Adonis Pro** →
  - [ ] Price 1: **$7.99**, Recurring, Monthly → save, copy the `price_…` id → `STRIPE_PRICE_MONTHLY`.
  - [ ] Price 2 (Add another price): **$59.99**, Recurring, Yearly → copy id → `STRIPE_PRICE_YEARLY`.
- [ ] **Settings → Billing → Customer portal** → **Activate**. (Defaults are fine;
      this powers the "Manage billing" button — cancel/update card.)
- [ ] **Developers → Webhooks → + Add endpoint**:
  - [ ] Endpoint URL: `https://<domain>/api/stripe-webhook` (use the Vercel URL until step 6).
  - [ ] Events — select exactly: `checkout.session.completed`,
        `customer.subscription.created`, `customer.subscription.updated`,
        `customer.subscription.deleted`.
  - [ ] Save → **Reveal signing secret** → copy `whsec_…` → `STRIPE_WEBHOOK_SECRET`.
- [ ] **Developers → API keys** → copy the **Secret key** (`sk_test_…`) → `STRIPE_SECRET_KEY`.
- [ ] **At launch:** toggle to **Live mode** and repeat this whole step (product,
      prices, portal, webhook, keys) — live mode is a separate copy of everything.
      Swap the four Stripe env vars in Vercel and redeploy.

## 3. Whoop — recovery integration (~10 min)

- [ ] [developer.whoop.com](https://developer.whoop.com) → sign in with your Whoop
      account → dashboard → **Create app**.
- [ ] Scopes: `read:recovery read:cycles read:sleep read:workout read:profile offline`
      (`offline` is required — without it there are no refresh tokens and syncs die after ~1 hour).
- [ ] Redirect URI: `https://<domain>/api/whoop/callback` (HTTPS required;
      `http://localhost:3000/api/whoop/callback` may be added for `vercel dev` testing).
- [ ] Fill in app name, contact email, privacy policy URL.
- [ ] Copy **Client ID** → `WHOOP_CLIENT_ID`, **Client Secret** → `WHOOP_CLIENT_SECRET`.
- [ ] **Note:** unreviewed apps are capped at **10 Whoop members** — enough to launch
      and test. Submit the app-approval form (Developer Dashboard) early; Whoop reviews
      monthly and delays are common. See GTM.md for the integrations-page outreach.

## 4. Google Health API — Google Fit & Fitbit integration (~20 min)

> Google Fit REST is closed to new apps (May 2024) and shuts down end-2026; this
> integration uses its successor, the **Google Health API** (also where Fitbit
> account data lives). Internal provider id stays `googlefit`.

> **PROMINENT — weekly reconnects until Google review.** While the OAuth consent
> screen is in **Testing** publishing status, **Google refresh tokens expire every
> 7 days** — every connected user must reconnect weekly (the app shows a clean
> "reconnect required" prompt). This only goes away after you pass Google's
> [third-party security review for restricted scopes](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
> (paid CASA assessment, weeks of lead time). Apply once there are real users on
> the integration — don't block launch on it.

- [ ] [console.cloud.google.com](https://console.cloud.google.com) → project picker →
      **New project** → name `adonis`.
- [ ] **APIs & Services → Library** → search **Google Health API**
      (`health.googleapis.com`) → **Enable**.
- [ ] **APIs & Services → OAuth consent screen** → User type **External** → fill app
      name, support email, developer contact → save. Leave publishing status in
      **Testing**.
- [ ] **OAuth consent screen → Audience** → add every account that will use the
      integration under **Test users** (max 100) — start with your own Google account.
- [ ] **OAuth consent screen → Data Access** → **Add or remove scopes** → add the
      three `googlehealth` readonly scopes the app requests:
      `…/auth/googlehealth.activity_and_fitness.readonly`,
      `…/auth/googlehealth.sleep.readonly`,
      `…/auth/googlehealth.health_metrics_and_measurements.readonly`.
- [ ] **APIs & Services → Credentials → + Create credentials → OAuth client ID** →
      type **Web application** → Authorized redirect URI:
      `https://<domain>/api/googlefit/callback`.
- [ ] Copy **Client ID** → `GOOGLE_FIT_CLIENT_ID`, **Client secret** → `GOOGLE_FIT_CLIENT_SECRET`.

## 5. Vercel — deploy (~10 min)

- [ ] [vercel.com/new](https://vercel.com/new) → import the GitHub repo. Framework
      preset auto-detects as **Vite** (build `npm run build`, output `dist`). Deploy once.
- [ ] **Project → Settings → Environment Variables** — add everything you collected
      (all environments, or Production+Preview):

| Var | Scope | Where to find it |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | CLIENT | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | CLIENT | Supabase → Project Settings → API → anon key |
| `SUPABASE_URL` | SERVER | same value as `VITE_SUPABASE_URL` |
| `SUPABASE_ANON_KEY` | SERVER | same value as `VITE_SUPABASE_ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | SERVER | Supabase → Project Settings → API → service_role (secret) |
| `STRIPE_SECRET_KEY` | SERVER | Stripe → Developers → API keys (`sk_test_…` now, `sk_live_…` at launch) |
| `STRIPE_WEBHOOK_SECRET` | SERVER | Stripe → Developers → Webhooks → your endpoint → signing secret |
| `STRIPE_PRICE_MONTHLY` | SERVER | Stripe → Product catalog → Adonis Pro → $7.99 price id |
| `STRIPE_PRICE_YEARLY` | SERVER | Stripe → Product catalog → Adonis Pro → $59.99 price id |
| `WHOOP_CLIENT_ID` | SERVER | developer.whoop.com → your app |
| `WHOOP_CLIENT_SECRET` | SERVER | developer.whoop.com → your app |
| `GOOGLE_FIT_CLIENT_ID` | SERVER | Google Cloud → Credentials → OAuth client (skip if step 4 skipped) |
| `GOOGLE_FIT_CLIENT_SECRET` | SERVER | Google Cloud → Credentials → OAuth client |
| `APP_URL` | SERVER | your canonical origin — `https://<project>.vercel.app` for now |
| `DEEPSEEK_API` | SERVER | platform.deepseek.com → API keys (AI coach) |
| `KV_REST_API_URL` | SERVER | auto-injected: Vercel → Storage → Create → Upstash Redis (legacy code sync, optional) |
| `KV_REST_API_TOKEN` | SERVER | auto-injected with the above |

- [ ] Redeploy (**Deployments → ⋯ → Redeploy**) so the env vars take effect.
- [ ] Smoke test: open the URL → app loads → Settings shows the account section →
      magic-link sign-in works → `/landing` renders the marketing page.

## 6. Domain + URL registrations (~15 min, when you have the domain)

- [ ] Vercel → **Project → Settings → Domains** → add `<your-domain>` (+ `www` redirect).
- [ ] Set `APP_URL=https://<your-domain>` in Vercel env vars.
- [ ] Supabase → **Authentication → URL Configuration** → Site URL = the domain;
      add it to Redirect URLs.
- [ ] Whoop app → change redirect URI to `https://<your-domain>/api/whoop/callback`.
- [ ] Google OAuth client → change redirect URI to `https://<your-domain>/api/googlefit/callback`.
- [ ] Stripe webhook endpoint → update the URL to `https://<your-domain>/api/stripe-webhook`.
- [ ] Update the SEO tags — **they are currently relative** and must become absolute
      for OG previews and canonical ranking:
  - [ ] `index.html`: `og:url` (`/` → `https://<your-domain>/`).
  - [ ] `public/landing.html`: `canonical` and `og:url` (`/landing` → `https://<your-domain>/landing`).
- [ ] Commit, push, redeploy.

## 7. Test-mode end-to-end check (~15 min)

Run in an incognito window against the deployed URL, Stripe still in test mode:

1. [ ] Sign up: Settings → enter email → magic link arrives → click → signed in, plan badge **Free**.
2. [ ] Upgrade: open the upgrade dialog → pick yearly → Stripe Checkout →
       card `4242 4242 4242 4242`, any future expiry, any CVC/ZIP → pay.
3. [ ] Redirected to `/?checkout=success` → plan badge flips to **Trial · 14 days left**
       (or **Trial** briefly, before the webhook writes the period end).
       That flip is the webhook working — if it stays Free, check
       Stripe → Developers → Webhooks → your endpoint → recent deliveries for errors.
4. [ ] Connect Whoop: Settings → Integrations → Connect → Whoop OAuth consent →
       redirected back with `?connected=whoop` and a success toast.
5. [ ] Sync: **Sync now** → recovery card appears on Home with today's score/HRV/RHR.
6. [ ] AI coach: generate a weekly summary → response includes the recovery block.
7. [ ] Billing portal: **Manage billing** → Stripe portal opens → cancel → plan
       stays Pro until period end (`cancel_at_period_end`), webhook downgrade on delete.

All seven pass → flip Stripe to live mode (step 2 last bullet) and launch.

## 8. Local development (~5 min)

```bash
cp .env.example .env   # fill in what you have; blanks are fine
npm install
npm run dev            # UI-only dev: http://localhost:5173
```

- `npm run dev` — full UI, plus: `/api/deepseek` proxied straight to DeepSeek by the
  Vite dev server (needs `DEEPSEEK_API` in `.env`), `/api/sync` backed by an
  in-memory dev store, and Supabase auth/cloud-sync (client talks to Supabase
  directly via the `VITE_` vars). **Not available:** Stripe checkout/webhook and
  Whoop / Google Fit & Fitbit connect — those live in the Edge functions the Vite server
  doesn't run.
- `vercel dev` — runs the real functions in `api/` on `http://localhost:3000` for
  full-stack testing (pull env with `vercel env pull .env`). Webhooks still need a
  public URL — use `stripe listen --forward-to localhost:3000/api/stripe-webhook`.
