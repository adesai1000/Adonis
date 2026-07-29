// Vercel Edge Function — Whoop integration (OAuth connect/callback, data sync,
// status, disconnect). Routes on ?action= — see docs/SAAS-SPEC.md §API and
// docs/RESEARCH.md "Whoop" for the external endpoint reference.
// Tokens live only in the `integrations` table (service-role access) and are
// never logged or returned to the client.
export const config = { runtime: "edge" }

import { appUrl, supabaseConfigured, whoopClientId, whoopClientSecret } from "./_lib/env"
import { getAction, getCookie, json, serializeCookie } from "./_lib/http"
import { signState, verifyState } from "./_lib/state"
import {
  deleteIntegration,
  getIntegration,
  getProfile,
  getUserFromToken,
  isProProfile,
  upsertIntegration,
  type IntegrationRow,
} from "./_lib/supa"

const AUTHORIZE_URL = "https://api.prod.whoop.com/oauth/oauth2/auth"
const TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token"
const API_BASE = "https://api.prod.whoop.com/developer"
const SCOPES = "read:recovery read:cycles read:sleep read:workout read:profile offline"

const PAGE_LIMIT = 25 // Whoop max per page
const MAX_PAGES = 10 // per endpoint, per sync
const DAY_MS = 24 * 60 * 60 * 1000
// Re-fetch 3 days for late-scored records: the (possibly partial) boundary
// date of the day-aligned window is dropped, leaving 2 full re-fetched days.
const OVERLAP_MS = 3 * DAY_MS
const FIRST_SYNC_MS = 30 * DAY_MS
const REFRESH_MARGIN_MS = 60 * 1000
// Binds the OAuth flow to the browser that started it (CSRF guard).
const NONCE_COOKIE = "oauth_nonce_whoop"

// ── Client-contract shapes (mirrors src/lib/types.ts) ──────────────────────

type CardioActivity =
  | "Run"
  | "Walk"
  | "Cycle"
  | "Swim"
  | "Row"
  | "Jump Rope"
  | "Stair Climber"
  | "HIIT"
  | "Steps"
  | "Other"

interface RecoveryEntry {
  id: string
  date: string // yyyy-MM-dd
  source: "whoop"
  recoveryScore?: number
  hrvMs?: number
  restingHeartRate?: number
  sleepPerformance?: number
  sleepDurationSec?: number
  dayStrain?: number
  caloriesOut?: number
}

interface CardioEntry {
  id: string
  datetime: string
  activity: CardioActivity
  durationSec: number
  avgHeartRate?: number
  caloriesBurned?: number
  notes?: string
  source: "whoop"
  externalId: string
}

interface IntegrationSyncResult {
  provider: "whoop"
  recovery: RecoveryEntry[]
  cardio: CardioEntry[]
  weights: never[] // Whoop has no body-weight timeline we import
  lastSyncedAt: string
}

// ── Whoop API shapes (docs/RESEARCH.md) ────────────────────────────────────

interface WhoopTokens {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
}

interface WhoopRecovery {
  cycle_id?: string | number
  sleep_id?: string | number
  created_at?: string
  score_state?: string
  score?: {
    recovery_score?: number
    resting_heart_rate?: number
    hrv_rmssd_milli?: number
  }
}

interface WhoopSleep {
  id?: string | number
  start?: string
  end?: string
  timezone_offset?: string // e.g. "+02:00"
  nap?: boolean
  score_state?: string
  score?: { sleep_performance_percentage?: number }
}

interface WhoopCycle {
  id?: string | number
  start?: string
  timezone_offset?: string
  score_state?: string
  score?: { strain?: number; kilojoule?: number }
}

interface WhoopWorkout {
  id?: string | number
  sport_id?: number
  sport_name?: string
  start?: string
  end?: string
  score?: {
    average_heart_rate?: number
    kilojoule?: number
  }
}

// Non-2xx from the Whoop API — surfaced to the client as {error:"whoop_error"}.
class WhoopApiError extends Error {
  status: number
  constructor(status: number) {
    super(`whoop ${status}`)
    this.status = status
  }
}

