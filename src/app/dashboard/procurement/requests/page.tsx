'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useApp } from '@/hooks/useApp'
import { useLang } from '@/context/LangContext'
import { createClient } from '../../../../../lib/supabase'
import {
  Button, Modal, Field, Input, Select, Textarea, Table, TR, TD, Tabs, Badge, Alert,
} from '@/components/ui'
import { Plus, Trash2, ChevronRight, ChevronDown } from 'lucide-react'
import { pgErrorKey, writeErrorKey, renderProcError, type ProcError } from '@/lib/pgError'
import { canWrite } from '@/lib/procurementAccess'
import { withTimeout } from '@/lib/withTimeout'
import type { PurchaseRequest, PurchaseRequestItem, PurchaseRequestStatus, BudgetCategory } from '@/types'

/** Tab ids are the enum values, so the DB stays the single source of truth. */
const TAB_KEYS = ['all', 'draft', 'submitted', 'approved', 'rejected'] as const
type TabKey = (typeof TAB_KEYS)[number]

const STATUS_VARIANT: Record<PurchaseRequestStatus, 'gray' | 'amber' | 'green' | 'red' | 'blue'> = {
  draft: 'gray', submitted: 'amber', approved: 'green', rejected: 'red',
  cancelled: 'gray', ordered: 'blue', completed: 'green',
}

type LineDraft = { description: string; qty: string; unit: string; unit_cost: string }
const emptyLine: LineDraft = { description: '', qty: '1', unit: '', unit_cost: '0' }
const emptyForm = { title: '', justification: '', needed_by: '', budget_cat_id: '', stated_total: '0' }

/**
 * Itemised requests are totalled by the database from their line items; only a
 * lump-sum request (no lines) states its own figure and has it honoured.
 */
type RequestMode = 'itemised' | 'lump'

