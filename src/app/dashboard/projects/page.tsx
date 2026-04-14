'use client'

import { useState } from 'react'
import { useApp } from '@/hooks/useApp'
import { createClient } from '../../../../lib/supabase'
import { Button, Modal, Field, Input, Select, Textarea, EmptyState } from '@/components/ui'
import { cn, fmt, pct } from '@/lib/utils'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { Project } from '@/types'

const COLORS = ['#4338CA','#059669','#0891B2','#7C3AED','#DC2626','#0A0A0A','#D97706']
const TYPES = ['education_training','humanitarian_relief','health','church_ministry','community_development','other']

export default function ProjectsPage() {
  const { projects, activeProject, setActiveProject, orgId, refreshProjects, isAdmin } = useApp()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [color, setColor] = useState(COLORS[0])
  const router = useRouter()
  const supabase = createClient()

  const [form, setForm] = useState({ name:'', type:'education_training', desc:'', start:'', end:'', budget:'', target:'', cats:'Personnel, Materials, Activities, Transportation, Administration' })
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleCreate = async () => {
    if (!form.name) return
    setSaving(true)
    const { data: proj, error } = await supabase.from('projects').insert({
      org_id: orgId, name: form.name, project_type: form.type,
      description: form.desc, start_date: form.start || null, end_date: form.end || null,
      budget_usd: parseFloat(form.budget) || null, target_count: parseInt(form.target) || null,
      color, status: 'Active'
    }).select().single()

    if (!error && proj) {
      // Seed budget categories
      const cats = form.cats.split(',').map((c, i) => ({
        project_id: proj.id, code: String.fromCharCode(65 + i), name: c.trim(), alloc_usd: 0, sort_order: i + 1
      }))
      await supabase.from('budget_categories').insert(cats)
      await refreshProjects()
      setActiveProject(proj)
      setOpen(false)
      setSaving(false)
      router.push('/dashboard')
    } else {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">Workspace › Projects</div>
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Projects</h1>
          <div className="text-sm text-gray-400">All programs across AFRILEAD</div>
        </div>
        {isAdmin && (
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus size={14} /> New project
          </Button>
        )}
      </div>

      {projects.length === 0 ? (
      <EmptyState title="No projects yet" sub="Create your first project to get started"
          action={isAdmin ? <Button variant="primary" size="sm" onClick={() => setOpen(true)}>Create project</Button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p: Project) => {
            const isActive = activeProject?.id === p.id
            return (
              <div
                key={p.id}
                onClick={() => { setActiveProject(p); router.push('/dashboard') }}
                className={cn(
                  'bg-white rounded-xl border cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 p-4',
                  isActive ? 'border-2 border-indigo-400' : 'border-gray-100'
                )}
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold mb-3" style={{ background: p.color || '#4338CA' }}>
                  {p.name.split(' ').slice(0,2).map((w:string) => w[0]).join('').toUpperCase()}
                </div>
                <div className="text-sm font-bold text-gray-900 mb-0.5">{p.name}</div>
                <div className="text-xs text-gray-400 mb-3">{p.project_type?.replace('_',' ')} · {p.start_date?.slice(0,4)}–{p.end_date?.slice(0,4)}</div>
                {p.budget_usd && (
                  <div className="text-xs text-gray-500 mb-1">Budget: <span className="font-semibold text-gray-900">{fmt(p.budget_usd)}</span></div>
                )}
                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ background: p.color || '#4338CA', width: '0%' }} />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-400">0 / {p.target_count ?? '?'} participants</span>
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', p.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                    {p.status}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Create new project"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={handleCreate} disabled={saving}>{saving ? 'Creating…' : 'Create project'}</Button></>}
      >
        <div className="space-y-3">
          <Field label="Project name"><Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. ACCESS YAOUNDÉ 2026–2028" /></Field>
          <Field label="Organisation">
            <Select value={form.type} onChange={e => set('type', e.target.value)}>
              {TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
            </Select>
          </Field>
          <Field label="Description"><Textarea value={form.desc} onChange={e => set('desc', e.target.value)} placeholder="Brief description…" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date"><Input type="date" value={form.start} onChange={e => set('start', e.target.value)} /></Field>
            <Field label="End date"><Input type="date" value={form.end} onChange={e => set('end', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Budget (USD)"><Input type="number" value={form.budget} onChange={e => set('budget', e.target.value)} placeholder="0" /></Field>
            <Field label="Participant target"><Input type="number" value={form.target} onChange={e => set('target', e.target.value)} placeholder="0" /></Field>
          </div>
          <Field label="Budget categories">
            <Input value={form.cats} onChange={e => set('cats', e.target.value)} placeholder="Personnel, Materials, Activities…" />
          </Field>
          <Field label="Project colour">
            <div className="flex gap-2 mt-1">
              {COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={cn('w-6 h-6 rounded-md transition-all', color === c && 'ring-2 ring-offset-1 ring-gray-900')}
                  style={{ background: c }} />
              ))}
            </div>
          </Field>
        </div>
      </Modal>
    </div>
  )
}
