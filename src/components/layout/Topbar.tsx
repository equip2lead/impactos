'use client'

import { useApp } from '@/hooks/useApp'
import { useLang } from '@/context/LangContext'
import { cn, initials } from '@/lib/utils'
import { Search, ChevronDown, LogOut } from 'lucide-react'
import { useState } from 'react'
import type { Project } from '@/types'

export function Topbar() {
  const { activeProject, setActiveProject, projects, role, profile, signOut } = useApp()
  const { lang, setLang, t } = useLang()
  const [projOpen, setProjOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)

  const avatarText = profile
    ? initials(profile.first_name, profile.last_name)
    : 'DE'

  const roleLabel: Record<string, string> = {
    owner: lang === 'fr' ? 'Propriétaire' : 'Owner',
    finance_officer: lang === 'fr' ? 'Finance' : 'Finance Officer',
    coordinator: lang === 'fr' ? 'Coordinateur' : 'Coordinator',
    staff: lang === 'fr' ? 'Personnel' : 'Staff',
    viewer: lang === 'fr' ? 'Observateur' : 'Viewer',
  }

  return (
    <header className="h-12 bg-white border-b border-gray-100 flex items-center justify-between px-4 flex-shrink-0 gap-3 z-40">
      {/* Brand */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-6 h-6 bg-gray-900 rounded-md flex items-center justify-center">
          <div className="w-2.5 h-2.5 bg-amber-400 rounded-sm" />
        </div>
        <span className="text-sm font-bold text-gray-900 tracking-tight">IMPACTOS</span>
      </div>

      {/* Search */}
      <div className="flex-1 max-w-xs">
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
          <Search size={12} className="text-gray-300 flex-shrink-0" />
          <span className="text-xs text-gray-300">
            {lang === 'fr' ? 'Rechercher projets, personnes…' : 'Search projects, people, reports…'}
          </span>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Lang toggle */}
        <div className="flex gap-0.5 bg-gray-50 border border-gray-100 rounded-lg p-0.5">
          <button onClick={() => setLang('en')}
            className={cn('px-2 py-1 rounded-md text-[10px] font-semibold transition-all',
              lang==='en' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600')}>
            EN
          </button>
          <button onClick={() => setLang('fr')}
            className={cn('px-2 py-1 rounded-md text-[10px] font-semibold transition-all',
              lang==='fr' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600')}>
            FR
          </button>
        </div>

        {/* Project selector */}
        <div className="relative">
          <button onClick={() => setProjOpen(o => !o)}
            className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-full px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 transition-colors">
            {activeProject ? (
              <>
                <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: activeProject.color || '#4338CA' }} />
                <span className="max-w-32 truncate">{activeProject.name}</span>
              </>
            ) : (
              <span className="text-gray-400">{lang === 'fr' ? 'Aucun projet' : 'No project'}</span>
            )}
            <ChevronDown size={12} className="text-gray-400" />
          </button>

          {projOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 w-56 py-1">
              {projects.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-400">
                  {lang === 'fr' ? 'Aucun projet' : 'No projects yet'}
                </div>
              )}
              {projects.map((p: Project) => (
                <button key={p.id} onClick={() => { setActiveProject(p); setProjOpen(false) }}
                  className={cn('w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-gray-50 transition-colors',
                    activeProject?.id === p.id && 'bg-indigo-50 text-indigo-700')}>
                  <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: p.color || '#4338CA' }} />
                  <span className="truncate font-medium">{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative">
          <button onClick={() => setUserOpen(o => !o)}
            className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-medium text-gray-700 leading-none">
                {profile ? `${profile.first_name} ${profile.last_name}` : 'Dr. Denis Ekobena'}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">{roleLabel[role] || role}</div>
            </div>
            <div className="w-7 h-7 bg-gray-900 rounded-full flex items-center justify-center text-[9px] font-bold text-amber-400">
              {avatarText}
            </div>
          </button>

          {userOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 w-44 py-1">
              <div className="px-3 py-2 border-b border-gray-100">
                <div className="text-xs font-semibold text-gray-900">
                  {profile ? `${profile.first_name} ${profile.last_name}` : 'Dr. Denis Ekobena'}
                </div>
                <div className="text-[10px] text-gray-400">{profile?.email}</div>
              </div>
              <button onClick={() => { setUserOpen(false); signOut() }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors">
                <LogOut size={12} />
                {t.signOut}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
