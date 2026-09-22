'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/hooks/useApp'
import { useLang } from '@/context/LangContext'
import { createClient } from '../../../../../lib/supabase'
import { Button, Modal, Field, Textarea, Table, TR, TD, Badge, Alert } from '@/components/ui'
import { Check, X } from 'lucide-react'
import { pgErrorKey, writeErrorKey, renderProcError, type ProcError } from '@/lib/pgError'
import { canWrite } from '@/lib/procurementAccess'
import { withTimeout } from '@/lib/withTimeout'
import type { PurchaseRequest, PurchaseRequestItem } from '@/types'

const usd = (n: number | null | undefined) =>
  `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function ApprovalsPage() {
  const { activeProject, role, profile } = useApp()
  const { t } = useLang()
  const supabase = createClient()

  // Approving is an update on purchase_requests, so the write gate is the same
  // one the requests screen uses. Whether *this* user may approve *this* amount
  // is the database's call, not ours — see approve() below.
  const canAct = canWrite(role, 'purchase_requests')

  const [requests, setRequests] = useState<PurchaseRequest[]>([])
  const [threshold, setThreshold] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  // Errors are stored unresolved so the wording follows the language toggle.
  const [pageError, setPageError] = useState<ProcError | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [rejecting, setRejecting] = useState<PurchaseRequest | null>(null)
  const [reason, setReason] = useState('')
  const [rejectError, setRejectError] = useState<ProcError | null>(null)
  const [saving, setSaving] = useState(false)

  const [reloadKey, setReloadKey] = useState(0)
  const load = () => setReloadKey(k => k + 1)

  useEffect(() => {
    if (!activeProject) return
    let cancelled = false
    ;(async () => {
      const res = await withTimeout(Promise.resolve(
        supabase.from('purchase_requests')
          .select('*, purchase_request_items(*), budget_categories(id,code,name)')
          .eq('project_id', activeProject.id)
          .eq('status', 'submitted')
          .order('created_at', { ascending: true })
      ))
      if (cancelled) return
      if (res.timedOut) { setPageError({ key: 'timeout', params: {} }); setLoading(false); return }
      const { data, error } = res.value
      const err = pgErrorKey(error)
      if (err) setPageError(err)
      else {
        setPageError(null)
        setRequests((data ?? []) as PurchaseRequest[])
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [activeProject, reloadKey]) // eslint-disable-line

  // The threshold is shown for context only. It is never used to gate the
  // buttons: the trigger compares GREATEST(stated, sum of lines), so any
  // client-side guess could differ from the figure the database enforces.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('procurement_settings').select('finance_approval_threshold_usd').maybeSingle()
      if (cancelled) return
      setThreshold(data?.finance_approval_threshold_usd ?? null)
    })()
    return () => { cancelled = true }
  }, []) // eslint-disable-line

  // ── Approve ─────────────────────────────────────────
  const approve = async (r: PurchaseRequest) => {
    setBusyId(r.id); setPageError(null)
    // Only the status is sent. approved_by and approved_at are filled by
    // enforce_pr_approval from auth.uid(); sending them would let a client
    // credit the approval to someone else.
    const raced = await withTimeout(Promise.resolve(supabase
      .from('purchase_requests')
      .update({ status: 'approved' })
      .eq('id', r.id)
      .select()))
    setBusyId(null)
    if (raced.timedOut) return setPageError({ key: 'timeout', params: {} })
    const message = writeErrorKey(raced.value)
    // A refusal here is the server's answer — including the threshold rule,
    // which we deliberately do not pre-empt in the UI.
    if (message) return setPageError(message)
    load()
  }

  // ── Reject ──────────────────────────────────────────
  const openReject = (r: PurchaseRequest) => {
    setRejecting(r); setReason(''); setRejectError(null)
  }

  const reject = async () => {
    if (!rejecting) return
    const trimmed = reason.trim()
    // purchase_requests_rejection_needs_reason enforces this too; the guard
    // here just avoids a round trip we know will fail.
    if (!trimmed) return
    setSaving(true); setRejectError(null)
    const raced = await withTimeout(Promise.resolve(supabase
      .from('purchase_requests')
      .update({ status: 'rejected', rejection_reason: trimmed })
      .eq('id', rejecting.id)
      .select()))
    setSaving(false)
    if (raced.timedOut) return setRejectError({ key: 'timeout', params: {} })
    const message = writeErrorKey(raced.value)
    if (message) return setRejectError(message)
    setRejecting(null); setReason(''); load()
  }

  // ── Render ──────────────────────────────────────────
  if (!activeProject) {
    return <div className="text-gray-400 text-sm p-4">{t.selectProjectFirst}</div>
  }

  const thresholdNote = threshold != null
    ? t.financeThresholdNote.replace('{threshold}', usd(threshold))
    : null

  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">
        {t.procurement} › {activeProject.name} › {t.approvals}
      </div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t.approvalQueue}</h1>
          <div className="text-xs text-gray-400">
            {requests.length} {t.statusSubmitted.toLowerCase()}
            {!canAct && <> · {t.approvalReadOnly}</>}
          </div>
        </div>
      </div>

      {thresholdNote && (
        <div className="mb-3 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          {thresholdNote}
        </div>
      )}
      {pageError && <div className="mb-3"><Alert>{renderProcError(pageError, t.procErrors)}</Alert></div>}

      {loading ? (
        <div className="text-sm text-gray-400 py-10 text-center">{t.loading}</div>
      ) : requests.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl py-12 text-center">
          <div className="text-sm font-medium text-gray-700">{t.noPendingApprovals}</div>
          <div className="text-xs text-gray-400 mt-1">{t.noPendingApprovalsSub}</div>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => {
            const items = [...(r.purchase_request_items ?? [])].sort((a, b) => a.sort_order - b.sort_order)
            // Self-approval is refused by enforce_pr_approval at any amount. Hide
            // the action and say why, rather than leaving a button that always
            // fails. Reject stays available: withdrawing your own request is
            // legitimate, and only approval is restricted.
            const isOwnRequest = !!profile && r.requested_by === profile.id
            return (
              <div key={r.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <div className="flex items-start justify-between gap-4 px-4 py-3 border-b border-gray-50">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-500">{r.request_no}</span>
                      <Badge variant="amber">{t.statusSubmitted}</Badge>
                    </div>
                    <div className="font-medium text-gray-900 mt-0.5">{r.title}</div>
                    {r.justification && (
                      <div className="text-xs text-gray-500 mt-1 italic">{r.justification}</div>
                    )}
                    <div className="text-xs text-gray-400 mt-1">
                      {r.budget_categories
                        ? `${r.budget_categories.code} — ${r.budget_categories.name}`
                        : '—'}
                      {r.needed_by && <> · {t.neededBy} {r.needed_by}</>}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {/* DB-maintained: displayed from the row, never recomputed */}
                    <div className="text-lg font-bold text-gray-900 tabular-nums">
                      {usd(r.estimated_total_usd)}
                    </div>
                    {canAct && (
                      <div className="flex flex-col items-end gap-1 mt-2">
                        <div className="flex items-center gap-1">
                          {!isOwnRequest && (
                            <Button variant="secondary" size="sm"
                              onClick={() => approve(r)} disabled={busyId === r.id}>
                              <Check size={12} />{busyId === r.id ? t.approving : t.approve}
                            </Button>
                          )}
                          <Button variant="danger" size="sm"
                            onClick={() => openReject(r)} disabled={busyId === r.id}>
                            <X size={12} />{t.reject}
                          </Button>
                        </div>
                        {isOwnRequest && (
                          <div className="text-[11px] text-amber-600 max-w-[15rem] text-right leading-snug">
                            {t.yourOwnRequest}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {items.length > 0 && (
                  <Table
                    headers={[t.description, t.qty, t.unit, t.unitCost, t.lineTotal]}
                    empty={false}
                  >
                    {items.map((it: PurchaseRequestItem) => (
                      <TR key={it.id}>
                        <TD className="text-gray-700">{it.description}</TD>
                        <TD className="text-gray-500">{it.qty}</TD>
                        <TD className="text-gray-500">{it.unit ?? '—'}</TD>
                        <TD className="text-gray-500">{usd(it.unit_cost_estimate_usd)}</TD>
                        {/* generated column — display only */}
                        <TD className="text-gray-900 font-medium">{usd(it.line_total_usd)}</TD>
                      </TR>
                    ))}
                  </Table>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Reject — reason required */}
      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={t.rejectRequest}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejecting(null)}>{t.cancel}</Button>
            <Button variant="danger" onClick={reject} disabled={saving || !reason.trim()}>
              {saving ? t.rejecting : t.reject}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-sm text-gray-700">
            {rejecting?.request_no} · {rejecting?.title}
          </div>
          <Field label={t.rejectionReason}>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder="e.g. Over budget for this quarter — resubmit with two fewer units" />
          </Field>
          <div className="text-xs text-gray-400">{t.rejectionReasonHint}</div>
          <Alert>{renderProcError(rejectError, t.procErrors)}</Alert>
        </div>
      </Modal>
    </div>
  )
}
