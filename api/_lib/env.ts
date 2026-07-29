// Typed access to server-side environment variables (see docs/SAAS-SPEC.md).
// Every SaaS feature must degrade gracefully when its vars are missing — the
// route handlers check the *Configured() helpers and return {error}, 503.

export function supabaseUrl(): string {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ""
  return url.replace(/\/+$/, "")
}

export function supabaseAnonKey(): string {
  return process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ""
}

export function supabaseServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || ""
}

export function stripeSecretKey(): string {
  return process.env.STRIPE_SECRET_KEY || ""
}

export function stripeWebhookSecret(): string {
  return process.env.STRIPE_WEBHOOK_SECRET || ""
}

export function stripePriceMonthly(): string {
  return process.env.STRIPE_PRICE_MONTHLY || ""
}

export function stripePriceYearly(): string {
  return process.env.STRIPE_PRICE_YEARLY || ""
}

export function whoopClientId(): string {
  return process.env.WHOOP_CLIENT_ID || ""
}

export function whoopClientSecret(): string {
  return process.env.WHOOP_CLIENT_SECRET || ""
}

export function googleFitClientId(): string {
  return process.env.GOOGLE_FIT_CLIENT_ID || ""
}

export function googleFitClientSecret(): string {
  return process.env.GOOGLE_FIT_CLIENT_SECRET || ""
}

export function deepseekApiKey(): string {
  return process.env.DEEPSEEK_API || process.env.VITE_DEEPSEEK_API || ""
}

export function kvRestApiUrl(): string {
  return process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ""
}

export function kvRestApiToken(): string {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ""
}

export function supabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseAnonKey() && supabaseServiceRoleKey())
}

export function stripeConfigured(): boolean {
  return Boolean(stripeSecretKey())
}

// Canonical app origin for redirects: APP_URL when set, else the request origin.
export function appUrl(req: Request): string {
  const configured = process.env.APP_URL
  if (configured) return configured.replace(/\/+$/, "")
  return new URL(req.url).origin
}
