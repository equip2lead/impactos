'use client'
import { useEffect, useState, useCallback } from 'react'
import { useApp } from '@/hooks/useApp'
import { createClient } from '../../../../lib/supabase'
import { Button, Modal, Field, Input, Select, Table, TR, TD, EmptyState } from '@/components/ui'
import { statusBadge } from '@/components/ui'
import { Plus, Trash2 } from 'lucide-react'
import { fmt } from '@/lib/utils'
import type { Donor } from '@/types'

export default function DonorsPage() {
  const { activeProject, isAdmin } = useApp()
  const supabase = createClient()
  const [donors, setDonors] = useState<Donor[]>([])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name:'', type:'Government', contact:'', email:'', amount:'', status:'active', due:'', notes:'' })

  const load = useCallback(async () => {
    if (!activeProject) return
    const { data } = await supabase.from('donors').select('*').eq('project_id', activeProject.id).order('created_at', { ascending: false })
    setDonors((data ?? []) as Donor[])
  }, [activeProject]) // eslint-disable-line

  useEffect(() => { load() }, [load])

  const addDonor = async () => {
    if (!form.name || !activeProject) return
    setSaving(true)
    await supabase.from('donors').insert({
      project_id: activeProject.id, name: form.name, donor_type: form.type,
      contact_person: form.contact || null, email: form.email || null,
      grant_amount_usd: parseFloat(form.amount) || null, status: form.status,
      report_due: form.due || null, notes: form.notes || null
    })
    setForm({ name:'', type:'Government', contact:'', email:'', amount:'', status:'active', due:'', notes:'' })
    setOpen(false); setSaving(false); load()
  }

  const removeDonor = async (id: string) => {
    await supabase.from('donors').delete().eq('id', id); load()
  }

  if (!activeProject) return <div className="text-gray-400 text-sm p-4">Select a project first.</div>

  const totalSecured = donors.reduce((a, d) => a + (d.grant_amount_usd ?? 0), 0)

  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">Projects › {activeProject.name} › Donors & Funders</div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Donors & Funders</h1>
          <div className="text-xs text-gray-400">{donors.length} funder{donors.length!==1?'s':''} · {fmt(totalSecured)} total secured</div>
        </div>
        {isAdmin && <Button variant="primary" size="sm" onClick={() => setOpen(true)}><Plus size={13}/>Add funder</Button>}
      </div>

      {/* Cards grid */}
      {donors.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {donors.map(d => (
            <div key={d.id} className="bg-white border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <div className="font-bold text-sm text-gray-900">{d.name}</div>
                {statusBadge(d.status ?? 'active')}
              </div>
              <div className="text-xs text-gray-400 mb-3">{d.donor_type}</div>
              {d.contact_person && <div className="text-xs text-gray-500 mb-1">Contact: {d.contact_person}</div>}
              {d.email && <div className="text-xs text-indigo-600 mb-2">{d.email}</div>}
              {d.grant_amount_usd && <div className="text-lg font-bold text-emerald-600 mb-2">{fmt(d.grant_amount_usd)}</div>}
              {d.report_due && <div className="text-xs text-gray-400">Report due: {d.report_due}</div>}
              {d.notes && <div className="text-xs text-gray-400 italic mt-1">{d.notes}</div>}
              {isAdmin && (
                <button onClick={() => removeDonor(d.id)} className="mt-2 text-red-300 hover:text-red-500"><Trash2 size={13}/></button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Grant pipeline table */}
      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">Grant pipeline</div>
        {donors.length === 0
          ? <EmptyState title="No donors added" sub="Add grant makers, foundations, and donors to track relationships"/>
          : (
            <Table headers={['Funder','Grant amount','Status','Report due','Notes']}>
              {donors.map(d => (
                <TR key={d.id}>
                  <TD><span className="font-medium">{d.name}</span><div className="text-xs text-gray-400">{d.donor_type}</div></TD>
                  <TD><span className="font-bold text-emerald-600">{d.grant_amount_usd ? fmt(d.grant_amount_usd) : '—'}</span></TD>
                  <TD>{statusBadge(d.status ?? 'active')}</TD>
                  <TD>{d.report_due ?? '—'}</TD>
                  <TD className="text-xs text-gray-400">{d.notes ?? '—'}</TD>
                </TR>
              ))}
            </Table>
          )
        }
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add donor / funder"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={addDonor} disabled={saving}>{saving?'Saving…':'Add funder'}</Button></>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><Input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="U.S. Embassy Yaoundé"/></Field>
            <Field label="Type"><Select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}><option>Government</option><option>Foundation</option><option>Individual donor</option><option>Corporate sponsor</option><option>Church / Faith org</option><option>UN / INGO</option></Select></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact person"><Input value={form.contact} onChange={e=>setForm(f=>({...f,contact:e.target.value}))} placeholder="Public Affairs Section"/></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Grant amount (USD)"><Input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} min="0"/></Field>
            <Field label="Status"><Select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="active">Active grant</option><option value="prospect">Prospect</option><option value="completed">Completed</option></Select></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Report due"><Input type="date" value={form.due} onChange={e=>setForm(f=>({...f,due:e.target.value}))}/></Field>
            <Field label="Notes"><Input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Optional"/></Field>
          </div>
        </div>
      </Modal>
    </div>
  )
}
