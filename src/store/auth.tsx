import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { Session, User } from "@supabase/supabase-js"
import { isAuthConfigured, supabase } from "@/lib/supabase"

export interface Profile {
  user_id: string
  email: string | null
  plan: "free" | "pro"
  plan_status: string | null
  price_id: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  isAuthConfigured: boolean
  /** Pro plan with an access-granting subscription status. */
  isPro: boolean
  /**
   * True when a session exists but the profile could not be fetched
   * (transient failure). Pro status is unknown — don't hard-gate Pro UI on
   * it; the server still enforces pro_required.
   */
  profileUnknown: boolean
  signInWithEmail: (email: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  /** fetch() with the Supabase access token attached (plain fetch when signed out). */
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

const NOT_CONFIGURED = "Accounts are not configured on this deployment."
const ACTIVE_STATUSES = ["trialing", "active", "past_due"]

const AuthContext = createContext<AuthContextValue | null>(null)

// "error" (transient failure) is distinct from a missing row — treating a
// flaky request as "no profile" would demote a paying Pro user to gated UI.
async function fetchProfile(
  userId: string
): Promise<{ profile: Profile | null } | "error"> {
  if (!supabase) return { profile: null }
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "user_id, email, plan, plan_status, price_id, current_period_end, cancel_at_period_end"
    )
    .eq("user_id", userId)
    .maybeSingle()
  if (error) return "error"
  return { profile: (data as Profile | null) ?? null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileUnknown, setProfileUnknown] = useState(false)
  const [loading, setLoading] = useState(isAuthConfigured)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false

    // Fetch with a short backoff — a single flaky request on app open must
    // not leave a paying user gated until the next auth event.
    async function loadProfile(userId: string): Promise<void> {
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await fetchProfile(userId)
        if (cancelled) return
        if (result !== "error") {
          setProfile(result.profile)
          setProfileUnknown(false)
          return
        }
        if (attempt < 2) {
          await new Promise((r) => window.setTimeout(r, 1000 * (attempt + 1)))
          if (cancelled) return
        }
      }
      setProfileUnknown(true)
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      if (data.session) void loadProfile(data.session.user.id)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setLoading(false)
      if (s) {
        // defer supabase calls out of the auth callback (avoids client deadlock)
        window.setTimeout(() => {
          void loadProfile(s.user.id)
        }, 0)
      } else {
        setProfile(null)
        setProfileUnknown(false)
      }
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const signInWithEmail = useCallback(async (email: string) => {
    if (!supabase) throw new Error(NOT_CONFIGURED)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) throw new Error(error.message)
  }, [])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) throw new Error(NOT_CONFIGURED)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    })
    if (error) throw new Error(error.message)
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) throw new Error(NOT_CONFIGURED)
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error(error.message)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!supabase) throw new Error(NOT_CONFIGURED)
    if (!session) return
    const result = await fetchProfile(session.user.id)
    if (result === "error") {
      // Keep the previous profile — a transient failure must not demote Pro.
      setProfileUnknown(true)
      return
    }
    setProfile(result.profile)
    setProfileUnknown(false)
  }, [session])

  const authFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const token = session?.access_token
      if (!token) return fetch(input, init)
      const headers = new Headers(init?.headers)
      headers.set("Authorization", `Bearer ${token}`)
      return fetch(input, { ...init, headers })
    },
    [session]
  )

  const isPro = useMemo(() => {
    if (!profile || profile.plan !== "pro") return false
    if (profile.plan_status == null) return true
    return ACTIVE_STATUSES.includes(profile.plan_status)
  }, [profile])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      isAuthConfigured,
      isPro,
      profileUnknown,
      signInWithEmail,
      signInWithGoogle,
      signOut,
      refreshProfile,
      authFetch,
    }),
    [
      session,
      profile,
      loading,
      isPro,
      profileUnknown,
      signInWithEmail,
      signInWithGoogle,
      signOut,
      refreshProfile,
      authFetch,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>")
  return ctx
}
