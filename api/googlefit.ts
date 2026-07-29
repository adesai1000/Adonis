// Vercel Edge Function — Google Health API integration for Adonis Pro.
// Single function routing on ?action= (vercel.json rewrites the clean
// /api/googlefit/callback path Google redirects to → ?action=callback).
//
// The provider id stays "googlefit" (types, UI, storage all use it) but the
// backend is the Google Health API — the account-centric successor to both
// the Google Fit REST API (closed to new apps May 2024, shut down end-2026)
// and the Fitbit Web API. See docs/RESEARCH.md "Google Health API".
//
// IMPORTANT: while the OAuth client is in Testing (pre security review),
// Google refresh tokens EXPIRE AFTER 7 DAYS — refresh then fails with
// invalid_grant, which maps to { error: "reconnect_required" }, 401 and the
// client prompts the user to reconnect. Users will hit this weekly until the
// app passes Google's third-party security review.
//
// GET  ?action=connect     (auth, Pro) → { url }  Google OAuth authorize URL
// GET  ?action=callback    (from Google: code+state) → 302 /?connected=googlefit | /?connect_error=googlefit
// GET  ?action=status      (auth)      → { connected, lastSyncedAt }
// POST ?action=sync        (auth, Pro) → IntegrationSyncResult
// POST ?action=disconnect  (auth)      → { ok: true }
export const config = { runtime: "edge" }

import {
  appUrl,
  googleFitClientId,
  googleFitClientSecret,
  supabaseConfigured,
} from "./_lib/env"
import { getAction, getCookie, json, serializeCookie } from "./_lib/http"
import { signState, verifyState } from "./_lib/state"
import type { IntegrationRow } from "./_lib/supa"
import {
  deleteIntegration,
  getIntegration,
  getProfile,
  getUserFromToken,
  isProProfile,
  upsertIntegration,
} from "./_lib/supa"

const PROVIDER = "googlefit"
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const REVOKE_URL = "https://oauth2.googleapis.com/revoke"
const HEALTH_BASE = "https://health.googleapis.com/v4"
// Readonly Health API scopes (docs/RESEARCH.md "Google Health API"):
// activity_and_fitness → steps + exercise, health_metrics_and_measurements →
// weight, sleep → sleep sessions.
const SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
].join(" ")

const DAY_MS = 86400000
// Re-fetch 3 days: the (possibly partial) boundary date of the day-aligned
// window is dropped from the recovery entries, leaving 2 full re-fetched days.
const SYNC_OVERLAP_MS = 3 * DAY_MS
const FIRST_SYNC_WINDOW_MS = 30 * DAY_MS
// dataPoints.list rejects ranges > 90 days for these types — 89 leaves room
// for the flooring of the window start to UTC midnight.
const MAX_WINDOW_MS = 89 * DAY_MS
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000
const MAX_PAGES = 10 // per data type, per sync
// steps/weight allow pageSize up to 10000; exercise/sleep are capped at 25.
const SAMPLE_PAGE_SIZE = 10000
// Binds the OAuth flow to the browser that started it (CSRF guard).
const NONCE_COOKIE = "oauth_nonce_googlefit"

// ─────────────────────── payload types (mirror src/lib/types.ts) ───────────────────────

interface RecoveryEntry {
  id: string
  date: string // yyyy-MM-dd
  source: "googlefit"
  steps?: number
  sleepDurationSec?: number
}

interface WeightEntry {
  id: string
  datetime: string
  weight: number
  unit: "kg"
  source: "googlefit"
  externalId: string
}

interface CardioEntry {
  id: string
  datetime: string
  activity: string
  durationSec: number
  avgHeartRate?: number
  caloriesBurned?: number
  notes?: string
  source: "googlefit"
  externalId: string
}

interface IntegrationSyncResult {
  provider: "googlefit"
  recovery: RecoveryEntry[]
  cardio: CardioEntry[]
  weights: WeightEntry[]
  lastSyncedAt: string
}

// ─────────────────────── Google response types ───────────────────────

interface GoogleTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
}

