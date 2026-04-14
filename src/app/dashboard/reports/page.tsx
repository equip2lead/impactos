'use client'
import { useEffect, useState, useCallback } from 'react'
import { useApp } from '@/hooks/useApp'
import { createClient } from '../../../../lib/supabase'
import { Button, Modal, Field, Input, Select, Table, TR, TD } from '@/components/ui'
import { statusBadge } from '@/components/ui'
import { Plus, CheckCircle } from 'lucide-react'
import type { Report } from '@/types'

export default function ReportsPage() {
  const { activeProject, isAdmin } = useApp()
  const supabase = createClient()
  const [reports, setReports] = useState<Report[]>([])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name:'', freq:'Monthly', due:'', recip:'' })

  const load = useCallback(async () => {
    if (!activeProject) return
    const { data } = await supabase.from('reports').select('*').eq('project_id', activeProject.id).order('due_date')
    setReports((data ?? []) as Report[])
  }, [activeProject]) // eslint-disable-line

  useEffect(() => { load() }, [load])

  const addReport = async () => {
    if (!form.name || !activeProject) return
    setSaving(true)
    await supabase.from('reports').insert({
      project_id: activeProject.id, name: form.name, frequency: form.freq,
      due_date: form.due || null, recipient: form.recip || null, status: 'upcoming'
    })
    setForm({ name:'', freq:'Monthly', due:'', recip:'' })
    setOpen(false); setSaving(false); load()
  }

  const markSubmitted = async (id: string) => {
    await supabase.from('reports').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', id); load()
  }

  if (!activeProject) return <div className="text-gray-400 text-sm p-4">Select a project first.</div>

  const today = new Date().toISOString().slice(0,10)
  const overdue = reports.filter(r => r.status !== 'submitted' && r.due_date && r.due_date < today)
  const submitted = reports.filter(r => r.status === 'submitted')

  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">Projects › {activeProject.name} › Reports</div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Reports</h1>
          <div className="text-xs text-gray-400">{reports.length} total · {submitted.length} submitted · {overdue.length} overdue</div>
        </div>
        {isAdmin && <Button variant="primary" size="sm" onClick={() => setOpen(true)}><Plus size={13}/>Add report</Button>}
      </div>

      {overdue.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
          ⚠️ {overdue.length} report{overdue.length>1?'s are':' is'} past due: {overdue.map(r=>r.name).join(', ')}
        </div>
      )}

      <Table headers={['Report','Frequency','Due date','Recipient','Status', isAdmin?'Actions':'']} empty={reports.length===0}>
        {reports.map(r => (
          <TR key={r.id}>
            <TD><span className="font-medium">{r.name}</span></TD>
            <TD><span className="text-xs text-gray-500">{r.frequency}</span></TD>
            <TD><span className={r.status!=='submitted'&&r.due_date&&r.due_date<today?'text-red-600 font-semibold':''}>{r.due_date ?? '—'}</span></TD>
            <TD className="text-sm text-gray-500">{r.recipient ?? '—'}</TD>
            <TD>{statusBadge(r.status)}</TD>
            {isAdmin && (
              <TD>
                {r.status !== 'submitted' && (
                  <button onClick={() => markSubmitted(r.id)} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 font-medium">
                    <CheckCircle size={12}/>Mark submitted
                  </button>
                )}
              </TD>
            )}
          </TR>
        ))}
      </Table>

      <Modal open={open} onClose={() => setOpen(false)} title="Add report to calendar"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={addReport} disabled={saving}>{saving?'Saving…':'Add report'}</Button></>}>
        <div className="space-y-3">
          <Field label="Report name"><Input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Monthly attendance summary"/></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Frequency"><Select value={form.freq} onChange={e=>setForm(f=>({...f,freq:e.target.value}))}><option>Monthly</option><option>Quarterly</option><option>Semi-annual</option><option>Annual</option><option>One-time</option></Select></Field>
            <Field label="Due date"><Input type="date" value={form.due} onChange={e=>setForm(f=>({...f,due:e.target.value}))}/></Field>
          </div>
          <Field label="Recipient"><Input value={form.recip} onChange={e=>setForm(f=>({...f,recip:e.target.value}))} placeholder="U.S. Embassy PAS"/></Field>
        </div>
      </Modal>
    </div>
  )
}
