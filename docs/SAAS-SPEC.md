# Adonis SaaS — Architecture & Implementation Spec

This is the single source of truth for converting Adonis (local-first fitness PWA)
into a sellable SaaS. All implementation agents MUST follow the contracts here
exactly. Where this spec and existing code conflict on *conventions*, match the
existing code style; where it conflicts on *contracts* (names, routes, shapes),
this spec wins.

## Product & pricing

- **Adonis Free** — full manual tracking (workouts, nutrition, body weight,
  history, routines, export/import), account sign-in with cloud sync across
  devices.
- **Adonis Pro** — everything in Free plus: **AI Coach**, **Whoop integration**,
  **Google Fit integration**, **Recovery dashboard card**.
  - $7.99/month or $59.99/year (save 37%), **14-day free trial**, cancel
    anytime via Stripe customer portal.
- Legacy sync-code sync stays working for signed-out users (backwards compat).
- **Graceful degradation is non-negotiable**: with zero env vars configured the
  app must keep working exactly as today (local-only tracker). Every SaaS
  feature turns on only when its env vars exist.

## Environment variables

Client (Vite, exposed to browser):
| Var | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (publishable) key |

Server (Vercel functions):
| Var | Purpose |
| --- | --- |
| `SUPABASE_URL` | same value as VITE_SUPABASE_URL |
| `SUPABASE_ANON_KEY` | same value as VITE_SUPABASE_ANON_KEY (JWT verification) |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role key (server only) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | webhook signing secret (whsec_…) |
| `STRIPE_PRICE_MONTHLY` | price id for $7.99/mo |
| `STRIPE_PRICE_YEARLY` | price id for $59.99/yr |
| `WHOOP_CLIENT_ID` / `WHOOP_CLIENT_SECRET` | Whoop developer app |
| `GOOGLE_FIT_CLIENT_ID` / `GOOGLE_FIT_CLIENT_SECRET` | Google Cloud OAuth client |
| `APP_URL` | canonical app origin, e.g. `https://adonis.example.com` (fallback: request origin) |
| `DEEPSEEK_API` | existing — AI coach |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | existing — legacy code sync |

`.env.example` must list all of these with comments.

## Database (supabase/schema.sql)

```sql
-- profiles: plan/billing state. Client may SELECT own row; writes are service-role only.
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  stripe_customer_id text unique,
  plan text not null default 'free',          -- 'free' | 'pro'
  plan_status text,                            -- stripe subscription status ('trialing','active','past_due','canceled',…)
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- + RLS: select own row only; no client insert/update/delete policies.
-- + trigger on auth.users insert -> create profiles row (security definer fn).

-- user_docs: whole-app-state blob sync (same LWW model as legacy code sync).
create table public.user_docs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  doc jsonb not null,
  updated_at timestamptz not null default now()
);
-- + RLS: all ops where auth.uid() = user_id.

-- integrations: OAuth tokens. NO client policies (deny-all) — service role only.
create table public.integrations (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,                      -- 'whoop' | 'googlefit'
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scopes text,
  external_user_id text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, provider)
);
```

## Client data model additions (src/lib/types.ts)

```ts
export type DataSource = "manual" | "whoop" | "googlefit"

// Daily recovery/readiness metrics, one entry per (source, date).
export interface RecoveryEntry {
  id: ID
  date: string            // yyyy-MM-dd
  source: DataSource
  recoveryScore?: number  // 0–100 (Whoop)
  hrvMs?: number          // HRV RMSSD in ms
  restingHeartRate?: number
  sleepPerformance?: number // 0–100
  sleepDurationSec?: number
  dayStrain?: number      // Whoop 0–21
  steps?: number          // Google Fit daily steps
  caloriesOut?: number    // active energy burned
}
```

- `CardioEntry`, `WeightEntry`, `WorkoutSession` gain optional
  `source?: DataSource` and `externalId?: string`.
- `BackupData` gains `recoveryLog?: RecoveryEntry[]` (optional = back-compat
  with old backups/sync blobs).
