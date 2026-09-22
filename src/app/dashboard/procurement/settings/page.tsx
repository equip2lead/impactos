'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/hooks/useApp'
import { useLang } from '@/context/LangContext'
import { createClient } from '../../../../../lib/supabase'
import { Button, Field, Input, Alert } from '@/components/ui'
import { Save } from 'lucide-react'
import { pgErrorKey, writeErrorKey, renderProcError, type ProcError } from '@/lib/pgError'
import { canWrite } from '@/lib/procurementAccess'
import { withTimeout } from '@/lib/withTimeout'
import type { ProcurementSettings } from '@/types'

/**
 * One procurement_settings.changed row. audit_procurement_settings writes a
 * from/to pair per field, and only when at least one actually differs.
 */
type ThresholdChange = {
  id: string
  created_at: string
  meta: Record<string, { from: number | null; to: number | null } | undefined>
  profiles?: { first_name: string; last_name: string } | null
}

const FIELDS = [
  { key: 'finance_approval_threshold_usd', money: true,
    label: (t: { financeApprovalThreshold: string }) => t.financeApprovalThreshold.replace(' (USD)', '') },
  { key: 'quotes_required_threshold_usd', money: true,
    label: (t: { quotesRequiredThreshold: string }) => t.quotesRequiredThreshold.replace(' (USD)', '') },
  { key: 'min_quotes_required', money: false,
    label: (t: { minQuotesRequired: string }) => t.minQuotesRequired },
] as const

