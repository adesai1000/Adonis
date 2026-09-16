// Merges the two food sources into one picker list. Shared by the Vercel
// function (api/food-search.ts) and the Vite dev middleware.
import type { FoodProduct, FoodSearchHit } from "./food-types"
import { MIN_QUERY_LENGTH, searchOpenFoodFacts } from "./off-search"
import { usdaByUpc, usdaKey, usdaSearch } from "./usda"

/** How many USDA generic foods lead the list before packaged results. */
const GENERIC_LEAD = 5
const MAX_HITS = 30

export type SearchOutcome =
  | { hits: FoodSearchHit[] }
  | { error: string; status: number }

export async function searchFoods(
  q: string,
  env: Record<string, string | undefined>
): Promise<SearchOutcome> {
  if (q.length < MIN_QUERY_LENGTH) {
    return { error: `Type at least ${MIN_QUERY_LENGTH} characters.`, status: 400 }
  }

  const [off, usda] = await Promise.allSettled([
    searchOpenFoodFacts(q),
    usdaSearch(q, usdaKey(env)),
  ])
  if (off.status === "rejected" && usda.status === "rejected") {
    return {
      error:
        off.reason instanceof Error ? off.reason.message : "Search failed.",
      status: 502,
    }
  }

  const offHits = off.status === "fulfilled" ? off.value : []
  const usdaHits = usda.status === "fulfilled" ? usda.value : []

  // Generic reference foods first (what OFF can't offer), then packaged
  // products from both sources with USDA duplicates of OFF barcodes dropped.
  const seenBarcodes = new Set(offHits.map((h) => h.barcode).filter(Boolean))
  const generic = usdaHits
    .filter((h) => h.kind === "generic" && mentionsEveryWord(h.name, q))
    .slice(0, GENERIC_LEAD)
  const usdaPackaged = usdaHits.filter(
    (h) => h.kind === "packaged" && !(h.barcode && seenBarcodes.has(h.barcode))
  )

  return { hits: [...generic, ...offHits, ...usdaPackaged].slice(0, MAX_HITS) }
}

export async function lookupUpcFallback(
  upc: string,
  env: Record<string, string | undefined>
): Promise<FoodProduct | null> {
  return usdaByUpc(upc, usdaKey(env))
}

/**
 * USDA's reference-food search is fuzzy enough to return "Prune puree" for
 * "pure protein bar". Keep a generic row only if every query word (by its
 * first four letters, so "eggs" still matches "Egg, whole") appears in it.
 */
function mentionsEveryWord(name: string, q: string): boolean {
  const hay = name.toLowerCase()
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 3)
  return words.every((w) => hay.includes(w.slice(0, 4)))
}
