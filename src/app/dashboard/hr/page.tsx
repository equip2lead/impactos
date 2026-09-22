'use client'
import { useEffect, useState, useCallback } from 'react'
import { useApp } from '@/hooks/useApp'
import { useLang } from '@/context/LangContext'
import { withTimeout } from '@/lib/withTimeout'
import { createClient } from '../../../../lib/supabase'
import { Button, Modal, Field, Input, Select, Table, TR, TD, Tabs, EmptyState, Alert } from '@/components/ui'
import { statusBadge } from '@/components/ui'
import { Plus, Trash2, PlusCircle } from 'lucide-react'
import { fmt } from '@/lib/utils'
import type { Staff, StaffAssignment, Payroll, LeaveRequest, StaffAttendanceSession } from '@/types'

const ORG_ID = 'a0000000-0000-0000-0000-000000000001'

export default function HRPage() {
  const { activeProject, isAdmin, isFinance, orgId } = useApp()
  const { t } = useLang()
  const supabase = createClient()
  const [tab, setTab] = useState('Roster')
  // Minimal error slot: these screens had no way to report a failed or
  // stalled write, so a hang left the button spinning with no explanation.
  const [opError, setOpError] = useState<string | null>(null)
  const [staff, setStaff] = useState<(Staff & { assignments: StaffAssignment[] })[]>([])
  const [payroll, setPayroll] = useState<Payroll[]>([])
  const [leave, setLeave] = useState<LeaveRequest[]>([])
  const [staffSessions, setStaffSessions] = useState<StaffAttendanceSession[]>([])
  const [attGrid, setAttGrid] = useState<Record<string, 'p'|'a'|''>>({})
  const [openModal, setOpenModal] = useState<string|null>(null)
  const [saving, setSaving] = useState(false)

  const [staffForm, setStaffForm] = useState({ fn:'', ln:'', email:'', role:'', type:'full-time', salary:'', end:'', status:'active' })
  const [assignForm, setAssignForm] = useState({ staff_id:'', role:'', pct:'100', salary:'' })
  const [payForm, setPayForm] = useState({ staff_id:'', amount:'', period:'', date: new Date().toISOString().slice(0,10), notes:'' })
  const [leaveForm, setLeaveForm] = useState({ staff_id:'', from:'', to:'', type:'Annual leave', status:'pending' })
  const [sessForm, setSessForm] = useState({ date: new Date().toISOString().slice(0,10), type:'Training' })

  const load = useCallback(async () => {
    if (!activeProject) return
    const [staffR, assignR, payR, leaveR, sessR] = await Promise.all([
      supabase.from('staff').select('*').eq('org_id', ORG_ID).order('first_name'),
      supabase.from('staff_project_assignments').select('*').eq('project_id', activeProject.id).eq('is_active', true),
      supabase.from('payroll').select('*, staff(first_name,last_name)').eq('project_id', activeProject.id).order('paid_date', { ascending: false }),
      supabase.from('leave_requests').select('*, staff(first_name,last_name)').order('created_at', { ascending: false }),
      supabase.from('staff_attendance_sessions').select('*').eq('project_id', activeProject.id).order('session_date', { ascending: false }),
    ])
    const allStaff = (staffR.data ?? []) as Staff[]
    const assignments = (assignR.data ?? []) as StaffAssignment[]
    const merged = allStaff.map(s => ({ ...s, assignments: assignments.filter(a => a.staff_id === s.id) }))
    setStaff(merged)
    setPayroll((payR.data ?? []) as Payroll[])
    setLeave((leaveR.data ?? []) as LeaveRequest[])
    setStaffSessions((sessR.data ?? []) as StaffAttendanceSession[])
  }, [activeProject]) // eslint-disable-line

  useEffect(() => { load() }, [load])

  const addStaff = async () => {
    if (!staffForm.fn || !staffForm.ln) return
    setSaving(true)
    const raced = await withTimeout(Promise.resolve(supabase.from('staff').insert({
      org_id: ORG_ID, first_name: staffForm.fn, last_name: staffForm.ln,
      email: staffForm.email || null, role_title: staffForm.role || null,
      staff_type: staffForm.type, base_salary_usd: parseFloat(staffForm.salary) || 0,
      contract_end: staffForm.end || null, status: staffForm.status
    }).select().single()))
    if (raced.timedOut) {
      setSaving(false)
      return setOpError('That took too long. Check your connection and try again.')
    }
    const { data: newStaff } = raced.value
    // Auto-assign to current project
    if (newStaff && activeProject) {
      await supabase.from('staff_project_assignments').insert({
        staff_id: newStaff.id, project_id: activeProject.id,
        role_in_project: staffForm.role || null, commitment_pct: 100,
        salary_usd: parseFloat(staffForm.salary) || 0, is_active: true
      })
    }
    setStaffForm({ fn:'', ln:'', email:'', role:'', type:'full-time', salary:'', end:'', status:'active' })
    setOpenModal(null); setSaving(false); load()
  }

  const addPayroll = async () => {
    if (!payForm.staff_id || !payForm.amount || !activeProject) return
    setSaving(true)
    await supabase.from('payroll').insert({
      staff_id: payForm.staff_id, project_id: activeProject.id,
      amount_usd: parseFloat(payForm.amount), period: payForm.period,
      paid_date: payForm.date, notes: payForm.notes || null
    })
    setPayForm({ staff_id:'', amount:'', period:'', date: new Date().toISOString().slice(0,10), notes:'' })
    setOpenModal(null); setSaving(false); load()
  }

  const addLeave = async () => {
    if (!leaveForm.staff_id || !leaveForm.from) return
    setSaving(true)
    await supabase.from('leave_requests').insert({
      staff_id: leaveForm.staff_id, from_date: leaveForm.from,
      to_date: leaveForm.to || null, leave_type: leaveForm.type, status: leaveForm.status
    })
    setLeaveForm({ staff_id:'', from:'', to:'', type:'Annual leave', status:'pending' })
    setOpenModal(null); setSaving(false); load()
  }


  // An approval with no pending state looks identical to an approval that was
  // refused: the request still reads pending. Disabling the control
  // while the write is in flight is the difference between the two.
  const [busyId, setBusyId] = useState<string | null>(null)

  const approveLeave = async (id: string) => {
    if (busyId) return
    setBusyId(id)
    await supabase.from('leave_requests').update({ status: 'approved' }).eq('id', id)
    setBusyId(null); load()
  }

  const toggleAtt = (id: string) => {
    const states: ('p'|'a'|'')[] = ['','p','a']
    const cur = attGrid[id] ?? ''
    const next = states[(states.indexOf(cur)+1)%3]
    setAttGrid(g => ({ ...g, [id]: next }))
  }

  const saveStaffSession = async () => {
    if (!activeProject) return
    const assigned = staff.filter(s => s.assignments.length > 0)
    let present = 0, absent = 0
    assigned.forEach(s => { if(attGrid[s.id]==='p') present++; else if(attGrid[s.id]==='a') absent++ })
    // An alert() blocks the page and says nothing the error slot cannot.
    if (present + absent === 0) return setOpError(t.markAtLeastOneStaff)
    setOpError(null)
    await supabase.from('staff_attendance_sessions').insert({
      project_id: activeProject.id, session_date: sessForm.date,
      session_type: sessForm.type, present_count: present, absent_count: absent
    })
    setAttGrid({}); load()
  }

  // Same double-count risk as the KPI increment: the count on screen is stale
  // until the refetch lands, so a second click would send the same +1 again.
  const addPD = async (staffId: string, current: number) => {
    if (busyId) return
    setBusyId(staffId)
    await supabase.from('staff').update({ pd_events: (current||0)+1 }).eq('id', staffId)
    setBusyId(null); load()
  }

  const removeStaff = async (staffId: string) => {
    if (!activeProject || busyId) return
    setBusyId(staffId)
    await supabase.from('staff_project_assignments').update({ is_active: false }).eq('staff_id', staffId).eq('project_id', activeProject.id)
    setBusyId(null); load()
  }

  if (!activeProject) return <div className="text-gray-400 text-sm p-4">{t.selectProjectFirst}</div>

  const assignedStaff = staff.filter(s => s.assignments.length > 0)
  // Keys stay English so `tab` and the DB-facing comparisons below are stable
  // across a language switch; only the label is translated. Same rule governs
  // the <option> values in this file, whose text is written to the database —
  // see "A string that carries identity needs its own handle" in AGENTS.md.
  const tabs = ['Roster', 'Staff attendance', ...(isFinance ? ['Payroll', 'Leave'] : [])]
    .map(k => ({ key: k, label: t.hrTabs[k] ?? k }))

  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">{t.projects} › {activeProject.name} › {t.hrStaff}</div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t.hrStaff}</h1>
          <div className="text-xs text-gray-400">{assignedStaff.length} {t.assignedToProject} · {staff.length} {t.totalInOrg}</div>
        </div>
        {isAdmin && <Button variant="primary" size="sm" onClick={() => setOpenModal('staff')}><Plus size={13}/>{t.addStaff}</Button>}
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'Roster' && (
        <Table headers={[t.name, t.role, t.type, t.status, t.contractEndShort, t.salaryMo, t.pd, isAdmin ? t.actions : '']} empty={assignedStaff.length === 0}>
          {assignedStaff.map(s => (
            <TR key={s.id}>
              <TD><span className="font-medium">{s.first_name} {s.last_name}</span>{s.email && <div className="text-xs text-gray-400">{s.email}</div>}</TD>
              <TD>{s.role_title ?? '—'}</TD>
              <TD>{t.staffTypes[s.staff_type ?? ''] ?? s.staff_type}</TD>
              <TD>{statusBadge(s.status ?? 'active')}</TD>
              <TD className="text-xs text-gray-400">{s.contract_end ?? '—'}</TD>
              <TD>{s.base_salary_usd ? fmt(s.base_salary_usd) : '—'}</TD>
              <TD><span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full">{s.pd_events ?? 0}</span></TD>
              {isAdmin && (
                <TD>
                  <div className="flex gap-1">
                    <button onClick={() => addPD(s.id, s.pd_events ?? 0)} disabled={busyId === s.id} className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded text-gray-600 flex items-center gap-1 disabled:opacity-40 disabled:cursor-wait"><PlusCircle size={10}/>{t.pd}</button>
                    <button onClick={() => removeStaff(s.id)} disabled={busyId === s.id} className="text-red-400 hover:text-red-600 ml-1 disabled:opacity-40 disabled:cursor-wait"><Trash2 size={13}/></button>
                  </div>
                </TD>
              )}
            </TR>
          ))}
        </Table>
      )}

      {tab === 'Staff attendance' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="font-semibold text-sm text-gray-900 mb-3">{t.signInSheet}</div>
            {/* The other opError slot lives inside the add-staff modal, which is
                never open on this tab, so the two cannot both render. */}
            {opError && <div className="mb-3"><Alert>{opError}</Alert></div>}
            <div className="flex gap-3 mb-4 flex-wrap items-end">
              <Field label={t.sessionDate} className="w-auto"><Input type="date" value={sessForm.date} onChange={e=>setSessForm(f=>({...f,date:e.target.value}))} style={{width:'auto'}}/></Field>
              <Field label={t.sessionType} className="w-auto"><Select value={sessForm.type} onChange={e=>setSessForm(f=>({...f,type:e.target.value}))} style={{width:'auto'}}>{Object.keys(t.sessionTypes).map(k => <option key={k} value={k}>{t.sessionTypes[k]}</option>)}</Select></Field>
              {isAdmin && <Button variant="primary" size="sm" onClick={saveStaffSession}>{t.saveSignIn}</Button>}
            </div>
            {assignedStaff.length === 0 ? <div className="text-sm text-gray-400">{t.addStaffFirst}</div> : (
              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-2">
                {assignedStaff.map(s => {
                  const st = attGrid[s.id] ?? ''
                  return (
                    <button key={s.id} onClick={() => isAdmin && toggleAtt(s.id)} title={`${s.first_name} ${s.last_name}`}
                      className={`w-9 h-9 rounded-full text-xs font-bold transition-all border ${st==='p'?'bg-emerald-50 text-emerald-700 border-emerald-200':st==='a'?'bg-red-50 text-red-600 border-red-200':'bg-gray-50 text-gray-400 border-gray-200'}`}>
                      {s.first_name[0]}{s.last_name[0]}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="flex gap-4 mt-3 text-xs text-gray-400">
              <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1"/>{t.present}</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1"/>{t.absent}</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-gray-200 mr-1"/>{t.notMarked}</span>
            </div>
          </div>
          <Table headers={[t.date, t.sessionType, t.present, t.absent, t.rate]} empty={staffSessions.length === 0}>
            {staffSessions.map(s => {
              const tot = (s.present_count??0)+(s.absent_count??0)
              const rate = tot > 0 ? Math.round(((s.present_count??0)/tot)*100) : 0
              return (
                <TR key={s.id}>
                  <TD>{s.session_date}</TD><TD>{t.sessionTypes[s.session_type ?? ''] ?? s.session_type}</TD>
                  <TD>{s.present_count??0}</TD><TD>{s.absent_count??0}</TD>
                  <TD><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${rate>=80?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>{rate}%</span></TD>
                </TR>
              )
            })}
          </Table>
        </div>
      )}

      {tab === 'Payroll' && isFinance && (
        <div className="space-y-4">
          <div className="flex justify-end"><Button variant="finance" size="sm" onClick={()=>setOpenModal('payroll')}><Plus size={13}/>{t.logPayment}</Button></div>
          <Table headers={[t.date, t.staffMember, t.period, t.amount, t.notes]} empty={payroll.length===0}>
            {payroll.map(p => (
              <TR key={p.id}>
                <TD>{p.paid_date}</TD>
                <TD>{p.staff ? `${(p.staff as {first_name:string;last_name:string}).first_name} ${(p.staff as {first_name:string;last_name:string}).last_name}` : '—'}</TD>
                <TD>{p.period ?? '—'}</TD>
                <TD><span className="font-bold text-amber-700">{fmt(p.amount_usd)}</span></TD>
                <TD>{p.notes ?? '—'}</TD>
              </TR>
            ))}
          </Table>
        </div>
      )}

      {tab === 'Leave' && isFinance && (
        <div className="space-y-4">
          <div className="flex justify-end"><Button variant="secondary" size="sm" onClick={()=>setOpenModal('leave')}><Plus size={13}/>{t.requestLeave}</Button></div>
          <Table headers={[t.staff, t.from, t.to, t.type, t.status, t.actions]} empty={leave.length===0}>
            {leave.map(r => (
              <TR key={r.id}>
                <TD>{r.staff ? `${(r.staff as {first_name:string;last_name:string}).first_name} ${(r.staff as {first_name:string;last_name:string}).last_name}` : '—'}</TD>
                <TD>{r.from_date ?? '—'}</TD><TD>{r.to_date ?? '—'}</TD>
                <TD>{t.leaveTypes[r.leave_type ?? ''] ?? r.leave_type}</TD>
                <TD>{statusBadge(r.status)}</TD>
                <TD>{r.status === 'pending' && isAdmin && <button onClick={()=>approveLeave(r.id)} disabled={busyId === r.id} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-wait">{t.approve}</button>}</TD>
              </TR>
            ))}
          </Table>
        </div>
      )}

      {/* Add staff modal */}
      <Modal open={openModal==='staff'} onClose={()=>setOpenModal(null)} title={t.addStaffMember}
        footer={<><Button variant="secondary" onClick={()=>setOpenModal(null)}>{t.cancel}</Button><Button variant="primary" onClick={addStaff} disabled={saving}>{saving ? t.saving : t.addStaff}</Button></>}>
        <div className="space-y-3">
          <Alert>{opError}</Alert>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.firstName}><Input value={staffForm.fn} onChange={e=>setStaffForm(f=>({...f,fn:e.target.value}))} placeholder="Denis"/></Field>
            <Field label={t.lastName}><Input value={staffForm.ln} onChange={e=>setStaffForm(f=>({...f,ln:e.target.value}))} placeholder="Ekobena"/></Field>
          </div>
          <Field label={t.roleTitle}><Input value={staffForm.role} onChange={e=>setStaffForm(f=>({...f,role:e.target.value}))} placeholder="Academic Director"/></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.email}><Input type="email" value={staffForm.email} onChange={e=>setStaffForm(f=>({...f,email:e.target.value}))}/></Field>
            <Field label={t.type}><Select value={staffForm.type} onChange={e=>setStaffForm(f=>({...f,type:e.target.value}))}>{Object.keys(t.staffTypes).map(k => <option key={k} value={k}>{t.staffTypes[k]}</option>)}</Select></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.salaryPerMonth}><Input type="number" value={staffForm.salary} onChange={e=>setStaffForm(f=>({...f,salary:e.target.value}))} min="0"/></Field>
            <Field label={t.contractEnd}><Input type="date" value={staffForm.end} onChange={e=>setStaffForm(f=>({...f,end:e.target.value}))}/></Field>
          </div>
        </div>
      </Modal>

      {/* Payroll modal */}
      <Modal open={openModal==='payroll'} onClose={()=>setOpenModal(null)} title={t.logPayrollDisbursement}
        footer={<><Button variant="secondary" onClick={()=>setOpenModal(null)}>{t.cancel}</Button><Button variant="finance" onClick={addPayroll} disabled={saving}>{saving ? t.saving : t.logPayment}</Button></>}>
        <div className="space-y-3">
          <Field label={t.staffMember}><Select value={payForm.staff_id} onChange={e=>setPayForm(f=>({...f,staff_id:e.target.value}))}><option value="">{t.selectPlaceholder}</option>{assignedStaff.map(s=><option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.amountPaid}><Input type="number" value={payForm.amount} onChange={e=>setPayForm(f=>({...f,amount:e.target.value}))} min="0"/></Field>
            <Field label={t.period}><Input value={payForm.period} onChange={e=>setPayForm(f=>({...f,period:e.target.value}))} placeholder="Sep 2026"/></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.datePaid}><Input type="date" value={payForm.date} onChange={e=>setPayForm(f=>({...f,date:e.target.value}))}/></Field>
            <Field label={t.notes}><Input value={payForm.notes} onChange={e=>setPayForm(f=>({...f,notes:e.target.value}))} placeholder={t.optional}/></Field>
          </div>
        </div>
      </Modal>

      {/* Leave modal */}
      <Modal open={openModal==='leave'} onClose={()=>setOpenModal(null)} title={t.submitLeaveRequest}
        footer={<><Button variant="secondary" onClick={()=>setOpenModal(null)}>{t.cancel}</Button><Button variant="primary" onClick={addLeave} disabled={saving}>{saving ? t.saving : t.submit}</Button></>}>
        <div className="space-y-3">
          <Field label={t.staffMember}><Select value={leaveForm.staff_id} onChange={e=>setLeaveForm(f=>({...f,staff_id:e.target.value}))}><option value="">{t.selectPlaceholder}</option>{staff.map(s=><option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.from}><Input type="date" value={leaveForm.from} onChange={e=>setLeaveForm(f=>({...f,from:e.target.value}))}/></Field>
            <Field label={t.to}><Input type="date" value={leaveForm.to} onChange={e=>setLeaveForm(f=>({...f,to:e.target.value}))}/></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.type}><Select value={leaveForm.type} onChange={e=>setLeaveForm(f=>({...f,type:e.target.value}))}>{Object.keys(t.leaveTypes).map(k => <option key={k} value={k}>{t.leaveTypes[k]}</option>)}</Select></Field>
            <Field label={t.status}><Select value={leaveForm.status} onChange={e=>setLeaveForm(f=>({...f,status:e.target.value}))}>{Object.keys(t.leaveStatuses).map(k => <option key={k} value={k}>{t.leaveStatuses[k]}</option>)}</Select></Field>
          </div>
        </div>
      </Modal>
    </div>
  )
}
