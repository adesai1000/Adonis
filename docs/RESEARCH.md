# External API reference (Whoop, Google Fit, Stripe, Supabase)

> STATUS: written from model knowledge (cutoff Jan 2026) during a web-tooling
> outage. Items marked ⚠️VERIFY must be re-checked against live docs before
> launch. Everything else is long-stable API surface.

## Whoop (API v2 — v1 was deprecated Oct 2025; v2 is required)

- Developer portal / app registration: https://developer.whoop.com (dashboard →
  create app, set redirect URIs — must be HTTPS, localhost allowed for dev).
  ⚠️VERIFY: team-size/user limits for unreviewed apps and any approval process.
- Authorize (GET): `https://api.prod.whoop.com/oauth/oauth2/auth`
  params: `client_id`, `redirect_uri`, `response_type=code`,
  `scope` (space-separated), `state` (**min 8 chars, required**).
- Token (POST, form-encoded): `https://api.prod.whoop.com/oauth/oauth2/token`
  - auth code: `grant_type=authorization_code, code, client_id, client_secret, redirect_uri`
  - refresh: `grant_type=refresh_token, refresh_token, client_id, client_secret`
  - Access token ~1 hour. **Refresh tokens are single-use and rotate** — always
    persist the new `refresh_token` returned by every refresh. `offline` scope
    required to receive refresh tokens.
- Scopes used: `read:recovery read:cycles read:sleep read:workout read:profile offline`
- REST base: `https://api.prod.whoop.com/developer`
  - `GET /v2/recovery?start=<ISO>&end=<ISO>&limit=25&nextToken=…` →
    `{ records: [{ cycle_id, sleep_id, user_id, created_at, score_state,
    score: { user_calibrating, recovery_score, resting_heart_rate,
    hrv_rmssd_milli, spo2_percentage, skin_temp_celsius } }], next_token }`
    (only use records with `score_state === "SCORED"`)
  - `GET /v2/activity/sleep?start&end&limit&nextToken` → records
    `{ id, start, end, nap, score_state, score: { sleep_performance_percentage,
    stage_summary: {...}, respiratory_rate, ... } }` (skip `nap === true` for
    the daily sleep metric; sleep duration = end − start)
  - `GET /v2/cycle?start&end&limit&nextToken` → records `{ id, start, end,
    score_state, score: { strain, kilojoule, average_heart_rate,
    max_heart_rate } }` (day strain; kilojoule → kcal = kJ / 4.184)
  - `GET /v2/activity/workout?start&end&limit&nextToken` → records `{ id,
    sport_id, sport_name?, start, end, score_state, score: { strain,
    average_heart_rate, max_heart_rate, kilojoule, distance_meter?, ... } }`
    ⚠️VERIFY exact v2 sport field (v2 moved toward `sport_name`).
  - `GET /v2/user/profile/basic` → `{ user_id, email, first_name, last_name }`
- Whoop workout → CardioEntry mapping: running→Run, walking→Walk,
  cycling→Cycle, swimming→Swim, rowing→Row, jump rope→Jump Rope,
  stairmaster→Stair Climber, HIIT→HIIT, else→Other (sport name in notes).
  **Skip strength/weightlifting sports** (weightlifting, functional fitness,
  powerlifting — match case-insensitively on sport name; if only numeric
  sport_id is present, known strength ids ⚠️VERIFY — default to importing with
  Other rather than dropping unknowns, EXCEPT ids/names matching strength).
- Rate limit ~100 req/min per app. Webhooks exist in v2 — not used (we poll).
- Token revoke: `DELETE /v2/user/access` revokes the current user's access. ⚠️VERIFY.

## Google Health API — ✅ VERIFIED 2026-07-29 — THE Google integration target

