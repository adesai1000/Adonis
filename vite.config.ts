import path from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, type Plugin } from "vite"
import { MIN_QUERY_LENGTH, searchOpenFoodFacts } from "./api/_lib/off-search"

// Dev-only stand-in for the /api/sync serverless function. Keeps blobs in
// memory (per dev-server lifetime) so device sync can be exercised locally.
// In production this path is served by api/sync.ts (Upstash / Vercel KV).
function devSyncPlugin(): Plugin {
  const store = new Map<string, string>()
  return {
    name: "dev-sync",
    configureServer(server) {
      server.middlewares.use("/api/sync", async (req, res) => {
        const reqUrl = new URL(req.url || "", "http://localhost")
        const code = (reqUrl.searchParams.get("code") || "").trim()
        res.setHeader("content-type", "application/json")
        if (!code || code.length < 4) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: "A sync code of at least 4 characters is required." }))
          return
        }
        if (req.method === "GET") {
          const value = store.get(code)
          res.end(JSON.stringify({ data: value ? JSON.parse(value) : null }))
          return
        }
        if (req.method === "POST" || req.method === "PUT") {
          let body = ""
          for await (const chunk of req) body += chunk
          store.set(code, body)
          res.end(JSON.stringify({ ok: true }))
          return
        }
        res.statusCode = 405
        res.end(JSON.stringify({ error: "Method not allowed" }))
      })
    },
  }
}

// Dev-only stand-in for api/off-search.ts: same helper, same JSON shape.
function devOffSearchPlugin(): Plugin {
  return {
    name: "dev-off-search",
    configureServer(server) {
      server.middlewares.use("/api/off-search", async (req, res) => {
        res.setHeader("content-type", "application/json")
        const q = (new URL(req.url || "", "http://localhost").searchParams.get("q") || "").trim()
        if (q.length < MIN_QUERY_LENGTH) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: `Type at least ${MIN_QUERY_LENGTH} characters.` }))
          return
        }
        try {
          res.end(JSON.stringify({ hits: await searchOpenFoodFacts(q) }))
        } catch (e) {
          res.statusCode = 502
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : "Search failed." }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), devSyncPlugin(), devOffSearchPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
