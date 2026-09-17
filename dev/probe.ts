// Dev-only: compile the diamond shaders and draw one stone in whatever
// browser opens this page, then report what happened (GL caps, compile
// errors, whether pixels came out) both on the page and to the dev server's
// in-memory sync store, so a browser that can't be automated (Safari, a
// phone on the LAN) can still be checked from the terminal:
//   curl "http://localhost:5173/api/sync?code=diamond-probe"
import {
  DIAMOND_FRAG,
  DIAMOND_VERT,
  FACET_DATA,
  POST_FRAG,
  POST_VERT,
} from "@/lib/diamond-shader"

const out = document.getElementById("out")!
const report: Record<string, unknown> = { ua: navigator.userAgent, when: new Date().toISOString() }

async function run() {
  const canvas = document.getElementById("c") as HTMLCanvasElement
  const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, premultipliedAlpha: true })
  if (!gl) {
    report.result = "no webgl context"
    return
  }
  const dbg = gl.getExtension("WEBGL_debug_renderer_info")
  report.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  report.version = gl.getParameter(gl.VERSION)
  report.maxFragmentUniformVectors = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)
  report.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE)
  report.maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS)
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)
  report.fragmentHighp = hp ? { precision: hp.precision, rangeMin: hp.rangeMin, rangeMax: hp.rangeMax } : null

  const build = (name: string, v: string, f: string) => {
    const t0 = performance.now()
    const vs = gl.createShader(gl.VERTEX_SHADER)!
    gl.shaderSource(vs, v)
    gl.compileShader(vs)
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fs, f)
    gl.compileShader(fs)
    const p = gl.createProgram()!
    gl.attachShader(p, vs)
    gl.attachShader(p, fs)
    gl.linkProgram(p)
    const ok = gl.getProgramParameter(p, gl.LINK_STATUS)
    report[`${name}Link`] = {
      ok,
      ms: Math.round(performance.now() - t0),
      log: ok ? "" : `${gl.getShaderInfoLog(vs)} ${gl.getShaderInfoLog(fs)} ${gl.getProgramInfoLog(p)}`.trim(),
    }
    return ok ? p : null
  }
  const post = build("post", POST_VERT, POST_FRAG)
  const gem = build("gem", DIAMOND_VERT, DIAMOND_FRAG)
  if (!gem || !post) {
    report.result = "shader failed to link"
    return
  }

  gl.useProgram(gem)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const a = gl.getAttribLocation(gem, "a_pos")
  gl.enableVertexAttribArray(a)
  gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0)
  const U = (n: string) => gl.getUniformLocation(gem, n)
  gl.uniform4fv(U("u_facets"), FACET_DATA)
  gl.uniform1f(U("u_time"), 1)
  gl.uniform2f(U("u_tilt"), 0, 0)
  gl.uniform1f(U("u_spin"), 0)
  gl.uniform1f(U("u_seed"), 4.2)
  gl.uniform1f(U("u_birth"), 5)
  gl.uniform3f(U("u_absorb"), 0.14, 0.13, 0.1)
  gl.uniform1f(U("u_exposure"), 1)
  gl.uniform1f(U("u_dark"), 1)
  gl.uniform1f(U("u_fire"), 0.05)
  gl.uniform1i(U("u_depth"), 7)
  gl.uniform1f(U("u_rim"), 0)
  gl.viewport(0, 0, canvas.width, canvas.height)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  const t0 = performance.now()
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  const px = new Uint8Array(canvas.width * canvas.height * 4)
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px)
  report.firstDrawMs = Math.round(performance.now() - t0)
  let covered = 0
  let sum = [0, 0, 0]
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > 0) {
      covered++
      sum[0] += px[i]
      sum[1] += px[i + 1]
      sum[2] += px[i + 2]
    }
  }
  const n = canvas.width * canvas.height
  report.coverage = Math.round((covered / n) * 1000) / 10
  report.meanColour = covered ? sum.map((v) => Math.round(v / covered)) : null
  report.glError = gl.getError()
  report.result = covered > n * 0.15 && covered < n * 0.8 ? "rendered" : "drew nothing sensible"
}

try {
  await run()
} catch (e) {
  report.result = `threw: ${e instanceof Error ? e.message : String(e)}`
}
out.textContent = JSON.stringify(report, null, 2)
try {
  await fetch("/api/sync?code=diamond-probe", { method: "POST", body: JSON.stringify(report) })
} catch {
  /* dev server only */
}