export default async function handler(req: Request): Promise<Response> {
  const action = getAction(req)
  try {
    if (action === "connect" && req.method === "GET") return await connect(req)
    if (action === "callback" && req.method === "GET") return await callback(req)
    if (action === "sync" && req.method === "POST") return await sync(req)
    if (action === "status" && req.method === "GET") return await status(req)
    if (action === "disconnect" && req.method === "POST") return await disconnect(req)
    return json({ error: "Unknown action" }, 400)
  } catch (e) {
    if (e instanceof WhoopApiError) {
      return json({ error: "whoop_error", detail: e.status }, 502)
    }
    return json({ error: e instanceof Error ? e.message : "whoop failed" }, 500)
  }
}

// ── Auth gates ──────────────────────────────────────────────────────────────

function whoopConfigured(): boolean {
  return Boolean(whoopClientId() && whoopClientSecret())
}

async function requireUser(
  req: Request
): Promise<{ id: string; email: string } | Response> {
  if (!supabaseConfigured()) {
    return json({ error: "Accounts are not configured on the server." }, 503)
  }
  const user = await getUserFromToken(req)
  if (!user) return json({ error: "auth_required" }, 401)
  return user
}

async function requirePro(
  req: Request
): Promise<{ id: string; email: string } | Response> {
  const user = await requireUser(req)
  if (user instanceof Response) return user
  const profile = await getProfile(user.id)
  if (!isProProfile(profile)) return json({ error: "pro_required" }, 403)
  return user
}

// ── connect ─────────────────────────────────────────────────────────────────

async function connect(req: Request): Promise<Response> {
  const user = await requirePro(req)
  if (user instanceof Response) return user
  if (!whoopConfigured()) {
    return json({ error: "Whoop is not configured on the server." }, 503)
  }
  // The nonce ties the flow to this browser: it travels in the signed state
  // AND in an httpOnly cookie, and the callback requires both to match —
  // otherwise a leaked/attacker-issued state could bind a victim's Whoop
  // account (and health data) to the attacker's user.
  const nonce = crypto.randomUUID()
  const state = await signState({ u: user.id, p: "whoop", n: nonce })
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set("client_id", whoopClientId())
  url.searchParams.set("redirect_uri", `${appUrl(req)}/api/whoop/callback`)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", SCOPES)
  url.searchParams.set("state", state)
  return json({ url: url.toString() }, 200, {
    "set-cookie": serializeCookie(NONCE_COOKIE, nonce, 600),
  })
}

// ── callback ────────────────────────────────────────────────────────────────
// No Authorization header here (browser redirect from Whoop) — the user's
// identity comes from the HMAC-signed `state` we issued in connect.

async function callback(req: Request): Promise<Response> {
  const base = appUrl(req)
  const fail = () => redirect(`${base}/?connect_error=whoop`)
  try {
    if (!supabaseConfigured() || !whoopConfigured()) return fail()
    const params = new URL(req.url).searchParams
    const code = params.get("code") || ""
    const stateParam = params.get("state") || ""
    if (!code || !stateParam) return fail()
    const state = await verifyState(stateParam)
    if (!state || state.p !== "whoop") return fail()
    // The signed state alone is a bearer anyone could be lured into
    // completing — require the nonce cookie set by connect() on the browser
    // that started the flow.
    const nonce = getCookie(req, NONCE_COOKIE)
    if (!nonce || nonce !== state.n) return fail()

    const tokens = await exchangeCode(code, base)
    if (!tokens || !tokens.access_token) return fail()

    // Best-effort: record the Whoop user id for reference/debugging.
    let externalUserId: string | null = null
    try {
      const res = await fetch(`${API_BASE}/v2/user/profile/basic`, {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      })
      if (res.ok) {
        const profile = (await res.json()) as { user_id?: number | string }
        if (profile.user_id != null) externalUserId = String(profile.user_id)
      }
    } catch {
      // non-fatal — connection still works without it
    }

    await upsertIntegration({
      user_id: state.u,
      provider: "whoop",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
      scopes: tokens.scope || SCOPES,
      external_user_id: externalUserId,
      last_synced_at: null,
    })
    // Clear the nonce so the one-time cookie can't be replayed.
    return redirect(`${base}/?connected=whoop`, serializeCookie(NONCE_COOKIE, "", 0))
  } catch {
    return fail()
  }
}

