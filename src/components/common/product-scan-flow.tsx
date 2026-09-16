import { Suspense, lazy, useState } from "react"
import { Loader2, PackageSearch, Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { fmtCompact } from "@/lib/calc"
import {
  defaultBasis,
  lookupProduct,
  lookupProductFallback,
  productDisplayName,
  productMacros,
  productToMeal,
  searchProducts,
  servingLabel,
  type ProductSearchHit,
  type ScannedProduct,
  type ServingBasis,
} from "@/lib/openfoodfacts"
import type { Meal } from "@/lib/types"

// The ZXing decoder is ~400 kB; only fetch it the first time a scan starts.
const BarcodeScanner = lazy(() =>
  import("@/components/common/barcode-scanner").then((m) => ({
    default: m.BarcodeScanner,
  }))
)

/** How the flow starts: camera scan or a text search. */
export type ProductLookupMode = "scan" | "search"

type Step =
  | { kind: "closed" }
  | { kind: "scan" }
  | { kind: "search" }
  | { kind: "lookup"; code: string }
  | { kind: "confirm"; product: ScannedProduct }

/**
 * Scan or search → Open Food Facts lookup → serving-basis confirmation. Emits
 * either a meal already in the library carrying that barcode, or fresh meal
 * data for the caller to add. Drive it with `mode`; it closes itself when done.
 */
export function ProductScanFlow({
  mode,
  onOpenChange,
  meals,
  onExisting,
  onNew,
  confirmLabel,
}: {
  mode: ProductLookupMode | null
  onOpenChange: (open: boolean) => void
  meals: Meal[]
  /** A meal with this barcode is already in the library. */
  onExisting: (meal: Meal) => void
  /** Product resolved; caller decides what to do with the meal data. */
  onNew: (meal: Omit<Meal, "id">, product: ScannedProduct) => void
  confirmLabel: string
}) {
  const [step, setStep] = useState<Step>({ kind: "closed" })
  const [basis, setBasis] = useState<ServingBasis>("serving")

  // `mode` from the parent starts the flow; internal steps take it from there.
  const effective: Step = mode
    ? step.kind === "closed"
      ? { kind: mode }
      : step
    : { kind: "closed" }

  function close() {
    setStep({ kind: "closed" })
    onOpenChange(false)
  }

  async function handleDetected(code: string) {
    const digits = code.replace(/\D/g, "")
    const existing = meals.find((m) => m.barcode && m.barcode === digits)
    if (existing) {
      close()
      onExisting(existing)
      return
    }
    setStep({ kind: "lookup", code: digits })
    try {
      let product = await lookupProduct(digits)
      if (product && !product.per100g && !product.perServing) product = null
      // Not in Open Food Facts (or no nutrition there): try USDA's branded database.
      if (!product) product = await lookupProductFallback(digits)
      if (!product) {
        toast.error("That barcode isn't in Open Food Facts or USDA yet.")
        close()
        return
      }
      showProduct(product)
    } catch {
      toast.error(
        navigator.onLine === false
          ? "You're offline — barcode lookup needs a connection."
          : "Couldn't reach Open Food Facts. Try again in a moment."
      )
      close()
    }
  }

  function showProduct(product: ScannedProduct) {
    setBasis(defaultBasis(product))
    setStep({ kind: "confirm", product })
  }

  function confirm() {
    if (effective.kind !== "confirm") return
    const meal = productToMeal(effective.product, basis)
    if (!meal) return
    const product = effective.product
    close()
    onNew(meal, product)
  }

  const product = effective.kind === "confirm" ? effective.product : null
  const macros = product ? productMacros(product, basis) : null

  return (
    <>
      {effective.kind === "scan" && (
        <Suspense fallback={null}>
          <BarcodeScanner
            open
            onOpenChange={(o) => {
              if (!o) close()
            }}
            onDetected={handleDetected}
          />
        </Suspense>
      )}

      <SearchDialog
        open={effective.kind === "search"}
        onClose={close}
        onPick={(hit) => {
          if (hit.product) {
            // USDA rows arrive with nutrition; skip the barcode round-trip.
            const existing = hit.barcode
              ? meals.find((m) => m.barcode && m.barcode === hit.barcode)
              : undefined
            if (existing) {
              close()
              onExisting(existing)
            } else {
              showProduct(hit.product)
            }
          } else if (hit.barcode) {
            handleDetected(hit.barcode)
          }
        }}
      />

      {/* Lookup spinner */}
      <Dialog
        open={effective.kind === "lookup"}
        onOpenChange={(o) => {
          if (!o) close()
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Looking up product
            </DialogTitle>
            <DialogDescription className="tabular-nums">
              Barcode {effective.kind === "lookup" ? effective.code : ""}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Confirm serving basis */}
      <Dialog
        open={effective.kind === "confirm"}
        onOpenChange={(o) => {
          if (!o) close()
        }}
      >
        <DialogContent>
          {product && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-start gap-2 text-left">
                  <PackageSearch className="mt-1 size-4 shrink-0" />
                  <span className="min-w-0 break-words">{productDisplayName(product)}</span>
                </DialogTitle>
                <DialogDescription>
                  {[
                    product.packageQuantity,
                    product.barcode ? `barcode ${product.barcode}` : null,
                    product.source === "usda" ? "USDA FoodData Central" : "Open Food Facts",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  One serving in your library equals
                </Label>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={basis}
                  onValueChange={(v) => {
                    if (v === "serving" || v === "100g") setBasis(v)
                  }}
                  className="grid w-full grid-cols-2"
                >
                  <ToggleGroupItem
                    value="serving"
                    className="h-11"
                    disabled={!product.perServing}
                  >
                    {product.perServing
                      ? `Serving · ${servingLabel(product, "serving")}`
                      : "Serving · unknown"}
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="100g"
                    className="h-11"
                    disabled={!product.per100g}
                  >
                    100 g
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {macros && (
                <div className="grid grid-cols-5 gap-1.5 text-center tabular-nums">
                  <Stat label="kcal" value={fmtCompact(macros.calories)} />
                  <Stat label="P" value={`${fmtCompact(macros.protein)} g`} />
                  <Stat label="C" value={`${fmtCompact(macros.carbs)} g`} />
                  <Stat label="F" value={`${fmtCompact(macros.fat)} g`} />
                  <Stat label="Na" value={`${fmtCompact(macros.sodium)} mg`} />
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" className="h-11" onClick={close}>
                  Cancel
                </Button>
                <Button type="button" className="h-11" onClick={confirm} disabled={!macros}>
                  {confirmLabel}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-muted px-1 py-2">
      <p className="truncate text-sm font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

// ───────────────────────────── Search picker ─────────────────────────────
type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "results"; hits: ProductSearchHit[]; query: string }
  | { kind: "error"; message: string }

function SearchDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (hit: ProductSearchHit) => void
}) {
  const [query, setQuery] = useState("")
  const [state, setState] = useState<SearchState>({ kind: "idle" })

  async function run() {
    const q = query.trim()
    if (q.length < 2) return
    setState({ kind: "loading" })
    try {
      const hits = await searchProducts(q)
      setState({ kind: "results", hits, query: q })
    } catch (e) {
      setState({
        kind: "error",
        message:
          navigator.onLine === false
            ? "You're offline — search needs a connection."
            : e instanceof Error
              ? e.message
              : "Search failed.",
      })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="flex max-h-[85dvh] flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="size-4" />
            Search foods
          </DialogTitle>
          <DialogDescription>
            Generic foods from USDA plus packaged products from Open Food Facts.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            autoFocus
            placeholder="e.g. Pure Protein bar"
            className="h-11"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                run()
              }
            }}
            enterKeyHint="search"
          />
          <Button
            type="button"
            className="h-11 shrink-0"
            onClick={run}
            disabled={query.trim().length < 2 || state.kind === "loading"}
          >
            {state.kind === "loading" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
            Search
          </Button>
        </div>

        <div className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2">
          {state.kind === "idle" && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Results show calories per 100 g. You'll pick the serving next.
            </p>
          )}
          {state.kind === "loading" && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Searching…
            </p>
          )}
          {state.kind === "error" && (
            <p className="py-6 text-center text-sm text-red">{state.message}</p>
          )}
          {state.kind === "results" && state.hits.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing with nutrition data for "{state.query}". Try a brand name,
              or scan the barcode.
            </p>
          )}
          {state.kind === "results" && state.hits.length > 0 && (
            <ul className="divide-y divide-line">
              {state.hits.map((hit) => (
                <li key={`${hit.source}:${hit.sourceId}`}>
                  <button
                    type="button"
                    onClick={() => onPick(hit)}
                    className="flex w-full items-center gap-3 rounded-[12px] px-2 py-2.5 text-left transition-colors hover:bg-accent/60 active:bg-accent"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{hit.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[
                          hit.kind === "generic" ? "USDA generic" : hit.brand,
                          hit.quantity,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "\u00a0"}
                      </p>
                    </div>
                    {hit.kcalPer100g != null && (
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {hit.kcalPer100g} kcal
                        <span className="text-ink-3"> / 100 g</span>
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
