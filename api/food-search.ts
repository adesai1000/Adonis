// Vercel Edge Function — food search + barcode fallback.
//   GET /api/food-search?q=<text>   →  { hits: FoodSearchHit[] }
//   GET /api/food-search?upc=<code> →  { product: FoodProduct | null }
//
// Text search merges Open Food Facts (packaged goods, global) with USDA
// FoodData Central (generic whole foods + US branded). The OFF search service
// isn't CORS-open and USDA wants a key, so both run server-side. The barcode
// path is only the USDA fallback; the client asks Open Food Facts directly
// first. Set USDA_FDC_API_KEY in the environment (see .env.example).
import { searchFoods, lookupUpcFallback } from "./_lib/food-search"

export const config = { runtime: "edge" }

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  })
}

// Same query from any device within 10 minutes is served from the edge.
const CACHE = { "cache-control": "public, s-maxage=600, stale-while-revalidate=3600" }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405)
  const params = new URL(req.url).searchParams
  const env = process.env as Record<string, string | undefined>

  const upc = (params.get("upc") || "").replace(/\D/g, "")
  if (upc) {
    try {
      return json({ product: await lookupUpcFallback(upc, env) }, 200, CACHE)
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "Lookup failed." }, 502)
    }
  }

  const q = (params.get("q") || "").trim().slice(0, 100)
  const result = await searchFoods(q, env)
  if ("error" in result) return json({ error: result.error }, result.status)
  return json({ hits: result.hits }, 200, CACHE)
}
