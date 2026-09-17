import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import {
  DIAMOND_FRAG,
  DIAMOND_PAD,
  DIAMOND_VERT,
  FACET_COUNT,
  FACET_DATA,
  POST_FRAG,
  POST_VERT,
} from "@/lib/diamond-shader"

export interface DiamondGem {
  /** Cell rect in CSS px, relative to the field. */
  x: number
  y: number
  size: number
  /** 1 = colourless diamond (full day), 2 = yellow diamond (full day + steps). */
  tier: 1 | 2
  /** Any number; per-stone variation (initial orientation etc.). */
  seed: number
  /** Stagger for the arrival, ms. */
  delayMs: number
  title?: string
}

interface GemState {
  tilt: [number, number]
  tiltV: [number, number]
  spin: number
  spinV: number
}

/** Spring constants for the lean toward the pointer, per step of STEP_MS. */
const STIFF = 0.09
const DAMP = 0.74
/** The spring advances in fixed steps, so a 120 Hz screen feels the same as 60. */
const STEP_MS = 1000 / 60
/** Idle stones redraw no more often than this. */
const IDLE_MS = 30
/** A tap shoves the stone round by about a facet; the shove decays geometrically. */
const SPIN_KICK = (Math.PI / 4) * 0.12
const SPIN_DAMP = 0.9
/** Dispersion (spread of the refractive index); real diamond is 0.044. */
const FIRE = 0.05
/**
 * Stones this size (CSS px) and under are traced at twice the resolution and
 * box-filtered down, which is what keeps a 36 px stone from breaking up into
 * noise. They also trace fewer bounces and much less fire, which at that
 * size only reads as coloured speckle.
 */
const SMALL = 96

/**
 * The stone's body colour, as Beer absorption per channel: how quickly red,
 * green and blue die out per unit travelled inside. Zero is perfectly clear.
 * The colourless stone leans a touch icy; the yellow one swallows blue.
 */
const ABSORB: Record<1 | 2, [number, number, number]> = {
  1: [0.14, 0.13, 0.1],
  2: [0.12, 0.3, 1.7],
}
/** Sky brightness on light and dark cards. */
const EXPOSURE = { light: 0.96, dark: 1.0 }

/**
 * How far a DiamondField's canvas extends past its field on every side, in
 * CSS px. Most of that fringe is transparent, but a host that clips (a
 * scroll box) must still leave this much room, or the overflow makes it
 * scrollable.
 */
export function diamondCanvasMargin(size: number): number {
  return Math.ceil(Math.max(0, size) * DIAMOND_PAD)
}

/**
 * One WebGL canvas that renders every stone in `gems` in its own cell. Idle
 * the stones turn slowly so their facets flash; the pointer leans the
 * nearest stones toward it with spring damping; a tap spins one. Draws only
 * while on screen, and only the stones inside `clipRef` (a scroll box) when
 * one is given. Falls back to `children` (the CSS discs) when WebGL is
 * unavailable.
 */