- New `CardKey` value `"recovery"` for the dashboard (normalizeUiPrefs migration
  auto-adds it; default visible). **Staging note:** the `CardKey` union change is
  made in the same stage as `pages/home/metrics.ts` + `home.tsx` updates (they
  hold `Record<CardKey, …>` maps that must stay exhaustive), NOT in the core
  stage.
- `STORAGE_KEYS.recoveryLog = "wt_recovery_log"`, plus
  `welcomeDone = "wt_welcome_done"`.

### Store additions (src/store/store.tsx)

- `recoveryLog: RecoveryEntry[]` slice (persisted), included in
  exportAll/importAll/clearAll and the SyncProvider `dataSig`.
- `mergeIntegrationData(result: IntegrationSyncResult): { added: number; updated: number }`
  — pure upsert merge:
  - `recovery` entries upsert by `(source, date)`.
  - `cardio` entries upsert by `(source, externalId)`.
  - `weights` entries upsert by `(source, externalId)`.
  - Never touches manual entries (`source` undefined/"manual").

### Integration sync payload (client ⇄ server contract)

```ts
export interface IntegrationSyncResult {
  provider: "whoop" | "googlefit"
  recovery: RecoveryEntry[]      // ids generated server-side as `${provider}-${date}`
  cardio: CardioEntry[]          // ids `${provider}-${externalId}`; source+externalId set
  weights: WeightEntry[]         // ids `${provider}-${externalId}`
  lastSyncedAt: string           // ISO
}
```

Mapping rules:
- **Whoop**: recovery score / HRV (ms) / RHR from recovery records; sleep
  performance + duration from sleep records; day strain + kcal from cycles;
  workouts → `CardioEntry` (map sport to the closest `CARDIO_ACTIVITIES` value,
  else `"Other"` with the sport name in `notes`; include durationSec,
  avgHeartRate, caloriesBurned). **Skip strength-training sport types** —
  users log lifting manually in Adonis and imports would duplicate.
- **Google Fit**: daily steps + calories → `RecoveryEntry.steps/caloriesOut`;
  weight datapoints → `WeightEntry` (kg, unit "kg"); activity sessions →
  `CardioEntry` (same mapping rules). Skip strength sessions.

## Auth (client)

- New `src/lib/supabase.ts`: exports `supabase` (SupabaseClient | null) and
  `isAuthConfigured` boolean. Null when VITE_ vars missing — every consumer must
  handle null.
- New `src/store/auth.tsx` `AuthProvider` + `useAuth()`:
  - `session`, `user`, `profile` (plan fields), `loading`
  - `signInWithEmail(email)` → magic link / OTP; `signInWithGoogle()`;
    `signOut()`; `refreshProfile()`
  - `isPro` = profile.plan === "pro" AND plan_status in
    ("trialing","active","past_due")  // past_due keeps access until Stripe cancels
  - `authFetch(input, init)` — fetch that adds `Authorization: Bearer <access_token>`.
- Provider order in App.tsx: StoreProvider > ThemeProvider > NavProvider >
  **AuthProvider** > SyncProvider > …

## Sync rework (src/store/sync.tsx)

- `syncMode: "account" | "code" | "off"` — account mode when signed in
  (isAuthConfigured && session), else code mode when a sync code is set.
- Account mode: pull/push the same `SyncBlob` to `user_docs` via supabase-js
  (select / upsert). Same last-write-wins + debounced auto-push + pull-on-open
  behavior as today. Auto-sync defaults ON in account mode.
- Code mode unchanged (legacy).

## API functions (Vercel Edge runtime, `Request => Response`, match existing idioms)

Shared helpers in `api/_lib/` (underscore = not exposed as routes):
- `env.ts` — typed env access.
- `http.ts` — `json()`, error helper, `readBody`.
- `supa.ts` — service-role REST helpers: `getUserFromToken(req)` (verify Supabase
  JWT → user id/email or null), `getProfile(userId)`, `updateProfile(userId, patch)`,
  `getIntegration(userId, provider)`, `upsertIntegration(...)`, `deleteIntegration(...)`
  — all via `fetch` against Supabase REST/auth endpoints with the service key
  (no SDK needed server-side).