function redirect(location: string, setCookie?: string): Response {
  const headers: Record<string, string> = { location }
  if (setCookie) headers["set-cookie"] = setCookie
  return new Response(null, { status: 302, headers })
}

async function exchangeCode(code: string, base: string): Promise<WhoopTokens | null> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: whoopClientId(),
    client_secret: whoopClientSecret(),
    redirect_uri: `${base}/api/whoop/callback`,
  })
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })
  if (!res.ok) return null
  return (await res.json()) as WhoopTokens
}

// ── sync ────────────────────────────────────────────────────────────────────

async function sync(req: Request): Promise<Response> {
  const user = await requirePro(req)
  if (user instanceof Response) return user
  if (!whoopConfigured()) {
    return json({ error: "Whoop is not configured on the server." }, 503)
  }
  const row = await getIntegration(user.id, "whoop")
  if (!row) return json({ error: "not_connected" }, 400)

  const accessToken = await getFreshToken(row)
  if (!accessToken) return json({ error: "reconnect_required" }, 401)

  const end = new Date()
  const sinceMs = row.last_synced_at
    ? new Date(row.last_synced_at).getTime() - OVERLAP_MS
    : end.getTime() - FIRST_SYNC_MS
  // Day-aligned window: a mid-day start would return only some of the
  // boundary date's records (recovery ~07:00, sleep ~23:00) and the resulting
  // partial entry would clobber the previously-imported complete one on the
  // client. buildRecovery additionally drops the boundary date itself.
  const start = new Date(Math.floor(sinceMs / DAY_MS) * DAY_MS)

  const [recoveries, sleeps, cycles, workouts] = await Promise.all([
    fetchCollection<WhoopRecovery>("/v2/recovery", accessToken, start, end),
    fetchCollection<WhoopSleep>("/v2/activity/sleep", accessToken, start, end),
    fetchCollection<WhoopCycle>("/v2/cycle", accessToken, start, end),
    fetchCollection<WhoopWorkout>("/v2/activity/workout", accessToken, start, end),
  ])

  const result: IntegrationSyncResult = {
    provider: "whoop",
    recovery: buildRecovery(recoveries, sleeps, cycles, start.toISOString().slice(0, 10)),
    cardio: buildCardio(workouts),
    weights: [],
    lastSyncedAt: end.toISOString(),
  }

  // `row` carries the freshest tokens (getFreshToken updates it in place).
  await upsertIntegration({ ...row, last_synced_at: result.lastSyncedAt })
  return json(result)
}

// Returns a valid access token, refreshing when it expires within 60s.
// Whoop refresh tokens are single-use and rotate — both new tokens are
// persisted immediately (and mirrored onto `row`) before the token is used.
// Only a genuinely dead grant (no refresh token, or invalid_grant) → null
// (caller maps to 401 reconnect_required); transient failures — network
// errors, Whoop 5xx — throw WhoopApiError instead so the client is not told
// to reconnect a perfectly valid grant. The stored row is never deleted here.
async function getFreshToken(row: IntegrationRow): Promise<string | null> {
  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0
  if (expiresAt - Date.now() > REFRESH_MARGIN_MS) return row.access_token
  if (!row.refresh_token) return null

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
    client_id: whoopClientId(),
    client_secret: whoopClientSecret(),
    scope: "offline",
  })
  let res: Response
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })
  } catch {
    // No response at all — a network blip, not a dead grant.
    throw new WhoopApiError(0)
  }
  const data = (await res.json().catch(() => null)) as
    | (WhoopTokens & { error?: string })
    | null
  if (!res.ok || !data?.access_token) {
    if (data?.error === "invalid_grant") return null
    throw new WhoopApiError(res.status)
  }

  row.access_token = data.access_token
  row.refresh_token = data.refresh_token || row.refresh_token
  row.expires_at = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString()
  await upsertIntegration(row)
  return row.access_token
}

