'use client'
import { useEffect, useState } from 'react'
import { useApp } from '@/hooks/useApp'
import { useLang } from '@/context/LangContext'
import { withTimeout } from '@/lib/withTimeout'
import { createClient } from '../../../../lib/supabase'
import { Button, Modal, Field, Input, Select, Textarea, Card, EmptyState, Alert } from '@/components/ui'
import { Plus, CheckCircle, Circle } from 'lucide-react'
import type { SchedulePhase, Milestone } from '@/types'

const TAG_COLORS: Record<string, string> = {
  english:'bg-indigo-50 text-indigo-700', culture:'bg-violet-50 text-violet-700',
  skills:'bg-amber-50 text-amber-700', steam:'bg-cyan-50 text-cyan-700',
  intensive:'bg-emerald-50 text-emerald-700', assessment:'bg-red-50 text-red-700',
  relief:'bg-cyan-50 text-cyan-700', distribution:'bg-cyan-50 text-cyan-700',
  admin:'bg-gray-100 text-gray-600', other:'bg-gray-100 text-gray-500',
}

export default function SchedulePage() {
  const { activeProject, isAdmin } = useApp()
  const { t } = useLang()
  const supabase = createClient()
  const [phases, setPhases] = useState<SchedulePhase[]>([])
  // Minimal error slot: these screens had no way to report a failed or
  // stalled write, so a hang left the button spinning with no explanation.
  const [opError, setOpError] = useState<string | null>(null)
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [openPhase, setOpenPhase] = useState(false)
  const [saving, setSaving] = useState(false)
  const [phaseForm, setPhaseForm] = useState({ name:'', period:'', tag:'english', activities:'' })
  const [msForm, setMsForm] = useState({ title:'', date:'' })

  // Bumped by mutations to re-run the fetch below. The effect owns the query so
  // a project switch mid-flight cannot land stale rows.
  const [reloadKey, setReloadKey] = useState(0)
  const load = () => setReloadKey(k => k + 1)

  useEffect(() => {
    if (!activeProject) return
    let cancelled = false
    ;(async () => {
      const [phaseR, msR] = await Promise.all([
        supabase.from('schedule_phases').select('*, phase_activities(*)').eq('project_id', activeProject.id).order('sort_order'),
        supabase.from('milestones').select('*').eq('project_id', activeProject.id).order('due_date')
      ])
      if (cancelled) return
      setPhases((phaseR.data ?? []) as SchedulePhase[])
      setMilestones((msR.data ?? []) as Milestone[])
    })()
    return () => { cancelled = true }
  }, [activeProject, reloadKey]) // eslint-disable-line

  const addPhase = async () => {
    if (!phaseForm.name || !activeProject) return
    setSaving(true)
    const raced = await withTimeout(Promise.resolve(supabase.from('schedule_phases').insert({
      project_id: activeProject.id, name: phaseForm.name,
      period: phaseForm.period || null, tag: phaseForm.tag,
      sort_order: phases.length + 1
    }).select().single()))
    if (raced.timedOut) {
      setSaving(false)
      return setOpError(t.procErrors.timeout)
    }
    const { data: ph } = raced.value
    if (ph && phaseForm.activities) {
      const acts = phaseForm.activities.split('\n').map((a, i) => ({ phase_id: ph.id, description: a.trim(), sort_order: i+1 })).filter(a => a.description)
      if (acts.length > 0) await supabase.from('phase_activities').insert(acts)
    }
    setPhaseForm({ name:'', period:'', tag:'english', activities:'' })
    setOpenPhase(false); setSaving(false); load()
  }

  const addMilestone = async () => {
    if (!msForm.title || !activeProject) return
    await supabase.from('milestones').insert({
      project_id: activeProject.id, title: msForm.title,
      due_date: msForm.date || null, status: 'upcoming'
    })
    setMsForm({ title:'', date:'' }); load()
  }

  const toggleMilestone = async (m: Milestone) => {
    const newStatus = m.status === 'done' ? 'upcoming' : 'done'
    await supabase.from('milestones').update({ status: newStatus, completed_at: newStatus === 'done' ? new Date().toISOString() : null }).eq('id', m.id)
    load()
  }

  if (!activeProject) return <div className="text-gray-400 text-sm p-4">{t.selectProjectFirst}</div>

  const done = milestones.filter(m => m.status === 'done').length

  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">{t.projects} › {activeProject.name} › {t.schedule}</div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t.scheduleAndMilestones}</h1>
          <div className="text-xs text-gray-400">{phases.length} {t.phases} · {done}/{milestones.length} {t.milestonesDone}</div>
        </div>
        {isAdmin && <Button variant="primary" size="sm" onClick={() => setOpenPhase(true)}><Plus size={13}/>{t.addPhase}</Button>}
      </div>

      {/* Phases */}
      {phases.length === 0
        ? <EmptyState title={t.noPhases} sub={t.noPhasesSub}/>
        : (
          <div className="space-y-3 mb-6">
            {phases.map(ph => (
              <Card key={ph.id}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-sm text-gray-900 flex-1">{ph.name}</span>
                  {ph.tag && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TAG_COLORS[ph.tag] ?? 'bg-gray-100 text-gray-500'}`}>{t.phaseTags[ph.tag] ?? ph.tag}</span>}
                  {ph.period && <span className="text-xs text-gray-400">{ph.period}</span>}
                </div>
                {(ph.activities ?? []).map(a => (
                  <div key={a.id} className="flex gap-2 py-1.5 border-b border-gray-50 last:border-0 text-sm text-gray-600">
                    <span className="text-gray-300">→</span>{a.description}
                  </div>
                ))}
              </Card>
            ))}
          </div>
        )
      }

      {/* Milestones */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold text-sm text-gray-900">{t.milestones}</div>
          <div className="text-xs text-gray-400">{done}/{milestones.length} {t.complete_}</div>
        </div>
        {isAdmin && (
          <div className="flex gap-2 mb-4">
            <Input value={msForm.title} onChange={e=>setMsForm(f=>({...f,title:e.target.value}))} placeholder={t.milestoneName} className="flex-1"/>
            <input type="date" value={msForm.date} onChange={e=>setMsForm(f=>({...f,date:e.target.value}))} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
            <Button variant="primary" size="sm" onClick={addMilestone}>{t.add}</Button>
          </div>
        )}
        {milestones.length === 0
          ? <div className="text-sm text-gray-400">{t.noMilestones}</div>
          : (
            <div className="space-y-2">
              {milestones.map(m => (
                <div key={m.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <button onClick={() => isAdmin && toggleMilestone(m)} className={`flex-shrink-0 transition-colors ${m.status==='done'?'text-emerald-500':'text-gray-300 hover:text-gray-400'}`}>
                    {m.status==='done' ? <CheckCircle size={16}/> : <Circle size={16}/>}
                  </button>
                  <div className="flex-1">
                    <div className={`text-sm font-medium ${m.status==='done'?'line-through text-gray-400':'text-gray-800'}`}>{m.title}</div>
                    {m.due_date && <div className="text-xs text-gray-400">{m.due_date}</div>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.status==='done'?'bg-emerald-50 text-emerald-700':m.status==='overdue'?'bg-red-50 text-red-700':'bg-amber-50 text-amber-700'}`}>{t.milestoneStatuses[m.status] ?? m.status}</span>
                </div>
              ))}
            </div>
          )
        }
      </Card>

      <Modal open={openPhase} onClose={() => setOpenPhase(false)} title={t.addSchedulePhase}
        footer={<><Button variant="secondary" onClick={() => setOpenPhase(false)}>{t.cancel}</Button><Button variant="primary" onClick={addPhase} disabled={saving}>{saving ? t.saving : t.addPhase}</Button></>}>
        <div className="space-y-3">
          <Alert>{opError}</Alert>
          <Field label={t.phaseName}><Input value={phaseForm.name} onChange={e=>setPhaseForm(f=>({...f,name:e.target.value}))} placeholder="Module 1 — English Communication Essentials"/></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.period}><Input value={phaseForm.period} onChange={e=>setPhaseForm(f=>({...f,period:e.target.value}))} placeholder="Sep–Nov 2026"/></Field>
            <Field label={t.tag}>
              <Select value={phaseForm.tag} onChange={e=>setPhaseForm(f=>({...f,tag:e.target.value}))}>
                {Object.keys(TAG_COLORS).map(k => (
                  <option key={k} value={k}>{t.phaseTags[k] ?? k}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={t.activities}><Textarea value={phaseForm.activities} onChange={e=>setPhaseForm(f=>({...f,activities:e.target.value}))} placeholder="Pronunciation and vocabulary&#10;Twice weekly · 3 hours&#10;Monthly Culture Club" rows={4}/></Field>
        </div>
      </Modal>
    </div>
  )
}
