import { useRef, useState } from "react"
import { format } from "date-fns"
import { Database, Download, Sparkles, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { formatBytes } from "@/lib/storage"
import { useStore } from "@/store/store"
import type { BackupData } from "@/lib/types"

function summarize(data: Partial<BackupData>): string {
  const parts: string[] = []
  const push = (n: number | undefined, label: string) => {
    if (n != null) parts.push(`${n} ${label}`)
  }
  push(data.foodLog?.length, "food entries")
  push(data.workoutLog?.length, "workouts")
  push(data.cardioLog?.length, "cardio entries")
  push(data.weightLog?.length, "weight entries")
  push(data.meals?.length, "meals")
  push(data.exercises?.length, "exercises")
  push(data.routines?.length, "routines")
  return parts.length ? parts.join(", ") : "no records"
}

export function DataManagementSection() {
  const { exportAll, importAll, clearAll, loadDemoData, storageBytes } =
    useStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [pending, setPending] = useState<Partial<BackupData> | null>(null)
  const [importError, setImportError] = useState("")
  const [clearText, setClearText] = useState("")

  const usage = formatBytes(storageBytes())

  function handleExport() {
    try {
      const data = exportAll()
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `fitness_backup_${format(new Date(), "yyyy-MM-dd")}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success("Backup exported")
    } catch {
      toast.error("Export failed")
    }
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // reset so selecting the same file again re-triggers onChange
    e.target.value = ""
    if (!file) return
    setImportError("")
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<BackupData>
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("bad shape")
        }
        setPending(parsed)
      } catch {
        setImportError("Could not read that file. Expected a JSON backup.")
        toast.error("Invalid backup file")
      }
    }
    reader.onerror = () => {
      setImportError("Could not read that file.")
      toast.error("Could not read file")
    }
    reader.readAsText(file)
  }

  function confirmImport() {
    if (!pending) return
    importAll(pending)
    setPending(null)
    toast.success("Data imported")
  }

  function confirmClear() {
    clearAll()
    setClearText("")
    toast.success("All data cleared")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Database className="size-4" />
            Storage used
          </span>
          <span className="text-sm font-medium tabular-nums">{usage}</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            variant="outline"
            className="h-11 gap-2"
            onClick={handleExport}
          >
            <Download className="size-4" />
            Export all
          </Button>

          <Button
            variant="outline"
            className="h-11 gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-4" />
            Import
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFile}
          />
        </div>
        {importError && (
          <p className="text-xs font-medium text-destructive">{importError}</p>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="h-11 w-full gap-2">
              <Sparkles className="size-4" />
              Load 2 months of sample data
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Load sample data?</AlertDialogTitle>
              <AlertDialogDescription>
                This replaces your food, workout, cardio and weight logs with two
                months of realistic sample data (US units) and adds a few sample
                routines. Your meals and exercise library are kept.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  loadDemoData()
                  toast.success("Sample data loaded")
                }}
              >
                Load sample data
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Separator />

        {/* Clear all data - typed confirmation */}
        <div className="space-y-2">
          <Label className="text-muted-foreground">Danger zone</Label>
          <ClearTrigger
            clearText={clearText}
            setClearText={setClearText}
            onConfirm={confirmClear}
          />
        </div>
      </CardContent>

      {/* Import confirmation */}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(o) => {
          if (!o) setPending(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces your current data with the file contents:{" "}
              {pending ? summarize(pending) : ""}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmImport}>
              Import and overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function ClearTrigger({
  clearText,
  setClearText,
  onConfirm,
}: {
  clearText: string
  setClearText: (v: string) => void
  onConfirm: () => void
}) {
  const armed = clearText.trim() === "DELETE"
  return (
    <AlertDialog
      onOpenChange={(o) => {
        if (!o) setClearText("")
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="h-11 w-full gap-2">
          <Trash2 className="size-4" />
          Clear all data
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear all data?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes every log, meal, custom exercise, routine
            and setting, restoring the app to its initial state. Type{" "}
            <span className="font-semibold text-foreground">DELETE</span> to
            confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          className="h-11"
          autoCapitalize="characters"
          placeholder="DELETE"
          value={clearText}
          onChange={(e) => setClearText(e.target.value)}
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!armed}
            onClick={onConfirm}
          >
            Clear everything
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