// dataPoints.list responses (docs/RESEARCH.md "Google Health API"). int64
// fields (steps count, sleep minutes) arrive as JSON strings — parsed with
// Number(). `name` ends in the data point id: users/me/dataTypes/…/dataPoints/{id}.
interface HealthInterval {
  startTime?: string // RFC 3339
  endTime?: string
  startUtcOffset?: string // proto Duration, e.g. "-25200s"
  endUtcOffset?: string
  civilStartTime?: string // local wall-clock time, e.g. "2026-07-29T07:12:00"
  civilEndTime?: string
}

interface StepsPoint {
  name?: string
  steps?: { interval?: HealthInterval; count?: string | number }
}

interface WeightPoint {
  name?: string
  weight?: {
    sampleTime?: { physicalTime?: string }
    weightGrams?: number
  }
}

interface ExercisePoint {
  name?: string
  exercise?: {
    interval?: HealthInterval
    exerciseType?: string
    displayName?: string
    activeDuration?: string // e.g. "1800s"
    metricsSummary?: {
      caloriesKcal?: number
      averageHeartRateBeatsPerMinute?: number
    }
  }
}

interface SleepPoint {
  name?: string
  sleep?: {
    interval?: HealthInterval
    summary?: { minutesAsleep?: string | number }
  }
}

// Health API ExerciseType enum → CARDIO_ACTIVITIES (verified against the
// dataPoints reference — see docs/RESEARCH.md "Google Health API").
const EXERCISE_MAP: Record<string, string> = {
  RUNNING: "Run",
  TRAIL_RUN: "Run",
  INCLINE_RUN: "Run",
  TREADMILL: "Run",
  WALKING: "Walk",
  POWER_WALKING: "Walk",
  NORDIC_WALKING: "Walk",
  STROLLER_WALK: "Walk",
  TREADMILL_WALK: "Walk",
  INCLINE_WALK: "Walk",
  WALK_WITH_WEIGHTS: "Walk",
  BIKING: "Cycle",
  MOUNTAIN_BIKE: "Cycle",
  OUTDOOR_BIKE: "Cycle",
  STATIONARY_BIKE: "Cycle",
  SPINNING: "Cycle",
  HAND_CYCLING: "Cycle",
  ASSAULT_BIKE: "Cycle",
  SWIMMING: "Swim",
  SWIMMING_POOL: "Swim",
  SWIMMING_OPEN_WATER: "Swim",
  ROWING: "Row",
  ROWING_MACHINE: "Row",
  JUMPING_ROPE: "Jump Rope",
  STAIRCLIMBER: "Stair Climber",
  HIIT: "HIIT",
  INTERVAL_WORKOUT: "HIIT",
  TABATA_WORKOUT: "HIIT",
}

// Users log lifting manually in Adonis — importing these would duplicate.
const STRENGTH_TYPES = new Set([
  "STRENGTH_TRAINING",
  "WEIGHTLIFTING",
  "POWERLIFTING",
  "FUNCTIONAL_STRENGTH_TRAINING",
  "FREE_WEIGHTS",
  "WEIGHTS",
  "WEIGHT_MACHINES",
  "BODY_WEIGHT",
  "CALISTHENICS",
  "CORE_TRAINING",
  "RESISTANCE_BANDS",
  "TRX",
  "CROSSFIT",
])

// Sessions that aren't workouts.
const NON_WORKOUT_TYPES = new Set(["EXERCISE_TYPE_UNSPECIFIED", "MEDITATE"])

// ─────────────────────── error sentinels ───────────────────────

// The stored grant is gone (revoked / expired / no refresh token) — the user
// must reconnect from Settings → Integrations. In Testing mode Google refresh
// tokens expire after 7 days, so this path is routine, not exceptional.
class ReconnectRequired extends Error {}
// Google rejected us with 403 — API disabled for the OAuth client, scope
// missing, or access revoked at the project level.
class ProviderUnavailable extends Error {}
class GoogleHealthError extends Error {
  constructor(readonly status: number) {
    super(`googlefit ${status}`)
  }
}

// ─────────────────────── handler ───────────────────────

