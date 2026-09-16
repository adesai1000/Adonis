import { useEffect, useRef } from "react"
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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    })
    if (!gl || gl.isContextLost()) {
      failedRef.current = true
      canvas.style.display = "none"
      document.documentElement.classList.add("no-webgl")
      return
    }
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
      console.warn("[opal] falling back to CSS stones:", e)
      failedRef.current = true
      canvas.style.display = "none"
      document.documentElement.classList.add("no-webgl")
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
      px: U("u_px"),
    }
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

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
      const key = `${width}x${height}x${dpr}`
      if (key === lastSize) return
      lastSize = key
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
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
        const cx = g.x + g.size / 2
        const cy = g.y + g.size / 2

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

        const pad = g.size * 0.9
        const vx = Math.round((g.x - pad) * dpr)
        const vy = Math.round((height - (g.y + g.size + pad)) * dpr)
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
        gl.uniform1f(u.px, 2 / vs)
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
        const d = Math.hypot(p.x - (g.x + g.size / 2), p.y - (g.y + g.size / 2))
        if (d < bestD) { bestD = d; best = i }
      }
      if (best < 0 || bestD > list[best].size * 1.2) return
      const g = list[best]
      const st = stateFor(best)
      st.rippleStart = performance.now()
      const pad = g.size * 0.9
      st.rippleAt = [
        ((p.x - (g.x - pad)) / (g.size + pad * 2)) * 2 - 1,
        -(((p.y - (g.y - pad)) / (g.size + pad * 2)) * 2 - 1),
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
  }, [width, height])

  return (
    <>
      <canvas
        ref={canvasRef}
        className={className}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        aria-hidden
      />
      {children}
    </>
  )
}
