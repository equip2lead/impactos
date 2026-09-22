'use client'

import { useState } from 'react'
import { useApp } from '@/hooks/useApp'
import { useLang } from '@/context/LangContext'
import { createClient } from '../../../lib/supabase'
import { Button, Field, Input, Alert } from '@/components/ui'
import { pgErrorKey, renderProcError, type ProcError } from '@/lib/pgError'
import { withTimeout } from '@/lib/withTimeout'

/**
 * A signed-in user whose profile has no organisation cannot be shown the
 * dashboard: every query is scoped by current_user_org(), so each screen would
 * render as a working but permanently empty app.
 *
 * Normally unreachable — signup creates the organisation inside the same
 * transaction as the profile. This catches the leftovers: profiles created
 * before that existed, and any signup whose metadata did not carry an
 * organisation name.
 *
 * Joining an existing organisation is deliberately not offered here. Doing so
 * would mean letting a stranger search organisations by name, which leaks the
 * customer list, and letting them pick their own role. Joining is by invitation
 * only, so the copy says that rather than leaving the user guessing.
 */
export function OrgGate({ children }: { children: React.ReactNode }) {
  const { profile, loading, profileError, retryProfile } = useApp()
  const { t } = useLang()
  const supabase = createClient()

  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  // Stored unresolved so the wording follows the language toggle.
  const [error, setError] = useState<ProcError | null>(null)

  // Defer to ProfileGate while identity is still resolving or has failed —
  // "you have no organisation" would be a lie when the truth is "we could not
  // read your profile".
  if (loading || profileError || !profile) return <>{children}</>
  if (profile.org_id) return <>{children}</>

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true); setError(null)
    const raced = await withTimeout(Promise.resolve(
      supabase.rpc('claim_new_organisation', { p_name: trimmed })
    ))
    if (raced.timedOut) { setBusy(false); return setError({ key: 'timeout', params: {} }) }
    const { error: rpcError } = raced.value
    if (rpcError) {
      setBusy(false)
      // An RPC failure arrives shaped like a PostgrestError, so the same
      // DETAIL-carries-the-key mapping applies.
      return setError(pgErrorKey(rpcError))
    }
    // org_id and role changed server-side; re-read identity rather than
    // guessing at the new state. retryProfile only bumps a tick, so this stays
    // busy until the re-read lands and this gate unmounts.
    retryProfile()
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-6">
        <div className="text-base font-bold text-gray-900 mb-1">{t.noOrgTitle}</div>
        <p className="text-sm text-gray-500 mb-4">{t.noOrgBody}</p>

        <div className="space-y-3">
          <Field label={t.organisationName}>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Hope & Light Foundation"
              onKeyDown={e => { if (e.key === 'Enter' && name.trim() && !busy) create() }}
            />
          </Field>
          <Alert>{renderProcError(error, t.procErrors)}</Alert>
          <Button variant="primary" onClick={create} disabled={busy || !name.trim()}>
            {busy ? t.creatingOrganisation : t.createOrganisation}
          </Button>
        </div>

        <p className="text-xs text-gray-400 mt-4 leading-snug">{t.noOrgInviteNote}</p>
      </div>
    </div>
  )
}
