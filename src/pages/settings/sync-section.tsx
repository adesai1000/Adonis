import { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import {
  Check,
  Cloud,
  CloudDownload,
  CloudUpload,
  Loader2,
  Shuffle,
} from "lucide-react"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { useSync } from "@/store/sync"

function genCode(): string {
  const part = () => Math.random().toString(36).slice(2, 6)
  return `${part()}-${part()}`
}

export function SyncSection() {
  const { code, setCode, auto, setAuto, last, pushNow, pullNow } = useSync()
  const [draft, setDraft] = useState(code)
  const [busy, setBusy] = useState<null | "push" | "pull">(null)

  const connected = code.trim().length >= 4
  const draftChanged = draft.trim() !== code.trim()

  function connect() {
    const c = draft.trim()
    if (c.length < 4) {
      toast.error("Use a sync code of at least 4 characters")
      return
    }
    setCode(c)
    toast.success("Sync code set")
  }

  async function doPush() {
    setBusy("push")
    try {
      await pushNow()
      toast.success("Pushed to cloud")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Push failed")
    } finally {
      setBusy(null)
    }
  }

  async function doPull() {
    setBusy("pull")
    try {
      const applied = await pullNow()
      toast.success(
        applied ? "Pulled latest from cloud" : "Nothing stored under this code yet"
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Pull failed")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="size-5 text-primary" />
          Sync
        </CardTitle>
        <CardDescription>
          Set the same sync code on your phone and computer to share data between
          them. Anyone with the code can read and write it, so pick something only
          you would use.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Sync code */}
        <div className="space-y-2">
          <Label htmlFor="sync-code">Sync code</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="sync-code"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. blue-otter-42"
              className="h-11"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 gap-2"
                onClick={() => setDraft(genCode())}
              >
                <Shuffle className="size-4" />
                Generate
              </Button>
              <Button
                type="button"
                className="h-11 flex-1 gap-2"
                onClick={connect}
                disabled={!draftChanged && connected}
              >
                <Check className="size-4" />
                Use code
              </Button>
            </div>
          </div>
          {connected && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              Connected as
              <Badge variant="secondary" className="font-mono">
                {code}
              </Badge>
              {last && <span>· last synced {formatDistanceToNow(new Date(last), { addSuffix: true })}</span>}
            </p>
          )}
        </div>

        <Separator />

        {/* Auto-sync */}
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <Label htmlFor="auto-sync">Auto-sync</Label>
            <p className="text-xs text-muted-foreground">
              Pull on open and push changes automatically.
            </p>
          </div>
          <Switch
            id="auto-sync"
            checked={auto}
            onCheckedChange={setAuto}
            disabled={!connected}
            aria-label="Toggle auto-sync"
          />
        </div>

        {/* Manual push / pull */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            variant="outline"
            className="h-11 gap-2"
            onClick={doPush}
            disabled={!connected || busy !== null}
          >
            {busy === "push" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CloudUpload className="size-4" />
            )}
            Push to cloud
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="h-11 gap-2"
                disabled={!connected || busy !== null}
              >
                {busy === "pull" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CloudDownload className="size-4" />
                )}
                Pull from cloud
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Replace local data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This overwrites everything on this device with the copy stored
                  under code{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {code}
                  </span>
                  .
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={doPull}>
                  Pull and overwrite
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {!connected && (
          <p className="text-xs text-muted-foreground">
            Set a sync code above to enable pushing and pulling.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
