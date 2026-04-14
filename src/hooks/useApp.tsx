'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createClient } from '../../lib/supabase'
import type { Project, Profile, UserRole } from '@/types'

interface AppContextType {
  activeProject: Project | null
  setActiveProject: (p: Project | null) => void
  projects: Project[]
  profile: Profile | null
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [activeProject, setActiveProjectState] = useState<Project | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const role: UserRole = (profile?.role ?? 'viewer') as UserRole
  const isFinance = role === 'owner' || role === 'finance_officer'
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
    await supabase.auth.signOut()
    setProfile(null)
    setActiveProjectState(null)
    window.location.href = '/login'
  }

  useEffect(() => {
    const init = async () => {
      // Check for authenticated user
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        if (prof) {
          setProfile(prof as Profile)
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
          const { data: created } = await supabase
            .from('profiles')
            .upsert(newProfile)
            .select()
            .single()
          if (created) setProfile(created as Profile)
        }
      }
      await refreshProjects()
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
        } else if (event === 'SIGNED_IN' && session?.user) {
          await init()
        }
      }
    )
    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line

  return (
    <AppContext.Provider value={{
      activeProject, setActiveProject, projects, profile,
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
