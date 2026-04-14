'use client'
import { useEffect, useState, useCallback } from 'react'
import { useApp } from '@/hooks/useApp'
import { createClient } from '../../../../lib/supabase'
import { Button, Table, TR, TD, Card } from '@/components/ui'
import type { Participant, AttendanceSession } from '@/types'

export default function AttendancePage() {
  const { activeProject, isAdmin } = useApp()
  const supabase = createClient()
  const [participants, setParticipants] = useState<Participant[]>([])
  const [sessions, setSessions] = useState<AttendanceSession[]>([])
  const [attState, setAttState] = useState<Record<string,'p'|'a'|''>>({})
  const [sessDate, setSessDate] = useState(new Date().toISOString().slice(0,10))
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!activeProject) return
    const [partR, sessR] = await Promise.all([
      supabase.from('participants').select('*').eq('project_id', activeProject.id).eq('status', 'Active').order('first_name'),
      supabase.from('attendance_sessions').select('*').eq('project_id', activeProject.id).order('session_date', { ascending: false })
    ])
    setParticipants((partR.data ?? []) as Participant[])
    // compute present/absent counts per session
    const rawSessions = (sessR.data ?? []) as AttendanceSession[]
    const sessIds = rawSessions.map(s => s.id)
    if (sessIds.length > 0) {
      const { data: records } = await supabase.from('attendance_records').select('session_id,status').in('session_id', sessIds)
      const enriched = rawSessions.map(s => {
        const recs = (records ?? []).filter(r => r.session_id === s.id)
        const present = recs.filter(r => r.status === 'present').length
        const absent = recs.filter(r => r.status === 'absent').length
        const total = present + absent
        return { ...s, present_count: present, absent_count: absent, rate: total > 0 ? Math.round((present/total)*100) : 0 }
      })
      setSessions(enriched)
    } else setSessions([])
  }, [activeProject]) // eslint-disable-line

  useEffect(() => { load() }, [load])

  const toggle = (id: string) => {
    if (!isAdmin) return
    const states: ('p'|'a'|'')[] = ['','p','a']
    const cur = attState[id] ?? ''
    setAttState(s => ({ ...s, [id]: states[(states.indexOf(cur)+1)%3] }))
  }

  const saveSession = async () => {
    if (!activeProject) return
    const marked = participants.filter(p => attState[p.id] && attState[p.id] !== '')
    if (marked.length === 0) return alert('Mark at least one participant.')
    setSaving(true)
    const { data: sess } = await supabase.from('attendance_sessions').insert({
      project_id: activeProject.id, session_date: sessDate
    }).select().single()
    if (sess) {
      const records = participants.map(p => ({
        session_id: sess.id, participant_id: p.id,
        status: attState[p.id] === 'p' ? 'present' : attState[p.id] === 'a' ? 'absent' : 'not_marked'
      })).filter(r => r.status !== 'not_marked')
      await supabase.from('attendance_records').insert(records)
    }
    setAttState({}); setSaving(false); load()
  }

  if (!activeProject) return <div className="text-gray-400 text-sm p-4">Select a project first.</div>

  const avgRate = sessions.length > 0
    ? Math.round(sessions.reduce((a, s) => a + (s.rate ?? 0), 0) / sessions.length)
    : null

  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">Projects › {activeProject.name} › Attendance</div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Attendance</h1>
          <div className="text-xs text-gray-400">{sessions.length} sessions · avg rate {avgRate !== null ? `${avgRate}%` : '—'}</div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <input type="date" value={sessDate} onChange={e=>setSessDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-indigo-400"/>
            <Button variant="primary" size="sm" onClick={saveSession} disabled={saving}>{saving?'Saving…':'Save session'}</Button>
          </div>
        )}
      </div>

      <Card className="mb-4">
        <div className="text-sm font-semibold text-gray-900 mb-3">Mark attendance — tap each participant</div>
        {participants.length === 0
          ? <div className="text-sm text-gray-400">Add active participants first.</div>
          : <div className="flex flex-wrap gap-2">
              {participants.map(p => {
                const st = attState[p.id] ?? ''
                return (
                  <button key={p.id} onClick={() => toggle(p.id)} title={`${p.first_name} ${p.last_name}`}
                    className={`w-10 h-10 rounded-full text-xs font-bold transition-all border-2 ${st==='p'?'bg-emerald-100 text-emerald-700 border-emerald-300':st==='a'?'bg-red-100 text-red-600 border-red-300':'bg-gray-100 text-gray-400 border-gray-200 hover:border-gray-300'}`}>
                    {p.first_name[0]}{p.last_name[0]}
                  </button>
                )
              })}
            </div>
        }
        <div className="flex gap-4 mt-3 text-xs text-gray-400">
          <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1.5"/>Present</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1.5"/>Absent</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-gray-200 mr-1.5"/>Not marked</span>
        </div>
      </Card>

      <Table headers={['Date','Present','Absent','Attendance rate']} empty={sessions.length === 0}>
        {sessions.map(s => (
          <TR key={s.id}>
            <TD className="font-medium">{s.session_date}</TD>
            <TD><span className="font-semibold text-emerald-600">{s.present_count ?? 0}</span></TD>
            <TD><span className="font-semibold text-red-500">{s.absent_count ?? 0}</span></TD>
            <TD>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${(s.rate??0)>=80?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>
                {s.rate ?? 0}%
              </span>
            </TD>
          </TR>
        ))}
      </Table>
    </div>
  )
}
