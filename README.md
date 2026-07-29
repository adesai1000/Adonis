# Adonis

**The private, local-first training dashboard: workouts, macros, body weight,
and Whoop recovery on one screen — with an AI coach that reads your actual week.**

Installable PWA, works fully offline, your data lives on your device by default.
Marketing page ships at [`/landing`](./public/landing.html).

## Features

**Free**

- Full manual tracking: workouts (sets/reps/PRs), nutrition & macros, body
  weight, cardio, history, routines
- Export / import (your data is never locked in)
- Account sign-in (magic link / Google) with cloud sync across devices
- Legacy sync-code device sync for signed-out users
- Installable PWA, 100% offline-capable

**Pro — $7.99/mo or $59.99/yr (save 37%), 14-day trial**

- AI Coach — weekly summary that reads training, food, sleep, and strain
- Whoop integration — recovery, HRV, RHR, sleep, strain, workouts
- Google Fit & Fitbit integration (Google Health API) — steps, weight, workouts, sleep
- Recovery dashboard card

Everything degrades gracefully: with zero env vars configured the app runs as a
pure local-only tracker.

## Screenshots

_TODO: add screenshots (dashboard, workout logging, recovery card, AI coach)._

## Tech stack

- **Client:** React 19 + TypeScript + Vite, Tailwind CSS 4, shadcn/Radix
  primitives, Recharts, localStorage as source of truth, PWA service worker
- **Backend:** Vercel Edge Functions (`api/`, raw `fetch` — no server SDKs),
  Supabase (auth + Postgres + RLS), Stripe (Checkout / Portal / webhooks),
  DeepSeek (AI coach), Upstash Redis (legacy sync)

## Quickstart

```bash
npm install
npm run dev        # http://localhost:5173
```

Optional: `cp .env.example .env` and fill in keys — see
[.env.example](./.env.example) for what each var enables. `vercel dev` runs the
real API functions locally.

## Repo layout

| Path | What lives there |
| --- | --- |
| `src/` | React app — pages, components, store, lib |
| `api/` | Vercel Edge functions (deepseek, stripe, stripe-webhook, whoop, googlefit, sync) |
| `supabase/` | `schema.sql` — tables, RLS policies, signup trigger |
| `docs/` | [SAAS-SPEC.md](./docs/SAAS-SPEC.md) (architecture contract), RESEARCH.md (external API reference) |
| `public/` | static assets, PWA manifest + service worker, `landing.html` |

## Docs

- [SETUP.md](./SETUP.md) — ordered go-live checklist (Supabase, Stripe, Whoop,
  Google Health API, Vercel, domain, E2E test)
- [DEPLOY.md](./DEPLOY.md) — quick deploy + personal-mode instructions
- [GTM.md](./GTM.md) — go-to-market plan
- [docs/SAAS-SPEC.md](./docs/SAAS-SPEC.md) — binding architecture spec

## License

Proprietary. All rights reserved. Not licensed for redistribution or reuse.