- `state.ts` — HMAC-signed OAuth `state` (payload `{u: userId, t: timestamp, p: provider}`,
  key = SHA-256 of SUPABASE_SERVICE_ROLE_KEY, WebCrypto), 10-min expiry.
- `stripe.ts` — minimal Stripe REST via fetch (form-encoded), webhook signature
  verification (WebCrypto HMAC-SHA256 over `${t}.${payload}`, constant-time compare).

Routes (all JSON unless noted):
1. `api/deepseek.ts` (modified): if Supabase configured → require valid JWT +
   Pro plan (403 with `{error:"pro_required"}` otherwise). Unconfigured → legacy
   behavior.
2. `api/stripe.ts` (POST, auth required):
   - `{action:"checkout", interval:"monthly"|"yearly"}` → ensures Stripe
     customer (saved to profiles), creates subscription Checkout Session
     (14-day trial, promotion codes on, success/cancel URLs
     `${APP_URL}/?checkout=success|cancelled`) → `{url}`.
   - `{action:"portal"}` → billing portal session → `{url}`.
3. `api/stripe-webhook.ts` (POST, signature-verified raw body): handles
   `checkout.session.completed`, `customer.subscription.created/updated/deleted`
   → updates profiles (plan: pro/free, plan_status, price_id,
   current_period_end, cancel_at_period_end) looked up by stripe_customer_id.
   Returns 200 fast; unhandled events → 200.
4. `api/whoop.ts` — `?action=`:
   - `connect` (GET, auth via `?token=` … no: auth via Authorization header,
     returns `{url}` and the client redirects) — requires Pro. Builds authorize
     URL with signed state.
   - `callback` (GET from Whoop, `code`+`state`): verify state → exchange code →
     store tokens → 302 to `/?connected=whoop` (or `/?connect_error=whoop`).
     Registered redirect URI is the clean path `${APP_URL}/api/whoop/callback`
     (no query params — some providers reject them); `vercel.json` rewrites
     `/api/whoop/callback` → `/api/whoop?action=callback` (same for googlefit).
   - `sync` (POST, auth, Pro): refresh token if needed, pull last 30 days
     (first sync) or since `last_synced_at` minus 2-day overlap; return
     `IntegrationSyncResult`; update `last_synced_at`.
   - `status` (GET, auth): `{connected, lastSyncedAt}`.
   - `disconnect` (POST, auth): delete row (+ best-effort token revoke).
5. `api/googlefit.ts` — identical shape to whoop.
6. `api/sync.ts` — untouched (legacy).

(EXACT external endpoint URLs/params for Whoop v2, Google Fit REST, Stripe are
in `docs/RESEARCH.md` — follow it.)

## UI additions

- `src/pages/settings/account-section.tsx` — top of settings: signed-out →
  email input (magic link) + "Continue with Google"; signed-in → email, plan
  badge (Free/Pro/Trial + renewal date), Upgrade button (opens UpgradeDialog) or
  "Manage billing" (portal), Sign out. Match Card/section conventions of
  existing sections exactly.
- `src/pages/settings/integrations-section.tsx` — cards for Whoop & Google Fit:
  connect (Pro-gated → UpgradeDialog), status + last synced, "Sync now",
  disconnect (confirm dialog removes imported entries? NO — keep data, just
  disconnect). Handles `?connected=` / `?connect_error=` query params on mount
  (toast + strip param + auto-sync).
- `src/components/account/upgrade-dialog.tsx` — Pro feature list,
  monthly/yearly toggle (yearly pre-selected, "Save 37%" badge), CTA →
  `/api/stripe` checkout → `window.location.href = url`. Handles
  `?checkout=success` (toast + refreshProfile) in a small hook exported here.