export default async function handler(req: Request): Promise<Response> {
  const action = getAction(req)

  // The callback arrives as a browser redirect from Google (no Authorization
  // header — the user is identified by the signed state). Always redirects.
  if (action === "callback") return callback(req)

  if (!supabaseConfigured()) {
    return json({ error: "Accounts are not configured on the server." }, 503)
  }

  try {
    const user = await getUserFromToken(req)
    if (!user) return json({ error: "auth_required" }, 401)

    if (action === "status") {
      if (req.method !== "GET") return json({ error: "Method not allowed" }, 405)
      const row = await getIntegration(user.id, PROVIDER)
      return json({
        connected: Boolean(row),
        lastSyncedAt: row?.last_synced_at || null,
      })
    }

    if (action === "connect") {
      if (req.method !== "GET") return json({ error: "Method not allowed" }, 405)
      if (!googleFitConfigured()) {
        return json({ error: "Google Fit is not configured on the server." }, 503)
      }
      const profile = await getProfile(user.id)
      if (!isProProfile(profile)) return json({ error: "pro_required" }, 403)

      const url = new URL(AUTH_URL)
      url.searchParams.set("client_id", googleFitClientId())
      url.searchParams.set("redirect_uri", `${appUrl(req)}/api/googlefit/callback`)
      url.searchParams.set("response_type", "code")
      url.searchParams.set("scope", SCOPES)
      // offline + consent: Google only returns a refresh token from a real
      // consent screen — without these a reconnect would leave us unable to
      // refresh access tokens.
      url.searchParams.set("access_type", "offline")
      url.searchParams.set("prompt", "consent")
      url.searchParams.set("include_granted_scopes", "true")
      // The nonce ties the flow to this browser: it travels in the signed
      // state AND in an httpOnly cookie, and the callback requires both to
      // match — otherwise a leaked/attacker-issued state could bind a
      // victim's Google account (and health data) to the attacker's user.
      const nonce = crypto.randomUUID()
      url.searchParams.set("state", await signState({ u: user.id, p: PROVIDER, n: nonce }))
      return json({ url: url.toString() }, 200, {
        "set-cookie": serializeCookie(NONCE_COOKIE, nonce, 600),
      })
    }

    if (action === "sync") {
      if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
      if (!googleFitConfigured()) {
        return json({ error: "Google Fit is not configured on the server." }, 503)
      }
      const profile = await getProfile(user.id)
      if (!isProProfile(profile)) return json({ error: "pro_required" }, 403)
      const row = await getIntegration(user.id, PROVIDER)
      if (!row) return json({ error: "not_connected" }, 400)
      return json(await sync(row))
    }

    if (action === "disconnect") {
      if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)
      const row = await getIntegration(user.id, PROVIDER)
      if (row) {
        await revokeToken(row.refresh_token || row.access_token)
        await deleteIntegration(user.id, PROVIDER)
      }
      return json({ ok: true })
    }

    return json({ error: "unknown_action" }, 400)
  } catch (e) {
    if (e instanceof ReconnectRequired) {
      return json({ error: "reconnect_required" }, 401)
    }
    if (e instanceof ProviderUnavailable) {
      return json({ error: "provider_unavailable" }, 502)
    }
    if (e instanceof GoogleHealthError) {
      return json({ error: "googlefit_error", detail: e.status }, 502)
    }
    return json({ error: e instanceof Error ? e.message : "googlefit failed" }, 500)
  }
}

// ─────────────────────── OAuth ───────────────────────

async function callback(req: Request): Promise<Response> {
  const origin = appUrl(req)
  const fail = () => redirect(`${origin}/?connect_error=googlefit`)
  if (!supabaseConfigured() || !googleFitConfigured()) return fail()

  try {
    const params = new URL(req.url).searchParams
    const code = params.get("code") || ""
    const state = await verifyState(params.get("state") || "")
    if (!code || !state || state.p !== PROVIDER) return fail()
    // The signed state alone is a bearer anyone could be lured into
    // completing — require the nonce cookie set by connect() on the browser
    // that started the flow.
    const nonce = getCookie(req, NONCE_COOKIE)
    if (!nonce || nonce !== state.n) return fail()

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: googleFitClientId(),
        client_secret: googleFitClientSecret(),
        redirect_uri: `${origin}/api/googlefit/callback`,
      }),
    })
    const data = (await res.json().catch(() => null)) as GoogleTokenResponse | null
    if (!res.ok || !data?.access_token) return fail()

    // Google only includes refresh_token on a fresh consent — keep the
    // previously stored one when reconnecting without one.
    const existing = await getIntegration(state.u, PROVIDER)
    await upsertIntegration({
      user_id: state.u,
      provider: PROVIDER,
      access_token: data.access_token,
      refresh_token: data.refresh_token || existing?.refresh_token || null,
      expires_at: expiresAtIso(data.expires_in),
      scopes: data.scope || SCOPES,
      // No extra userinfo call — we don't request a profile scope, so there
      // is no external user id to store.
      external_user_id: existing?.external_user_id || null,
      last_synced_at: existing?.last_synced_at || null,
    })
    // Clear the nonce so the one-time cookie can't be replayed.
    return redirect(`${origin}/?connected=googlefit`, serializeCookie(NONCE_COOKIE, "", 0))
  } catch {
    return fail()
  }
}

