import { useEffect, useMemo, useRef } from "react"
import { OPAL_FRAG, OPAL_VERT } from "@/lib/opal-shader"

export interface OpalGem {
  /** Cell rect in CSS px, relative to the field. */
  x: number
  y: number
  size: number
  /** 1 = full day, 2 = full day + steps (warm palette). */
  tier: 1 | 2
  /** Any number; drives the per-stone noise so no two look alike. */
  seed: number
  /** Stagger for the mount light sweep, ms. */
  delayMs: number
  title?: string
}

interface GemState {
  look: [number, number]
  lookV: [number, number]
  bulge: number
  bulgeV: number
  rippleStart: number
  rippleAt: [number, number]
}

/** Spring constants for the lean toward the cursor (per frame at 60 Hz). */
const STIFF = 0.09
const DAMP = 0.74
/**
 * Draw area around each stone, as a fraction of its size. The demo page
 * frames one stone in a square canvas where the stone spans ~45% of the
 * width; this pad reproduces that framing so a tracker stone looks exactly
 * like the demo, just smaller.
 */
const PAD = 0.6

/**
 * How far an OpalField's canvas extends past its field on every side, in CSS
 * px. Most of that fringe is transparent, but a host that clips (a scroll
 * box) must still leave this much room, or the overflow makes it scrollable.
 */
export function opalCanvasMargin(size: number): number {
  return Math.ceil(Math.max(0, size) * PAD)
}

/**
 * One WebGL canvas that renders every gem in `gems` in its own cell. Idle it
 * floats on simplex noise; the cursor leans and bulges the nearest stones
 * with spring damping; a tap ripples. Draws only while on screen. Falls back
 * to `children` (the CSS stones) when WebGL is unavailable.
 */
