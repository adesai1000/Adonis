// Open Food Facts text search, proxied server-side because the search
// service (search.openfoodfacts.org) only allows CORS for its own origins.
// Shared by the Vercel function (api/off-search.ts) and the Vite dev
// middleware so both environments behave the same.

const SEARCH_URL = "https://search.openfoodfacts.org/search"
/** Open Food Facts asks for an identifying User-Agent on API traffic. */
const USER_AGENT = "Adonis fitness tracker (https://github.com/adesai1000/Adonis)"
const FIELDS = [
  "code",
  "product_name",
  "product_name_en",
  "brands",
  "quantity",
  "nutriments",
].join(",")

import type { FoodMacros, FoodSearchHit } from "./food-types"
import { plausiblePer100g, tidyName } from "./food-text"

export const MIN_QUERY_LENGTH = 2
export const MAX_RESULTS = 25

interface RawHit {
  code?: string
  product_name?: string
  product_name_en?: string
  brands?: string[] | string
  quantity?: string
  nutriments?: Record<string, number | string | undefined>
}

function num(v: number | string | undefined): number | undefined {
  if (v == null || v === "") return undefined
  const n = typeof v === "number" ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : undefined
}

function firstBrand(brands: string[] | string | undefined, name: string): string | undefined {
  const list = (Array.isArray(brands) ? brands : (brands || "").split(","))
    .map((b) => b.trim())
    .filter(Boolean)
  if (list.length === 0) return undefined
  const lower = name.toLowerCase()
  return (
    list.find((b) => lower.includes(b.toLowerCase())) ??
    list.reduce((a, b) => (b.length < a.length ? b : a))
  )
}

export async function searchOpenFoodFacts(
  query: string,
  pageSize = MAX_RESULTS
): Promise<FoodSearchHit[]> {
  const url = new URL(SEARCH_URL)
  url.searchParams.set("q", query)
  url.searchParams.set("page_size", String(pageSize))
  // Relevance ranking; sorting by popularity buries the actual matches.
  url.searchParams.set("fields", FIELDS)

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  })
  if (!res.ok) throw new Error(`Open Food Facts search returned ${res.status}`)
  const data = (await res.json()) as { hits?: RawHit[] }

  const seen = new Set<string>()
  const hits: FoodSearchHit[] = []
  for (const h of data.hits ?? []) {
    const code = (h.code || "").replace(/\D/g, "")
    const name = (h.product_name_en || h.product_name || "").trim()
    if (!code || !name || seen.has(code)) continue
    const n = h.nutriments ?? {}
    // Only useful if there's something to log, and only if it's believable.
    const kcal = num(n["energy-kcal_100g"])
    const macros: FoodMacros = {
      calories: kcal ?? 0,
      protein: num(n["proteins_100g"]) ?? 0,
      carbs: num(n["carbohydrates_100g"]) ?? 0,
      fat: num(n["fat_100g"]) ?? 0,
      sodium: (num(n["sodium_100g"]) ?? 0) * 1000,
    }
    const hasMacros =
      kcal != null ||
      num(n["proteins_100g"]) != null ||
      num(n["carbohydrates_100g"]) != null ||
      num(n["fat_100g"]) != null
    if (!hasMacros || !plausiblePer100g(macros)) continue
    seen.add(code)
    const brand = firstBrand(h.brands, name)
    hits.push({
      source: "off",
      sourceId: code,
      barcode: code,
      name: tidyName(name),
      brand: brand ? tidyName(brand) : undefined,
      quantity: h.quantity?.trim() || undefined,
      kcalPer100g: kcal != null ? Math.round(kcal) : undefined,
      kind: "packaged",
    })
  }
  return hits
}
