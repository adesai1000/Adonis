// USDA FoodData Central — https://fdc.nal.usda.gov/api-guide
// Free key (https://api.nal.usda.gov/signup), 1,000 requests/hour. The
// shared DEMO_KEY works without signup at 30 requests/hour per address.
//
// Covers what Open Food Facts is weakest at: generic whole foods with lab
// nutrition (SR Legacy / Foundation) plus a large US branded database that is
// searchable by UPC.
import type { FoodMacros, FoodProduct, FoodSearchHit } from "./food-types"

const API = "https://api.nal.usda.gov/fdc/v1/foods/search"

// Nutrient ids in FDC search payloads (values are per 100 g).
const KCAL = 1008
const KCAL_ATWATER_GENERAL = 2047
const KCAL_ATWATER_SPECIFIC = 2048
const KJ = 1062
const PROTEIN = 1003
const CARBS = 1005
const FAT = 1004
const SODIUM_MG = 1093

interface FdcNutrient {
  nutrientId?: number
  value?: number
  unitName?: string
}

interface FdcFood {
  fdcId?: number
  description?: string
  dataType?: string
  brandOwner?: string
  brandName?: string
  gtinUpc?: string
  packageWeight?: string
  servingSize?: number
  servingSizeUnit?: string
  householdServingFullText?: string
  foodNutrients?: FdcNutrient[]
}

export function usdaKey(env: Record<string, string | undefined>): string {
  return (env.USDA_FDC_API_KEY || "").trim() || "DEMO_KEY"
}

function pick(nutrients: FdcNutrient[], id: number): number | undefined {
  const n = nutrients.find((x) => x.nutrientId === id)
  return n && typeof n.value === "number" && Number.isFinite(n.value)
    ? n.value
    : undefined
}

function macros(food: FdcFood): FoodMacros | null {
  const ns = food.foodNutrients ?? []
  let kcal =
    pick(ns, KCAL) ?? pick(ns, KCAL_ATWATER_GENERAL) ?? pick(ns, KCAL_ATWATER_SPECIFIC)
  if (kcal == null) {
    const kj = pick(ns, KJ)
    if (kj != null) kcal = kj / 4.184
  }
  const protein = pick(ns, PROTEIN)
  const carbs = pick(ns, CARBS)
  const fat = pick(ns, FAT)
  const sodium = pick(ns, SODIUM_MG)
  if (kcal == null && protein == null && carbs == null && fat == null) return null
  const r = (v: number) => Math.round(v * 10) / 10
  return {
    calories: r(kcal ?? 0),
    protein: r(protein ?? 0),
    carbs: r(carbs ?? 0),
    fat: r(fat ?? 0),
    sodium: Math.round(sodium ?? 0),
  }
}

function scale(m: FoodMacros, factor: number): FoodMacros {
  const r = (v: number) => Math.round(v * factor * 10) / 10
  return {
    calories: r(m.calories),
    protein: r(m.protein),
    carbs: r(m.carbs),
    fat: r(m.fat),
    sodium: Math.round(m.sodium * factor),
  }
}

/** "COOKIE DOUGH PROTEIN BAR, COOKIE DOUGH" → "Cookie Dough Protein Bar, Cookie Dough". */
function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s
  return s
    .toLowerCase()
    .replace(/(^|[\s(\-/,])([a-z])/g, (_, pre: string, ch: string) => pre + ch.toUpperCase())
}

function isGeneric(food: FdcFood): boolean {
  return food.dataType !== "Branded"
}

function toProduct(food: FdcFood): FoodProduct | null {
  const per100g = macros(food)
  if (!per100g || !food.fdcId) return null
  const generic = isGeneric(food)
  const rawName = (food.description || "").trim()
  const name = generic ? rawName : titleCase(rawName)
  const brand = generic
    ? undefined
    : (food.brandName || food.brandOwner || "").trim() || undefined

  const unit = (food.servingSizeUnit || "").toLowerCase()
  const servingGrams =
    food.servingSize && food.servingSize > 0 && (unit === "g" || unit === "ml" || unit === "grm" || unit === "mlt")
      ? food.servingSize
      : undefined
  const household = titleCase((food.householdServingFullText || "").trim())
  const servingSize = servingGrams
    ? household
      ? `${household} (${servingGrams} ${unit.startsWith("m") ? "ml" : "g"})`
      : `${servingGrams} ${unit.startsWith("m") ? "ml" : "g"}`
    : undefined

  const barcode = (food.gtinUpc || "").replace(/\D/g, "") || undefined

  return {
    source: "usda",
    sourceId: `fdc:${food.fdcId}`,
    barcode,
    name,
    brand: brand ? titleCase(brand) : undefined,
    packageQuantity: food.packageWeight?.trim() || undefined,
    servingSize,
    servingGrams,
    per100g,
    perServing: servingGrams ? scale(per100g, servingGrams / 100) : null,
  }
}

async function query(params: Record<string, string>, key: string): Promise<FdcFood[]> {
  const url = new URL(API)
  url.searchParams.set("api_key", key)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } })
  if (res.status === 429) throw new Error("USDA rate limit reached — try again in a minute.")
  if (!res.ok) throw new Error(`USDA returned ${res.status}`)
  const data = (await res.json()) as { foods?: FdcFood[] }
  return data.foods ?? []
}

/** Text search across generic reference foods and US branded products. */
export async function usdaSearch(text: string, key: string, pageSize = 20): Promise<FoodSearchHit[]> {
  const foods = await query(
    { query: text, pageSize: String(pageSize), dataType: "Foundation,SR Legacy,Branded" },
    key
  )
  const hits: FoodSearchHit[] = []
  for (const f of foods) {
    const product = toProduct(f)
    if (!product) continue
    hits.push({
      source: "usda",
      sourceId: product.sourceId,
      barcode: product.barcode,
      name: product.name,
      brand: product.brand,
      quantity: product.packageQuantity ?? product.servingSize,
      kcalPer100g: product.per100g ? Math.round(product.per100g.calories) : undefined,
      kind: isGeneric(f) ? "generic" : "packaged",
      product,
    })
  }
  return hits
}

/** Branded-food lookup by UPC/EAN, for barcodes Open Food Facts doesn't know. */
export async function usdaByUpc(code: string, key: string): Promise<FoodProduct | null> {
  const digits = code.replace(/\D/g, "")
  if (!digits) return null
  // FDC stores UPC-A without the EAN-13 leading zero; try both spellings.
  const variants = [...new Set([digits.replace(/^0+/, ""), digits])].filter(Boolean)
  for (const v of variants) {
    const foods = await query({ query: `gtinUpc:${v}`, pageSize: "3", dataType: "Branded" }, key)
    const match = foods.find((f) => (f.gtinUpc || "").replace(/\D/g, "").replace(/^0+/, "") === v.replace(/^0+/, ""))
    const product = match ? toProduct(match) : null
    if (product) return { ...product, barcode: digits }
  }
  return null
}
