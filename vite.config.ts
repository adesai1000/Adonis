import path from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, loadEnv, type Plugin } from "vite"
import { lookupUpcFallback, searchFoods } from "./api/_lib/food-search"

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

// Dev-only stand-in for api/food-search.ts: same helpers, same JSON shapes.
// `env` carries USDA_FDC_API_KEY from .env (never exposed to the client).
function devFoodSearchPlugin(env: Record<string, string | undefined>): Plugin {
  return {
    name: "dev-food-search",
    configureServer(server) {
      server.middlewares.use("/api/food-search", async (req, res) => {
        res.setHeader("content-type", "application/json")
        const params = new URL(req.url || "", "http://localhost").searchParams
        try {
          const upc = (params.get("upc") || "").replace(/\D/g, "")
          if (upc) {
            res.end(JSON.stringify({ product: await lookupUpcFallback(upc, env) }))
            return
          }
          const result = await searchFoods((params.get("q") || "").trim(), env)
          if ("error" in result) {
            res.statusCode = result.status
            res.end(JSON.stringify({ error: result.error }))
            return
          }
          res.end(JSON.stringify({ hits: result.hits }))
        } catch (e) {
          res.statusCode = 502
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : "Search failed." }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Server-side secrets for the dev middleware only; not in the client bundle.
  const env = loadEnv(mode, process.cwd(), "")
  return {
    plugins: [react(), tailwindcss(), devSyncPlugin(), devFoodSearchPlugin(env)],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
})