// Returns a valid access token, refreshing when within 5 minutes of expiry.
// Google refresh tokens do NOT rotate — the stored one stays valid and only
// the access token/expiry are updated. But in Testing mode (pre security
// review) refresh tokens expire after 7 days: refresh then fails with
// invalid_grant → ReconnectRequired → 401 { error: "reconnect_required" }.
async function getFreshToken(
  row: IntegrationRow
): Promise<{ token: string; row: IntegrationRow }> {
  const expiresAt = row.expires_at ? Date.parse(row.expires_at) : 0
  if (row.access_token && expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
    return { token: row.access_token, row }
  }
  if (!row.refresh_token) throw new ReconnectRequired()

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
      client_id: googleFitClientId(),
      client_secret: googleFitClientSecret(),
    }),
  })
  const data = (await res.json().catch(() => null)) as GoogleTokenResponse | null
  if (!res.ok || !data?.access_token) {
    if (data?.error === "invalid_grant") throw new ReconnectRequired()
    throw new GoogleHealthError(res.status)
  }

  const updated: IntegrationRow = {
    ...row,
    access_token: data.access_token,
    refresh_token: data.refresh_token || row.refresh_token,
    expires_at: expiresAtIso(data.expires_in),
  }
  await upsertIntegration(updated)
  return { token: updated.access_token, row: updated }
}

// Best-effort revoke — revoking the refresh token invalidates the whole grant.
async function revokeToken(token: string | null): Promise<void> {
  if (!token) return
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    })
  } catch {
    // best-effort — the integration row is deleted regardless
  }
}

// ─────────────────────── sync ───────────────────────

