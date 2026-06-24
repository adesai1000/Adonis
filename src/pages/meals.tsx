import { useMemo, useState } from "react"
import { Pencil, Plus, Search, Trash2, UtensilsCrossed } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState, FieldError } from "@/components/common/bits"
import { useDraft } from "@/lib/storage"
import { fmt } from "@/lib/calc"
import { useStore } from "@/store/store"
import type { Meal } from "@/lib/types"

// ───────────────────────────── Form types ─────────────────────────────
interface MealForm {
  name: string
  serving: string
  calories: string
  protein: string
  carbs: string
  fat: string
}

const emptyForm: MealForm = {
  name: "",
  serving: "",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
}

interface FormErrors {
  name?: string
  calories?: string
  protein?: string
  carbs?: string
  fat?: string
}

type EditorState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "edit"; meal: Meal }

const MACRO_FIELDS = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
] as const

// ───────────────────────────── Page ─────────────────────────────
export default function Page() {
  const { meals, addMeal, updateMeal, deleteMeal } = useStore()

  const [query, setQuery] = useState("")
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" })
  const [pendingDelete, setPendingDelete] = useState<Meal | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? meals.filter((m) => m.name.toLowerCase().includes(q))
      : meals.slice()
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [meals, query])

  function handleDelete() {
    if (!pendingDelete) return
    deleteMeal(pendingDelete.id)
    toast.success("Meal deleted")
    setPendingDelete(null)
  }

  return (
    <div className="space-y-6">

      {/* Search + add */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search meals"
            className="h-11 pl-9"
            aria-label="Search meals"
          />
        </div>
        <Button
          className="h-11 shrink-0"
          onClick={() => setEditor({ mode: "add" })}
        >
          <Plus className="size-4" />
          Add meal
        </Button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed className="size-8" />}
          title={query.trim() ? "No matching meals" : "No meals yet"}
          hint={
            query.trim()
              ? "Try a different search term."
              : "Add a meal to build your library."
          }
        />
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((meal) => (
              <MealCard
                key={meal.id}
                meal={meal}
                onEdit={() => setEditor({ mode: "edit", meal })}
                onDelete={() => setPendingDelete(meal)}
              />
            ))}
          </div>

          {/* Desktop: table */}
          <Card className="hidden overflow-hidden py-0 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Meal</TableHead>
                  <TableHead className="text-right">Calories</TableHead>
                  <TableHead className="text-right">Protein</TableHead>
                  <TableHead className="text-right">Carbs</TableHead>
                  <TableHead className="text-right">Fat</TableHead>
                  <TableHead className="px-4 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((meal) => (
                  <TableRow key={meal.id}>
                    <TableCell className="px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{meal.name}</span>
                        {meal.builtIn && (
                          <Badge variant="secondary" className="font-normal">
                            default
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {meal.serving || "-"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt(meal.calories)} kcal
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt(meal.protein)} g
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt(meal.carbs)} g
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt(meal.fat)} g
                    </TableCell>
                    <TableCell className="px-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${meal.name}`}
                          onClick={() => setEditor({ mode: "edit", meal })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${meal.name}`}
                          onClick={() => setPendingDelete(meal)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <MealEditor
        key={editor.mode === "edit" ? `edit-${editor.meal.id}` : "add"}
        editor={editor}
        onClose={() => setEditor({ mode: "closed" })}
        addMeal={addMeal}
        updateMeal={updateMeal}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete meal?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `"${pendingDelete.name}" will be removed from your library. Past food log entries are not affected.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ───────────────────────────── Meal card (mobile) ─────────────────────────────
function MealCard({
  meal,
  onEdit,
  onDelete,
}: {
  meal: Meal
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{meal.name}</span>
            {meal.builtIn && (
              <Badge variant="secondary" className="shrink-0 font-normal">
                default
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {meal.serving || "-"}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${meal.name}`}
            onClick={onEdit}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${meal.name}`}
            onClick={onDelete}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <MacroStat label="kcal" value={fmt(meal.calories)} />
        <MacroStat label="P" value={`${fmt(meal.protein)} g`} />
        <MacroStat label="C" value={`${fmt(meal.carbs)} g`} />
        <MacroStat label="F" value={`${fmt(meal.fat)} g`} />
      </div>
    </Card>
  )
}

function MacroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 py-1.5">
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[0.65rem] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
    </div>
  )
}

