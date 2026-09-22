'use client'

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react'
import { createClient } from '../../lib/supabase'
import { withTimeout } from '@/lib/withTimeout'
import type { Project, Profile, UserRole } from '@/types'

interface AppContextType {
  activeProject: Project | null
  setActiveProject: (p: Project | null) => void
  projects: Project[]
  profile: Profile | null
  /**
   * Set when a session exists but its profile could not be resolved. The app
   * must surface this rather than run on the defaulted role: a silent default
   * renders a working UI at the wrong identity and privileges.
   */
  profileError: string | null
  retryProfile: () => void
  role: UserRole
  isFinance: boolean
  isAdmin: boolean
  orgId: string
  loading: boolean
  refreshProjects: () => Promise<void>
  signOut: () => Promise<void>
}

const AppContext = createContext<AppContextType | null>(null)
const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

/**
 * The auth cookie @supabase/ssr writes for this project. Used to tell a genuine
 * signed-out state from one where a session exists that the client failed to
 * read — the two look identical to getUser(), but only one is an error.
 */
const SESSION_COOKIE = `sb-${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').split('//')[1]?.split('.')[0] ?? ''}-auth-token`
const hasSessionCookie = () =>
  typeof document !== 'undefined' && document.cookie.includes(`${SESSION_COOKIE}=`)

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeProject, setActiveProjectState] = useState<Project | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [authTick, setAuthTick] = useState(0)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const role: UserRole = (profile?.role ?? 'viewer') as UserRole
  const isFinance = role === 'owner' || role === 'finance'
  const isAdmin = isFinance || role === 'coordinator'

  const setActiveProject = (p: Project | null) => {
    setActiveProjectState(p)
    if (typeof window !== 'undefined') {
      if (p) localStorage.setItem('impactos_active_project', p.id)
      else localStorage.removeItem('impactos_active_project')
    }
  }

  const refreshProjects = async () => {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('org_id', ORG_ID)
      .order('created_at', { ascending: false })
    if (data) {
      setProjects(data)
      const savedId = typeof window !== 'undefined'
        ? localStorage.getItem('impactos_active_project')
        : null
      if (savedId) {
        const found = data.find((p: Project) => p.id === savedId)
        if (found) setActiveProjectState(found)
        else if (data.length > 0) setActiveProjectState(data[0])
      } else if (data.length > 0 && !activeProject) {
        setActiveProjectState(data[0])
      }
    }
  }

  const signOut = async () => {
    // Clear local state FIRST. Awaiting supabase.auth.signOut() is unsafe: when
    // the client cannot see the session the call can hang rather than reject,
    // and a hang never reaches catch or finally — so a try/finally redirect
    // still never runs. Nothing here may depend on that call returning.
    setProfile(null)
    setProfileError(null)
    setActiveProjectState(null)
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem('impactos_active_project') } catch { /* ignore */ }
    }

    // Give the server a chance to revoke, but never wait on it indefinitely.
    await Promise.race([
      supabase.auth.signOut().catch(() => undefined),
      new Promise(resolve => setTimeout(resolve, 1500)),
    ])

    // Whether or not that call completed, the local session must be gone.
    if (typeof document !== 'undefined') {
      for (const suffix of ['', '.0', '.1']) {
        document.cookie = `${SESSION_COOKIE}${suffix}=; Max-Age=0; path=/`
      }
    }
    if (typeof window !== 'undefined') window.location.href = '/login'
  }

  useEffect(() => {
    const init = async () => {
      // Check for authenticated user
      // Raced, not awaited: a stalled getUser() would leave loading true forever,
      // which bypasses ProfileGate and keeps the reconcile dormant — the exact
      // state that defeated both recovery paths.
      const userRes = await withTimeout(supabase.auth.getUser())
      if (userRes.timedOut) {
        setProfileError('Timed out reading your session. Check your connection and try again.')
        setLoading(false)
        return
      }
      const { data: { user }, error: userErr } = userRes.value
      if (!user) {
        // No session at all is normal on public routes; only report a genuine
        // lookup failure, never a signed-out state.
        if (userErr) setProfileError(userErr.message)
        else if (hasSessionCookie()) {
          // The server let this request through on a session the client could
          // not read. That is a failure, not a signed-out state, and it must
          // not degrade silently into the role defaults.
          setProfileError('Session cookie present but no user could be read from it')
        }
        await refreshProjects()
        setLoading(false)
        return
      }
      {
        // PostgrestBuilder is thenable but not a Promise, so wrap it.
        const profRes = await withTimeout(
          Promise.resolve(supabase.from('profiles').select('*').eq('id', user.id).single())
        )
        if (profRes.timedOut) {
          setProfileError('Timed out loading your profile. Check your connection and try again.')
          setLoading(false)
          return
        }
        const { data: prof, error: profErr } = profRes.value
        if (prof) {
          setProfile(prof as Profile)
          setProfileError(null)
        } else if (profErr && profErr.code !== 'PGRST116') {
          // PGRST116 is "no rows", which the auto-create below handles.
          // Anything else is a real failure and must not be defaulted away.
          setProfileError(profErr.message)
          await refreshProjects()
          setLoading(false)
          return
        } else {
          // Auto-create profile for first-time users
          const nameParts = (user.email?.split('@')[0] ?? 'User').split('.')
          const newProfile = {
            id: user.id,
            org_id: ORG_ID,
            first_name: nameParts[0] ?? 'User',
            last_name: nameParts[1] ?? '',
            email: user.email ?? '',
            role: 'viewer' as UserRole,
            is_active: true,
          }
          const { data: created, error: createErr } = await supabase
            .from('profiles')
            .upsert(newProfile)
            .select()
            .single()
          if (created) { setProfile(created as Profile); setProfileError(null) }
          else setProfileError(createErr?.message ?? 'Profile could not be created')
        }
      }
      await withTimeout(refreshProjects())
      setLoading(false)
    }

    init()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          setProfile(null)
          setProjects([])
          setActiveProjectState(null)
          window.location.href = '/login'
        } else if (
          (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')
          && session?.user
        ) {
          // A refreshed token or a late-arriving initial session must re-resolve
          // the profile. Without this the bootstrap ran once and, if it missed,
          // stayed missed for the life of the mount.
          await init()
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [authTick]) // eslint-disable-line

  // Identity used to hinge on a single SIGNED_IN event: the provider is mounted
  // in the root layout, so the post-login router.push is a client-side
  // navigation that never remounts it. If that one event was missed, the
  // provider stayed profile-less for the life of the tab. This reconciles that
  // state — a live session cookie with no profile and no error — by re-running
  // init, bounded so a genuinely profile-less account cannot loop.
  const reconcileAttempts = useRef(0)
  useEffect(() => {
    if (loading || profile || profileError) {
      if (profile) reconcileAttempts.current = 0
      return
    }
    if (!hasSessionCookie() || reconcileAttempts.current >= 3) return
    reconcileAttempts.current += 1
    const delay = 300 * reconcileAttempts.current
    const timer = setTimeout(() => setAuthTick(t => t + 1), delay)
    return () => clearTimeout(timer)
  }, [loading, profile, profileError])

  return (
    <AppContext.Provider value={{
      activeProject, setActiveProject, projects, profile,
      profileError, retryProfile: () => setAuthTick(t => t + 1),
      role, isFinance, isAdmin, orgId: ORG_ID,
      loading, refreshProjects, signOut
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
