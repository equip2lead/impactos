'use client'
import { useEffect, useState, useCallback } from 'react'
import { useApp } from '@/hooks/useApp'
import { createClient } from '../../../../lib/supabase'
import { Button, Modal, Field, Input, Card, ProgressBar, EmptyState } from '@/components/ui'
import { Plus, Trash2, PlusCircle } from 'lucide-react'
import type { KPI } from '@/types'

export default function KPIsPage() {
  const { activeProject, isAdmin } = useApp()
  const supabase = createClient()
  const [kpis, setKpis] = useState<KPI[]>([])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name:'', target:'', current:'0', unit:'' })

  const load = useCallback(async () => {
    if (!activeProject) return
    const { data } = await supabase.from('kpis').select('*').eq('project_id', activeProject.id).order('sort_order')
    setKpis((data ?? []) as KPI[])
  }, [activeProject]) // eslint-disable-line

  useEffect(() => { load() }, [load])

  const addKPI = async () => {
    if (!form.name || !form.target || !activeProject) return
    setSaving(true)
    await supabase.from('kpis').insert({
      project_id: activeProject.id, name: form.name,
      target_val: parseFloat(form.target), current_val: parseFloat(form.current) || 0,
      unit: form.unit || null, sort_order: kpis.length + 1
    })
    setForm({ name:'', target:'', current:'0', unit:'' })
    setOpen(false); setSaving(false); load()
  }

  const increment = async (kpi: KPI) => {
    await supabase.from('kpis').update({ current_val: kpi.current_val + 1 }).eq('id', kpi.id); load()
  }

  const deleteKPI = async (id: string) => {
    await supabase.from('kpis').delete().eq('id', id); load()
  }

  if (!activeProject) return <div className="text-gray-400 text-sm p-4">Select a project first.</div>

  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">Projects › {activeProject.name} › KPIs & M&E</div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">KPIs & M&E</h1>
          <div className="text-xs text-gray-400">Monitor & Evaluation — {kpis.length} indicators tracked</div>
        </div>
        {isAdmin && <Button variant="primary" size="sm" onClick={() => setOpen(true)}><Plus size={13}/>Add KPI</Button>}
      </div>

      {kpis.length === 0
        ? <EmptyState title="No KPIs yet" sub="Add indicators to track program performance" action={isAdmin ? <Button variant="primary" size="sm" onClick={() => setOpen(true)}>Add first KPI</Button> : undefined}/>
        : (
          <Card>
            <div className="space-y-5">
              {kpis.map(k => {
                const pct = k.target_val > 0 ? Math.min(100, Math.round((k.current_val / k.target_val) * 100)) : 0
                const color = pct >= 100 ? '#059669' : pct >= 60 ? (activeProject.color || '#4338CA') : '#D97706'
                return (
                  <div key={k.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">{k.name}</span>
                        <span className="text-xs text-gray-400">{k.unit}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">{k.current_val}/{k.target_val}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: color+'20', color }}>{pct}%</span>
                        {isAdmin && <>
                          <button onClick={() => increment(k)} className="text-gray-400 hover:text-indigo-600 transition-colors"><PlusCircle size={14}/></button>
                          <button onClick={() => deleteKPI(k.id)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={13}/></button>
                        </>}
                      </div>
                    </div>
                    <ProgressBar value={k.current_val} max={k.target_val} color={color} height={6}/>
                  </div>
                )
              })}
            </div>
          </Card>
        )
      }

      <Modal open={open} onClose={() => setOpen(false)} title="Add custom KPI"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={addKPI} disabled={saving}>{saving?'Saving…':'Add KPI'}</Button></>}>
        <div className="space-y-3">
          <Field label="KPI name"><Input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Culture activities logged"/></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Target value"><Input type="number" value={form.target} onChange={e=>setForm(f=>({...f,target:e.target.value}))} placeholder="0"/></Field>
            <Field label="Current value"><Input type="number" value={form.current} onChange={e=>setForm(f=>({...f,current:e.target.value}))} placeholder="0"/></Field>
            <Field label="Unit"><Input value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))} placeholder="events, %, people"/></Field>
          </div>
        </div>
      </Modal>
    </div>
  )
}
