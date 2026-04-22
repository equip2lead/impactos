'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useApp } from '@/hooks/useApp'
import { useLang } from '@/context/LangContext'
import {
  LayoutDashboard, FolderOpen, Users, UserSquare2, Heart,
  CalendarCheck, Package, TrendingUp, CreditCard,
  CalendarDays, FileText, Menu, ChevronLeft, Settings
} from 'lucide-react'

export function Sidebar() {
  const pathname = usePathname()
  const { isFinance } = useApp()
  const { t, lang } = useLang()
  const [collapsed, setCollapsed] = useState(false)

  const NAV = [
    { section: t.workspace },
    { href: '/dashboard', label: t.dashboard, icon: LayoutDashboard },
    { href: '/dashboard/projects', label: t.projects, icon: FolderOpen },
    { section: t.people },
    { href: '/dashboard/participants', label: t.participants, icon: Users },
    { href: '/dashboard/hr', label: t.hr, icon: UserSquare2 },
    { href: '/dashboard/donors', label: t.donors, icon: Heart },
    { section: t.operations },
    { href: '/dashboard/attendance', label: t.attendance, icon: CalendarCheck },
    { href: '/dashboard/supply', label: t.supply, icon: Package },
    { href: '/dashboard/kpis', label: t.kpis, icon: TrendingUp },
    { section: t.finance, financeGate: true },
    { href: '/dashboard/finance', label: t.finance, icon: CreditCard, financeOnly: true },
    { section: t.planning },
    { href: '/dashboard/schedule', label: t.schedule, icon: CalendarDays },
    { href: '/dashboard/reports', label: t.reports, icon: FileText },
    { section: "System" },
    { href: "/dashboard/settings", label: lang === "fr" ? "Paramètres" : "Settings", icon: Settings },
  ]

  return (
    <aside className={cn(
      'flex flex-col bg-white border-r border-gray-100 transition-all duration-200 flex-shrink-0',
      collapsed ? 'w-12' : 'w-48'
    )}>
      <button onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-2 px-3 h-10 border-b border-gray-100 hover:bg-gray-50 transition-colors">
        {collapsed
          ? <Menu size={16} className="text-gray-400" />
          : <ChevronLeft size={16} className="text-gray-400" />}
        {!collapsed && <span className="text-xs font-bold text-gray-900">IMPACTOS</span>}
      </button>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {NAV.map((item, i) => {
          if ('section' in item) {
            if (item.financeGate && !isFinance) return null
            return (
              <div key={i} className={cn(
                'px-3 pt-3 pb-1 text-[9px] font-semibold text-gray-300 uppercase tracking-wider whitespace-nowrap overflow-hidden',
                collapsed && 'opacity-0'
              )}>
                {item.section}
              </div>
            )
          }

          if (item.financeOnly && !isFinance) return null

          const active = pathname === item.href
          const Icon = item.icon

          return (
            <Link key={item.href} href={item.href!}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 mx-1 rounded-lg transition-colors',
                active
                  ? item.financeOnly
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800',
                item.financeOnly && !active && 'text-amber-600 hover:bg-amber-50'
              )}>
              <Icon size={15} className="flex-shrink-0" />
              {!collapsed && (
                <span className="text-xs font-medium truncate">{item.label}</span>
              )}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
