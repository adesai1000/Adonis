// Shapes shared by the food-search function and the browser client.
// Kept dependency-free so both the edge runtime and Vite can import it.

export type FoodSource = "off" | "usda"

export interface FoodMacros {
  calories: number
  protein: number
  carbs: number
  fat: number
  /** mg */
  sodium: number
}

/** A resolved product, ready for the serving-basis dialog. */
export interface FoodProduct {
  source: FoodSource
  /** Stable id within the source: the barcode for OFF, "fdc:<id>" for USDA. */
  sourceId: string
  /** EAN/UPC digits when the product has one. */
  barcode?: string
  name: string
  brand?: string
  /** Package size as printed, e.g. "500 g". */
  packageQuantity?: string
  /** Serving as printed, e.g. "1 bar (50 g)". */
  servingSize?: string
  /** Serving weight in grams (or ml), when known. */
  servingGrams?: number
  per100g: FoodMacros | null
  perServing: FoodMacros | null
}

/** One row of the search picker. */
export interface FoodSearchHit {
  source: FoodSource
  sourceId: string
  barcode?: string
  name: string
  brand?: string
  quantity?: string
  kcalPer100g?: number
  /** "Generic" for USDA reference foods (no brand, lab nutrition). */
  kind: "packaged" | "generic"
  /**
   * Present when the search payload already carried full nutrition (USDA),
   * so picking the row needs no second request.
   */
  product?: FoodProduct
}