- `src/pages/home/recovery-card.tsx` — dashboard card (CardKey "recovery"),
  rendered like other metric cards: today's (or latest ≤3 days old) recovery
  score with color (red <34, yellow 34–66, green >66), HRV, RHR, strain, sleep;
  steps/calories when Google Fit. Hidden when no recovery data ever imported
  (EmptyState-free: just don't render; card manager still lists it).
- AI Coach gating: when `isAuthConfigured` and user not Pro → replace generate
  action with upgrade prompt. `src/lib/ai.ts`: `generateCoachSummary` accepts
  optional auth token, sends Authorization header; WeeklyStats gains optional
  `recovery` block (avg recovery/HRV/sleep/strain over the week) fed to the
  prompt when present.
- Welcome screen `src/components/welcome.tsx`: full-screen first-run cover
  (shown when `wt_welcome_done` unset AND no workouts/food/weights logged):
  brand, one-line pitch, 3 feature bullets, primary "Start tracking", secondary
  "Sign in", tertiary "Explore with demo data" (loads demo). Sets flag on any
  action. Rendered from App.tsx above Shell.
- **Onboarding flow** `src/components/onboarding/onboarding.tsx` (+ step files
  in the same folder): multi-step guided setup shown after Welcome's "Start
  tracking" (and after first sign-in when the flag is unset). Flag
  `STORAGE_KEYS.onboardingDone = "wt_onboarding_done"`; "Explore with demo
  data" sets it too (demo users skip setup). Steps, each skippable, progress
  dots, Back supported:
  1. **Basics** — weight unit (kg/lbs) + distance unit toggle, height (ft/in
     or cm per unit), current body weight (creates the first WeightEntry on
     finish), goal weight + optional target date → writes Settings.
  2. **Nutrition targets** — calorie/protein/carb/fat goals; prefill smart
     defaults from step 1 (protein ≈ 0.8 g/lb of goal weight, calories from a
     simple Mifflin-ish estimate with a note it's editable later); a "set for
     me" button applies the suggestions.
  3. **Account** — sign in / magic link + Google (only when isAuthConfigured;
     step auto-skipped otherwise). Copy: free cloud sync across devices.
  4. **Connect your devices** — Whoop + Google Fit cards; if signed in, real
     connect buttons (Pro-gated → UpgradeDialog with trial CTA); if skipped or
     signed out, show "you can connect anytime in Settings → Integrations".
  Finish → sets flag, lands on Home. Must work fully offline/unconfigured
  (steps 3–4 degrade gracefully). Uses existing ui primitives; mobile-first.

## Marketing site

- `public/landing.html` (copied verbatim into dist by Vite — no build config
  needed) — fully self-contained (inline CSS, no JS deps): hero + product pitch,
  feature grid (tracking, AI coach, Whoop/Google Fit, local-first privacy,
  PWA install), pricing table (Free vs Pro), FAQ, CTA buttons to `/`.
  Dark, premium aesthetic consistent with the app. Full SEO meta + OG tags.
- `vercel.json`: rewrites — `/landing` → `/landing.html`,
  `/api/whoop/callback` → `/api/whoop?action=callback`,
  `/api/googlefit/callback` → `/api/googlefit?action=callback`.
- `index.html`: proper title ("Adonis — Fitness, nutrition & recovery tracker"),
  meta description, OG/Twitter tags.

## Docs to write

- `SETUP.md` — provision Supabase (schema.sql, auth providers, URL allowlist),
  Stripe (products/prices/webhook/portal), Whoop dev app, Google Cloud OAuth,
  Vercel env vars + deploy. Ordered checklist with time estimates.
- `GTM.md` — positioning, ICP, pricing rationale, $50k ARR math, zero/low-budget
  channel playbook, launch checklist, metrics.
- Update `DEPLOY.md`, add `README.md`, `.env.example`.

## Non-negotiables

- `npm run build` (tsc -b + vite build) must pass clean.
- No new client deps except `@supabase/supabase-js`. No server SDKs (raw fetch).
- Everything null-safe when env unconfigured; the local-only experience is untouched.
- Never log or return tokens/secrets to the client; integration tokens live only
  in the `integrations` table (service-role access only).
- Match existing code style: 2-space, no semicolons where absent, `cn()`,
  sonner toasts, lucide icons, shadcn components, section Card pattern.