const usd = (n: number | null | undefined) =>
  `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function ProcurementSettingsPage() {
  const { role } = useApp()
  const { t } = useLang()
  const supabase = createClient()

  // settings_write is (org_id = current_user_org() AND is_finance()), which is
  // owner + finance. Everyone else in the org can read the row — the thresholds
  // explain refusals they will hit elsewhere, so hiding them would be unkind.
  const canEdit = canWrite(role, 'procurement_settings')

  const [settings, setSettings] = useState<ProcurementSettings | null>(null)
  const [history, setHistory] = useState<ThresholdChange[]>([])
  const [loading, setLoading] = useState(true)
  // Errors are stored unresolved so the wording follows the language toggle.
  const [pageError, setPageError] = useState<ProcError | null>(null)
  const [saveError, setSaveError] = useState<ProcError | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    finance_approval_threshold_usd: '',
    quotes_required_threshold_usd: '',
    min_quotes_required: '',
  })

  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await withTimeout(Promise.all([
        supabase.from('procurement_settings').select('*').maybeSingle(),
        // Org-level rows carry project_id NULL; the "org members can view
        // org-level activity" policy covers exactly that, so this reads for
        // every role including the ones that cannot edit.
        supabase.from('activity_log')
          .select('id, created_at, meta, profiles:user_id(first_name,last_name)')
          .eq('action', 'procurement_settings.changed')
          .order('created_at', { ascending: false })
          .limit(10),
      ]))
      if (cancelled) return
      if (res.timedOut) { setPageError({ key: 'timeout', params: {} }); setLoading(false); return }
      const [{ data, error }, logR] = res.value
      setHistory((logR.data ?? []) as unknown as ThresholdChange[])
      const err = pgErrorKey(error)
      if (err) setPageError(err)
      else {
        setPageError(null)
        const row = (data ?? null) as ProcurementSettings | null
        setSettings(row)
        if (row) setForm({
          finance_approval_threshold_usd: String(row.finance_approval_threshold_usd),
          quotes_required_threshold_usd: String(row.quotes_required_threshold_usd),
          min_quotes_required: String(row.min_quotes_required),
        })
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [reloadKey]) // eslint-disable-line

  // min_quotes_required >= 1 is a check constraint; the rest are only required
  // to be numbers. Anything the database would refuse is still reported from
  // the database — this only avoids a round trip that cannot succeed.
  const minQuotes = Number(form.min_quotes_required)
  const financeThreshold = Number(form.finance_approval_threshold_usd)
  const quotesThreshold = Number(form.quotes_required_threshold_usd)
  const valid =
    Number.isFinite(financeThreshold) && financeThreshold >= 0 &&
    Number.isFinite(quotesThreshold) && quotesThreshold >= 0 &&
    Number.isInteger(minQuotes) && minQuotes >= 1

  const dirty = !!settings && (
    financeThreshold !== Number(settings.finance_approval_threshold_usd) ||
    quotesThreshold !== Number(settings.quotes_required_threshold_usd) ||
    minQuotes !== Number(settings.min_quotes_required)
  )

  const save = async () => {
    if (!settings || !valid || !dirty) return
    setSaving(true); setSaveError(null); setSaved(false)
    // org_id is never sent: it scopes the row RLS already matched on, and
    // sending it would let a client aim the update at another organisation.
    const raced = await withTimeout(Promise.resolve(supabase
      .from('procurement_settings')
      .update({
        finance_approval_threshold_usd: financeThreshold,
        quotes_required_threshold_usd: quotesThreshold,
        min_quotes_required: minQuotes,
      })
      .eq('id', settings.id)
      .select()))
    setSaving(false)
    if (raced.timedOut) return setSaveError({ key: 'timeout', params: {} })
    const message = writeErrorKey(raced.value)
    if (message) return setSaveError(message)
    // Adopt the returned row before the refetch. Without this, `settings` stays
    // stale for the length of the round trip, `dirty` reads true against the
    // old values, and Save re-enables — long enough for a second click to send
    // a redundant PATCH. Observed in testing: two PATCHes for one save.
    setSettings(raced.value.data![0] as ProcurementSettings)
    setSaved(true)
    setReloadKey(k => k + 1)
  }

  // ── Render ──────────────────────────────────────────
  if (loading) {
    return <div className="text-sm text-gray-400 py-10 text-center">{t.loading}</div>
  }

  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">
        {t.procurement} › {t.procurementSettings}
      </div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t.procurementSettings}</h1>
        <div className="text-xs text-gray-400">
          {t.procurementSettingsSub}
          {!canEdit && <> · {t.settingsReadOnly}</>}
        </div>
      </div>

      {pageError && <div className="mb-3"><Alert>{renderProcError(pageError, t.procErrors)}</Alert></div>}

      {!settings ? (
        <div className="bg-white border border-gray-100 rounded-xl py-12 text-center">
          <div className="text-sm font-medium text-gray-700">{t.settingsMissing}</div>
          <div className="text-xs text-gray-400 mt-1">{t.settingsMissingSub}</div>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-xl p-4 max-w-2xl">
          <div className="space-y-5">
            <div>
              <Field label={t.financeApprovalThreshold}>
                <Input type="number" min="0" step="any" disabled={!canEdit}
                  value={form.finance_approval_threshold_usd}
                  onChange={e => { setSaved(false); setForm(f => ({ ...f, finance_approval_threshold_usd: e.target.value })) }} />
              </Field>
              <div className="text-xs text-gray-400 mt-1">{t.financeApprovalThresholdHint}</div>
            </div>

            <div>
              <Field label={t.quotesRequiredThreshold}>
                <Input type="number" min="0" step="any" disabled={!canEdit}
                  value={form.quotes_required_threshold_usd}
                  onChange={e => { setSaved(false); setForm(f => ({ ...f, quotes_required_threshold_usd: e.target.value })) }} />
              </Field>
              <div className="text-xs text-gray-400 mt-1">{t.quotesRequiredThresholdHint}</div>
            </div>

            <div>
              <Field label={t.minQuotesRequired}>
                <Input type="number" min="1" step="1" disabled={!canEdit}
                  value={form.min_quotes_required}
                  onChange={e => { setSaved(false); setForm(f => ({ ...f, min_quotes_required: e.target.value })) }} />
              </Field>
              <div className="text-xs text-gray-400 mt-1">{t.minQuotesRequiredHint}</div>
            </div>
          </div>

          {/* Stated in the present tense, because that is what a threshold change
              does and does not do — approvals already granted are not revisited. */}
          <div className="mt-5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            {t.settingsAppliesNow}
          </div>

          {canEdit && (
            <div className="mt-4 flex items-center gap-3">
              <Button variant="primary" onClick={save} disabled={saving || !valid || !dirty}>
                <Save size={13} />{saving ? t.saving : t.save}
              </Button>
              {saved && !dirty && (
                <span className="text-xs text-green-700">{t.settingsSaved}</span>
              )}
            </div>
          )}

          <div className="mt-4"><Alert>{renderProcError(saveError, t.procErrors)}</Alert></div>

          {/* The saved figures, not the draft in the inputs — so an unsaved edit
              never looks like the rule the database is applying. */}
          <div className="mt-4 pt-3 border-t border-gray-50 text-xs text-gray-400">
            {t.lastUpdated}: {settings.updated_at?.slice(0, 10) ?? '—'}
            {' · '}{usd(settings.finance_approval_threshold_usd)}
            {' · '}{usd(settings.quotes_required_threshold_usd)}
            {' · '}{settings.min_quotes_required} {t.quotes.toLowerCase()}
          </div>
        </div>
      )}

      {/* There is no procurement activity screen to put this on, and a
          threshold change is the edit most worth tracing — so it lives beside
          the thresholds themselves, where the question is asked. */}
      {settings && (
        <div className="mt-6 max-w-2xl">
          <div className="text-sm font-bold text-gray-900">{t.thresholdHistory}</div>
          <div className="text-xs text-gray-400 mb-2">{t.thresholdHistoryHint}</div>
          {history.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-xl py-8 text-center text-sm text-gray-400">
              {t.noThresholdHistory}
            </div>
          ) : (
            <div className="space-y-2">
              {history.map(h => {
                // Every row carries all three fields; only the ones that moved
                // are worth showing.
                const changed = FIELDS
                  .map(f => ({ f, pair: h.meta?.[f.key] }))
                  .filter(({ pair }) => pair && pair.from !== pair.to)
                return (
                  <div key={h.id} className="bg-white border border-gray-100 rounded-xl px-4 py-2.5">
                    <div className="text-[11px] text-gray-400">
                      {h.created_at.slice(0, 10)}
                      {' · '}
                      {h.profiles ? `${h.profiles.first_name} ${h.profiles.last_name}` : '—'}
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {changed.map(({ f, pair }) => (
                        <li key={f.key} className="text-xs text-gray-700 tabular-nums">
                          {t.changedFromTo
                            .replace('{field}', f.label(t))
                            .replace('{from}', f.money ? usd(pair!.from) : String(pair!.from))
                            .replace('{to}', f.money ? usd(pair!.to) : String(pair!.to))}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
