import { createContext, useContext, useEffect, type ReactNode } from "react"
import { useStore } from "@/store/store"
import type { Theme } from "@/lib/types"

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  resolved: "light" | "dark"
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyTheme(theme: Theme): "light" | "dark" {
  const root = document.documentElement
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  const resolved: "light" | "dark" =
    theme === "system" ? (prefersDark ? "dark" : "light") : theme
  root.classList.toggle("dark", resolved === "dark")
  root.style.colorScheme = resolved
  return resolved
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, updateUser } = useStore()
  const theme = user.theme ?? "system"

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // React to OS theme changes while in "system" mode
  useEffect(() => {
    if (theme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => applyTheme("system")
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [theme])

  const resolved = applyTheme(theme)

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme: (t) => updateUser({ theme: t }), resolved }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>")
  return ctx
}