export function OpalField({
  gems,
  width,
  height,
  className,
  children,
}: {
  gems: OpalGem[]
  width: number
  height: number
  className?: string
  children?: React.ReactNode
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gemsRef = useRef(gems)
  gemsRef.current = gems
  const failedRef = useRef(false)
  // The canvas is larger than the field by this much on every side so the
  // halo of an edge stone isn't clipped into a square.
  const margin = opalCanvasMargin(Math.max(0, ...gems.map((g) => g.size)))
  const cw = width + margin * 2
  const ch = height + margin * 2

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // The shader writes straight (colour, coverage); blending that with
    // SRC_ALPHA / ONE_MINUS_SRC_ALPHA onto a transparent clear leaves
    // premultiplied pixels in the buffer, so the canvas must be declared
    // premultiplied. Declared straight, the compositor would multiply by
    // alpha a second time: halo dim on dark cards, a grey ring on light ones.
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    })
    if (!gl || gl.isContextLost()) {
      console.warn("[opal] WebGL unavailable; using the flat fallback disc")
      failedRef.current = true
      canvas.style.display = "none"
      document.documentElement.classList.add("no-webgl")
      document.documentElement.dataset.opal = "no-context"
      return
    }
    document.documentElement.dataset.opal = "webgl"
    canvas.style.display = ""
    document.documentElement.classList.remove("no-webgl")

    // ── program ──
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh)
        gl.deleteShader(sh)
        throw new Error(log || "shader compile failed")
      }
      return sh
    }
    let program: WebGLProgram
    try {
      program = gl.createProgram()!
      gl.attachShader(program, compile(gl.VERTEX_SHADER, OPAL_VERT))
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, OPAL_FRAG))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "link failed")
      }
    } catch (e) {
      console.warn("[opal] shader failed; using the flat fallback disc:", e)
      failedRef.current = true
      canvas.style.display = "none"
      document.documentElement.classList.add("no-webgl")
      document.documentElement.dataset.opal = `shader-error: ${e instanceof Error ? e.message : String(e)}`
      return
    }
    gl.useProgram(program)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(program, "a_pos")
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
    const U = (n: string) => gl.getUniformLocation(program, n)
    const u = {
      time: U("u_time"),
      look: U("u_look"),
      bulge: U("u_bulge"),
      tier: U("u_tier"),
      seed: U("u_seed"),
      ripple: U("u_ripple"),
      rippleAt: U("u_rippleAt"),
      birth: U("u_birth"),
      detail: U("u_detail"),
    }
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    // ── state ──
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const states = new Map<number, GemState>()
    const stateFor = (i: number): GemState => {
      let s = states.get(i)
      if (!s) {
        s = { look: [0, 0], lookV: [0, 0], bulge: 0, bulgeV: 0, rippleStart: -1, rippleAt: [0, 0] }
        states.set(i, s)
      }
      return s
    }
    const mountedAt = performance.now()
    let pointer: { x: number; y: number } | null = null
    let visible = true
    let raf = 0
    let lastSize = ""
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const resize = () => {
      const key = `${cw}x${ch}x${dpr}`
      if (key === lastSize) return
      lastSize = key
      canvas.width = Math.max(1, Math.round(cw * dpr))
      canvas.height = Math.max(1, Math.round(ch * dpr))
      canvas.style.width = `${cw}px`
      canvas.style.height = `${ch}px`
    }

    const frame = () => {
      raf = 0
      if (!visible) return
      resize()
      const now = performance.now()
      const t = (now - mountedAt) / 1000
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)

      // gems are drawn with a margin so the halo can spill past the cell
      const list = gemsRef.current
      for (let i = 0; i < list.length; i++) {
        const g = list[i]
        const st = stateFor(i)
        // canvas space: field coordinates shifted by the margin
        const gx = g.x + margin
        const gy = g.y + margin
        const cx = gx + g.size / 2
        const cy = gy + g.size / 2

        // spring toward the cursor: target lean and bulge from proximity
        let tx = 0, ty = 0, tb = 0
        if (pointer) {
          const dx = pointer.x - cx
          const dy = pointer.y - cy
          const dist = Math.hypot(dx, dy)
          const reach = g.size * 6
          const near = Math.max(0, 1 - dist / reach)
          tx = Math.max(-1, Math.min(1, dx / (g.size * 3))) * near
          ty = Math.max(-1, Math.min(1, -dy / (g.size * 3))) * near
          tb = near * near
        }
        st.lookV[0] = (st.lookV[0] + (tx - st.look[0]) * STIFF) * DAMP
        st.lookV[1] = (st.lookV[1] + (ty - st.look[1]) * STIFF) * DAMP
        st.look[0] += st.lookV[0]
        st.look[1] += st.lookV[1]
        st.bulgeV = (st.bulgeV + (tb - st.bulge) * STIFF) * DAMP
        st.bulge += st.bulgeV

        const pad = g.size * PAD
        const vx = Math.round((gx - pad) * dpr)
        const vy = Math.round((ch - (gy + g.size + pad)) * dpr)
        const vs = Math.round((g.size + pad * 2) * dpr)
        gl.viewport(vx, vy, vs, vs)

        gl.uniform1f(u.time, t + g.seed * 0.37)
        gl.uniform2f(u.look, st.look[0], st.look[1])
        gl.uniform1f(u.bulge, st.bulge)
        gl.uniform1f(u.tier, g.tier)
        gl.uniform1f(u.seed, g.seed)
        const rip = st.rippleStart >= 0 ? (now - st.rippleStart) / 1000 : -1
        gl.uniform1f(u.ripple, rip >= 0 && rip < 2.5 ? rip : -1)
        gl.uniform2f(u.rippleAt, st.rippleAt[0], st.rippleAt[1])
        gl.uniform1f(u.birth, Math.max(0, (now - mountedAt - g.delayMs) / 1000))
        // identical material to /opal.html at every size
        gl.uniform1f(u.detail, 1.0)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }
      if (!reduceMotion) raf = requestAnimationFrame(frame)
    }
    const kick = () => {
      if (!raf && visible) raf = requestAnimationFrame(frame)
    }

    // ── interaction ──
    const toLocal = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const onMove = (e: PointerEvent) => {
      pointer = toLocal(e)
      kick()
    }
    const onLeave = () => {
      pointer = null
      kick()
    }
    const onDown = (e: PointerEvent) => {
      const p = toLocal(e)
      const list = gemsRef.current
      let best = -1, bestD = Infinity
      for (let i = 0; i < list.length; i++) {
        const g = list[i]
        const d = Math.hypot(p.x - (g.x + margin + g.size / 2), p.y - (g.y + margin + g.size / 2))
        if (d < bestD) { bestD = d; best = i }
      }
      if (best < 0 || bestD > list[best].size * 1.2) return
      const g = list[best]
      const st = stateFor(best)
      st.rippleStart = performance.now()
      const pad = g.size * PAD
      const gx = g.x + margin
      const gy = g.y + margin
      st.rippleAt = [
        ((p.x - (gx - pad)) / (g.size + pad * 2)) * 2 - 1,
        -(((p.y - (gy - pad)) / (g.size + pad * 2)) * 2 - 1),
      ]
      kick()
    }
    const host = canvas.parentElement ?? canvas
    host.addEventListener("pointermove", onMove, { passive: true })
    host.addEventListener("pointerleave", onLeave, { passive: true })
    host.addEventListener("pointerdown", onDown, { passive: true })

    const io = new IntersectionObserver((entries) => {
      visible = entries.some((en) => en.isIntersecting) && !document.hidden
      kick()
    })
    io.observe(canvas)
    const onVis = () => {
      visible = !document.hidden
      kick()
    }
    document.addEventListener("visibilitychange", onVis)

    kick()
    return () => {
      if (raf) cancelAnimationFrame(raf)
      io.disconnect()
      document.removeEventListener("visibilitychange", onVis)
      host.removeEventListener("pointermove", onMove)
      host.removeEventListener("pointerleave", onLeave)
      host.removeEventListener("pointerdown", onDown)
      // Don't lose the context here: a canvas keeps handing back the same
      // context, so a re-run of this effect (StrictMode, a size change)
      // would inherit a dead one. Release the program and buffer instead.
      gl.deleteBuffer(buf)
      gl.deleteProgram(program)
    }
    // re-created only when the field size changes; gems flow through the ref
  }, [cw, ch, margin])

  return (
    <>
      <canvas
        ref={canvasRef}
        className={className}
        style={{
          position: "absolute",
          left: -margin,
          top: -margin,
          width: cw,
          height: ch,
          pointerEvents: "none",
        }}
        aria-hidden
      />
      {children}
    </>
  )
}

/**
 * One stone on its own canvas, exactly as /opal.html renders it: same
 * shader, same framing, same motion. `size` is the box in CSS px.
 */
export function Opal({
  size,
  tier,
  seed = 4.2,
  className,
}: {
  size: number
  tier: 1 | 2
  seed?: number
  className?: string
}) {
  const gems = useMemo<OpalGem[]>(
    () => [{ x: 0, y: 0, size, tier, seed, delayMs: 0 }],
    [size, tier, seed]
  )
  return (
    <span
      className={className}
      style={{ position: "relative", display: "inline-block", width: size, height: size }}
    >
      <OpalField gems={gems} width={size} height={size}>
        <span className="gem-fallback">
          <span className="gem-body" />
        </span>
      </OpalField>
    </span>
  )
}
