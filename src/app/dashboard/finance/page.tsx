'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/hooks/useApp'
import { createClient } from '../../../../lib/supabase'
import { Button, Modal, Field, Input, Select, Table, TR, TD, Tabs, MetricCard, ProgressBar, Card, CardHeader } from '@/components/ui'
import { Lock, Plus, TrendingUp, TrendingDown } from 'lucide-react'
import { fmt, pct } from '@/lib/utils'
import type { Income, Expense, BudgetCategory } from '@/types'

export default function FinancePage() {
  const { activeProject, isFinance } = useApp()
  const supabase = createClient()
  const [tab, setTab] = useState('Overview')
  const [income, setIncome] = useState<Income[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [cats, setCats] = useState<BudgetCategory[]>([])
  const [open, setOpen] = useState<'income'|'expense'|null>(null)
  const [saving, setSaving] = useState(false)

  const [incForm, setIncForm] = useState({ source:'', amount:'', date: new Date().toISOString().slice(0,10), type:'Grant', ref:'' })
  const [expForm, setExpForm] = useState({ desc:'', amount:'', date: new Date().toISOString().slice(0,10), cat_id:'', ref:'' })

  const load = async () => {
    if (!activeProject) return
    const [incR, expR, catR] = await Promise.all([
      supabase.from('income').select('*').eq('project_id', activeProject.id).order('income_date', { ascending: false }),
      supabase.from('expenses').select('*, budget_categories(*)').eq('project_id', activeProject.id).order('expense_date', { ascending: false }),
      supabase.from('budget_categories').select('*').eq('project_id', activeProject.id).order('sort_order'),
    ])
    setIncome((incR.data ?? []) as Income[])
    setExpenses((expR.data ?? []) as Expense[])
    setCats((catR.data ?? []) as BudgetCategory[])
  }

  useEffect(() => { load() }, [activeProject]) // eslint-disable-line

  // Finance gate
  if (!isFinance) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center">
          <Lock size={20} className="text-amber-600" />
        </div>
        <div className="text-center">
          <div className="text-base font-bold text-gray-900 mb-1">Finance — restricted access</div>
          <div className="text-sm text-gray-400">Switch to Owner or Finance Officer role to access this module.</div>
        </div>
      </div>
    )
  }

  if (!activeProject) return <div className="text-gray-400 text-sm">Select a project first.</div>

  const totalIncome = income.reduce((a, r) => a + (r.amount_usd ?? 0), 0)
  const totalExpenses = expenses.reduce((a, r) => a + (r.amount_usd ?? 0), 0)
  const net = totalIncome - totalExpenses
  const budget = activeProject.budget_usd ?? 0
  const spentPct = pct(totalExpenses, budget)

  const addIncome = async () => {
    if (!incForm.source || !incForm.amount) return
    setSaving(true)
    await supabase.from('income').insert({
      project_id: activeProject.id, source: incForm.source,
      amount_usd: parseFloat(incForm.amount), income_date: incForm.date,
      income_type: incForm.type, reference: incForm.ref || null
    })
    setIncForm({ source:'', amount:'', date: new Date().toISOString().slice(0,10), type:'Grant', ref:'' })
    setOpen(null); setSaving(false); load()
  }

  const addExpense = async () => {
    if (!expForm.desc || !expForm.amount) return
    setSaving(true)
    await supabase.from('expenses').insert({
      project_id: activeProject.id, description: expForm.desc,
      amount_usd: parseFloat(expForm.amount), expense_date: expForm.date,
      budget_cat_id: expForm.cat_id || null, reference: expForm.ref || null
    })
    setExpForm({ desc:'', amount:'', date: new Date().toISOString().slice(0,10), cat_id:'', ref:'' })
    setOpen(null); setSaving(false); load()
  }

  const incomeByType: Record<string,number> = {}
  income.forEach(r => { incomeByType[r.income_type ?? 'Other'] = (incomeByType[r.income_type ?? 'Other'] ?? 0) + r.amount_usd })

  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">Projects › {activeProject.name} › Finance</div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-amber-700 tracking-tight">Finance</h1>
          <div className="text-sm text-gray-400">Income, expenses, payroll and budget tracking</div>
        </div>
        <div className="flex gap-2">
          <Button variant="finance" size="sm" onClick={() => setOpen('income')}><Plus size={13} /> Log income</Button>
          <Button variant="danger" size="sm" onClick={() => setOpen('expense')}><Plus size={13} /> Log expense</Button>
        </div>
      </div>

      <Tabs tabs={['Overview','Income','Expenses','Budget']} active={tab} onChange={setTab} />

      {tab === 'Overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard label="Total income" value={fmt(totalIncome)} icon={<TrendingUp size={13} className="text-emerald-600" />} iconBg="bg-emerald-50" trend={{ label: '↑ Funded', color: 'bg-emerald-50 text-emerald-600' }} />
            <MetricCard label="Total expenses" value={fmt(totalExpenses)} icon={<TrendingDown size={13} className="text-red-600" />} iconBg="bg-red-50" trend={{ label: `${spentPct}% of budget`, color: 'bg-amber-50 text-amber-600' }} />
            <MetricCard label="Net balance" value={fmt(net)} trend={{ label: net >= 0 ? '↑ Positive' : '↓ Deficit', color: net >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600' }} />
            <MetricCard label="Budget used" value={`${spentPct}%`} sub={`of ${fmt(budget)}`} trend={{ label: budget > 0 ? fmt(budget - totalExpenses) + ' remaining' : 'No budget set', color: 'bg-gray-100 text-gray-500' }} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader title="Income vs expenses" />
              <div className="space-y-3">
                <div><div className="flex justify-between text-xs text-gray-400 mb-1.5"><span>Income</span><span className="font-semibold text-emerald-600">{fmt(totalIncome)}</span></div><ProgressBar value={totalIncome} max={Math.max(totalIncome, totalExpenses, 1)} color="#059669" height={8} /></div>
                <div><div className="flex justify-between text-xs text-gray-400 mb-1.5"><span>Expenses</span><span className="font-semibold text-red-600">{fmt(totalExpenses)}</span></div><ProgressBar value={totalExpenses} max={Math.max(totalIncome, totalExpenses, 1)} color="#DC2626" height={8} /></div>
                <div className="border-t border-gray-100 pt-2 text-sm font-bold" style={{ color: net >= 0 ? '#059669' : '#DC2626' }}>Net balance: {net >= 0 ? '+' : ''}{fmt(net)}</div>
              </div>
            </Card>
            <Card>
              <CardHeader title="Income by type" />
              {Object.keys(incomeByType).length === 0 ? <div className="text-sm text-gray-400">No income recorded yet.</div> : (
                <div className="space-y-2">
                  {Object.entries(incomeByType).map(([type, amt]) => (
                    <div key={type} className="flex justify-between py-2 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-600">{type}</span>
                      <span className="text-sm font-bold text-emerald-600">{fmt(amt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === 'Income' && (
        <Table headers={['Date','Source','Type','Amount','Reference']} empty={income.length === 0}>
          {income.map(r => (
            <TR key={r.id}>
              <TD>{r.income_date}</TD>
              <TD><span className="font-medium">{r.source}</span></TD>
              <TD><span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{r.income_type}</span></TD>
              <TD><span className="font-bold text-emerald-600">{fmt(r.amount_usd)}</span></TD>
              <TD>{r.reference ?? '—'}</TD>
            </TR>
          ))}
        </Table>
      )}

      {tab === 'Expenses' && (
        <Table headers={['Date','Description','Category','Amount','Reference']} empty={expenses.length === 0}>
          {expenses.map(r => (
            <TR key={r.id}>
              <TD>{r.expense_date}</TD>
              <TD><span className="font-medium">{r.description}</span></TD>
              <TD>{r.budget_categories ? <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">{r.budget_categories.name}</span> : '—'}</TD>
              <TD><span className="font-bold text-red-600">{fmt(r.amount_usd)}</span></TD>
              <TD>{r.reference ?? '—'}</TD>
            </TR>
          ))}
        </Table>
      )}

      {tab === 'Budget' && (
        <Card>
          <CardHeader title="Budget vs actuals by category" />
          <div className="space-y-4">
            {cats.map(c => {
              const spent = expenses.filter(e => e.budget_cat_id === c.id).reduce((a, e) => a + e.amount_usd, 0)
              const p = pct(spent, c.alloc_usd)
              return (
                <div key={c.id}>
                  <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                    <span className="font-medium">{c.code}. {c.name}</span>
                    <span>{fmt(spent)} / {fmt(c.alloc_usd)}</span>
                  </div>
                  <ProgressBar value={spent} max={c.alloc_usd || 1} color={p > 90 ? '#DC2626' : activeProject.color || '#4338CA'} height={6} />
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Log income modal */}
      <Modal open={open === 'income'} onClose={() => setOpen(null)} title="Log income"
        footer={<><Button variant="secondary" onClick={() => setOpen(null)}>Cancel</Button><Button variant="primary" onClick={addIncome} disabled={saving}>{saving ? 'Saving…' : 'Log income'}</Button></>}
      >
        <div className="space-y-3">
          <Field label="Source / Donor"><Input value={incForm.source} onChange={e => setIncForm(f=>({...f,source:e.target.value}))} placeholder="U.S. Embassy grant" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (USD)"><Input type="number" value={incForm.amount} onChange={e => setIncForm(f=>({...f,amount:e.target.value}))} min="0" /></Field>
            <Field label="Date"><Input type="date" value={incForm.date} onChange={e => setIncForm(f=>({...f,date:e.target.value}))} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <Select value={incForm.type} onChange={e => setIncForm(f=>({...f,type:e.target.value}))}>
                <option>Grant</option><option>Donation</option><option>In-kind</option><option>Membership fee</option><option>Service revenue</option><option>Other</option>
              </Select>
            </Field>
            <Field label="Reference"><Input value={incForm.ref} onChange={e => setIncForm(f=>({...f,ref:e.target.value}))} placeholder="Optional" /></Field>
          </div>
        </div>
      </Modal>

      {/* Log expense modal */}
      <Modal open={open === 'expense'} onClose={() => setOpen(null)} title="Log expense"
        footer={<><Button variant="secondary" onClick={() => setOpen(null)}>Cancel</Button><Button variant="danger" onClick={addExpense} disabled={saving}>{saving ? 'Saving…' : 'Log expense'}</Button></>}
      >
        <div className="space-y-3">
          <Field label="Description"><Input value={expForm.desc} onChange={e => setExpForm(f=>({...f,desc:e.target.value}))} placeholder="Teacher salary Sep 2026" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (USD)"><Input type="number" value={expForm.amount} onChange={e => setExpForm(f=>({...f,amount:e.target.value}))} min="0" /></Field>
            <Field label="Date"><Input type="date" value={expForm.date} onChange={e => setExpForm(f=>({...f,date:e.target.value}))} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select value={expForm.cat_id} onChange={e => setExpForm(f=>({...f,cat_id:e.target.value}))}>
                <option value="">— Select —</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.code}. {c.name}</option>)}
              </Select>
            </Field>
            <Field label="Receipt ref"><Input value={expForm.ref} onChange={e => setExpForm(f=>({...f,ref:e.target.value}))} placeholder="Optional" /></Field>
          </div>
        </div>
      </Modal>
    </div>
  )
}
