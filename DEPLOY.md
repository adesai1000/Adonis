# Deploying Adonis (Vercel)

Adonis runs entirely in the browser (localStorage). Two small serverless
functions add the extras:

- `api/deepseek.ts` – proxies the AI Coach request so your DeepSeek key stays
  on the server (never shipped to the browser).
- `api/sync.ts` – a tiny key/value store so the same data can be shared between
  your phone and computer using a shared "sync code".
- `api/keepalive.ts` – pinged once a day by a Vercel Cron Job (`vercel.json`) so
  the free Upstash database never goes idle long enough to be archived.

## 1. Push the repo to GitHub

```bash
git add -A
git commit -m "Adonis"
git push
```

## 2. Import the project into Vercel

- Go to https://vercel.com/new and import the repo.
- Framework preset is auto-detected as **Vite** (build `npm run build`, output `dist`).
- Click Deploy.

## 3. Add the DeepSeek key (for the AI Coach)

In the Vercel project → **Settings → Environment Variables**, add:

| Name           | Value                         |
| -------------- | ----------------------------- |
| `DEEPSEEK_API` | your DeepSeek API key (`sk-…`) |

## 4. Add a KV store (for device sync)

In the Vercel project → **Storage → Create Database → Upstash for Redis** (free
tier), and connect it to the project with the default `KV` prefix. Vercel
injects these automatically:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

(`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, `REDIS_REST_API_*` and
`STORAGE_REST_API_*` are also accepted — see `api/_lib/redis.ts`.)

> Sync is optional. If you skip this, everything else still works — the Sync
> buttons will just report that sync isn't configured.

### If sync suddenly stops working ("Could not reach sync storage…")

Upstash **archives free databases after ~30 days without a single command** and
Vercel then shows the store as *"Archived due to inactivity"*. The daily cron in
`vercel.json` prevents that as long as the project stays deployed. If it does
happen anyway:

1. Vercel project → **Storage → Create Database → Upstash for Redis** (new DB).
2. Open the *old* archived store → **Projects** → ⋯ → **Disconnect** (removes the
   stale `KV_*` variables), then **Connect Database** the new one with prefix `KV`.
3. Redeploy (Deployments → ⋯ → Redeploy). Open the app on the device with the
   freshest data first and tap **Push to cloud** — that becomes the new cloud copy.

The archived data is kept as a backup in the Upstash console (*inactive
databases → Restore*), but it is at least a month old, so only restore it if no
device has a newer copy.

## 5. Redeploy

Trigger a redeploy so the new env vars take effect (Deployments → ⋯ → Redeploy).

## 6. Sync your devices

1. Open the deployed URL on your Mac. Go to **Settings → Sync**, generate or type
   a sync code, tap **Use code**, then **Push to cloud** (or turn on **Auto-sync**).
2. Open the same URL on your phone, enter the **same** sync code, and tap
   **Pull from cloud** (or turn on **Auto-sync**).

With Auto-sync on, each device pulls when opened and pushes changes a moment
after you make them (last write wins).

## Local development

```bash
npm install
npm run dev
```

- The AI Coach works locally via the Vite dev proxy as long as `DEEPSEEK_API` is
  in your local `.env` (already gitignored).
- Sync works locally too, backed by an in-memory store in the dev server
  (resets when you restart `npm run dev`) — enough to try the flow.
- The cron keep-alive only runs on Vercel; nothing to do locally.