async function sync(integration: IntegrationRow): Promise<IntegrationSyncResult> {
  const { token, row } = await getFreshToken(integration)

  const now = Date.now()
  const lastSyncMs = row.last_synced_at ? Date.parse(row.last_synced_at) : NaN
  const sinceMs = Number.isFinite(lastSyncMs)
    ? lastSyncMs - SYNC_OVERLAP_MS
    : now - FIRST_SYNC_WINDOW_MS
  const windowStartMs = Math.min(Math.max(sinceMs, now - MAX_WINDOW_MS), now - 1)
  // Daily step/sleep totals need whole days — floor to UTC midnight.
  const dayStartMs = Math.floor(windowStartMs / DAY_MS) * DAY_MS

  const [stepPoints, weightPoints, exercisePoints, sleepPoints] = await Promise.all([
    listDataPoints<StepsPoint>(
      token,
      "steps",
      "steps.interval.start_time",
      dayStartMs,
      now,
      SAMPLE_PAGE_SIZE
    ),
    listDataPoints<WeightPoint>(
      token,
      "weight",
      "weight.sample_time.physical_time",
      dayStartMs,
      now,
      SAMPLE_PAGE_SIZE
    ),
    listDataPoints<ExercisePoint>(
      token,
      "exercise",
      "exercise.interval.start_time",
      dayStartMs,
      now
    ),
    // Sleep is a nice-to-have on the recovery card — never fail the whole
    // sync over it (e.g. the sleep scope was declined on the consent screen).
    listDataPoints<SleepPoint>(
      token,
      "sleep",
      "sleep.interval.start_time",
      dayStartMs,
      now
    ).catch(() => [] as SleepPoint[]),
  ])

  // Daily steps + sleep → one RecoveryEntry per LOCAL calendar date (skip
  // empty days): the client compares entry dates against the device's local
  // date, and Whoop entries are keyed the same way, so cross-source entries
  // for the same physical day must share a key. Steps key on their local
  // start day; sleep keys on its local end (wake) day, matching Whoop.
  // caloriesOut is intentionally omitted: total-calories is rollup-only with
  // a 14-day range cap and active-energy-burned is minute-grained — neither
  // is a cheap single read (see docs/RESEARCH.md).
  const daily = new Map<string, { steps?: number; sleepDurationSec?: number }>()
  for (const point of stepPoints) {
    const interval = point.steps?.interval
    const date = localDate(interval?.civilStartTime, interval?.startTime, interval?.startUtcOffset)
    const count = Number(point.steps?.count)
    if (!date || !Number.isFinite(count) || count <= 0) continue
    const metrics = daily.get(date) || {}
    metrics.steps = (metrics.steps || 0) + Math.round(count)
    daily.set(date, metrics)
  }
  for (const point of sleepPoints) {
    const interval = point.sleep?.interval
    const date =
      localDate(interval?.civilEndTime, interval?.endTime, interval?.endUtcOffset) ??
      localDate(interval?.civilStartTime, interval?.startTime, interval?.startUtcOffset)
    if (!date) continue
    const sec = sleepSeconds(point)
    if (!sec) continue
    // Longest session per date wins — avoids naps overriding the night.
    const metrics = daily.get(date) || {}
    if (!metrics.sleepDurationSec || sec > metrics.sleepDurationSec) {
      metrics.sleepDurationSec = sec
    }
    daily.set(date, metrics)
  }
  // Drop the window's boundary date — its records may only partially fall
  // inside the day-aligned window, and a partial entry would wipe fields
  // from the already-imported complete one on the client.
  const boundaryDate = new Date(dayStartMs).toISOString().slice(0, 10)
  const recovery = [...daily.entries()]
    .filter(([date]) => date > boundaryDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([date, metrics]): RecoveryEntry => ({
        id: `${PROVIDER}-${date}`,
        date,
        source: PROVIDER,
        ...metrics,
      })
    )

  // Weight — the latest sample of each UTC date wins; grams → kg.
  const latestWeight = new Map<string, { ms: number; kg: number }>()
  for (const point of weightPoints) {
    const grams = Number(point.weight?.weightGrams)
    const sampleMs = Date.parse(point.weight?.sampleTime?.physicalTime || "")
    if (!Number.isFinite(grams) || grams <= 0 || Number.isNaN(sampleMs)) continue
    const date = new Date(sampleMs).toISOString().slice(0, 10)
    const prev = latestWeight.get(date)
    if (!prev || sampleMs > prev.ms) {
      latestWeight.set(date, { ms: sampleMs, kg: grams / 1000 })
    }
  }
  const weights = [...latestWeight.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([date, sample]): WeightEntry => ({
        id: `${PROVIDER}-${date}`,
        externalId: date,
        source: PROVIDER,
        datetime: new Date(sample.ms).toISOString(),
        weight: Math.round(sample.kg * 10) / 10,
        unit: "kg",
      })
    )

  // Exercise sessions → CardioEntry (skip strength — logged manually in Adonis).
  const cardio: CardioEntry[] = []
  for (const point of exercisePoints) {
    const exercise = point.exercise
    if (!exercise) continue
    const type = exercise.exerciseType || ""
    if (STRENGTH_TYPES.has(type) || NON_WORKOUT_TYPES.has(type)) continue
    const id = pointId(point.name)
    const startMs = Date.parse(exercise.interval?.startTime || "")
    const endMs = Date.parse(exercise.interval?.endTime || "")
    if (!id || Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) continue

    const activity = EXERCISE_MAP[type]
    const entry: CardioEntry = {
      id: `${PROVIDER}-${id}`,
      externalId: id,
      source: PROVIDER,
      datetime: new Date(startMs).toISOString(),
      durationSec:
        durationSeconds(exercise.activeDuration) ??
        Math.round((endMs - startMs) / 1000),
      activity: activity || "Other",
    }
    if (!activity) {
      entry.notes =
        exercise.displayName || type.toLowerCase().replace(/_/g, " ") || "Google workout"
    }
    const hr = Number(exercise.metricsSummary?.averageHeartRateBeatsPerMinute)
    if (Number.isFinite(hr) && hr > 0) entry.avgHeartRate = Math.round(hr)
    const kcal = Number(exercise.metricsSummary?.caloriesKcal)
    if (Number.isFinite(kcal) && kcal > 0) entry.caloriesBurned = Math.round(kcal)
    cardio.push(entry)
  }

  const lastSyncedAt = new Date(now).toISOString()
  await upsertIntegration({ ...row, last_synced_at: lastSyncedAt })

  return { provider: PROVIDER, recovery, cardio, weights, lastSyncedAt }
}

