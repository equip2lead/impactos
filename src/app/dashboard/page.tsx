'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/hooks/useApp'
import { useLang } from '@/context/LangContext'
import { createClient } from '../../../lib/supabase'
import { MetricCard, Card, CardHeader, ProgressBar, EmptyState } from '@/components/ui'
import { Button } from '@/components/ui'
import { fmt, pct } from '@/lib/utils'
import { Users, CalendarCheck, Wallet, UserSquare2, Heart, TrendingUp, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import type { KPI, Milestone, Report, Income, Expense } from '@/types'

export default function DashboardPage() {
  const { activeProject, isFinance } = useApp()
  const { t } = useLang()
  const supabase = createClient()

  const [participantCount, setParticipantCount] = useState(0)
  const [staffCount, setStaffCount] = useState(0)
  const [donorCount, setDonorCount] = useState(0)
  const [avgAtt, setAvgAtt] = useState<number | null>(null)
  const [totalIncome, setTotalIncome] = useState(0)
  const [totalExpenses, setTotalExpenses] = useState(0)
  const [kpis, setKpis] = useState<KPI[]>([])
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!activeProject) return
    const pid = activeProject.id
    setLoading(true)

    Promise.all([
      supabase.from('participants').select('id', { count: 'exact', head: true }).eq('project_id', pid),
      supabase.from('staff_project_assignments').select('id', { count: 'exact', head: true }).eq('project_id', pid).eq('is_active', true),
      supabase.from('donors').select('id', { count: 'exact', head: true }).eq('project_id', pid),
      supabase.from('attendance_sessions').select('id, present_count, absent_count').eq('project_id', pid).limit(50),
      supabase.from('income').select('amount_usd').eq('project_id', pid),
      supabase.from('expenses').select('amount_usd').eq('project_id', pid),
      supabase.from('kpis').select('*').eq('project_id', pid).order('sort_order'),
      supabase.from('milestones').select('*').eq('project_id', pid).neq('status', 'done').order('due_date').limit(5),
      supabase.from('reports').select('*').eq('project_id', pid).order('due_date').limit(6),
    ]).then(([parts, staffA, donors, sessions, incomeR, expR, kpisR, msR, rptR]) => {
      setParticipantCount(parts.count ?? 0)
      setStaffCount(staffA.count ?? 0)
      setDonorCount(donors.count ?? 0)
      
      if (sessions.data && sessions.data.length > 0) {
        const rates = sessions.data.map(s => {
          const total = (s.present_count ?? 0) + (s.absent_count ?? 0)
          return total > 0 ? Math.round(((s.present_count ?? 0) / total) * 100) : null
        }).filter(Boolean) as number[]
        setAvgAtt(rates.length > 0 ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null)
      } else setAvgAtt(null)

      const income = (incomeR.data ?? []).reduce((a: number, r: { amount_usd: number }) => a + (r.amount_usd ?? 0), 0)
      const expenses = (expR.data ?? []).reduce((a: number, r: { amount_usd: number }) => a + (r.amount_usd ?? 0), 0)
      setTotalIncome(income as number)
      setTotalExpenses(expenses as number)
      setKpis((kpisR.data ?? []) as KPI[])
      setMilestones((msR.data ?? []) as Milestone[])
      setReports((rptR.data ?? []) as Report[])
      setLoading(false)
    })
  }, [activeProject]) // eslint-disable-line

  if (!activeProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="text-center">
          <div className="text-lg font-bold text-gray-900 mb-1">{t.selectProject}</div>
          <div className="text-sm text-gray-400 mb-4">{t.selectProjectSub}</div>
        </div>
        <Link href="/dashboard/projects">
          <Button variant="primary">{t.viewProjects} →</Button>
        </Link>
      </div>
    )
  }

  const budget = activeProject.budget_usd ?? 0
  const target = activeProject.target_count ?? 50
  const net = totalIncome - totalExpenses
  const spentPct = pct(totalExpenses, budget)
  const overdueReports = reports.filter(r => r.status !== 'submitted' && r.due_date && r.due_date < new Date().toISOString().slice(0, 10))

  return (
    <div>
      {/* Breadcrumb + title */}
      <div className="text-xs text-gray-400 mb-1">Workspace › Dashboard</div>
      <div className="mb-1">
        <div className="text-xs font-medium text-gray-400">{activeProject.project_type?.replace('_', ' ')} · AFRILEAD</div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{activeProject.name}</h1>
        <div className="text-sm text-gray-400">{activeProject.start_date} → {activeProject.end_date}</div>
      </div>

      {/* Alerts */}
      {overdueReports.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 text-sm text-amber-700">
          <AlertTriangle size={14} />
          {t.reportsOverdue(overdueReports.length)}
        </div>
      )}
      {avgAtt !== null && avgAtt < 80 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4 text-sm text-red-700">
          <AlertTriangle size={14} />
          Attendance rate ({avgAtt}%) is below the 80% target — review retention measures.
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <MetricCard
          label="Participants" value={participantCount} sub={`of ${target} target`}
          icon={<Users size={13} className="text-indigo-600" />} iconBg="bg-indigo-50"
          trend={{ label: `${pct(participantCount, target)}% enrolled`, color: 'bg-gray-100 text-gray-500' }}
        />
        <MetricCard
          label="Avg attendance" value={avgAtt !== null ? `${avgAtt}%` : '—'} sub="target ≥80%"
          icon={<CalendarCheck size={13} className="text-emerald-600" />} iconBg="bg-emerald-50"
          trend={{ label: avgAtt !== null && avgAtt >= 80 ? '↑ On target' : 'No sessions yet', color: avgAtt !== null && avgAtt >= 80 ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500' }}
        />
        <MetricCard
          label="Staff assigned" value={staffCount} sub={`${donorCount} funder${donorCount !== 1 ? 's' : ''}`}
          icon={<UserSquare2 size={13} className="text-gray-500" />} iconBg="bg-gray-50"
          trend={{ label: 'Organisation-wide', color: 'bg-gray-100 text-gray-500' }}
        />
        <MetricCard
          label="Donors" value={donorCount} sub="active grants"
          icon={<Heart size={13} className="text-violet-600" />} iconBg="bg-violet-50"
          trend={{ label: fmt(totalIncome) + ' secured', color: 'bg-emerald-50 text-emerald-600' }}
        />
      </div>

      {/* Finance strip — owner/finance only */}
      {isFinance && (
        <div className="border-l-4 border-amber-400 bg-white rounded-r-xl border border-gray-100 p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Wallet size={14} className="text-amber-600" />
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Financial overview</span>
            <span className="text-xs text-gray-400">· visible to owner & finance only</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-400 mb-1">Total income</div>
              <div className="text-lg font-bold text-emerald-600">{fmt(totalIncome)}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-400 mb-1">Total expenses</div>
              <div className="text-lg font-bold text-red-600">{fmt(totalExpenses)}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-400 mb-1">Net balance</div>
              <div className={`text-lg font-bold ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{net >= 0 ? '+' : ''}{fmt(net)}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-400 mb-1">Budget used</div>
              <div className="text-lg font-bold text-gray-900">{spentPct}%</div>
              <div className="text-xs text-gray-400">of {fmt(budget)}</div>
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1"><span>Income</span><span className="font-medium text-emerald-600">{fmt(totalIncome)}</span></div>
              <ProgressBar value={totalIncome} max={Math.max(totalIncome, totalExpenses, 1)} color="#059669" />
            </div>
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1"><span>Expenses</span><span className="font-medium text-red-600">{fmt(totalExpenses)}</span></div>
              <ProgressBar value={totalExpenses} max={Math.max(totalIncome, totalExpenses, 1)} color="#DC2626" />
            </div>
          </div>
        </div>
      )}

      {/* KPIs + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader title="KPI progress" action={<Link href="/dashboard/kpis" className="text-xs text-indigo-600 hover:underline">View all →</Link>} />
          {loading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : kpis.length === 0 ? (
            <EmptyState title="No KPIs" sub="Add KPIs in the KPIs module" />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 flex-1">Enrollment</span>
                <div className="flex-[2]"><ProgressBar value={participantCount} max={target} color="#4338CA" /></div>
                <span className="text-xs font-bold text-gray-900 w-12 text-right">{participantCount}/{target}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 flex-1">Attendance</span>
                <div className="flex-[2]"><ProgressBar value={avgAtt ?? 0} max={100} color="#059669" /></div>
                <span className="text-xs font-bold text-gray-900 w-12 text-right">{avgAtt !== null ? `${avgAtt}%` : '—'}</span>
              </div>
              {kpis.slice(0, 4).map(k => (
                <div key={k.id} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 flex-1 truncate">{k.name}</span>
                  <div className="flex-[2]"><ProgressBar value={k.current_val} max={k.target_val} color={activeProject.color || '#4338CA'} /></div>
                  <span className="text-xs font-bold text-gray-900 w-20 text-right">{k.current_val}/{k.target_val} {k.unit}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          {/* Milestones */}
          <Card>
            <CardHeader title="Upcoming milestones" action={<Link href="/dashboard/schedule" className="text-xs text-indigo-600 hover:underline">View all →</Link>} />
            {milestones.length === 0 ? (
              <EmptyState title="No upcoming milestones" />
            ) : (
              <div className="space-y-2">
                {milestones.slice(0, 4).map(m => (
                  <div key={m.id} className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${m.status === 'done' ? 'bg-emerald-400' : m.status === 'overdue' ? 'bg-red-400' : 'bg-amber-400'}`} />
                    <span className="text-xs text-gray-700 flex-1 truncate">{m.title}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{m.due_date}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Reports due */}
          <Card>
            <CardHeader title="Reports calendar" action={<Link href="/dashboard/reports" className="text-xs text-indigo-600 hover:underline">View all →</Link>} />
            {reports.length === 0 ? (
              <EmptyState title="No reports configured" />
            ) : (
              <div className="space-y-2">
                {reports.slice(0, 4).map(r => (
                  <div key={r.id} className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${r.status === 'submitted' ? 'bg-emerald-400' : r.status === 'overdue' ? 'bg-red-400' : 'bg-amber-400'}`} />
                    <span className="text-xs text-gray-700 flex-1 truncate">{r.name}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{r.due_date}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
