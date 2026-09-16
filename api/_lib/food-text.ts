// Small, dependency-free helpers shared by the server food sources and the
// browser client: consistent product naming and a sanity check on nutrition.
import type { FoodMacros } from "./food-types"

/** Per-100 g ceilings. Pure fat is 900 kcal; nothing edible beats these. */
const MAX_KCAL_100G = 950
const MAX_GRAMS_100G = 100
const MAX_SODIUM_MG_100G = 40000

/**
 * Community databases contain entries where someone typed the whole package
 * into the per-100 g fields ("63000 kcal / 100 g"). Reject anything that
 * can't physically be a 100 g portion.
 */
export function plausiblePer100g(m: FoodMacros | null | undefined): boolean {
  if (!m) return false
  if (m.calories < 0 || m.calories > MAX_KCAL_100G) return false
  if (m.protein < 0 || m.protein > MAX_GRAMS_100G) return false
  if (m.carbs < 0 || m.carbs > MAX_GRAMS_100G) return false
  if (m.fat < 0 || m.fat > MAX_GRAMS_100G) return false
  if (m.sodium < 0 || m.sodium > MAX_SODIUM_MG_100G) return false
  if (m.protein + m.carbs + m.fat > 105) return false
  return true
}

/** A serving can't carry more than 9 kcal per gram either. */
export function plausiblePerServing(
  m: FoodMacros | null | undefined,
  servingGrams: number | undefined
): boolean {
  if (!m) return false
  if (m.calories < 0 || m.protein < 0 || m.carbs < 0 || m.fat < 0 || m.sodium < 0) return false
  if (servingGrams && servingGrams > 0) {
    if (m.calories > servingGrams * 9.5) return false
    if (m.protein + m.carbs + m.fat > servingGrams * 1.05) return false
  } else if (m.calories > 5000) {
    return false
  }
  return true
}

const SMALL_WORDS = new Set(["a", "an", "and", "at", "by", "de", "for", "in", "of", "on", "or", "the", "to", "w/", "with"])

/**
 * "BUDDHA BOWL" → "Buddha Bowl", "steak bowl" → "Steak bowl", "Pure Protein Bar"
 * unchanged. Shouty names get title case (small words stay lower); otherwise
 * only the first letter is fixed so deliberate casing like "iPhone" survives.
 */
export function tidyName(raw: string | undefined | null): string {
  const s = (raw || "").replace(/\s+/g, " ").trim()
  if (!s) return ""
  const letters = s.replace(/[^A-Za-z]/g, "")
  const shouty = letters.length >= 3 && letters === letters.toUpperCase()
  if (!shouty) return s.charAt(0).toUpperCase() + s.slice(1)
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => {
      if (i > 0 && SMALL_WORDS.has(w)) return w
      // keep things like "100g" or "2x" as-is; capitalise after ( - / ,
      return w.replace(/(^|[(\-/,])([a-z])/g, (_, pre: string, ch: string) => pre + ch.toUpperCase())
    })
    .join(" ")
}