export function DiamondField({
  gems,
  width,
  height,
  clipRef,
  className,
  children,
}: {
  gems: DiamondGem[]
  width: number
  height: number
  clipRef?: RefObject<HTMLElement | null>
  className?: string
  children?: React.ReactNode
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gemsRef = useRef(gems)
  gemsRef.current = gems
  // bumped when a lost WebGL context comes back, to set everything up again
  const [generation, setGeneration] = useState(0)
  // The canvas is larger than the field by this much on every side so a
  // glint at the edge of an outer stone isn't clipped into a square.
  const margin = diamondCanvasMargin(Math.max(0, ...gems.map((g) => g.size)))
  const cw = width + margin * 2
  const ch = height + margin * 2

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // A crashed or evicted GPU takes the context away mid-session; show the
    // discs until it comes back, then start over on the restored context.
    // The fallback discs are this field's own siblings, so the flag lives on
    // the host, not the document: one field failing must not hide or show
    // another field's stones.
    const host = canvas.parentElement ?? canvas
    const fallBack = (why: string) => {
      console.warn(`[diamond] ${why}; using the flat fallback disc`)
      canvas.style.display = "none"
      host.classList.add("no-webgl")
      document.documentElement.dataset.diamond = why
    }
    let lost = false
    const onLost = (e: Event) => {
      e.preventDefault()
      lost = true
      fallBack("context lost")
    }
    const onRestored = () => setGeneration((g) => g + 1)
    canvas.addEventListener("webglcontextlost", onLost)
    canvas.addEventListener("webglcontextrestored", onRestored)
    const detach = () => {
      canvas.removeEventListener("webglcontextlost", onLost)
      canvas.removeEventListener("webglcontextrestored", onRestored)
    }
    // Both passes write premultiplied colour and blend with ONE /
    // ONE_MINUS_SRC_ALPHA, so the canvas must be declared premultiplied.
    // Declared straight, the compositor would multiply by alpha a second
    // time: a grey ring on light cards, dim edges on dark ones.
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    })
    if (!gl || gl.isContextLost()) {
      fallBack("WebGL unavailable")
      return detach
    }
    // the facet planes travel as a uniform array; the rest of the uniforms
    // need a dozen more vectors
    if (gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) < FACET_COUNT + 16) {
      fallBack("too few fragment uniforms")
      return detach
    }
    document.documentElement.dataset.diamond = "webgl"
    canvas.style.display = ""
    host.classList.remove("no-webgl")

    // ── programs ──
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
    const link = (vert: string, frag: string) => {
      const program = gl.createProgram()!
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vert))
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, frag))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "link failed")
      }
      return program
    }
    let gemProg: WebGLProgram
    let postProg: WebGLProgram
    try {
      gemProg = link(DIAMOND_VERT, DIAMOND_FRAG)
      postProg = link(POST_VERT, POST_FRAG)
    } catch (e) {
      fallBack(`shader error: ${e instanceof Error ? e.message : String(e)}`)
      return detach
    }
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const gemPos = gl.getAttribLocation(gemProg, "a_pos")
    const postPos = gl.getAttribLocation(postProg, "a_pos")
    const U = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n)
    const ug = {
      time: U(gemProg, "u_time"),
      tilt: U(gemProg, "u_tilt"),
      spin: U(gemProg, "u_spin"),
      seed: U(gemProg, "u_seed"),
      birth: U(gemProg, "u_birth"),
      absorb: U(gemProg, "u_absorb"),
      exposure: U(gemProg, "u_exposure"),
      dark: U(gemProg, "u_dark"),
      fire: U(gemProg, "u_fire"),
      depth: U(gemProg, "u_depth"),
      rim: U(gemProg, "u_rim"),
    }
    gl.useProgram(gemProg)
    gl.uniform4fv(U(gemProg, "u_facets"), FACET_DATA)
    const up = {
      rect: U(postProg, "u_rect"),
      tex: U(postProg, "u_tex"),
      texel: U(postProg, "u_texel"),
    }
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    // ── the off-screen target for the traced stones ──
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    // ── state ──
    // A season of history is thousands of CSS px wide; keep the drawing
    // buffer under the size old GPUs clamp at, or the viewport maths break.
    const dpr = Math.min(window.devicePixelRatio || 1, 2, 4096 / Math.max(cw, ch))
    const small = Math.max(0, ...gemsRef.current.map((g) => g.size)) <= SMALL
    // supersampling: the texture is this many times the canvas
    const ss = small ? 2 : 1
    const states = new Map<number, GemState>()
    const stateFor = (i: number): GemState => {
      let s = states.get(i)
      if (!s) {
        s = { tilt: [0, 0], tiltV: [0, 0], spin: 0, spinV: 0 }
        states.set(i, s)
      }
      return s
    }
    const mountedAt = performance.now()
    let pointer: { x: number; y: number } | null = null
    let onScreen = true
    let visible = true
    let raf = 0
    let lastSize = ""
    let lastTs = -1
    let lastDraw = -Infinity
    let stepDebt = 0
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

    // The traced stones go into an atlas of equal slots, not a copy of the
    // whole canvas: a season of history is thousands of pixels wide, and
    // supersampled that would pass old iOS texture limits and tens of
    // megabytes. A frame draws as many batches as the atlas needs.
    const maxTex = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, 4096)
    const atlas = { slot: 0, cols: 0, rows: 0, w: 0, h: 0 }
    const fitAtlas = (slot: number, count: number) => {
      const per = Math.max(1, Math.floor(maxTex / slot))
      let cols = Math.min(per, count, 8)
      let rows = Math.min(per, Math.ceil(count / cols), 8)
      if (slot === atlas.slot) {
        // only ever grow, so a scroll that shows fewer stones doesn't
        // reallocate every frame
        if (cols <= atlas.cols && rows <= atlas.rows) return
        cols = Math.max(cols, atlas.cols)
        rows = Math.max(rows, atlas.rows)
      }
      atlas.slot = slot
      atlas.cols = cols
      atlas.rows = rows
      atlas.w = cols * slot
      atlas.h = rows * slot
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, atlas.w, atlas.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    }

    const frame = (ts: number) => {
      raf = 0
      // pointer and scroll kicks keep coming after a loss; nothing to draw on
      if (!visible || lost || gl.isContextLost()) return
      resize()
      const now = performance.now()
      const t = reduceMotion ? 0 : (now - mountedAt) / 1000
      const dark = document.documentElement.classList.contains("dark")
      const list = gemsRef.current
      // how many spring steps this frame owes (a tab left in the background
      // doesn't come back with a thousand of them)
      const dt = lastTs < 0 ? STEP_MS : Math.min(ts - lastTs, 100)
      lastTs = ts
      stepDebt += dt
      const steps = Math.floor(stepDebt / STEP_MS)
      stepDebt -= steps * STEP_MS

      // Only the stones that can be seen: the ones inside the scroll box,
      // and the ones that have arrived. Rects come from layout, read once
      // per frame before any drawing.
      let visX0 = -Infinity
      let visX1 = Infinity
      const clip = clipRef?.current
      if (clip) {
        const cr = clip.getBoundingClientRect()
        const kr = canvas.getBoundingClientRect()
        visX0 = cr.left - kr.left
        visX1 = cr.right - kr.left
      }
      const drawn: number[] = []
      let active = false
      for (let i = 0; i < list.length; i++) {
        const g = list[i]
        const st = stateFor(i)

        // spring toward the pointer: target lean from direction and proximity
        let tx = 0, ty = 0
        if (pointer) {
          const dx = pointer.x - (g.x + margin + g.size / 2)
          const dy = pointer.y - (g.y + margin + g.size / 2)
          const dist = Math.hypot(dx, dy)
          const reach = g.size * 6
          const near = Math.max(0, 1 - dist / reach)
          tx = Math.max(-1, Math.min(1, dx / (g.size * 3))) * near
          ty = Math.max(-1, Math.min(1, -dy / (g.size * 3))) * near
        }
        for (let k = 0; k < steps; k++) {
          st.tiltV[0] = (st.tiltV[0] + (tx - st.tilt[0]) * STIFF) * DAMP
          st.tiltV[1] = (st.tiltV[1] + (ty - st.tilt[1]) * STIFF) * DAMP
          st.tilt[0] += st.tiltV[0]
          st.tilt[1] += st.tiltV[1]
          st.spin += st.spinV
          st.spinV *= SPIN_DAMP
        }
        if (Math.abs(st.spinV) > 1e-4 || Math.abs(st.tiltV[0]) + Math.abs(st.tiltV[1]) > 1e-3) active = true

        const birth = reduceMotion ? 60_000 : now - mountedAt - g.delayMs
        if (birth < 0) {
          active = true
          continue
        }
        if (birth < 1200) active = true
        const pad = g.size * DIAMOND_PAD
        const left = g.x + margin - pad
        if (left + g.size + pad * 2 < visX0 || left > visX1) continue
        drawn.push(i)
      }

      // Idle stones only need ~30 Hz; interaction and arrivals get every frame.
      if (!reduceMotion && !active && ts - lastDraw < IDLE_MS) {
        raf = requestAnimationFrame(frame)
        return
      }
      lastDraw = ts

      // every stone's draw square on the canvas, in device px
      const squares = drawn.map((i) => {
        const g = list[i]
        const pad = g.size * DIAMOND_PAD
        return {
          i,
          vx: Math.round((g.x + margin - pad) * dpr),
          vy: Math.round((ch - (g.y + margin + g.size + pad)) * dpr),
          vs: Math.round((g.size + pad * 2) * dpr),
        }
      })
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      if (squares.length === 0) {
        if (!reduceMotion) raf = requestAnimationFrame(frame)
        return
      }
      const slot = Math.max(...squares.map((q) => q.vs)) * ss
      fitAtlas(slot, squares.length)
      const perBatch = atlas.cols * atlas.rows
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      for (let b = 0; b < squares.length; b += perBatch) {
        const batch = squares.slice(b, b + perBatch)

        // pass 1: trace each stone of the batch into its slot
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
        gl.viewport(0, 0, atlas.w, atlas.h)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.useProgram(gemProg)
        gl.enableVertexAttribArray(gemPos)
        gl.vertexAttribPointer(gemPos, 2, gl.FLOAT, false, 0, 0)
        gl.uniform1f(ug.exposure, dark ? EXPOSURE.dark : EXPOSURE.light)
        gl.uniform1f(ug.dark, dark ? 1 : 0)
        gl.uniform1f(ug.fire, small ? FIRE * 0.25 : FIRE)
        gl.uniform1i(ug.depth, small ? 5 : 7)
        batch.forEach((q, k) => {
          const g = list[q.i]
          const st = stateFor(q.i)
          gl.viewport((k % atlas.cols) * slot, Math.floor(k / atlas.cols) * slot, q.vs * ss, q.vs * ss)
          gl.uniform1f(ug.time, t + g.seed * 0.37)
          gl.uniform2f(ug.tilt, st.tilt[0], st.tilt[1])
          gl.uniform1f(ug.spin, st.spin)
          gl.uniform1f(ug.seed, g.seed)
          gl.uniform1f(ug.birth, reduceMotion ? 60 : (now - mountedAt - g.delayMs) / 1000)
          const a = ABSORB[g.tier]
          gl.uniform3f(ug.absorb, a[0], a[1], a[2])
          // the white stone on a white card gets the darkened rim; the yellow
          // one already stands out, and a dark rim would only turn it brown
          gl.uniform1f(ug.rim, dark ? 0 : g.tier === 1 ? 1 : 0.3)
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        })

        // pass 2: smooth each stone from its slot onto the page
        gl.bindFramebuffer(gl.FRAMEBUFFER, null)
        gl.useProgram(postProg)
        gl.enableVertexAttribArray(postPos)
        gl.vertexAttribPointer(postPos, 2, gl.FLOAT, false, 0, 0)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.uniform1i(up.tex, 0)
        // taps are one canvas pixel apart; on a supersampled slot the
        // bilinear fetch between texels is the 2×2 box filter for free
        gl.uniform2f(up.texel, ss / atlas.w, ss / atlas.h)
        batch.forEach((q, k) => {
          gl.viewport(q.vx, q.vy, q.vs, q.vs)
          gl.uniform4f(
            up.rect,
            ((k % atlas.cols) * slot) / atlas.w,
            (Math.floor(k / atlas.cols) * slot) / atlas.h,
            (q.vs * ss) / atlas.w,
            (q.vs * ss) / atlas.h
          )
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        })
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
      // spin away from the side that was tapped
      const dir = p.x < g.x + margin + g.size / 2 ? 1 : -1
      st.spinV += SPIN_KICK * dir
      kick()
    }
    host.addEventListener("pointermove", onMove, { passive: true })
    host.addEventListener("pointerleave", onLeave, { passive: true })
    host.addEventListener("pointerdown", onDown, { passive: true })
    // a scrolled field brings other stones into view
    const clipEl = clipRef?.current
    clipEl?.addEventListener("scroll", kick, { passive: true })

    const io = new IntersectionObserver((entries) => {
      onScreen = entries.some((en) => en.isIntersecting)
      visible = onScreen && !document.hidden
      kick()
    })
    io.observe(canvas)
    const onVis = () => {
      visible = onScreen && !document.hidden
      kick()
    }
    document.addEventListener("visibilitychange", onVis)
    // a theme switch changes the sky; under reduced motion nothing else
    // would redraw
    const themeObserver = new MutationObserver(kick)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })

    kick()
    return () => {
      detach()
      if (raf) cancelAnimationFrame(raf)
      io.disconnect()
      themeObserver.disconnect()
      document.removeEventListener("visibilitychange", onVis)
      host.removeEventListener("pointermove", onMove)
      host.removeEventListener("pointerleave", onLeave)
      host.removeEventListener("pointerdown", onDown)
      clipEl?.removeEventListener("scroll", kick)
      // Don't lose the context here: a canvas keeps handing back the same
      // context, so a re-run of this effect (StrictMode, a size change)
      // would inherit a dead one. Release the GL objects instead.
      gl.deleteFramebuffer(fbo)
      gl.deleteTexture(tex)
      gl.deleteBuffer(buf)
      gl.deleteProgram(gemProg)
      gl.deleteProgram(postProg)
    }
    // re-created only when the field size changes or the context comes
    // back; gems flow through the ref
  }, [cw, ch, margin, clipRef, generation])

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
 * One stone on its own canvas: same shader, same framing, same motion as
 * the stones in the tracker. `size` is the box in CSS px.
 */
export function Diamond({
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
  const gems = useMemo<DiamondGem[]>(
    () => [{ x: 0, y: 0, size, tier, seed, delayMs: 0 }],
    [size, tier, seed]
  )
  return (
    <span
      className={className}
      style={{ position: "relative", display: "inline-block", width: size, height: size }}
    >
      <DiamondField gems={gems} width={size} height={size}>
        <span className="gem-fallback">
          <span className="gem-body" data-tier={tier} />
        </span>
      </DiamondField>
    </span>
  )
}
