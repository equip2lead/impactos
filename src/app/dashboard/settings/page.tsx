'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/hooks/useApp'
import { withTimeout } from '@/lib/withTimeout'
import { useLang } from '@/context/LangContext'
import { createClient } from '../../../../lib/supabase'
import { Button, Card, CardHeader, Field, Input, Select, Table, TR, TD, Modal, Alert } from '@/components/ui'
import { statusBadge } from '@/components/ui'
import { Settings, Users, User, Shield, Globe } from 'lucide-react'
import { writeErrorKey, renderProcError, type ProcError } from '@/lib/pgError'
import type { Profile } from '@/types'

const ROLES = [
  { value: 'owner', label: 'Owner', labelFr: 'Propriétaire', desc: 'Full access to everything including finance' },
  { value: 'finance', label: 'Finance Officer', labelFr: 'Responsable financier', desc: 'Finance + all operations access' },
  { value: 'coordinator', label: 'Coordinator', labelFr: 'Coordinateur', desc: 'Operations, HR, participants — no finance' },
  { value: 'staff', label: 'Staff', labelFr: 'Personnel', desc: 'View only — attendance and basic data' },
  { value: 'viewer', label: 'Viewer', labelFr: 'Observateur', desc: 'Read-only access — for donors, partners' },
]

export default function SettingsPage() {
  const { profile, role, isAdmin, isFinance, orgId, refreshProjects } = useApp()
  // protect_profile_identity requires an OWNER of the same organisation to
  // change a member's role — finance is not enough. Gating on isFinance would
  // show a working-looking select whose every write the database refuses.
  // The team list is already scoped to this organisation, so same-org holds.
  const canManageRoles = role === 'owner'
  const { lang, t } = useLang()
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
  const [inviteError, setInviteError] = useState<string | null>(null)

  // Bumped by team mutations to re-run the fetch below.
  const [reloadKey, setReloadKey] = useState(0)
  const loadTeam = () => setReloadKey(k => k + 1)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('org_id', orgId)
        .order('first_name')
      if (cancelled) return
      setTeam((data ?? []) as Profile[])
    })()
    return () => { cancelled = true }
  }, [orgId, reloadKey]) // eslint-disable-line

  // The profile arrives asynchronously, so seed the form once it identifies a
  // different person. Adjusting during render rather than in an effect keeps
  // this from clobbering edits in progress on every profile refresh.
  const [seededProfileId, setSeededProfileId] = useState(profile?.id)
  if (profile && profile.id !== seededProfileId) {
    setSeededProfileId(profile.id)
    setProfForm({
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      phone: profile.phone || '',
    })
  }

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

  // A select that snaps back to the old value is the only signal a refused
  // role change gives. Disabling it while in flight at least says the request
  // is still running rather than already finished.
  const [busyId, setBusyId] = useState<string | null>(null)
  // Stored unresolved so the wording follows the language toggle.
  const [teamError, setTeamError] = useState<ProcError | null>(null)

  const updateRole = async (userId: string, newRole: string) => {
    if (busyId) return
    setBusyId(userId); setTeamError(null)
    // .select() so an RLS denial, which returns zero rows rather than an
    // error, is not read as success. The trigger refusals (PROC_*) arrive as
    // real errors and are mapped by the same call.
    const raced = await withTimeout(Promise.resolve(
      supabase.from('profiles').update({ role: newRole }).eq('id', userId).select()
    ))
    setBusyId(null)
    if (raced.timedOut) return setTeamError({ key: 'timeout', params: {} })
    const failed = writeErrorKey(raced.value)
    // Reload either way: on failure the select must snap back to the real
    // value rather than sitting on the one the user picked.
    loadTeam()
    if (failed) return setTeamError(failed)
  }

  const inviteUser = async () => {
    if (!invForm.email) return
    setSaving(true); setInviteError(null)
    // Create auth user via Supabase admin — uses signUp in demo mode
    const raced = await withTimeout(supabase.auth.signUp({
      email: invForm.email,
      password: Math.random().toString(36).slice(-12) + 'A1!',
      options: {
        data: { role: invForm.role, org_id: orgId }
      }
    }))
    if (raced.timedOut) {
      setSaving(false)
      return setInviteError(t.procErrors.timeout)
    }
    const { data, error } = raced.value
    // Previously the form cleared and closed regardless, so a failed invite
    // looked exactly like a successful one.
    if (error) {
      setSaving(false)
      return setInviteError(error.message)
    }
    if (data.user) {
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

  // Shares busyId with updateRole: both act on the same row, and changing
  // someone's role while their deactivation is still in flight is not a
  // sequence worth allowing.
  const deactivate = async (userId: string) => {
    if (busyId) return
    setBusyId(userId); setTeamError(null)
    const raced = await withTimeout(Promise.resolve(
      supabase.from('profiles').update({ is_active: false }).eq('id', userId).select()
    ))
    setBusyId(null)
    if (raced.timedOut) return setTeamError({ key: 'timeout', params: {} })
    const failed = writeErrorKey(raced.value)
    loadTeam()
    if (failed) return setTeamError(failed)
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
              <Button variant="primary" size="sm" onClick={() => { setInviteError(null); setInviteOpen(true) }}>
                + {lang === 'fr' ? 'Inviter un membre' : 'Invite member'}
              </Button>
            )}
          </div>

          {teamError && (
            <div className="mb-3"><Alert>{renderProcError(teamError, t.procErrors)}</Alert></div>
          )}

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
                  {canManageRoles && m.id !== profile?.id ? (
                    <select
                      value={m.role}
                      onChange={e => updateRole(m.id, e.target.value)}
                      disabled={busyId === m.id}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:border-indigo-400 disabled:opacity-40 disabled:cursor-wait"
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
                      <button onClick={() => deactivate(m.id)} disabled={busyId === m.id}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-40 disabled:cursor-wait">
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
          <Alert>{inviteError}</Alert>
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