// ───────────────────────────── Editor dialog ─────────────────────────────
function MealEditor({
  editor,
  onClose,
  addMeal,
  updateMeal,
}: {
  editor: EditorState
  onClose: () => void
  addMeal: (data: Omit<Meal, "id">) => string
  updateMeal: (id: string, patch: Partial<Meal>) => void
}) {
  const open = editor.mode !== "closed"
  const isEdit = editor.mode === "edit"
  const editId = editor.mode === "edit" ? editor.meal.id : "new"

  // Draft survives tab switches / lock; keyed per meal so add vs each edit differ.
  const [form, setForm, resetForm] = useDraft<MealForm>(
    `wt_draft_meal_${editId}`,
    editor.mode === "edit"
      ? {
          name: editor.meal.name,
          serving: editor.meal.serving,
          calories: String(editor.meal.calories),
          protein: String(editor.meal.protein),
          carbs: String(editor.meal.carbs),
          fat: String(editor.meal.fat),
        }
      : emptyForm
  )

  const [errors, setErrors] = useState<FormErrors>({})

  function set<K extends keyof MealForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function validate(): { ok: boolean; errs: FormErrors; values: Omit<Meal, "id" | "builtIn"> } {
    const errs: FormErrors = {}
    const name = form.name.trim()
    if (!name) errs.name = "Name is required."

    const parseMacro = (raw: string, field: keyof FormErrors): number => {
      const trimmed = raw.trim()
      if (trimmed === "") return 0
      const n = Number(trimmed)
      if (!Number.isFinite(n)) {
        errs[field] = "Enter a number."
        return NaN
      }
      if (n < 0) {
        errs[field] = "Must be ≥ 0."
        return NaN
      }
      return n
    }

    const calories = parseMacro(form.calories, "calories")
    const protein = parseMacro(form.protein, "protein")
    const carbs = parseMacro(form.carbs, "carbs")
    const fat = parseMacro(form.fat, "fat")

    return {
      ok: Object.keys(errs).length === 0,
      errs,
      values: {
        name,
        serving: form.serving.trim(),
        calories,
        protein,
        carbs,
        fat,
      },
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const { ok, errs, values } = validate()
    setErrors(errs)
    if (!ok) return

    if (editor.mode === "edit") {
      updateMeal(editor.meal.id, values)
      toast.success("Meal updated")
    } else {
      addMeal({ ...values, builtIn: false })
      toast.success("Meal added")
    }
    resetForm()
    setErrors({})
    onClose()
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setErrors({})
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit meal" : "Add meal"}</DialogTitle>
          <DialogDescription>
            Per-serving macros. Values default to 0 when left blank.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="meal-name">Name</Label>
            <Input
              id="meal-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Grilled Chicken Breast"
              className="h-11"
              aria-invalid={!!errors.name}
              autoComplete="off"
            />
            <FieldError>{errors.name}</FieldError>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meal-serving">Serving</Label>
            <Input
              id="meal-serving"
              value={form.serving}
              onChange={(e) => set("serving", e.target.value)}
              placeholder="e.g. 150g, 1 cup"
              className="h-11"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {MACRO_FIELDS.map(({ key, label, unit }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`meal-${key}`}>
                  {label} ({unit})
                </Label>
                <Input
                  id={`meal-${key}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder="0"
                  className="h-11"
                  aria-invalid={!!errors[key]}
                />
                <FieldError>{errors[key]}</FieldError>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" className="h-11">
              {isEdit ? "Save changes" : "Add meal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