> **Verified live**: Google Fit REST API closed to new developer sign-ups on
> 2024-05-01 and shuts down entirely at the end of 2026 ("There is no
> alternative to the Fit REST API" — Google migration FAQ). The **Google
> Health API** is the account-centric REST successor (also the Fitbit Web API
> migration target; Fitbit Web API sunsets Sept 2026). Adonis therefore
> implements the Google-side integration against the **Google Health API**,
> keeping internal provider id `"googlefit"` (types/UI already shipped) with
> user-facing label "Google Fit & Fitbit".

- Enable **health.googleapis.com** in Google Cloud console (open to new
  projects — unlike Fit).
- REST base: `https://health.googleapis.com/v4`
- Read pattern (✅ verified 2026-07-29 against the REST reference):
  `GET /v4/users/me/dataTypes/{dataType}/dataPoints?filter=…&pageSize=…&pageToken=…`
  → `{ dataPoints: [...], nextPageToken }`. dataType ids are kebab-case in
  the URL (`body-fat`) but snake_case in filters (`body_fat`). `filter` is
  AIP-160 with `AND` (sleep also allows `OR`), operators `>=`/`<`:
  - interval types: `{type}.interval.start_time >= "2023-11-24T00:00:00Z"`
    (RFC 3339) or `{type}.interval.civil_start_time >= "2023-11-24T00:00:00"`
  - sample types: `{type}.sample_time.physical_time >= "…Z"` (RFC 3339)
  - daily summaries: `{type}.date >= "2023-11-24"`
  `pageSize` default 1440 / max 10000 — EXCEPT exercise + sleep: default and
  max 25. Max query range 90 days (14 days for heart-rate, total-calories,
  active-minutes, calories-in-heart-rate-zone).
- Data types used (✅ verified 2026-07-29, point JSON from the DataPoint
  reference; every point has `name: "users/me/dataTypes/{t}/dataPoints/{id}"`
  and `dataSource`; int64 fields serialize as JSON strings):
  - `steps` → `steps: { interval: { startTime, endTime, startUtcOffset,
    endUtcOffset, civilStartTime, civilEndTime }, count: "<int64 string>" }`.
    No pre-bucketed daily totals on `list` — sum counts per day, or use the
    aggregate endpoint below.
  - `weight` → `weight: { sampleTime: { physicalTime, utcOffset, civilTime },
    weightGrams: number, notes? }` (**grams** — divide by 1000 for kg).
  - `exercise` → `exercise: { interval, exerciseType: "RUNNING"|…,
    displayName?, activeDuration: "1800s", metricsSummary: { caloriesKcal,
    distanceMillimeters, steps, averageHeartRateBeatsPerMinute,
    activeZoneMinutes, averageSpeedMillimetersPerSecond, … } }`.
    ExerciseType is a ~190-value enum incl. RUNNING/TRAIL_RUN/TREADMILL,
    WALKING/POWER_WALKING/NORDIC_WALKING/TREADMILL_WALK, BIKING/
    MOUNTAIN_BIKE/STATIONARY_BIKE/SPINNING, SWIMMING(_POOL/_OPEN_WATER),
    ROWING/ROWING_MACHINE, JUMPING_ROPE, STAIRCLIMBER, HIIT/INTERVAL_WORKOUT/
    TABATA_WORKOUT; strength (skipped on import): STRENGTH_TRAINING,
    WEIGHTLIFTING, POWERLIFTING, FUNCTIONAL_STRENGTH_TRAINING, FREE_WEIGHTS,
    WEIGHTS, WEIGHT_MACHINES, BODY_WEIGHT, CALISTHENICS, CORE_TRAINING,
    RESISTANCE_BANDS, TRX, CROSSFIT.
  - `sleep` → `sleep: { interval, stages: [SleepStage], summary:
    { minutesAsleep, minutesAwake, minutesInSleepPeriod, minutesToFallAsleep,
      minutesAfterWakeUp } }` (summary is output-only; int64 → strings).
  - calories: `active-energy-burned` is listable (`{ interval, kcal }`) but
    minute-grained; `total-calories` is a read-only derived type — **rollup
    endpoints only**, requires an interval filter, 14-day max range. Adonis
    omits caloriesOut from the Google sync for now.
- Aggregation (✅ exists, verified 2026-07-29 — not used by Adonis, we sum
  list points per UTC day): `POST /v4/users/me/dataTypes/{t}/dataPoints:dailyRollUp`
  body `{ range: { start, end }, windowSizeDays?: 1, pageSize?, pageToken?,
  dataSourceFamily? }` → `{ rollupDataPoints: [{ civilStartTime,
  civilEndTime, <value> }] }`; civil-day buckets for steps, distance,
  weight, total-calories, heart summaries, etc. Physical-time variant:
  `dataPoints:rollUp`.
- OAuth: standard Google endpoints (authorize
  `https://accounts.google.com/o/oauth2/v2/auth`, token
  `https://oauth2.googleapis.com/token`, `access_type=offline`,
  `prompt=consent`). Scopes (readonly, ✅ verified 2026-07-29 against
  https://developers.google.com/health/scopes):
  `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`
  (steps, exercise, active/total calories),
  `https://www.googleapis.com/auth/googlehealth.sleep.readonly`,
  `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`
  (weight, body measurements, heart rate). There is no separate "body" scope —
  weight lives under health_metrics_and_measurements.
- Limits: unverified OAuth clients = **Testing mode: max 100 test users
  (added manually on the Audience page) and refresh tokens EXPIRE AFTER 7
  DAYS** — users must reconnect weekly until the app completes Google's
  third-party security review (restricted scopes). SETUP.md must state this
  plainly.
- Data source: the user's Google/Fitbit account data (Fitbit devices, Pixel
  Watch, apps writing to the account) — the successor of both Google Fit and
  Fitbit cloud data.

## Google Fit REST API — ❌ DEAD END, do not use

> Kept for reference only: sign-ups closed 2024-05-01, full shutdown end of
> 2026. New OAuth clients cannot request fitness scopes.

- OAuth authorize (GET): `https://accounts.google.com/o/oauth2/v2/auth`
  params: `client_id, redirect_uri, response_type=code, scope (space-sep),
  access_type=offline, prompt=consent, state, include_granted_scopes=true`
- Token (POST form): `https://oauth2.googleapis.com/token`
  (authorization_code / refresh_token grants; Google refresh tokens do NOT
  rotate; refresh token only returned on first consent — hence prompt=consent)
- Scopes: `https://www.googleapis.com/auth/fitness.activity.read`
  `https://www.googleapis.com/auth/fitness.body.read`
  (fitness scopes are **sensitive** → unverified apps limited to 100 test
  users in "Testing" publishing status; production needs OAuth verification.
  ⚠️VERIFY current policy for fitness scopes.)
- Daily steps + calories (POST):
  `https://fitness.googleapis.com/fitness/v1/users/me/dataset:aggregate`
  body: `{ "aggregateBy": [{ "dataTypeName": "com.google.step_count.delta",
  "dataSourceId": "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps" }],
  "bucketByTime": { "durationMillis": 86400000 }, "startTimeMillis": …,
  "endTimeMillis": … }` → `bucket[].dataset[].point[].value[0].intVal`.
  Calories: dataTypeName `com.google.calories.expended` (fpVal). Run the two
  aggregates in one request (two aggregateBy entries) or separate — separate is
  simpler to parse per-type.
- Weight: aggregate `com.google.weight` (fpVal, **kg**) with same bucketing, or
  raw dataset `users/me/dataSources/derived:com.google.weight:com.google.android.gms:merge_weight/datasets/{startNs}-{endNs}`.
  Use latest point per day → WeightEntry (unit "kg").
- Sessions (GET): `https://fitness.googleapis.com/fitness/v1/users/me/sessions?startTime=<ISO>&endTime=<ISO>`
  → `{ session: [{ id, name, description, activityType (int),
  startTimeMillis, endTimeMillis }] }`
- activityType mapping: 8 running→Run, 7 walking→Walk, 1 biking→Cycle,
  82 swimming→Swim, 103 rowing? ⚠️VERIFY→Row, 116/117 stair→Stair Climber,
  jump rope 26→Jump Rope, HIIT/interval 113/114→HIIT; **skip 80
  (strength_training)** and 96/97 weightlifting-type ids ⚠️VERIFY; unknown →
  Other with `name` in notes.

## Stripe (raw REST, no SDK — Edge-runtime safe)

- Base `https://api.stripe.com`; auth `Authorization: Bearer $STRIPE_SECRET_KEY`;
  bodies are `application/x-www-form-urlencoded`. Pin
  `Stripe-Version: 2024-06-20` header on every call (long-stable version).
- Create customer: `POST /v1/customers` — `email`, `metadata[supabase_user_id]`.
- Checkout session: `POST /v1/checkout/sessions` —
  `mode=subscription`, `customer`, `line_items[0][price]`,
  `line_items[0][quantity]=1`, `subscription_data[trial_period_days]=14`,
  `allow_promotion_codes=true`, `success_url=${APP_URL}/?checkout=success`,
  `cancel_url=${APP_URL}/?checkout=cancelled` → `{ url }`.
- Portal: `POST /v1/billing_portal/sessions` — `customer`,
  `return_url=${APP_URL}/` → `{ url }`. (Portal must be enabled once in the
  Stripe dashboard test/live settings.)
- Get subscription: `GET /v1/subscriptions/{id}` → `status`
  (`trialing|active|past_due|canceled|unpaid|incomplete|incomplete_expired`),
  `items.data[0].price.id`, `current_period_end` (unix), `cancel_at_period_end`,
  `customer`.
- Webhook verification (Edge/WebCrypto): header
  `Stripe-Signature: t=<ts>,v1=<sig>[,v1=…]`; compute HMAC-SHA256 over
  `` `${t}.${rawBody}` `` with `STRIPE_WEBHOOK_SECRET`; hex-compare
  constant-time against any v1; reject if `|now − t| > 300s`. Raw body =
  `await req.text()` BEFORE any JSON parse.
- Events handled: `checkout.session.completed` (session.customer,
  session.subscription → fetch subscription for full state),
  `customer.subscription.created|updated|deleted` (object IS the
  subscription). Everything else → 200 ignore. Map to profile:
  plan = (status in trialing/active/past_due) ? "pro" : "free";
  plan_status = status; price_id, current_period_end (unix→ISO),
  cancel_at_period_end; lookup row by stripe_customer_id.

## Supabase (server-side, raw REST — no SDK in Edge functions)

- Verify user JWT: `GET {SUPABASE_URL}/auth/v1/user` with headers
  `apikey: {SUPABASE_ANON_KEY}`, `Authorization: Bearer {userAccessToken}`
  → 200 `{ id, email, … }` | 401/403 invalid. (Works regardless of JWT signing
  algorithm; no local JWT verification needed.)
- Table REST (service role): `{SUPABASE_URL}/rest/v1/{table}` with
  `apikey: {SERVICE_ROLE_KEY}`, `Authorization: Bearer {SERVICE_ROLE_KEY}`.
  - select: `GET /rest/v1/profiles?user_id=eq.{id}&select=*` → array.
  - update: `PATCH /rest/v1/profiles?user_id=eq.{id}` JSON body,
    `Prefer: return=minimal`.
  - upsert: `POST /rest/v1/integrations?on_conflict=user_id,provider` with
    `Prefer: resolution=merge-duplicates,return=minimal`, JSON body.
  - delete: `DELETE /rest/v1/integrations?user_id=eq.{id}&provider=eq.whoop`.
- profiles lookup by customer: `GET /rest/v1/profiles?stripe_customer_id=eq.{cus_…}`.