// ─────────────────────── Health API ───────────────────────

// Health API request. 401 means the access token was revoked; 403 means the
// API is disabled for the OAuth client or the scope is missing — either way
// the provider is unavailable to us.
async function healthFetch<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${HEALTH_BASE}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  })
  if (res.ok) return (await res.json()) as T
  if (res.status === 401) throw new ReconnectRequired()
  if (res.status === 403) throw new ProviderUnavailable()
  throw new GoogleHealthError(res.status)
}

// GET /users/me/dataTypes/{dataType}/dataPoints with an AIP-160 time-range
// filter (RFC 3339, snake_case field paths), following nextPageToken (capped).
async function listDataPoints<T>(
  token: string,
  dataType: string,
  timeField: string,
  startMs: number,
  endMs: number,
  pageSize?: number
): Promise<T[]> {
  const filter = `${timeField} >= "${rfc3339(startMs)}" AND ${timeField} < "${rfc3339(endMs)}"`
  const points: T[] = []
  let pageToken = ""
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ filter })
    if (pageSize) params.set("pageSize", String(pageSize))
    if (pageToken) params.set("pageToken", pageToken)
    const data = await healthFetch<{ dataPoints?: T[]; nextPageToken?: string }>(
      token,
      `/users/me/dataTypes/${dataType}/dataPoints?${params}`
    )
    points.push(...(data.dataPoints || []))
    if (!data.nextPageToken) break
    pageToken = data.nextPageToken
  }
  return points
}

// ─────────────────────── small helpers ───────────────────────

function googleFitConfigured(): boolean {
  return Boolean(googleFitClientId() && googleFitClientSecret())
}

function redirect(url: string, setCookie?: string): Response {
  const headers: Record<string, string> = { location: url }
  if (setCookie) headers["set-cookie"] = setCookie
  return new Response(null, { status: 302, headers })
}

function expiresAtIso(expiresIn: number | undefined): string | null {
  if (!expiresIn) return null
  return new Date(Date.now() + expiresIn * 1000).toISOString()
}

// RFC 3339 without fractional seconds, e.g. "2026-07-29T00:00:00Z".
function rfc3339(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 19)}Z`
}

// Local calendar date of an interval boundary: prefer the civil timestamp
// (already in the user's local time — only its date prefix is needed), then
// the UTC instant shifted by the proto-Duration utcOffset, then plain UTC.
function localDate(
  civil: string | undefined,
  instant: string | undefined,
  utcOffset: string | undefined
): string | null {
  if (civil && /^\d{4}-\d{2}-\d{2}/.test(civil)) return civil.slice(0, 10)
  if (!instant) return null
  const ms = Date.parse(instant)
  if (Number.isNaN(ms)) return null
  const m = utcOffset ? /^(-?\d+(?:\.\d+)?)s$/.exec(utcOffset.trim()) : null
  const offsetMs = m ? Number(m[1]) * 1000 : 0
  return new Date(ms + offsetMs).toISOString().slice(0, 10)
}

// "users/me/dataTypes/exercise/dataPoints/{id}" → "{id}"
function pointId(name: string | undefined): string {
  if (!name) return ""
  return name.split("/").pop() || ""
}

// proto Duration string, e.g. "1800s" → 1800.
function durationSeconds(value: string | undefined): number | null {
  if (!value) return null
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value.trim())
  if (!match) return null
  const sec = Math.round(Number(match[1]))
  return sec > 0 ? sec : null
}

// Prefer the summary's minutesAsleep; fall back to the session interval.
function sleepSeconds(point: SleepPoint): number {
  const minutes = Number(point.sleep?.summary?.minutesAsleep)
  if (Number.isFinite(minutes) && minutes > 0) return Math.round(minutes * 60)
  const startMs = Date.parse(point.sleep?.interval?.startTime || "")
  const endMs = Date.parse(point.sleep?.interval?.endTime || "")
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return 0
  return Math.round((endMs - startMs) / 1000)
}
