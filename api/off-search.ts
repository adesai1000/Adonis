// Vercel Edge Function — Open Food Facts text search proxy.
// GET /api/off-search?q=<text>  →  { hits: OffSearchHit[] }
//
// The browser can't call search.openfoodfacts.org directly (its CORS policy
// only covers Open Food Facts' own sites), so this hop adds the identifying
// User-Agent the project asks for and lets the CDN cache popular queries.
import { MIN_QUERY_LENGTH, searchOpenFoodFacts } from "./_lib/off-search"

export const config = { runtime: "edge" }

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405)

  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 100)
  if (q.length < MIN_QUERY_LENGTH) {
    return json({ error: `Type at least ${MIN_QUERY_LENGTH} characters.` }, 400)
  }

  try {
    const hits = await searchOpenFoodFacts(q)
    return json(
      { hits },
      200,
      // Same query from any device within 10 minutes is served from the edge.
      { "cache-control": "public, s-maxage=600, stale-while-revalidate=3600" }
    )
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Search failed." },
      502
    )
  }
}