// Paginated GET against the Whoop developer API (follows next_token, capped).
async function fetchCollection<T>(
  path: string,
  accessToken: string,
  start: Date,
  end: Date
): Promise<T[]> {
  const records: T[] = []
  let nextToken = ""
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${API_BASE}${path}`)
    url.searchParams.set("start", start.toISOString())
    url.searchParams.set("end", end.toISOString())
    url.searchParams.set("limit", String(PAGE_LIMIT))
    if (nextToken) url.searchParams.set("nextToken", nextToken)
    const res = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new WhoopApiError(res.status)
    const data = (await res.json()) as { records?: T[]; next_token?: string | null }
    if (Array.isArray(data.records)) records.push(...data.records)
    if (!data.next_token) break
    nextToken = data.next_token
  }
  return records
}

// ── Mapping: Whoop records → RecoveryEntry per local (wake-day) date ────────
// The whole night+day is anchored on the WAKE day in the user's own timezone:
// sleeps key on their end, recoveries join their sleep via sleep_id, and
// cycles follow the recovery that points at them. Keying by UTC created_at /
// start dates put "today's" recovery on yesterday for users east of UTC and
// detached each night's sleep from its recovery.

// "+02:00" / "-05:30" → milliseconds; missing/malformed offsets → 0 (UTC).
function tzOffsetMs(offset: string | undefined): number {
  if (!offset) return 0
  const m = /^([+-])(\d{2}):(\d{2})/.exec(offset.trim())
  if (!m) return 0
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60 * 1000
}

// yyyy-MM-dd of an instant shifted into the record's local timezone.
function dayKey(value: string | undefined, tzOffset?: string): string | null {
  if (!value) return null
  const time = Date.parse(value)
  if (Number.isNaN(time)) return null
  return new Date(time + tzOffsetMs(tzOffset)).toISOString().slice(0, 10)
}

function buildRecovery(
  recoveries: WhoopRecovery[],
  sleeps: WhoopSleep[],
  cycles: WhoopCycle[],
  minDateExclusive: string
): RecoveryEntry[] {
  const byDate = new Map<string, RecoveryEntry>()
  const entryFor = (date: string): RecoveryEntry => {
    let entry = byDate.get(date)
    if (!entry) {
      entry = { id: `whoop-${date}`, date, source: "whoop" }
      byDate.set(date, entry)
    }
    return entry
  }

  const sleepById = new Map<string, WhoopSleep>()
  for (const sleep of sleeps) {
    if (sleep.id != null) sleepById.set(String(sleep.id), sleep)
  }
  const cycleById = new Map<string, WhoopCycle>()
  for (const cycle of cycles) {
    if (cycle.id != null) cycleById.set(String(cycle.id), cycle)
  }
  // Local date the user woke up from this sleep.
  const wakeDate = (sleep: WhoopSleep): string | null =>
    dayKey(sleep.end, sleep.timezone_offset) ??
    dayKey(sleep.start, sleep.timezone_offset)

  // Wake date per cycle id, filled in from the recoveries that point at them.
  const cycleDates = new Map<string, string>()

  for (const rec of recoveries) {
    if (rec.score_state !== "SCORED" || !rec.score) continue
    // Anchor the recovery on the wake date of the sleep it was computed
    // from; fall back to created_at in the cycle's (then UTC) timezone.
    const sleep = rec.sleep_id != null ? sleepById.get(String(rec.sleep_id)) : undefined
    const cycle = rec.cycle_id != null ? cycleById.get(String(rec.cycle_id)) : undefined
    const date =
      (sleep ? wakeDate(sleep) : null) ?? dayKey(rec.created_at, cycle?.timezone_offset)
    if (!date) continue
    if (rec.cycle_id != null) cycleDates.set(String(rec.cycle_id), date)
    const entry = entryFor(date)
    if (rec.score.recovery_score != null) entry.recoveryScore = rec.score.recovery_score
    if (rec.score.hrv_rmssd_milli != null) {
      entry.hrvMs = Math.round(rec.score.hrv_rmssd_milli * 10) / 10
    }
    if (rec.score.resting_heart_rate != null) {
      entry.restingHeartRate = Math.round(rec.score.resting_heart_rate)
    }
  }

  for (const sleep of sleeps) {
    if (sleep.nap === true) continue
    const date = wakeDate(sleep)
    if (!date) continue
    const entry = entryFor(date)
    const startMs = sleep.start ? Date.parse(sleep.start) : NaN
    const endMs = sleep.end ? Date.parse(sleep.end) : NaN
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs) {
      entry.sleepDurationSec = Math.round((endMs - startMs) / 1000)
    }
    const performance = sleep.score?.sleep_performance_percentage
    if (sleep.score_state === "SCORED" && performance != null) {
      entry.sleepPerformance = Math.round(performance)
    }
  }

  for (const cycle of cycles) {
    if (cycle.score_state !== "SCORED" || !cycle.score) continue
    // A cycle spans wake→wake: put its strain on the same day as the
    // recovery that points at it; orphan cycles key on their local start.
    const date =
      (cycle.id != null ? cycleDates.get(String(cycle.id)) : undefined) ??
      dayKey(cycle.start, cycle.timezone_offset)
    if (!date) continue
    const entry = entryFor(date)
    if (cycle.score.strain != null) {
      entry.dayStrain = Math.round(cycle.score.strain * 10) / 10
    }
    if (cycle.score.kilojoule != null) {
      entry.caloriesOut = Math.round(cycle.score.kilojoule / 4.184)
    }
  }

  return [...byDate.values()]
    // The boundary date's records may only partially fall inside the window
    // — emitting them would wipe fields from an already-complete entry.
    .filter((entry) => entry.date > minDateExclusive)
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ── Mapping: Whoop workouts → CardioEntry ───────────────────────────────────

// Whoop v2 sport_name is lowercase (e.g. "running").
const SPORT_TO_ACTIVITY: Record<string, CardioActivity> = {
  running: "Run",
  walking: "Walk",
  cycling: "Cycle",
  swimming: "Swim",
  rowing: "Row",
  "jump rope": "Jump Rope",
  stairmaster: "Stair Climber",
  hiit: "HIIT",
}

// Lifting is logged manually in Adonis — importing would duplicate.
// Names matched case-insensitively; ids are the known v2 strength sports
// (45 weightlifting, 48 functional fitness, 59 powerlifting, 123 strength trainer).
const STRENGTH_NAME_RE = /weightlifting|powerlifting|functional fitness|strength/
const STRENGTH_SPORT_IDS = new Set([45, 48, 59, 123])

function buildCardio(workouts: WhoopWorkout[]): CardioEntry[] {
  const cardio: CardioEntry[] = []
  for (const workout of workouts) {
    if (workout.id == null || !workout.start || !workout.end) continue
    const startMs = Date.parse(workout.start)
    const endMs = Date.parse(workout.end)
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) continue

    const sportName = (workout.sport_name || "").trim().toLowerCase()
    if (STRENGTH_NAME_RE.test(sportName)) continue
    if (workout.sport_id != null && STRENGTH_SPORT_IDS.has(workout.sport_id)) continue

    const activity = SPORT_TO_ACTIVITY[sportName] || "Other"
    const label = sportName || (workout.sport_id != null ? `Whoop sport ${workout.sport_id}` : "Whoop workout")
    const entry: CardioEntry = {
      id: `whoop-${workout.id}`,
      datetime: new Date(startMs).toISOString(),
      activity,
      durationSec: Math.round((endMs - startMs) / 1000),
      source: "whoop",
      externalId: String(workout.id),
    }
    if (activity === "Other") entry.notes = label
    if (workout.score?.average_heart_rate != null) {
      entry.avgHeartRate = Math.round(workout.score.average_heart_rate)
    }
    if (workout.score?.kilojoule != null) {
      entry.caloriesBurned = Math.round(workout.score.kilojoule / 4.184)
    }
    cardio.push(entry)
  }
  return cardio
}

// ── status / disconnect ─────────────────────────────────────────────────────

async function status(req: Request): Promise<Response> {
  const user = await requireUser(req)
  if (user instanceof Response) return user
  const row = await getIntegration(user.id, "whoop")
  return json({ connected: !!row, lastSyncedAt: row?.last_synced_at || null })
}

async function disconnect(req: Request): Promise<Response> {
  const user = await requireUser(req)
  if (user instanceof Response) return user
  const row = await getIntegration(user.id, "whoop")
  if (row) {
    // Best-effort revoke of the user's grant on Whoop's side.
    try {
      await fetch(`${API_BASE}/v2/user/access`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${row.access_token}` },
      })
    } catch {
      // ignore — deleting our stored tokens is what matters
    }
    await deleteIntegration(user.id, "whoop")
  }
  return json({ ok: true })
}