/** Matches the line_total_usd generated column: round(qty * unit_cost, 2). */
const lineTotal = (l: LineDraft) => {
  const n = Number(l.qty) * Number(l.unit_cost)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

const usd = (n: number | null | undefined) =>
  `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function RequestsPage() {
  // Unlike vendors, purchase_requests are project-scoped — the table has no
  // org_id at all, so everything here hangs off the active project.
  const { activeProject, role } = useApp()
  const { t } = useLang()
  const supabase = createClient()

  const canEdit = canWrite(role, 'purchase_requests')

  const [requests, setRequests] = useState<PurchaseRequest[]>([])
  const [budgetCats, setBudgetCats] = useState<BudgetCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('all')
  // Errors are stored unresolved so the wording follows the language toggle.
  const [pageError, setPageError] = useState<ProcError | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [mode, setMode] = useState<RequestMode>('itemised')
  const [lines, setLines] = useState<LineDraft[]>([{ ...emptyLine }])
  // itemsFailed marks the partial-save case; its prefix is joined at render.
  const [formError, setFormError] = useState<ProcError | null>(null)
  const [itemsFailed, setItemsFailed] = useState(false)
  const [saving, setSaving] = useState(false)

  // Bumped after every write so the list is re-read from the database. The
  // effect owns the query, so a project switch mid-flight cannot land stale rows.
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
          .order('created_at', { ascending: false })
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

  useEffect(() => {
    if (!activeProject) return
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('budget_categories').select('id,code,name,project_id,alloc_usd')
        .eq('project_id', activeProject.id).order('sort_order')
      if (cancelled) return
      setBudgetCats((data ?? []) as BudgetCategory[])
    })()
    return () => { cancelled = true }
  }, [activeProject]) // eslint-disable-line

  // ── Create ──────────────────────────────────────────
  const resetForm = () => {
    setForm(emptyForm); setLines([{ ...emptyLine }]); setMode('itemised')
  }
  const openCreate = () => {
    resetForm(); setFormError(null); setItemsFailed(false); setFormOpen(true)
  }

  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setLines(ls => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const addLine = () => setLines(ls => [...ls, { ...emptyLine }])
  const removeLine = (i: number) => setLines(ls => ls.filter((_, idx) => idx !== i))

  const isLumpSum = mode === 'lump'
  const filledLines = lines.filter(l => l.description.trim())
  /** Pre-save preview only. After save the database's figure is authoritative. */
  const previewTotal = filledLines.reduce((sum, l) => sum + lineTotal(l), 0)
  const canSave = isLumpSum ? form.stated_total.trim() !== '' : filledLines.length > 0

  const save = async () => {
    if (!activeProject) return
    const title = form.title.trim()
    if (!title || !canSave) return
    setSaving(true); setFormError(null)

    // request_no comes from a sequence default and status defaults to 'draft';
    // neither is ever sent from the client.
    //
    // estimated_total_usd is only ours to state on a lump-sum request. As soon
    // as line items exist, the recalc_request_total trigger derives it from
    // line_total_usd — a client-supplied figure would be overwritten anyway,
    // and understating it is exactly what used to slip past the approval and
    // quote thresholds. So we omit it and read back what the database computed.
    const reqRaced = await withTimeout(Promise.resolve(supabase
      .from('purchase_requests')
      .insert({
        project_id: activeProject.id,
        budget_cat_id: form.budget_cat_id || null,
        title,
        justification: form.justification.trim() || null,
        needed_by: form.needed_by || null,
        ...(isLumpSum ? { estimated_total_usd: Number(form.stated_total) || 0 } : {}),
        // requested_by is stamped by stamp_requester from auth.uid(); anything
        // the client sends is overwritten, so sending it would only mislead.
      })
      .select()))
    if (reqRaced.timedOut) { setSaving(false); setItemsFailed(false); return setFormError({ key: 'timeout', params: {} }) }
    const requestResult = reqRaced.value
    const requestMessage = writeErrorKey(requestResult)
    if (requestMessage) { setSaving(false); setItemsFailed(false); return setFormError(requestMessage) }

    if (isLumpSum) {
      setSaving(false); setFormOpen(false); resetForm(); load()
      return
    }

    // line_total_usd is generated by the database and is never written here.
    const requestId = requestResult.data![0].id
    const itemsRaced = await withTimeout(Promise.resolve(supabase
      .from('purchase_request_items')
      .insert(filledLines.map((l, i) => ({
        purchase_request_id: requestId,
        description: l.description.trim(),
        qty: Number(l.qty) || 0,
        unit: l.unit.trim() || null,
        unit_cost_estimate_usd: Number(l.unit_cost) || 0,
        sort_order: i,
      })))
      .select()))
    setSaving(false)
    // The request row already exists; a stall here leaves it without lines, so
    // report it the same way an outright failure is reported.
    if (itemsRaced.timedOut) { load(); setItemsFailed(true); return setFormError({ key: 'timeout', params: {} }) }
    const itemsMessage = writeErrorKey(itemsRaced.value)
    if (itemsMessage) {
      // The draft exists but is empty — say so rather than implying nothing saved.
      // Its total is still 0: the recalc trigger only fires once lines land.
      load()
      setItemsFailed(true)
      return setFormError(itemsMessage)
    }

    // Re-read rather than trusting the local sum: the row now carries the
    // database's total, computed from line_total_usd.
    setFormOpen(false); resetForm()
    load()
  }

  // ── Render ──────────────────────────────────────────
  if (!activeProject) {
    return <div className="text-gray-400 text-sm p-4">{t.selectProjectFirst}</div>
  }

  const statusLabel: Record<PurchaseRequestStatus, string> = {
    draft: t.statusDraft, submitted: t.statusSubmitted, approved: t.statusApproved,
    rejected: t.statusRejected, cancelled: t.statusCancelled, ordered: t.statusOrdered,
    completed: t.statusCompleted,
  }
  // Tab state is keyed on the enum value, not the translated label, so switching
  // language keeps the current tab selected.
  const tabLabels: Record<TabKey, string> = {
    all: t.all, draft: t.statusDraft, submitted: t.statusSubmitted,
    approved: t.statusApproved, rejected: t.statusRejected,
  }
  const shown = tab === 'all' ? requests : requests.filter(r => r.status === tab)

  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">
        {t.procurement} › {activeProject.name} › {t.requests}
      </div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t.requests}</h1>
          <div className="text-xs text-gray-400">
            {requests.length} {t.requests.toLowerCase()}
            {!canEdit && <> · {t.requestReadOnly}</>}
          </div>
        </div>
        {canEdit && (
          <Button variant="primary" size="sm" onClick={openCreate}>
            <Plus size={13} />{t.newRequest}
          </Button>
        )}
      </div>

      {pageError && <div className="mb-3"><Alert>{renderProcError(pageError, t.procErrors)}</Alert></div>}

      <Tabs
        tabs={TAB_KEYS.map(k => ({ key: k, label: tabLabels[k] }))}
        active={tab}
        onChange={key => setTab(TAB_KEYS.find(k => k === key) ?? 'all')}
      />

      {loading ? (
        <div className="text-sm text-gray-400 py-10 text-center">{t.loading}</div>
      ) : (
        <Table
          headers={['', t.requestNo, t.requestTitle, t.budgetLine, t.neededBy, t.estimatedTotal, t.status]}
          empty={shown.length === 0}
        >
          {shown.map(r => {
            const items = r.purchase_request_items ?? []
            const open = expanded === r.id
            return [
              <TR key={r.id}>
                <TD>
                  <button
                    onClick={() => setExpanded(open ? null : r.id)}
                    className="text-gray-400 hover:text-gray-700 transition-colors"
                    aria-label={r.request_no}
                  >
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                </TD>
                <TD className="font-mono text-xs text-gray-500">{r.request_no}</TD>
                <TD>
                  <Link href={`/dashboard/procurement/requests/${r.id}`}
                    className="font-medium text-gray-900 hover:text-indigo-600 transition-colors">
                    {r.title}
                  </Link>
                  <div className="text-xs text-gray-400">{items.length} {t.items}</div>
                </TD>
                <TD className="text-gray-500">
                  {r.budget_categories ? `${r.budget_categories.code} — ${r.budget_categories.name}` : '—'}
                </TD>
                <TD className="text-gray-500">{r.needed_by ?? '—'}</TD>
                <TD className="text-gray-900 font-medium">{usd(r.estimated_total_usd)}</TD>
                <TD>
                  <Badge variant={STATUS_VARIANT[r.status] ?? 'gray'}>
                    {statusLabel[r.status] ?? r.status}
                  </Badge>
                </TD>
              </TR>,
              open ? (
                <TR key={`${r.id}-items`} className="bg-gray-50/60">
                  <TD colSpan={7} className="!pt-0 !pb-3">
                    {r.justification && (
                      <div className="text-xs text-gray-500 mb-2 italic">{r.justification}</div>
                    )}
                    {items.length === 0 ? (
                      <div className="text-xs text-gray-400">{t.noData}</div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-400">
                            <th className="text-left font-medium py-1">{t.description}</th>
                            <th className="text-right font-medium py-1">{t.qty}</th>
                            <th className="text-left font-medium py-1 pl-2">{t.unit}</th>
                            <th className="text-right font-medium py-1">{t.unitCost}</th>
                            <th className="text-right font-medium py-1">{t.lineTotal}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...items]
                            .sort((a, b) => a.sort_order - b.sort_order)
                            .map((it: PurchaseRequestItem) => (
                              <tr key={it.id} className="border-t border-gray-200/70">
                                <td className="py-1 text-gray-700">{it.description}</td>
                                <td className="py-1 text-right text-gray-500">{it.qty}</td>
                                <td className="py-1 pl-2 text-gray-500">{it.unit ?? '—'}</td>
                                <td className="py-1 text-right text-gray-500">{usd(it.unit_cost_estimate_usd)}</td>
                                {/* generated column — display only */}
                                <td className="py-1 text-right text-gray-900 font-medium">{usd(it.line_total_usd)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    )}
                  </TD>
                </TR>
              ) : null,
            ]
          })}
        </Table>
      )}

      {/* Create request */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={t.newRequest}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>{t.cancel}</Button>
            <Button
              variant="primary"
              onClick={save}
              disabled={saving || !form.title.trim() || !canSave}
            >
              {saving ? t.saving : t.save}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t.requestTitle}>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Training materials for Cohort 3" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.budgetLine}>
              <Select value={form.budget_cat_id}
                onChange={e => setForm(f => ({ ...f, budget_cat_id: e.target.value }))}>
                <option value="">—</option>
                {budgetCats.map(bc => (
                  <option key={bc.id} value={bc.id}>{bc.code} — {bc.name}</option>
                ))}
              </Select>
            </Field>
            <Field label={t.neededBy}>
              <Input type="date" value={form.needed_by}
                onChange={e => setForm(f => ({ ...f, needed_by: e.target.value }))} />
            </Field>
          </div>
          <Field label={t.justification}>
            <Textarea value={form.justification} rows={2}
              onChange={e => setForm(f => ({ ...f, justification: e.target.value }))} />
          </Field>

          {/* Itemised vs lump sum — decides who owns the total */}
          <div className="flex gap-1 bg-gray-50 border border-gray-200 p-1 rounded-xl w-fit">
            {([['itemised', t.itemised], ['lump', t.lumpSum]] as const).map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)}
                className={
                  'px-3 py-1 rounded-lg text-xs font-medium transition-colors ' +
                  (mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')
                }>
                {label}
              </button>
            ))}
          </div>

          {isLumpSum ? (
            <>
              <Field label={t.statedTotal}>
                <Input type="number" min="0" step="any" value={form.stated_total}
                  onChange={e => setForm(f => ({ ...f, stated_total: e.target.value }))} />
              </Field>
              <div className="text-xs text-gray-400">{t.lumpSumHint}</div>
            </>
          ) : (
          /* Line items */
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-500">{t.lineItems}</label>
              <Button variant="ghost" size="sm" onClick={addLine}>
                <Plus size={12} />{t.addLine}
              </Button>
            </div>
            <div className="grid grid-cols-[1fr_60px_70px_90px_70px_28px] gap-1.5 text-[10px] font-medium text-gray-400 px-0.5 mb-1">
              <span>{t.description}</span><span>{t.qty}</span><span>{t.unit}</span>
              <span>{t.unitCost}</span><span className="text-right">{t.lineTotal}</span><span />
            </div>
            <div className="space-y-1.5">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_60px_70px_90px_70px_28px] gap-1.5 items-center">
                  <Input value={l.description} onChange={e => setLine(i, { description: e.target.value })}
                    placeholder="e.g. Flipchart paper" />
                  <Input type="number" min="0" step="any" value={l.qty}
                    onChange={e => setLine(i, { qty: e.target.value })} />
                  <Input value={l.unit} onChange={e => setLine(i, { unit: e.target.value })}
                    placeholder="pcs" />
                  <Input type="number" min="0" step="any" value={l.unit_cost}
                    onChange={e => setLine(i, { unit_cost: e.target.value })} />
                  {/* mirrors the generated column; never sent to the database */}
                  <span className="text-xs text-gray-500 text-right tabular-nums">{usd(lineTotal(l))}</span>
                  <button onClick={() => removeLine(i)} disabled={lines.length === 1}
                    className="text-gray-300 hover:text-red-600 disabled:opacity-30 disabled:hover:text-gray-300 transition-colors"
                    aria-label={t.delete}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center mt-2.5 pt-2 border-t border-gray-100">
              <span className="text-xs font-medium text-gray-500">{t.estimatedTotal}</span>
              <span className="text-sm font-bold text-gray-900 tabular-nums">{usd(previewTotal)}</span>
            </div>
            <div className="text-xs text-gray-400 mt-1">{t.totalFromLines}</div>
          </div>
          )}

          <div className="text-xs text-gray-400">{t.requestDraftHint}</div>
          {form.title.trim() && !isLumpSum && filledLines.length === 0 && (
            <div className="text-xs text-amber-600">{t.needAtLeastOneLine}</div>
          )}
          <Alert>{formError && (itemsFailed ? t.itemsFailed : '') + renderProcError(formError, t.procErrors)}</Alert>
        </div>
      </Modal>
    </div>
  )
}
