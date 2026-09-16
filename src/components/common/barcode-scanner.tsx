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

type CamState = "starting" | "live" | "stalled" | "denied" | "unavailable"

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
  const [manual, setManual] = useState("")
  const detectedRef = useRef(false)
  const onDetectedRef = useRef(onDetected)
  onDetectedRef.current = onDetected

  function emit(code: string) {
    if (detectedRef.current) return
    detectedRef.current = true
    onDetectedRef.current(code)
  }

  function submitManual() {
    const code = manual.replace(/\D/g, "")
    if (code) emit(code)
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

        {/* Mounted only while the dialog is open, so the camera starts once
            the portal has actually put the <video> in the DOM. */}
        {open && <CameraView onDetected={emit} />}

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

/**
 * The live viewfinder. Owns the camera stream itself rather than letting ZXing
 * drive the <video>, because iOS is picky: it wants the muted/playsinline
 * attributes on the element, may refuse play() outside a user gesture (Low
 * Power Mode), and ends the track when the app is backgrounded. We watch for
 * frames actually arriving and offer a tap-to-start when they don't.
 */
function CameraView({ onDetected }: { onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [cam, setCam] = useState<CamState>("starting")
  const [attempt, setAttempt] = useState(0)
  const onDetectedRef = useRef(onDetected)
  onDetectedRef.current = onDetected

  useEffect(() => {
    const video = videoRef.current
    if (!video || !navigator.mediaDevices?.getUserMedia) {
      setCam("unavailable")
      return
    }
    setCam("starting")

    // React sets these as properties only; iOS checks the attributes.
    video.muted = true
    video.setAttribute("muted", "")
    video.setAttribute("playsinline", "")
    video.setAttribute("autoplay", "")

    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS)
    hints.set(DecodeHintType.TRY_HARDER, true)
    const reader = new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 120,
    })

    let cancelled = false
    let fired = false
    let stream: MediaStream | null = null
    let controls: IScannerControls | null = null
    let stallTimer = 0

    const stopStream = () => {
      stream?.getTracks().forEach((t) => t.stop())
      stream = null
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
      } catch (err: unknown) {
        if (cancelled) return
        const name = err instanceof Error ? err.name : ""
        setCam(
          name === "NotAllowedError" || name === "SecurityError"
            ? "denied"
            : "unavailable"
        )
        return
      }
      if (cancelled || !video) {
        stopStream()
        return
      }

      // iOS ends the track when the app goes to the background; come back
      // with a fresh stream instead of a frozen frame.
      const track = stream.getVideoTracks()[0]
      track?.addEventListener("ended", () => {
        if (!cancelled) setAttempt((a) => a + 1)
      })

      video.srcObject = stream
      try {
        await video.play()
      } catch {
        // Autoplay refused (Low Power Mode etc.) — the tap-to-start button
        // calls play() from a real gesture.
      }
      if (cancelled) return

      // "Playing" alone isn't proof on iOS; wait for real frames.
      stallTimer = window.setTimeout(() => {
        if (cancelled) return
        if (video.paused || video.videoWidth === 0) setCam("stalled")
      }, 2500)

      try {
        controls = await reader.decodeFromVideoElement(video, (result) => {
          if (!result || fired || cancelled) return
          const text = result.getText().trim()
          if (!text) return
          fired = true
          controls?.stop()
          onDetectedRef.current(text)
        })
        if (cancelled) controls.stop()
      } catch {
        if (!cancelled) setCam("stalled")
      }
    }

    start()

    return () => {
      cancelled = true
      window.clearTimeout(stallTimer)
      controls?.stop()
      stopStream()
      video.srcObject = null
    }
  }, [attempt])

  /** Runs inside a genuine tap, which is what iOS wants for play(). */
  function tapToStart() {
    const video = videoRef.current
    if (!video) return
    if (video.srcObject) {
      video
        .play()
        .then(() => setCam("live"))
        .catch(() => setAttempt((a) => a + 1))
    } else {
      setAttempt((a) => a + 1)
    }
  }

  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[18px] bg-black sm:aspect-[4/3]">
      <video
        ref={videoRef}
        className="size-full object-cover"
        muted
        playsInline
        autoPlay
        onPlaying={() => setCam("live")}
      />
      {cam === "live" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[12%] top-1/2 h-[38%] -translate-y-1/2 rounded-[14px] border-2 border-white/80"
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
          {cam === "stalled" && (
            <Button
              type="button"
              variant="outline"
              className="h-11 border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              onClick={tapToStart}
            >
              <Camera className="size-4" />
              Tap to start camera
            </Button>
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
  )
}
