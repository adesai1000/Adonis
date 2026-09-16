import type { Meal } from "./types"
import type {
  FoodMacros,
  FoodProduct,
  FoodSearchHit,
} from "../../api/_lib/food-types"

// ───────────────────────────── Open Food Facts ─────────────────────────────
// Free, community-maintained product database keyed by barcode (EAN/UPC).
// https://world.openfoodfacts.org/data — v2 read API, CORS-enabled.

const API = "https://world.openfoodfacts.org/api/v2/product"
const FIELDS = [
  "code",
  "product_name",
  "product_name_en",
  "brands",
  "quantity",
  "serving_size",
  "serving_quantity",
  "nutriments",
].join(",")

export type ProductMacros = FoodMacros
/** A resolved product from either source, ready for the serving dialog. */
export type ScannedProduct = FoodProduct

export type ServingBasis = "serving" | "100g"

interface OffNutriments {
  [key: string]: number | string | undefined
}

interface OffProduct {
  code?: string
  product_name?: string
  product_name_en?: string
  brands?: string
  quantity?: string
  serving_size?: string
  serving_quantity?: number | string
  nutriments?: OffNutriments
}

function num(v: number | string | undefined): number | null {
  if (v == null || v === "") return null
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."))
  return Number.isFinite(n) ? n : null
}

function macrosFor(n: OffNutriments, suffix: "_100g" | "_serving"): ProductMacros | null {
  let kcal = num(n[`energy-kcal${suffix}`])
  if (kcal == null) {
    const kj = num(n[`energy${suffix}`])
    if (kj != null) kcal = kj / 4.184
  }
  const protein = num(n[`proteins${suffix}`])
  const carbs = num(n[`carbohydrates${suffix}`])
  const fat = num(n[`fat${suffix}`])
  // sodium is stored in grams; salt is 2.5x sodium
  let sodiumG = num(n[`sodium${suffix}`])
  if (sodiumG == null) {
    const salt = num(n[`salt${suffix}`])
    if (salt != null) sodiumG = salt / 2.5
  }
  if (kcal == null && protein == null && carbs == null && fat == null) return null
  const r = (v: number) => Math.round(v * 10) / 10
  return {
    calories: r(kcal ?? 0),
    protein: r(protein ?? 0),
    carbs: r(carbs ?? 0),
    fat: r(fat ?? 0),
    sodium: Math.round((sodiumG ?? 0) * 1000),
  }
}

function scale(m: ProductMacros, factor: number): ProductMacros {
  const r = (v: number) => Math.round(v * factor * 10) / 10
  return {
    calories: r(m.calories),
    protein: r(m.protein),
    carbs: r(m.carbs),
    fat: r(m.fat),
    sodium: Math.round(m.sodium * factor),
  }
}

/**
 * Look a barcode up. Resolves to null when the product isn't in the database;
 * throws on network failure so the caller can tell "unknown" from "offline".
 */
export async function lookupProduct(barcode: string): Promise<ScannedProduct | null> {
  const code = barcode.replace(/\D/g, "")
  if (!code) return null
  const res = await fetch(`${API}/${encodeURIComponent(code)}.json?fields=${FIELDS}`, {
    headers: { Accept: "application/json" },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Open Food Facts returned ${res.status}`)
  const json = (await res.json()) as { status?: number; product?: OffProduct }
  if (!json.product || json.status === 0) return null

  const p = json.product
  const n = p.nutriments ?? {}
  const per100g = macrosFor(n, "_100g")
  const servingGrams = num(p.serving_quantity) ?? undefined
  let perServing = macrosFor(n, "_serving")
  if (!perServing && per100g && servingGrams && servingGrams > 0) {
    perServing = scale(per100g, servingGrams / 100)
  }
  const name = (p.product_name_en || p.product_name || "").trim()
  const brand = pickBrand(p.brands, name)

  return {
    source: "off",
    sourceId: p.code || code,
    barcode: p.code || code,
    name: name || `Product ${code}`,
    brand,
    packageQuantity: p.quantity?.trim() || undefined,
    servingSize: p.serving_size?.trim() || undefined,
    servingGrams,
    per100g,
    perServing,
  }
}

/**
 * "brands" is a comma list that often leads with the parent company
 * ("COCA-COLA SERVICES SA/NV,Coca-Cola"). Prefer the entry the product name
 * already uses, otherwise the shortest one, which is usually the consumer brand.
 */
function pickBrand(brands: string | undefined, name: string): string | undefined {
  const list = (brands || "")
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean)
  if (list.length === 0) return undefined
  const lower = name.toLowerCase()
  const inName = list.find((b) => lower.includes(b.toLowerCase()))
  if (inName) return inName
  return list.reduce((a, b) => (b.length < a.length ? b : a))
}

/** Display name: brand first unless the product name already carries it. */
export function productDisplayName(p: ScannedProduct): string {
  if (!p.brand) return p.name
  return p.name.toLowerCase().includes(p.brand.toLowerCase())
    ? p.name
    : `${p.brand} ${p.name}`
}

/** The basis to default to: per serving when the database knows one. */
export function defaultBasis(p: ScannedProduct): ServingBasis {
  return p.perServing ? "serving" : "100g"
}

export function servingLabel(p: ScannedProduct, basis: ServingBasis): string {
  if (basis === "100g") return "100 g"
  if (p.servingSize) return p.servingSize
  if (p.servingGrams) return `${p.servingGrams} g`
  return "1 serving"
}

/** Macros for a basis, or null when the database has nothing usable. */
export function productMacros(p: ScannedProduct, basis: ServingBasis): ProductMacros | null {
  return basis === "serving" ? p.perServing : p.per100g
}

/** Turn a scanned product into a meal-library entry. */
export function productToMeal(
  p: ScannedProduct,
  basis: ServingBasis
): Omit<Meal, "id"> | null {
  const m = productMacros(p, basis)
  if (!m) return null
  return {
    name: productDisplayName(p),
    serving: servingLabel(p, basis),
    calories: m.calories,
    protein: m.protein,
    carbs: m.carbs,
    fat: m.fat,
    sodium: m.sodium,
    barcode: p.barcode || undefined,
    builtIn: false,
  }
}

// ───────────────────────────── Text search ─────────────────────────────
/**
 * One row of the search picker. OFF rows resolve via lookupProduct(barcode);
 * USDA rows carry `product` already.
 */
export type ProductSearchHit = FoodSearchHit

/** Search both sources by name via our proxy. */
export async function searchProducts(query: string): Promise<ProductSearchHit[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const res = await fetch(`/api/food-search?q=${encodeURIComponent(q)}`, {
    headers: { Accept: "application/json" },
  })
  if (!res.ok) {
    let msg = `Search failed (${res.status}).`
    try {
      const j = (await res.json()) as { error?: string }
      if (j.error) msg = j.error
    } catch {
      /* keep default */
    }
    throw new Error(msg)
  }
  const json = (await res.json()) as { hits?: ProductSearchHit[] }
  return json.hits ?? []
}

/** Barcode fallback (USDA branded database) for codes Open Food Facts lacks. */
export async function lookupProductFallback(barcode: string): Promise<ScannedProduct | null> {
  const code = barcode.replace(/\D/g, "")
  if (!code) return null
  const res = await fetch(`/api/food-search?upc=${encodeURIComponent(code)}`, {
    headers: { Accept: "application/json" },
  })
  if (!res.ok) return null
  const json = (await res.json()) as { product?: ScannedProduct | null }
  return json.product ?? null
}
