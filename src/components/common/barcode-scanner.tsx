import { useEffect, useRef, useState } from "react"
import { Camera, ScanBarcode } from "lucide-react"
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser"
import { BarcodeFormat, DecodeHintType } from "@zxing/library"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.QR_CODE,
]

type CamState = "starting" | "live" | "denied" | "unavailable"

/**
 * Camera barcode scanner in a dialog. Fires `onDetected` once with the first
 * code read, then closes. Falls back to typing the digits when the camera is
 * unavailable or permission is refused.
 */
export function BarcodeScanner({
  open,
  onOpenChange,
  onDetected,
  title = "Scan a barcode",
  description = "Point the camera at the barcode on the packaging.",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDetected: (code: string) => void
  title?: string
  description?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [cam, setCam] = useState<CamState>("starting")
  const [manual, setManual] = useState("")
  const detectedRef = useRef(false)
  const onDetectedRef = useRef(onDetected)
  onDetectedRef.current = onDetected

  useEffect(() => {
    if (!open) return
    detectedRef.current = false
    setCam("starting")
    setManual("")

    const video = videoRef.current
    if (!video || !navigator.mediaDevices?.getUserMedia) {
      setCam("unavailable")
      return
    }

    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS)
    hints.set(DecodeHintType.TRY_HARDER, true)
    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 120,
    })

    let controls: IScannerControls | null = null
    let cancelled = false

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } }, audio: false },
        video,
        (result) => {
          if (!result || detectedRef.current || cancelled) return
          const text = result.getText().trim()
          if (!text) return
          detectedRef.current = true
          controls?.stop()
          onDetectedRef.current(text)
        }
      )
      .then((c) => {
        if (cancelled) {
          c.stop()
          return
        }
        controls = c
        setCam("live")
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const name = err instanceof Error ? err.name : ""
        setCam(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable")
      })

    return () => {
      cancelled = true
      controls?.stop()
      // Belt and braces: release the stream even if ZXing didn't get to.
      const stream = video.srcObject as MediaStream | null
      stream?.getTracks().forEach((t) => t.stop())
      video.srcObject = null
    }
  }, [open])

  function submitManual() {
    const code = manual.replace(/\D/g, "")
    if (!code || detectedRef.current) return
    detectedRef.current = true
    onDetectedRef.current(code)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanBarcode className="size-4" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[18px] bg-black sm:aspect-[4/3]">
          <video
            ref={videoRef}
            className="size-full object-cover"
            muted
            playsInline
            autoPlay
          />
          {cam === "live" && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-[12%] top-1/2 h-[38%] -translate-y-1/2 rounded-[14px] border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
            />
          )}
          {cam !== "live" && (
            <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-white/80">
              {cam === "starting" && (
                <span className="flex items-center gap-2">
                  <Camera className="size-4 animate-pulse" />
                  Starting camera…
                </span>
              )}
              {cam === "denied" && (
                <span>
                  Camera access was blocked. Allow it in your browser settings, or
                  type the barcode below.
                </span>
              )}
              {cam === "unavailable" && (
                <span>No camera available here. Type the barcode below instead.</span>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="barcode-manual" className="text-xs text-muted-foreground">
            Or type the barcode
          </Label>
          <div className="flex gap-2">
            <Input
              id="barcode-manual"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 5000159484695"
              className="h-11 tabular-nums"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  submitManual()
                }
              }}
            />
            <Button
              type="button"
              className="h-11 shrink-0"
              onClick={submitManual}
              disabled={manual.replace(/\D/g, "").length < 6}
            >
              Look up
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
