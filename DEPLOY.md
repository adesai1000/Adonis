# Deploying Adonis (Vercel)

Adonis is a Vite SPA plus a handful of Vercel Edge functions in `api/`. It ships
in two shapes from the same codebase:

- **SaaS mode** — accounts (Supabase), Pro subscriptions (Stripe), Whoop /
  Google Fit integrations, AI coach. Each piece activates only when its env
  vars are set.
- **Personal mode** — zero accounts, zero billing: the original local-first
  tracker with optional AI coach + device sync. Works with 0–3 env vars.

## Quick deploy

1. Push the repo to GitHub.
2. [vercel.com/new](https://vercel.com/new) → import the repo. Framework preset
   auto-detects as **Vite** (build `npm run build`, output `dist`). Deploy.
3. Add env vars (Project → Settings → Environment Variables) — full list with
   comments in [.env.example](./.env.example) — then redeploy.

Which vars? That depends on the shape:

- **Full SaaS** → follow **[SETUP.md](./SETUP.md)**. It is the ordered go-live
  checklist: Supabase project + schema, Stripe product/webhook/portal, Whoop
  app, Google Fit OAuth (deprecation warning included), the complete Vercel env
  table, domain wiring, and a test-mode end-to-end script. Do not wing it —
  the order matters.
- **Purely personal** → the short section below is all you need.

## Local development

```bash
npm install
npm run dev      # UI + AI-coach proxy + in-memory sync at :5173
vercel dev       # real api/ functions at :3000 (full-stack testing)
```

See [SETUP.md § 8](./SETUP.md#8-local-development-5-min) for what each mode
covers.

## Run it purely personal (no accounts, no billing)

Deploy with no env vars at all and Adonis works as a fully local tracker
(localStorage, PWA, export/import). Two optional extras:

1. **AI coach** — Project → Settings → Environment Variables:

   | Name | Value |
   | --- | --- |
   | `DEEPSEEK_API` | your DeepSeek API key (`sk-…`) |

2. **Device sync (sync codes)** — Project → **Storage → Create Database →
   Upstash Redis** (free tier) and connect it. Vercel injects
   `KV_REST_API_URL` / `KV_REST_API_TOKEN` automatically
   (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` also accepted).

Redeploy, then on each device: **Settings → Sync** → enter the same sync code →
push on one, pull on the other (or turn on Auto-sync; last write wins). If you
skip the KV store, the sync buttons just report that sync isn't configured —
everything else keeps working.
