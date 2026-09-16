import { Suspense, lazy, useState } from "react"
import { Loader2, PackageSearch } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { fmtCompact } from "@/lib/calc"
import {
  defaultBasis,
  lookupProduct,
  productDisplayName,
  productMacros,
  productToMeal,
  servingLabel,
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

type Step =
  | { kind: "closed" }
  | { kind: "scan" }
  | { kind: "lookup"; code: string }
  | { kind: "confirm"; product: ScannedProduct }

/**
 * Scan → Open Food Facts lookup → serving-basis confirmation. Emits either a
 * meal already in the library carrying that barcode, or fresh meal data for
 * the caller to add. Drive it with `open`; it closes itself when done.
 */
export function ProductScanFlow({
  open,
  onOpenChange,
  meals,
  onExisting,
  onNew,
  confirmLabel,
}: {
  open: boolean
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

  // `open` from the parent starts the flow; internal steps take it from there.
  const effective: Step = open ? (step.kind === "closed" ? { kind: "scan" } : step) : { kind: "closed" }

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
      const product = await lookupProduct(digits)
      if (!product) {
        toast.error("That barcode isn't in Open Food Facts yet.")
        close()
        return
      }
      if (!product.per100g && !product.perServing) {
        toast.error(`${productDisplayName(product)} has no nutrition data on file.`)
        close()
        return
      }
      setBasis(defaultBasis(product))
      setStep({ kind: "confirm", product })
    } catch {
      toast.error(
        navigator.onLine === false
          ? "You're offline — barcode lookup needs a connection."
          : "Couldn't reach Open Food Facts. Try again in a moment."
      )
      close()
    }
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
                <DialogTitle className="flex items-center gap-2">
                  <PackageSearch className="size-4" />
                  {productDisplayName(product)}
                </DialogTitle>
                <DialogDescription>
                  {[product.packageQuantity, `barcode ${product.barcode}`]
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
                      ? `Serving (${servingLabel(product, "serving")})`
                      : "Serving (unknown)"}
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
