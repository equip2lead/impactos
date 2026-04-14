'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/hooks/useApp'
import { createClient } from '../../../../lib/supabase'
import { Button, Modal, Field, Input, Select, Table, TR, TD, EmptyState, Tabs } from '@/components/ui'
import { statusBadge } from '@/components/ui'
import { Plus, Trash2 } from 'lucide-react'
import type { Participant, BulkEntry } from '@/types'

export default function ParticipantsPage() {
  const { activeProject, isAdmin } = useApp()
  const supabase = createClient()
  const [tab, setTab] = useState('Named roster')
  const [participants, setParticipants] = useState<Participant[]>([])
  const [bulkEntries, setBulkEntries] = useState<BulkEntry[]>([])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({ fn:'', ln:'', age:'', gender:'F', group:'', level:'', status:'Active' })
  const [bulkForm, setBulkForm] = useState({ date: new Date().toISOString().slice(0,10), location:'', count:'', category:'IDPs — food', notes:'' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const setBulk = (k: string, v: string) => setBulkForm(f => ({ ...f, [k]: v }))

  const load = async () => {
    if (!activeProject) return
    const [partsR, bulkR] = await Promise.all([
      supabase.from('participants').select('*').eq('project_id', activeProject.id).order('created_at', { ascending: false }),
      supabase.from('bulk_beneficiary_entries').select('*').eq('project_id', activeProject.id).order('entry_date', { ascending: false }),
    ])
    setParticipants((partsR.data ?? []) as Participant[])
    setBulkEntries((bulkR.data ?? []) as BulkEntry[])
  }

  useEffect(() => { load() }, [activeProject]) // eslint-disable-line

  const addParticipant = async () => {
    if (!form.fn || !form.ln || !activeProject) return
    setSaving(true)
    await supabase.from('participants').insert({
      project_id: activeProject.id, first_name: form.fn, last_name: form.ln,
      age: parseInt(form.age) || null, gender: form.gender,
      group_location: form.group || null, baseline_level: form.level || null, status: form.status
    })
    setForm({ fn:'', ln:'', age:'', gender:'F', group:'', level:'', status:'Active' })
    setOpen(false); setSaving(false); load()
  }

  const removeParticipant = async (id: string) => {
    await supabase.from('participants').delete().eq('id', id); load()
  }

  const addBulk = async () => {
    if (!bulkForm.count || !activeProject) return
    setSaving(true)
    await supabase.from('bulk_beneficiary_entries').insert({
      project_id: activeProject.id, entry_date: bulkForm.date,
      location: bulkForm.location || null, count: parseInt(bulkForm.count),
      category: bulkForm.category, notes: bulkForm.notes || null
    })
    setBulkForm({ date: new Date().toISOString().slice(0,10), location:'', count:'', category:'IDPs — food', notes:'' })
    setBulkOpen(false); setSaving(false); load()
  }

  const removeBulk = async (id: string) => {
    await supabase.from('bulk_beneficiary_entries').delete().eq('id', id); load()
  }

  const filtered = participants.filter(p =>
    `${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase())
  )
  const totalBulk = bulkEntries.reduce((a, e) => a + (e.count ?? 0), 0)
  const female = participants.filter(p => p.gender === 'F').length
  const target = activeProject?.target_count ?? 50

  if (!activeProject) return <div className="text-gray-400 text-sm">Select a project first.</div>

  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">Projects › {activeProject.name} › Participants</div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Participants</h1>
          <div className="text-xs text-gray-400 mt-0.5">
            {participants.length} named · {totalBulk.toLocaleString()} bulk beneficiaries · {female} female ({participants.length > 0 ? Math.round((female/participants.length)*100) : 0}%)
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            {tab === 'Named roster' && <Button variant="primary" size="sm" onClick={() => setOpen(true)}><Plus size={13} /> Add participant</Button>}
            {tab === 'Bulk count' && <Button variant="primary" size="sm" onClick={() => setBulkOpen(true)}><Plus size={13} /> Log entry</Button>}
          </div>
        )}
      </div>

      <Tabs tabs={['Named roster', 'Bulk count']} active={tab} onChange={setTab} />

      {tab === 'Named roster' && (
        <>
          <div className="mb-3">
            <Input placeholder="Search participants…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
          </div>
          <Table headers={['Name','Age','Gender','Group / Location','Baseline','Status', isAdmin ? 'Actions' : '']}
            empty={filtered.length === 0}>
            {filtered.map(p => (
              <TR key={p.id}>
                <TD><span className="font-medium">{p.first_name} {p.last_name}</span></TD>
                <TD>{p.age ?? '—'}</TD>
                <TD>{p.gender === 'F' ? 'Female' : p.gender === 'M' ? 'Male' : 'Other'}</TD>
                <TD>{p.group_location ?? '—'}</TD>
                <TD>{p.baseline_level ? <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{p.baseline_level}</span> : '—'}</TD>
                <TD>{statusBadge(p.status ?? 'Active')}</TD>
                {isAdmin && <TD><button onClick={() => removeParticipant(p.id)} className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button></TD>}
              </TR>
            ))}
          </Table>
        </>
      )}

      {tab === 'Bulk count' && (
        <>
          <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4">
            <div className="text-sm text-gray-400 mb-1">Total beneficiaries reached</div>
            <div className="text-3xl font-bold text-gray-900">{totalBulk.toLocaleString()}</div>
          </div>
          <Table headers={['Date','Location','Category','Count','Notes',isAdmin?'Del':'']} empty={bulkEntries.length === 0}>
            {bulkEntries.map(e => (
              <TR key={e.id}>
                <TD>{e.entry_date}</TD>
                <TD>{e.location ?? '—'}</TD>
                <TD><span className="text-xs bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded-full font-medium">{e.category}</span></TD>
                <TD><span className="font-bold">{(e.count ?? 0).toLocaleString()}</span></TD>
                <TD>{e.notes ?? '—'}</TD>
                {isAdmin && <TD><button onClick={() => removeBulk(e.id)} className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button></TD>}
              </TR>
            ))}
          </Table>
        </>
      )}

      {/* Add participant modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="Add participant"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={addParticipant} disabled={saving}>{saving ? 'Saving…' : 'Add'}</Button></>}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name"><Input value={form.fn} onChange={e => set('fn', e.target.value)} placeholder="Amina" /></Field>
            <Field label="Last name"><Input value={form.ln} onChange={e => set('ln', e.target.value)} placeholder="Njoya" /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Age"><Input type="number" value={form.age} onChange={e => set('age', e.target.value)} min="1" /></Field>
            <Field label="Gender">
              <Select value={form.gender} onChange={e => set('gender', e.target.value)}>
                <option value="F">Female</option><option value="M">Male</option><option value="O">Other</option>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={e => set('status', e.target.value)}>
                <option>Active</option><option>Withdrawn</option><option>Graduated</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Group / Location"><Input value={form.group} onChange={e => set('group', e.target.value)} placeholder="Cité Verte" /></Field>
            <Field label="Baseline level"><Input value={form.level} onChange={e => set('level', e.target.value)} placeholder="A1, Beginner…" /></Field>
          </div>
        </div>
      </Modal>

      {/* Bulk entry modal */}
      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="Log bulk beneficiary count"
        footer={<><Button variant="secondary" onClick={() => setBulkOpen(false)}>Cancel</Button><Button variant="primary" onClick={addBulk} disabled={saving}>{saving ? 'Saving…' : 'Log entry'}</Button></>}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><Input type="date" value={bulkForm.date} onChange={e => setBulk('date', e.target.value)} /></Field>
            <Field label="Location"><Input value={bulkForm.location} onChange={e => setBulk('location', e.target.value)} placeholder="Mamfe Camp A" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Count"><Input type="number" value={bulkForm.count} onChange={e => setBulk('count', e.target.value)} min="0" /></Field>
            <Field label="Category">
              <Select value={bulkForm.category} onChange={e => setBulk('category', e.target.value)}>
                <option>IDPs — food</option><option>IDPs — medical</option><option>IDPs — shelter</option>
                <option>Students</option><option>Community members</option>
              </Select>
            </Field>
          </div>
          <Field label="Notes"><Input value={bulkForm.notes} onChange={e => setBulk('notes', e.target.value)} placeholder="Optional notes" /></Field>
        </div>
      </Modal>
    </div>
  )
}
