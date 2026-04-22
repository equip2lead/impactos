'use client'

import { useEffect, useState, useCallback } from 'react'
import { useApp } from '@/hooks/useApp'
import { useLang } from '@/context/LangContext'
import { createClient } from '../../../../lib/supabase'
import { Button, Card, CardHeader, Field, Input, Select, Table, TR, TD, Modal } from '@/components/ui'
import { statusBadge } from '@/components/ui'
import { Settings, Users, User, Shield, Globe } from 'lucide-react'
import type { Profile } from '@/types'

const ROLES = [
  { value: 'owner', label: 'Owner', labelFr: 'Propriétaire', desc: 'Full access to everything including finance' },
  { value: 'finance_officer', label: 'Finance Officer', labelFr: 'Responsable financier', desc: 'Finance + all operations access' },
  { value: 'coordinator', label: 'Coordinator', labelFr: 'Coordinateur', desc: 'Operations, HR, participants — no finance' },
  { value: 'staff', label: 'Staff', labelFr: 'Personnel', desc: 'View only — attendance and basic data' },
  { value: 'viewer', label: 'Viewer', labelFr: 'Observateur', desc: 'Read-only access — for donors, partners' },
]

export default function SettingsPage() {
  const { profile, role, isAdmin, isFinance, orgId, refreshProjects } = useApp()
  const { lang } = useLang()
  const supabase = createClient()

  const [tab, setTab] = useState<'profile'|'team'|'organisation'>('profile')
  const [team, setTeam] = useState<Profile[]>([])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Profile form
  const [profForm, setProfForm] = useState({
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    phone: profile?.phone || '',
  })

  // Invite form
  const [invForm, setInvForm] = useState({ email: '', role: 'coordinator' })

  const loadTeam = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('org_id', orgId)
      .order('first_name')
    setTeam((data ?? []) as Profile[])
  }, [orgId]) // eslint-disable-line

  useEffect(() => {
    loadTeam()
    if (profile) {
      setProfForm({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        phone: profile.phone || '',
      })
    }
  }, [profile, loadTeam])

  const saveProfile = async () => {
    if (!profile) return
    setSaving(true)
    await supabase.from('profiles').update({
      first_name: profForm.first_name,
      last_name: profForm.last_name,
      phone: profForm.phone,
    }).eq('id', profile.id)
    setSaving(false)
    window.location.reload()
  }

  const updateRole = async (userId: string, newRole: string) => {
    await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    loadTeam()
  }

  const inviteUser = async () => {
    if (!invForm.email) return
    setSaving(true)
    // Create auth user via Supabase admin — uses signUp in demo mode
    const { data, error } = await supabase.auth.signUp({
      email: invForm.email,
      password: Math.random().toString(36).slice(-12) + 'A1!',
      options: {
        data: { role: invForm.role, org_id: orgId }
      }
    })
    if (!error && data.user) {
      // Upsert profile
      await supabase.from('profiles').upsert({
        id: data.user.id,
        org_id: orgId,
        email: invForm.email,
        first_name: invForm.email.split('@')[0],
        last_name: '',
        role: invForm.role,
        is_active: true,
      })
    }
    setInvForm({ email: '', role: 'coordinator' })
    setInviteOpen(false)
    setSaving(false)
    loadTeam()
  }

  const deactivate = async (userId: string) => {
    await supabase.from('profiles').update({ is_active: false }).eq('id', userId)
    loadTeam()
  }

  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">Dashboard › Settings</div>
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Settings</h1>
          <div className="text-sm text-gray-400">Manage your profile, team, and organisation</div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-50 border border-gray-200 p-1 rounded-xl w-fit mb-6">
        {[
          { key: 'profile', label: lang === 'fr' ? 'Mon profil' : 'My profile', icon: User },
          { key: 'team', label: lang === 'fr' ? 'Équipe' : 'Team', icon: Users },
          { key: 'organisation', label: lang === 'fr' ? 'Organisation' : 'Organisation', icon: Settings },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <t.icon size={13} />{t.label}
          </button>
        ))}
      </div>

      {/* MY PROFILE */}
      {tab === 'profile' && (
        <div className="max-w-lg">
          <Card>
            <CardHeader title={lang === 'fr' ? 'Informations personnelles' : 'Personal information'} />
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label={lang === 'fr' ? 'Prénom' : 'First name'}>
                  <Input value={profForm.first_name} onChange={e => setProfForm(f => ({ ...f, first_name: e.target.value }))} />
                </Field>
                <Field label={lang === 'fr' ? 'Nom' : 'Last name'}>
                  <Input value={profForm.last_name} onChange={e => setProfForm(f => ({ ...f, last_name: e.target.value }))} />
                </Field>
              </div>
              <Field label="Email">
                <Input value={profile?.email || ''} disabled className="opacity-50 cursor-not-allowed" />
              </Field>
              <Field label={lang === 'fr' ? 'Téléphone' : 'Phone'}>
                <Input value={profForm.phone} onChange={e => setProfForm(f => ({ ...f, phone: e.target.value }))} placeholder="+237 674 991 704" />
              </Field>
              <Field label={lang === 'fr' ? 'Rôle' : 'Role'}>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg font-semibold capitalize border border-indigo-100">
                    {role.replace('_', ' ')}
                  </span>
                  {role === 'owner' && <Shield size={14} className="text-amber-500" />}
                </div>
              </Field>
              <Button variant="primary" onClick={saveProfile} disabled={saving}>
                {saving ? (lang === 'fr' ? 'Enregistrement…' : 'Saving…') : (lang === 'fr' ? 'Enregistrer' : 'Save changes')}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* TEAM */}
      {tab === 'team' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-gray-400">{team.length} member{team.length !== 1 ? 's' : ''} in AFRILEAD</div>
            {isFinance && (
              <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
                + {lang === 'fr' ? 'Inviter un membre' : 'Invite member'}
              </Button>
            )}
          </div>

          <Table headers={[
            lang === 'fr' ? 'Nom' : 'Name',
            'Email',
            lang === 'fr' ? 'Rôle' : 'Role',
            lang === 'fr' ? 'Statut' : 'Status',
            isFinance ? (lang === 'fr' ? 'Actions' : 'Actions') : ''
          ]}>
            {team.map(m => (
              <TR key={m.id}>
                <TD>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-gray-900 rounded-full flex items-center justify-center text-[9px] font-bold text-amber-400 flex-shrink-0">
                      {m.first_name?.[0]}{m.last_name?.[0]}
                    </div>
                    <span className="font-medium">{m.first_name} {m.last_name}</span>
                    {m.id === profile?.id && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">you</span>}
                  </div>
                </TD>
                <TD className="text-gray-400 text-xs">{m.email}</TD>
                <TD>
                  {isFinance && m.id !== profile?.id ? (
                    <select
                      value={m.role}
                      onChange={e => updateRole(m.id, e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-indigo-400"
                    >
                      {ROLES.map(r => (
                        <option key={r.value} value={r.value}>
                          {lang === 'fr' ? r.labelFr : r.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium capitalize">
                      {m.role?.replace('_', ' ')}
                    </span>
                  )}
                </TD>
                <TD>{statusBadge(m.is_active ? 'active' : 'inactive')}</TD>
                {isFinance && (
                  <TD>
                    {m.id !== profile?.id && m.is_active && (
                      <button onClick={() => deactivate(m.id)}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors">
                        {lang === 'fr' ? 'Désactiver' : 'Deactivate'}
                      </button>
                    )}
                  </TD>
                )}
              </TR>
            ))}
          </Table>

          {/* Role guide */}
          <Card className="mt-6">
            <CardHeader title={lang === 'fr' ? 'Guide des rôles' : 'Role guide'} />
            <div className="space-y-2">
              {ROLES.map(r => (
                <div key={r.value} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium min-w-32 text-center">
                    {lang === 'fr' ? r.labelFr : r.label}
                  </span>
                  <span className="text-xs text-gray-500">{r.desc}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ORGANISATION */}
      {tab === 'organisation' && (
        <div className="max-w-lg">
          <Card>
            <CardHeader title="AFRILEAD" />
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                <Globe size={16} className="text-gray-400" />
                <div>
                  <div className="text-sm font-medium text-gray-900">African Leadership Development Center</div>
                  <div className="text-xs text-gray-400">Association N° 000151/ADR/J06/APPA · Yaoundé, Cameroon</div>
                </div>
              </div>
              <Field label="Website">
                <Input value="afrilead.org" disabled className="opacity-50" />
              </Field>
              <Field label="Email">
                <Input value="equip2lead@gmail.com" disabled className="opacity-50" />
              </Field>
              <Field label="Platform URL">
                <Input value="app.useimpactos.com" disabled className="opacity-50" />
              </Field>
              <div className="text-xs text-gray-400 bg-amber-50 border border-amber-100 rounded-lg p-3">
                Contact your system administrator to update organisation details.
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Invite modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)}
        title={lang === 'fr' ? 'Inviter un membre' : 'Invite team member'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              {lang === 'fr' ? 'Annuler' : 'Cancel'}
            </Button>
            <Button variant="primary" onClick={inviteUser} disabled={saving}>
              {saving ? (lang === 'fr' ? 'Envoi…' : 'Sending…') : (lang === 'fr' ? 'Inviter' : 'Send invite')}
            </Button>
          </>
        }>
        <div className="space-y-3">
          <Field label="Email address">
            <Input type="email" value={invForm.email}
              onChange={e => setInvForm(f => ({ ...f, email: e.target.value }))}
              placeholder="colleague@afrilead.org" />
          </Field>
          <Field label={lang === 'fr' ? 'Rôle' : 'Role'}>
            <Select value={invForm.role} onChange={e => setInvForm(f => ({ ...f, role: e.target.value }))}>
              {ROLES.map(r => (
                <option key={r.value} value={r.value}>
                  {lang === 'fr' ? r.labelFr : r.label} — {r.desc}
                </option>
              ))}
            </Select>
          </Field>
          <div className="text-xs text-gray-400 bg-blue-50 border border-blue-100 rounded-lg p-3">
            The team member will receive an email to set their password and access IMPACTOS.
          </div>
        </div>
      </Modal>
    </div>
  )
}
