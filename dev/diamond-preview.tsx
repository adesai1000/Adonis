// Dev-only preview of the tracker's diamonds: the same <Diamond> and
// <DiamondField> the app renders, on the app's light and dark cards, at the
// tracker's size and blown up. Served by Vite at /dev/diamond.html; not part
// of the build. `?theme=dark` forces the dark card; `?big=N` sets the large
// stone's size.
import { StrictMode, useEffect } from "react"
import { createRoot } from "react-dom/client"
import "@/index.css"
import { Diamond, DiamondField, type DiamondGem } from "@/components/common/diamond-field"

const params = new URLSearchParams(location.search)
const theme = params.get("theme") === "dark" ? "dark" : "light"
const big = Number(params.get("big") || 320)
// ?bench=1: a desktop-tracker's worth of stones, and frame times in the console
const bench = params.get("bench") === "1"
const cols = bench ? 24 : 6

function Grid() {
  const size = 36
  const gap = 7
  const gems: DiamondGem[] = []
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < (bench ? 7 : 3); r++) {
      gems.push({
        x: c * (size + gap),
        y: r * (size + gap),
        size,
        tier: (c + r) % 3 === 0 ? 2 : 1,
        seed: c * 7.3 + r * 2.1,
        delayMs: 0,
      })
    }
  }
  const w = cols * (size + gap) - gap
  const h = (bench ? 7 : 3) * (size + gap) - gap
  return (
    <div className="relative" style={{ width: w, height: h }} data-grid>
      <DiamondField gems={gems} width={w} height={h} />
    </div>
  )
}

function Page() {
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    document.documentElement.style.colorScheme = theme
  }, [])
  useEffect(() => {
    if (!bench) return
    const deltas: number[] = []
    let last = performance.now()
    let raf = 0
    // keep the field on its 60 Hz interaction path: a pointer over the grid
    const grid = document.querySelector("[data-grid]")
    const poke = window.setInterval(() => {
      const r = grid?.getBoundingClientRect()
      if (r) grid?.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + 40, clientY: r.top + 40, bubbles: true }))
    }, 100)
    const tick = (now: number) => {
      deltas.push(now - last)
      last = now
      if (deltas.length < 240) raf = requestAnimationFrame(tick)
      else {
        const d = deltas.slice(60).sort((a, b) => a - b)
        const avg = d.reduce((a, b) => a + b, 0) / d.length
        console.log(`[bench] ${d.length} frames: avg ${avg.toFixed(1)}ms, median ${d[d.length >> 1].toFixed(1)}ms, p90 ${d[Math.floor(d.length * 0.9)].toFixed(1)}ms, max ${d[d.length - 1].toFixed(1)}ms`)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(poke)
    }
  }, [])
  return (
    <div className="min-h-dvh bg-background p-6 text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {!bench && (
          <div className="rounded-2xl bg-card p-6 shadow-sm" data-shot="big">
            <div className="flex items-end gap-10">
              <Diamond size={big} tier={1} seed={4.2} />
              <Diamond size={big} tier={2} seed={9.1} />
            </div>
          </div>
        )}
        <div className="rounded-2xl bg-card p-6 shadow-sm" data-shot="tracker">
          <div className="mb-3 text-[13px] font-semibold">Tracker size</div>
          <Grid />
          <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Diamond size={30} tier={1} seed={17} className="align-middle" /> full day
            </span>
            <span className="flex items-center gap-1.5">
              <Diamond size={30} tier={2} seed={34} className="align-middle" /> full day + steps
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Page />
  </StrictMode>
)
