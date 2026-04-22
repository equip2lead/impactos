'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, TrendingUp, FileText, Settings } from 'lucide-react'
import { useLang } from '@/context/LangContext'
import { cn } from '@/lib/utils'

export function MobileNav() {
  const pathname = usePathname()
  const { lang } = useLang()

  const items = [
    { href: '/dashboard', icon: LayoutDashboard, label: lang === 'fr' ? 'Accueil' : 'Home' },
    { href: '/dashboard/participants', icon: Users, label: lang === 'fr' ? 'Participants' : 'People' },
    { href: '/dashboard/kpis', icon: TrendingUp, label: 'KPIs' },
    { href: '/dashboard/reports', icon: FileText, label: lang === 'fr' ? 'Rapports' : 'Reports' },
    { href: '/dashboard/settings', icon: Settings, label: lang === 'fr' ? 'Réglages' : 'Settings' },
  ]

  return (
    <nav className="mobile-nav justify-around items-center px-2">
      {items.map(item => {
        const active = pathname === item.href
        const Icon = item.icon
        return (
          <Link key={item.href} href={item.href}
            className={cn(
              'flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors',
              active ? 'text-indigo-600' : 'text-gray-400'
            )}>
            <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
            <span className="text-[9px] font-semibold">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
