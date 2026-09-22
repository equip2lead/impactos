'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useApp } from '@/hooks/useApp'
import { useLang, requestStatusLabels, orderStatusLabels } from '@/context/LangContext'
import { createClient } from '../../../../../../lib/supabase'
import {
  Button, Modal, Field, Input, Select, Textarea, Table, TR, TD, Badge, Alert,
} from '@/components/ui'
import { Plus, ArrowLeft, Trophy, FileCheck, PackageCheck, CheckCircle2, RotateCcw } from 'lucide-react'
import { pgErrorKey, writeErrorKey, renderProcError, type ProcError } from '@/lib/pgError'
import { canWrite } from '@/lib/procurementAccess'
import { withTimeout } from '@/lib/withTimeout'
import type {
  PurchaseRequest, PurchaseRequestItem, Quote, Vendor, PurchaseRequestStatus,
  PurchaseOrder, PurchaseOrderStatus, GoodsReceived,
} from '@/types'

const usd = (n: number | null | undefined) =>
  `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const STATUS_VARIANT: Record<PurchaseRequestStatus, 'gray' | 'amber' | 'green' | 'red' | 'blue'> = {
  draft: 'gray', submitted: 'amber', approved: 'green', rejected: 'red',
  cancelled: 'gray', ordered: 'blue', completed: 'green',
}

const PO_STATUS_VARIANT: Record<PurchaseOrderStatus, 'gray' | 'amber' | 'green' | 'blue' | 'red'> = {
  issued: 'blue', partially_received: 'amber', received: 'green',
  cancelled: 'red', closed: 'gray',
}

type GrnLine = { request_item_id: string | null; description: string; unit: string | null; qty_ordered: number; qty_received: string }

const emptyGRN = {
  received_date: new Date().toISOString().slice(0, 10),
  is_complete: true, condition_notes: '', discrepancy_notes: '',
}

const emptyPO = {
  expected_delivery: '', delivery_terms: '', payment_terms: '', notes: '',
}

const emptyQuote = {
  vendor_id: '', quote_ref: '', quote_date: new Date().toISOString().slice(0, 10),
  total_usd: '', valid_until: '', attachment_ref: '',
}

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { role } = useApp()
  const { t } = useLang()
  const supabase = createClient()

  const canEdit = canWrite(role, 'quotes')

  const [request, setRequest] = useState<PurchaseRequest | null>(null)
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [threshold, setThreshold] = useState<number | null>(null)
  const [minQuotes, setMinQuotes] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  // Errors are stored unresolved so the wording follows the language toggle.
  const [pageError, setPageError] = useState<ProcError | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyQuote)
  const [formError, setFormError] = useState<ProcError | null>(null)
  const [saving, setSaving] = useState(false)

  const [po, setPo] = useState<PurchaseOrder | null>(null)
  const [poOpen, setPoOpen] = useState(false)
  const [poForm, setPoForm] = useState(emptyPO)
  const [poError, setPoError] = useState<ProcError | null>(null)
  const [issuing, setIssuing] = useState(false)

  const [grns, setGrns] = useState<GoodsReceived[]>([])
  const [grnOpen, setGrnOpen] = useState(false)
  const [grnForm, setGrnForm] = useState(emptyGRN)
  const [grnLines, setGrnLines] = useState<GrnLine[]>([])
  const [grnError, setGrnError] = useState<ProcError | null>(null)
  const [receiving, setReceiving] = useState(false)

  const [resolving, setResolving] = useState<GoodsReceived | null>(null)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [resolveError, setResolveError] = useState<ProcError | null>(null)
  const [resolveBusy, setResolveBusy] = useState(false)
  const [reopeningId, setReopeningId] = useState<string | null>(null)

  const [selecting, setSelecting] = useState<Quote | null>(null)
  const [justification, setJustification] = useState('')
  const [selectError, setSelectError] = useState<ProcError | null>(null)

  const [reloadKey, setReloadKey] = useState(0)
  const load = () => setReloadKey(k => k + 1)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      const all = await withTimeout(Promise.all([
        supabase.from('purchase_requests')
          .select('*, purchase_request_items(*), budget_categories(id,code,name)')
          .eq('id', id).maybeSingle(),
        supabase.from('quotes')
          .select('*, vendors(id,name,is_blacklisted)')
          .eq('purchase_request_id', id).order('total_usd'),
        supabase.from('procurement_settings')
          .select('quotes_required_threshold_usd,min_quotes_required').maybeSingle(),
        supabase.from('purchase_orders')
          .select('*, vendors(id,name,is_blacklisted)')
          .eq('purchase_request_id', id).maybeSingle(),
        supabase.from('goods_received')
          .select('*, goods_received_items(*), resolver:profiles!goods_received_resolved_by_fkey(id,first_name,last_name)')
          .order('received_date', { ascending: false }),
      ]))
      if (cancelled) return
      if (all.timedOut) { setPageError({ key: 'timeout', params: {} }); setLoading(false); return }
      const [reqR, quoteR, settingsR, poR, grnR] = all.value
      const err = pgErrorKey(reqR.error) ?? pgErrorKey(quoteR.error)
      if (err) setPageError(err)
      else {
        setPageError(null)
        setRequest(reqR.data as PurchaseRequest | null)
        setQuotes((quoteR.data ?? []) as Quote[])
        const poRow = (poR.data ?? null) as PurchaseOrder | null
        setPo(poRow)
        // GRNs are fetched for the org and narrowed to this PO, since the
        // PO id is not known until poR resolves.
        setGrns(((grnR.data ?? []) as GoodsReceived[]).filter(g => g.purchase_order_id === poRow?.id))
      }
      setThreshold(settingsR.data?.quotes_required_threshold_usd ?? null)
      setMinQuotes(settingsR.data?.min_quotes_required ?? null)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [id, reloadKey]) // eslint-disable-line

  // Blacklisted vendors are excluded at the source: enforce_po_controls refuses
  // a PO to one, so offering them here would only invite a dead end later.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('vendors').select('*').eq('is_blacklisted', false).order('name')
      if (cancelled) return
      setVendors((data ?? []) as Vendor[])
    })()
    return () => { cancelled = true }
  }, [reloadKey]) // eslint-disable-line

  // ── Add quote ───────────────────────────────────────
  const openCreate = () => {
    setForm(emptyQuote); setFormError(null); setFormOpen(true)
  }

  const quotedVendorIds = new Set(quotes.map(q => q.vendor_id))
  // One quote per vendor per request (unique constraint); don't offer duplicates.
  const availableVendors = vendors.filter(v => !quotedVendorIds.has(v.id))

  const canSaveQuote = form.vendor_id !== '' && form.total_usd.trim() !== ''

  const saveQuote = async () => {
    if (!canSaveQuote) return
    setSaving(true); setFormError(null)
    const raced = await withTimeout(Promise.resolve(supabase.from('quotes').insert({
      purchase_request_id: id,
      vendor_id: form.vendor_id,
      quote_ref: form.quote_ref.trim() || null,
      quote_date: form.quote_date || undefined,
      total_usd: Number(form.total_usd) || 0,
      valid_until: form.valid_until || null,
      attachment_ref: form.attachment_ref.trim() || null,
      // is_selected defaults false; selecting is a separate, justified action.
    }).select()))
    setSaving(false)
    if (raced.timedOut) return setFormError({ key: 'timeout', params: {} })
    const message = writeErrorKey(raced.value)
    if (message) return setFormError(message)
    setFormOpen(false); load()
  }

  // ── Select winner ───────────────────────────────────
  const openSelect = (q: Quote) => {
    setSelecting(q); setJustification(''); setSelectError(null)
  }

  const selectWinner = async () => {
    if (!selecting) return
    const reason = justification.trim()
    // quotes_selected_needs_justification enforces this too; the guard here
    // just avoids a round trip we know will fail.
    if (!reason) return
    setSaving(true); setSelectError(null)

    // quotes_one_selected_per_request is a partial unique index, so the previous
    // winner must be cleared before the new one is set — two selected rows can
    // never coexist, even briefly within one statement.
    const previous = quotes.find(q => q.is_selected && q.id !== selecting.id)
    if (previous) {
      const clearRaced = await withTimeout(Promise.resolve(supabase.from('quotes')
        .update({ is_selected: false, selection_justification: null })
        .eq('id', previous.id).select()))
      if (clearRaced.timedOut) { setSaving(false); return setSelectError({ key: 'timeout', params: {} }) }
      const clearError = writeErrorKey(clearRaced.value)
      if (clearError) { setSaving(false); return setSelectError(clearError) }
    }

    const setRaced = await withTimeout(Promise.resolve(supabase.from('quotes')
      .update({ is_selected: true, selection_justification: reason })
      .eq('id', selecting.id).select()))
    setSaving(false)
    if (setRaced.timedOut) return setSelectError({ key: 'timeout', params: {} })
    const message = writeErrorKey(setRaced.value)
    if (message) return setSelectError(message)
    setSelecting(null); setJustification(''); load()
  }

  // ── Issue purchase order ────────────────────────────
  const issuePO = async () => {
    if (!winner) return
    setIssuing(true); setPoError(null)
    // po_number comes from a sequence default and issued_by is stamped by
    // enforce_po_controls from auth.uid(); neither is ever sent. The vendor and
    // total are taken from the selected quote — the trigger refuses a PO naming
    // a different vendor, so offering a choice here would only invite that.
    const raced = await withTimeout(Promise.resolve(supabase.from('purchase_orders').insert({
      purchase_request_id: id,
      vendor_id: winner.vendor_id,
      total_usd: winner.total_usd,
      expected_delivery: poForm.expected_delivery || null,
      delivery_terms: poForm.delivery_terms.trim() || null,
      payment_terms: poForm.payment_terms.trim() || null,
      notes: poForm.notes.trim() || null,
    }).select()))
    setIssuing(false)
    // A stalled issuance is the worst case in the module: the user cannot tell
    // whether the order went out, and a blind retry used to create a second PO.
    // purchase_orders_one_per_request now blocks that, and this reports it.
    if (raced.timedOut) return setPoError({ key: 'timeout', params: {} })
    const message = writeErrorKey(raced.value)
    // The DB is the authority here: blacklist, request status and quote
    // thresholds are all checked by the trigger before RLS is even reached.
    if (message) return setPoError(message)
    setPoOpen(false); setPoForm(emptyPO); load()
  }

  // ── Record delivery ─────────────────────────────────
  const openGRN = () => {
    setGrnForm(emptyGRN); setGrnError(null)
    // Prefilled from the request's lines so the receiver checks against what
    // was ordered rather than retyping it.
    setGrnLines((request?.purchase_request_items ?? [])
      .slice().sort((a, b) => a.sort_order - b.sort_order)
      .map(it => ({
        request_item_id: it.id, description: it.description, unit: it.unit ?? null,
        qty_ordered: Number(it.qty), qty_received: String(it.qty),
      })))
    setGrnOpen(true)
  }

  const grnNeedsNotes = !grnForm.is_complete && grnForm.discrepancy_notes.trim() === ''
  const canSaveGRN = !!po && grnLines.length > 0 && !grnNeedsNotes

  const saveGRN = async () => {
    if (!po || !canSaveGRN) return
    setReceiving(true); setGrnError(null)
    // grn_number comes from a sequence default and received_by is stamped by
    // block_receipt_on_closed_po from auth.uid(); neither is ever sent. The PO
    // status is advanced server-side by advance_po_on_receipt — never written
    // from here, because a later complete delivery must not clear an earlier
    // unresolved shortfall.
    const headRaced = await withTimeout(Promise.resolve(
      supabase.from('goods_received').insert({
        purchase_order_id: po.id,
        received_date: grnForm.received_date || undefined,
        is_complete: grnForm.is_complete,
        condition_notes: grnForm.condition_notes.trim() || null,
        discrepancy_notes: grnForm.discrepancy_notes.trim() || null,
      }).select()
    ))
    if (headRaced.timedOut) { setReceiving(false); return setGrnError({ key: 'timeout', params: {} }) }
    const headMessage = writeErrorKey(headRaced.value)
    if (headMessage) { setReceiving(false); return setGrnError(headMessage) }

    const grnId = headRaced.value.data![0].id
    const itemsRaced = await withTimeout(Promise.resolve(
      supabase.from('goods_received_items').insert(grnLines.map(l => ({
        goods_received_id: grnId,
        request_item_id: l.request_item_id,
        description: l.description,
        qty_ordered: l.qty_ordered,
        qty_received: Number(l.qty_received) || 0,
        unit: l.unit,
      }))).select()
    ))
    setReceiving(false)
    if (itemsRaced.timedOut) { load(); return setGrnError({ key: 'timeout', params: {} }) }
    const itemsMessage = writeErrorKey(itemsRaced.value)
    if (itemsMessage) { load(); return setGrnError(itemsMessage) }

    setGrnOpen(false); load()
  }

  // ── Resolve / reopen a shortfall ────────────────────
  // This is what keeps an order from being stranded: recompute_po_status counts
  // incomplete deliveries with resolved_at IS NULL, so closing the last open one
  // is the only thing that moves the order to received. The status is never
  // written from here — resolving the shortfall is the action, the new status is
  // the consequence.
  const openResolve = (g: GoodsReceived) => {
    setResolving(g); setResolutionNotes(''); setResolveError(null)
  }

  const resolveDiscrepancy = async () => {
    if (!resolving) return
    const note = resolutionNotes.trim()
    // goods_received_resolution_needs_notes only checks NOT NULL, so an empty
    // string would satisfy the database. The gate that matters is this one.
    if (!note) return
    setResolveBusy(true); setResolveError(null)
    // resolved_by is stamped by stamp_discrepancy_resolver from auth.uid().
    const raced = await withTimeout(Promise.resolve(supabase
      .from('goods_received')
      .update({ resolved_at: new Date().toISOString(), resolution_notes: note })
      .eq('id', resolving.id)
      .select()))
    setResolveBusy(false)
    if (raced.timedOut) return setResolveError({ key: 'timeout', params: {} })
    const message = writeErrorKey(raced.value)
    if (message) return setResolveError(message)
    setResolving(null); setResolutionNotes(''); load()
  }

  // Resolving in error would strand the order the other way — reading received
  // when it is not. The trigger recomputes on reopen and audits it as
  // goods.discrepancy_reopened, so the record survives the correction.
  const reopenDiscrepancy = async (g: GoodsReceived) => {
    setReopeningId(g.id); setGrnError(null)
    const raced = await withTimeout(Promise.resolve(supabase
      .from('goods_received')
      .update({ resolved_at: null, resolution_notes: null })
      .eq('id', g.id)
      .select()))
    setReopeningId(null)
    if (raced.timedOut) return setGrnError({ key: 'timeout', params: {} })
    const message = writeErrorKey(raced.value)
    if (message) return setGrnError(message)
    load()
  }

  // ── Render ──────────────────────────────────────────
  if (loading) {
    return <div className="text-sm text-gray-400 py-10 text-center">{t.loading}</div>
  }
  if (!request) {
    return (
      <div>
        <Link href="/dashboard/procurement/requests" className="text-xs text-indigo-600 font-medium">
          ← {t.backToRequests}
        </Link>
        {pageError
          ? <div className="mt-3"><Alert>{renderProcError(pageError, t.procErrors)}</Alert></div>
          : <div className="text-sm text-gray-400 py-10 text-center">{t.noData}</div>}
      </div>
    )
  }

  const statusLabel: Record<PurchaseRequestStatus, string> = {
    draft: t.statusDraft, submitted: t.statusSubmitted, approved: t.statusApproved,
    rejected: t.statusRejected, cancelled: t.statusCancelled, ordered: t.statusOrdered,
    completed: t.statusCompleted,
  }
  const items = [...(request.purchase_request_items ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  const lowest = quotes.length ? Math.min(...quotes.map(q => Number(q.total_usd))) : null
  const winner = quotes.find(q => q.is_selected) ?? null
  // The threshold compares against the request total the database maintains.
  const quotesRequired = threshold != null && Number(request.estimated_total_usd) >= threshold
  const canReceive = canWrite(role, 'goods_received')
  // Every unresolved shortfall stays visible on the order: a later complete
  // delivery does not clear an earlier one, and the PO status reflects that.
  // This mirrors recompute_po_status exactly — same predicate, so the panel and
  // the badge can never disagree about why the order reads as it does.
  const openDiscrepancies = grns.filter(g => !g.is_complete && !g.resolved_at)
  const poIsOpen = !!po && po.status !== 'cancelled' && po.status !== 'closed'
  const canIssuePO = canWrite(role, 'purchase_orders')
  const requestApproved = request.status === 'approved'
  // Mirrors enforce_po_controls so the user knows what is still missing. The
  // DB remains the authority — the button only hides work that cannot succeed.
  const poReady = requestApproved && !!winner
    && (!quotesRequired || minQuotes == null || quotes.length >= minQuotes)
  const poStatusLabel: Record<PurchaseOrderStatus, string> = {
    issued: t.statusIssued, partially_received: t.statusPartiallyReceived,
    received: t.statusReceived, cancelled: t.statusCancelled2, closed: t.statusClosed,
  }
  const progress = (minQuotes != null)
    ? t.quotesProgress.replace('{actual}', String(quotes.length)).replace('{required}', String(minQuotes))
    : `${quotes.length}`

  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">
        <Link href="/dashboard/procurement/requests" className="hover:text-gray-600">
          {t.procurement} › {t.requests}
        </Link>
        {' › '}{request.request_no}
      </div>

      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{request.title}</h1>
            <Badge variant={STATUS_VARIANT[request.status] ?? 'gray'}>
              {statusLabel[request.status] ?? request.status}
            </Badge>
          </div>
          <div className="text-xs text-gray-400 mt-0.5 font-mono">{request.request_no}</div>
          {request.justification && (
            <div className="text-xs text-gray-500 mt-1 italic max-w-xl">{request.justification}</div>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          {/* DB-maintained: displayed from the row, never recomputed */}
          <div className="text-lg font-bold text-gray-900 tabular-nums">{usd(request.estimated_total_usd)}</div>
          <Link href="/dashboard/procurement/requests"
            className="text-xs text-gray-400 hover:text-gray-600 inline-flex items-center gap-1 mt-1">
            <ArrowLeft size={11} />{t.backToRequests}
          </Link>
        </div>
      </div>

      {pageError && <div className="mb-3"><Alert>{renderProcError(pageError, t.procErrors)}</Alert></div>}

      {/* Line items */}
      {items.length > 0 && (
        <div className="mb-5">
          <div className="text-xs font-medium text-gray-500 mb-1.5">{t.lineItems}</div>
          <Table headers={[t.description, t.qty, t.unit, t.unitCost, t.lineTotal]} empty={false}>
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
        </div>
      )}

      {/* Quotes */}
      <div className="flex items-end justify-between mb-2">
        <div>
          <div className="text-sm font-bold text-gray-900">{t.quotes}</div>
          <div className="text-xs text-gray-400">
            {quotesRequired ? progress : (threshold != null
              ? t.quotesNotRequired.replace('{threshold}', usd(threshold))
              : progress)}
            {' · '}
            <span className={winner ? 'text-emerald-600 font-medium' : 'text-amber-600'}>
              {winner ? t.winnerChosen : t.noWinnerYet}
            </span>
            {!canEdit && <> · {t.quotesReadOnly}</>}
          </div>
        </div>
        {canEdit && (
          <Button variant="primary" size="sm" onClick={openCreate}
            disabled={availableVendors.length === 0}>
            <Plus size={13} />{t.addQuote}
          </Button>
        )}
      </div>

      {quotes.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-xl py-10 text-center">
          <div className="text-sm font-medium text-gray-700">{t.noQuotes}</div>
          <div className="text-xs text-gray-400 mt-1">{t.noQuotesSub}</div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {quotes.map(q => {
            const isLowest = lowest != null && Number(q.total_usd) === lowest
            return (
              <div key={q.id} className={
                'bg-white border rounded-xl p-4 flex flex-col ' +
                (q.is_selected ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-gray-100')
              }>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{q.vendors?.name ?? '—'}</div>
                    {q.quote_ref && <div className="text-xs text-gray-400 font-mono">{q.quote_ref}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {q.is_selected && <Badge variant="green">{t.selected}</Badge>}
                    {isLowest && <Badge variant="blue">{t.lowest}</Badge>}
                  </div>
                </div>

                <div className="text-xl font-bold text-gray-900 tabular-nums mt-2">{usd(q.total_usd)}</div>

                <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                  <div>{t.quoteDate}: {q.quote_date}</div>
                  {q.valid_until && <div>{t.validUntil}: {q.valid_until}</div>}
                  {q.attachment_ref && <div className="truncate">{q.attachment_ref}</div>}
                </div>

                {q.is_selected && q.selection_justification && (
                  <div className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1.5 mt-2">
                    {q.selection_justification}
                  </div>
                )}

                {canEdit && !q.is_selected && (
                  <Button variant="secondary" size="sm" className="mt-3 w-full"
                    onClick={() => openSelect(q)}>
                    <Trophy size={12} />{t.selectWinner}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Purchase order */}
      <div className="mt-6">
        <div className="flex items-end justify-between mb-2">
          <div className="text-sm font-bold text-gray-900">{t.purchaseOrder}</div>
          {!po && canIssuePO && (
            <Button variant="primary" size="sm"
              onClick={() => { setPoForm(emptyPO); setPoError(null); setPoOpen(true) }}
              disabled={!poReady}>
              <FileCheck size={13} />{t.issuePO}
            </Button>
          )}
        </div>

        {po ? (
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-gray-500">{po.po_number}</span>
                  <Badge variant={PO_STATUS_VARIANT[po.status] ?? 'gray'}>
                    {poStatusLabel[po.status] ?? po.status}
                  </Badge>
                </div>
                <div className="font-medium text-gray-900 mt-0.5">{po.vendors?.name ?? '—'}</div>
                <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                  <div>{t.issueDate}: {po.issue_date}</div>
                  {po.expected_delivery && <div>{t.expectedDelivery}: {po.expected_delivery}</div>}
                  {po.delivery_terms && <div>{t.deliveryTerms}: {po.delivery_terms}</div>}
                  {po.payment_terms && <div>{t.paymentTerms}: {po.payment_terms}</div>}
                </div>
              </div>
              <div className="text-lg font-bold text-gray-900 tabular-nums">{usd(po.total_usd)}</div>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1.5">{t.poReadiness}</div>
            <ul className="text-xs space-y-1">
              <li className={requestApproved ? 'text-emerald-600' : 'text-gray-400'}>
                {requestApproved ? '✓' : '○'} {t.needApproved}
              </li>
              {quotesRequired && minQuotes != null && (
                <li className={quotes.length >= minQuotes ? 'text-emerald-600' : 'text-gray-400'}>
                  {quotes.length >= minQuotes ? '✓' : '○'}{' '}
                  {t.needQuotes.replace('{required}', String(minQuotes))} ({quotes.length}/{minQuotes})
                </li>
              )}
              <li className={winner ? 'text-emerald-600' : 'text-gray-400'}>
                {winner ? '✓' : '○'} {t.needWinner}
              </li>
            </ul>
          </div>
        )}
        {poError && <div className="mt-2"><Alert>{renderProcError(poError, t.procErrors, requestStatusLabels(t))}</Alert></div>}
      </div>

      {/* Deliveries */}
      {po && (
        <div className="mt-6">
          <div className="flex items-end justify-between mb-2">
            <div>
              <div className="text-sm font-bold text-gray-900">{t.deliveries}</div>
              <div className="text-xs text-gray-400">
                {grns.length} · {poStatusLabel[po.status] ?? po.status}
                {!canReceive && <> · {t.deliveriesReadOnly}</>}
                {!poIsOpen && <> · {t.poNotOpenHint}</>}
              </div>
            </div>
            {canReceive && poIsOpen && (
              <Button variant="primary" size="sm" onClick={openGRN}>
                <PackageCheck size={13} />{t.recordDelivery}
              </Button>
            )}
          </div>

          {/* Not a list title — a statement about the order. A clerk who has just
              recorded a complete delivery and sees the order still reading
              partially received needs the rule, not the inventory of what is
              missing, and needs the action that changes it. */}
          {openDiscrepancies.length > 0 && (
            <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <div className="text-xs font-medium text-amber-800">
                {t.outstandingDiscrepancies.replace('{status}', poStatusLabel[po.status] ?? po.status)}
              </div>
              <ul className="mt-1.5 space-y-1">
                {openDiscrepancies.map(g => (
                  <li key={g.id} className="flex items-start justify-between gap-3">
                    <span className="text-xs text-amber-700">
                      <span className="font-mono">{g.grn_number}</span> — {g.discrepancy_notes}
                    </span>
                    {canReceive && poIsOpen && (
                      <Button variant="secondary" size="sm" onClick={() => openResolve(g)}>
                        <CheckCircle2 size={12} />{t.resolve}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {grns.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-xl py-8 text-center">
              <div className="text-sm font-medium text-gray-700">{t.noDeliveries}</div>
              <div className="text-xs text-gray-400 mt-1">{t.noDeliveriesSub}</div>
            </div>
          ) : (
            <div className="space-y-3">
              {grns.map(g => (
                <div key={g.id} className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                  <div className="flex items-start justify-between gap-4 px-4 py-3 border-b border-gray-50">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-500">{g.grn_number}</span>
                        <Badge variant={g.is_complete ? 'green' : 'amber'}>
                          {g.is_complete ? t.complete : t.incomplete}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{t.receivedDate}: {g.received_date}</div>
                      {g.condition_notes && <div className="text-xs text-gray-500 mt-1">{g.condition_notes}</div>}
                      {/* A resolved shortfall keeps its original wording: the
                          resolution is added to the record, it does not replace
                          what was found. */}
                      {g.discrepancy_notes && (
                        <div className={g.resolved_at ? 'text-xs text-gray-500 mt-1 line-through decoration-gray-300' : 'text-xs text-amber-700 mt-1'}>
                          {g.resolved_at && <span className="mr-1 no-underline">{t.originalShortfall}:</span>}
                          {g.resolved_at ? ` ${g.discrepancy_notes}` : g.discrepancy_notes}
                        </div>
                      )}
                      {g.resolved_at && (
                        <div className="mt-2 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5">
                          <div className="text-[11px] font-medium text-green-800">{t.resolvedDiscrepancy}</div>
                          <div className="text-xs text-green-700 mt-0.5">{g.resolution_notes}</div>
                          <div className="text-[11px] text-green-600/80 mt-1">
                            {t.resolvedBy} {g.resolver
                              ? `${g.resolver.first_name} ${g.resolver.last_name}`
                              : '—'} · {t.resolvedOn} {g.resolved_at.slice(0, 10)}
                          </div>
                        </div>
                      )}
                    </div>
                    {g.resolved_at && canReceive && poIsOpen && (
                      <Button variant="secondary" size="sm" disabled={reopeningId === g.id}
                        onClick={() => reopenDiscrepancy(g)}>
                        <RotateCcw size={12} />{reopeningId === g.id ? t.reopening : t.reopenDiscrepancy}
                      </Button>
                    )}
                  </div>
                  {(g.goods_received_items ?? []).length > 0 && (
                    <Table headers={[t.description, t.qtyOrdered, t.grnQtyReceived, t.unit]} empty={false}>
                      {(g.goods_received_items ?? []).map(it => (
                        <TR key={it.id}>
                          <TD className="text-gray-700">{it.description}</TD>
                          <TD className="text-gray-500">{it.qty_ordered ?? '—'}</TD>
                          <TD className={Number(it.qty_received) < Number(it.qty_ordered ?? 0)
                            ? 'text-amber-700 font-medium' : 'text-gray-900 font-medium'}>
                            {it.qty_received}
                          </TD>
                          <TD className="text-gray-500">{it.unit ?? '—'}</TD>
                        </TR>
                      ))}
                    </Table>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Issue purchase order */}
      <Modal
        open={poOpen}
        onClose={() => setPoOpen(false)}
        title={t.issuePO}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPoOpen(false)}>{t.cancel}</Button>
            <Button variant="primary" onClick={issuePO} disabled={issuing || !winner}>
              {issuing ? t.issuingPO : t.issuePO}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <div className="text-sm font-medium text-gray-900">{winner?.vendors?.name ?? '—'}</div>
            <div className="text-lg font-bold text-gray-900 tabular-nums">{usd(winner?.total_usd)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{t.poVendorLocked}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.expectedDelivery}>
              <Input type="date" value={poForm.expected_delivery}
                onChange={e => setPoForm(f => ({ ...f, expected_delivery: e.target.value }))} />
            </Field>
            <Field label={t.deliveryTerms}>
              <Input value={poForm.delivery_terms}
                onChange={e => setPoForm(f => ({ ...f, delivery_terms: e.target.value }))}
                placeholder="e.g. Delivered to Buea office" />
            </Field>
          </div>
          <Field label={t.paymentTerms}>
            <Input value={poForm.payment_terms}
              onChange={e => setPoForm(f => ({ ...f, payment_terms: e.target.value }))}
              placeholder="e.g. 30 days from delivery" />
          </Field>
          <Field label={t.notes}>
            <Textarea value={poForm.notes} rows={2}
              onChange={e => setPoForm(f => ({ ...f, notes: e.target.value }))} />
          </Field>
          <Alert>{renderProcError(poError, t.procErrors, requestStatusLabels(t))}</Alert>
        </div>
      </Modal>

      {/* Record delivery */}
      <Modal
        open={grnOpen}
        onClose={() => setGrnOpen(false)}
        title={t.recordDelivery}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setGrnOpen(false)}>{t.cancel}</Button>
            <Button variant="primary" onClick={saveGRN} disabled={receiving || !canSaveGRN}>
              {receiving ? t.recordingDelivery : t.save}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 items-end">
            <Field label={t.receivedDate}>
              <Input type="date" value={grnForm.received_date}
                onChange={e => setGrnForm(f => ({ ...f, received_date: e.target.value }))} />
            </Field>
            <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
              <input type="checkbox" checked={grnForm.is_complete}
                onChange={e => setGrnForm(f => ({ ...f, is_complete: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300" />
              {t.deliveryComplete}
            </label>
          </div>

          <div>
            <div className="grid grid-cols-[1fr_80px_80px_70px] gap-1.5 text-[10px] font-medium text-gray-400 px-0.5 mb-1">
              <span>{t.description}</span><span>{t.qtyOrdered}</span>
              <span>{t.grnQtyReceived}</span><span>{t.unit}</span>
            </div>
            <div className="space-y-1.5">
              {grnLines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_80px_70px] gap-1.5 items-center">
                  <span className="text-sm text-gray-700 truncate">{l.description}</span>
                  <span className="text-sm text-gray-500 tabular-nums">{l.qty_ordered}</span>
                  <Input type="number" min="0" step="any" value={l.qty_received}
                    onChange={e => setGrnLines(ls => ls.map((x, idx) =>
                      idx === i ? { ...x, qty_received: e.target.value } : x))} />
                  <span className="text-sm text-gray-500">{l.unit ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>

          <Field label={t.conditionNotes}>
            <Textarea value={grnForm.condition_notes} rows={2}
              onChange={e => setGrnForm(f => ({ ...f, condition_notes: e.target.value }))} />
          </Field>

          {!grnForm.is_complete && (
            <>
              <Field label={t.discrepancyNotes}>
                <Textarea value={grnForm.discrepancy_notes} rows={2}
                  onChange={e => setGrnForm(f => ({ ...f, discrepancy_notes: e.target.value }))}
                  placeholder="e.g. 2 of 10 chairs arrived damaged" />
              </Field>
              <div className="text-xs text-gray-400">{t.discrepancyHint}</div>
            </>
          )}

          <Alert>{renderProcError(grnError, t.procErrors, orderStatusLabels(t))}</Alert>
        </div>
      </Modal>

      {/* Resolve a shortfall — notes required */}
      <Modal
        open={resolving !== null}
        onClose={() => setResolving(null)}
        title={t.resolveDiscrepancy}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResolving(null)}>{t.cancel}</Button>
            <Button variant="primary" onClick={resolveDiscrepancy}
              disabled={resolveBusy || !resolutionNotes.trim()}>
              {resolveBusy ? t.resolving : t.resolve}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <div className="text-xs font-medium text-amber-800">
              <span className="font-mono">{resolving?.grn_number}</span> · {t.originalShortfall}
            </div>
            <div className="text-xs text-amber-700 mt-0.5">{resolving?.discrepancy_notes}</div>
          </div>
          <Field label={t.resolutionNotes}>
            <Textarea value={resolutionNotes} rows={3}
              onChange={e => setResolutionNotes(e.target.value)}
              placeholder="e.g. Vendor delivered the 3 missing chairs on 22 Sept" />
          </Field>
          <div className="text-xs text-gray-400">{t.resolutionNotesHint}</div>
          <Alert>{renderProcError(resolveError, t.procErrors, orderStatusLabels(t))}</Alert>
        </div>
      </Modal>

      {/* Add quote */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={t.newQuote}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>{t.cancel}</Button>
            <Button variant="primary" onClick={saveQuote} disabled={saving || !canSaveQuote}>
              {saving ? t.saving : t.save}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.vendor}>
              <Select value={form.vendor_id}
                onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))}>
                <option value="">—</option>
                {availableVendors.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </Select>
            </Field>
            <Field label={t.quoteTotal}>
              <Input type="number" min="0" step="any" value={form.total_usd}
                onChange={e => setForm(f => ({ ...f, total_usd: e.target.value }))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.quoteRef}>
              <Input value={form.quote_ref}
                onChange={e => setForm(f => ({ ...f, quote_ref: e.target.value }))}
                placeholder="e.g. QT-4471" />
            </Field>
            <Field label={t.quoteDate}>
              <Input type="date" value={form.quote_date}
                onChange={e => setForm(f => ({ ...f, quote_date: e.target.value }))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.validUntil}>
              <Input type="date" value={form.valid_until}
                onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} />
            </Field>
            <Field label={t.attachmentRef}>
              <Input value={form.attachment_ref}
                onChange={e => setForm(f => ({ ...f, attachment_ref: e.target.value }))} />
            </Field>
          </div>
          {availableVendors.length === 0 && (
            <div className="text-xs text-amber-600">{t.noApprovedVendors}</div>
          )}
          <Alert>{renderProcError(formError, t.procErrors)}</Alert>
        </div>
      </Modal>

      {/* Select winner — justification required */}
      <Modal
        open={selecting !== null}
        onClose={() => setSelecting(null)}
        title={t.selectWinner}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelecting(null)}>{t.cancel}</Button>
            <Button variant="primary" onClick={selectWinner} disabled={saving || !justification.trim()}>
              {saving ? t.selecting : t.selectWinner}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-sm text-gray-700">
            {selecting?.vendors?.name} · {usd(selecting?.total_usd)}
            {lowest != null && selecting && Number(selecting.total_usd) !== lowest && (
              <span className="text-amber-600"> · {t.lowest}: {usd(lowest)}</span>
            )}
          </div>
          <Field label={t.selectionJustification}>
            <Textarea value={justification} rows={3}
              onChange={e => setJustification(e.target.value)}
              placeholder="e.g. Only vendor able to deliver before the training date" />
          </Field>
          <div className="text-xs text-gray-400">{t.selectionJustificationHint}</div>
          <Alert>{renderProcError(selectError, t.procErrors)}</Alert>
        </div>
      </Modal>
    </div>
  )
}
