#!/usr/bin/env node
// Screenshot a page with headless Brave over the DevTools protocol. Node 24,
// no dependencies. WebGL renders fine headless.
//
//   node dev/shoot.mjs --url http://localhost:5173/dev/diamond.html --out shot.png
//     [--selector "[data-shot=big]"]   clip to an element (document coords)
//     [--seed seed.json]               localStorage key → string, set then reload
//     [--wait 1500]                    ms to let the page animate before the shot
//     [--width 1200 --height 900]      window size in CSS px
//     [--scale 2]                      device scale factor
//     [--click CSS]                    click an element (real mouse events) before the shot
//     [--eval JS]                      run this in the page before the wait; its value is printed
//     [--console]                      print console messages
//
// Brave clamps headless windows to ~500 px wide in some builds; for a true
// phone render wrap the page in an iframe of the right width instead.

import { spawn } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const flag = (name) => args.includes(`--${name}`)

const url = opt("url")
const out = opt("out", "shot.png")
const selector = opt("selector")
const click = opt("click")
const evalJs = opt("eval")
const seedFile = opt("seed")
const wait = Number(opt("wait", 1500))
const width = Number(opt("width", 1200))
const height = Number(opt("height", 900))
const scale = Number(opt("scale", 2))
if (!url) {
  console.error("usage: node dev/shoot.mjs --url URL --out file.png [--selector CSS] [--seed file.json]")
  process.exit(2)
}

const BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
const port = 9222 + Math.floor(Math.random() * 1000)
const profile = mkdtempSync(join(tmpdir(), "shoot-"))
const browser = spawn(
  BRAVE,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    `--force-device-scale-factor=${scale}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--hide-scrollbars",
    "about:blank",
  ],
  { stdio: "ignore" }
)
const cleanup = () => {
  try { browser.kill() } catch {}
  try { rmSync(profile, { recursive: true, force: true }) } catch {}
}
process.on("exit", cleanup)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function targets() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`)
      return await res.json()
    } catch {
      await sleep(100)
    }
  }
  throw new Error("browser did not come up")
}

const list = await targets()
const page = list.find((t) => t.type === "page")
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let nextId = 1
const pending = new Map()
const events = []
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
  } else if (msg.method) {
    events.push(msg)
    if (flag("console") && msg.method === "Runtime.consoleAPICalled") {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ")
      console.log(`[console.${msg.params.type}]`, text)
    }
    if (flag("console") && msg.method === "Runtime.exceptionThrown") {
      console.log("[exception]", msg.params.exceptionDetails.text, msg.params.exceptionDetails.exception?.description ?? "")
    }
  }
}
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
  return r.result.value
}
const loaded = () =>
  new Promise((resolve) => {
    const check = () => {
      if (events.some((e) => e.method === "Page.loadEventFired")) return resolve()
      setTimeout(check, 50)
    }
    check()
  })

await send("Page.enable")
await send("Runtime.enable")
await send("Emulation.setDeviceMetricsOverride", {
  width,
  height,
  deviceScaleFactor: scale,
  mobile: false,
})
await send("Page.navigate", { url })
await loaded()
if (seedFile) {
  const seed = JSON.parse(readFileSync(seedFile, "utf8"))
  await evaluate(
    `(() => { const s = ${JSON.stringify(seed)}; for (const k in s) localStorage.setItem(k, s[k]); return Object.keys(s).length })()`
  )
  events.length = 0
  await send("Page.reload")
  await loaded()
}
if (click) {
  const at = await evaluate(
    `(() => { const el = document.querySelector(${JSON.stringify(click)}); if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`
  )
  if (!at) {
    console.error(`click target not found: ${click}`)
    process.exit(1)
  }
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x: at.x, y: at.y, button: "left", clickCount: 1 })
  }
}
if (evalJs) console.log("eval:", JSON.stringify(await evaluate(evalJs)))
await sleep(wait)

let clip
if (selector) {
  const rect = await evaluate(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height } })()`
  )
  if (!rect) {
    console.error(`selector not found: ${selector}`)
    process.exit(1)
  }
  await sleep(300)
  clip = { ...rect, scale: 1 }
}
const shot = await send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: true,
  ...(clip ? { clip } : {}),
})
writeFileSync(out, Buffer.from(shot.data, "base64"))
const diamond = await evaluate("document.documentElement.dataset.diamond || ''")
console.log(`wrote ${out}${clip ? ` (${Math.round(clip.width)}×${Math.round(clip.height)} css px)` : ""}${diamond ? `; diamond: ${diamond}` : ""}`)
ws.close()
process.exit(0)
