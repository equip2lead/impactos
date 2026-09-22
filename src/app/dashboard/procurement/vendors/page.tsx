'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/hooks/useApp'
import { useLang } from '@/context/LangContext'
import { createClient } from '../../../../../lib/supabase'
import {
  Button, Modal, Field, Input, Select, Textarea, Table, TR, TD, Tabs, Badge, Alert,
} from '@/components/ui'
import { Plus, Pencil, Check, Ban, RotateCcw } from 'lucide-react'
import { pgErrorKey, writeErrorKey, renderProcError, type ProcError } from '@/lib/pgError'
import { canWrite } from '@/lib/procurementAccess'
import { withTimeout } from '@/lib/withTimeout'
import type { Vendor } from '@/types'

const VENDOR_TYPES = ['Goods', 'Services', 'Works', 'Consultancy', 'Transport', 'Other']

const TAB_KEYS = ['all', 'approved', 'pending', 'blacklisted'] as const
type TabKey = (typeof TAB_KEYS)[number]

const emptyForm = {
  name: '', vendor_type: '', contact_person: '', email: '', phone: '',
  address: '', registration_no: '', tax_id: '', bank_details: '', notes: '',
}

/**
 * A vendor can be both approved and blacklisted — they are independent
 * booleans — so blacklisted always wins when we render a single state.
 */
function vendorBadge(v: Vendor, t: ReturnType<typeof useLang>['t']) {
  if (v.is_blacklisted) return <Badge variant="red">{t.blacklisted}</Badge>
  if (v.is_approved) return <Badge variant="green">{t.approved}</Badge>
  return <Badge variant="amber">{t.pendingApproval}</Badge>
}

export default function VendorsPage() {
  // Vendors are org-scoped, not project-scoped — no activeProject gate here.
  const { orgId, role } = useApp()
  const { t } = useLang()
  const supabase = createClient()

  const canEdit = canWrite(role, 'vendors')

  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabKey>('all')
  // Errors are stored unresolved so the wording follows the language toggle.
  const [pageError, setPageError] = useState<ProcError | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Vendor | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState<ProcError | null>(null)
  const [saving, setSaving] = useState(false)

  const [blacklisting, setBlacklisting] = useState<Vendor | null>(null)
  const [reason, setReason] = useState('')
  const [blacklistError, setBlacklistError] = useState<ProcError | null>(null)

  const [busyId, setBusyId] = useState<string | null>(null)

  // Bumped by mutations to re-run the fetch below. The effect owns the query so
  // an org switch mid-flight cannot land stale rows.
  const [reloadKey, setReloadKey] = useState(0)
  const load = () => setReloadKey(k => k + 1)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Raced: a stalled query would leave the page on "Loading…" with no
      // message and no way back except a reload the user has to think of.
      const res = await withTimeout(Promise.resolve(
        supabase.from('vendors').select('*').eq('org_id', orgId).order('name')
      ))
      if (cancelled) return
      if (res.timedOut) { setPageError({ key: 'timeout', params: {} }); setLoading(false); return }
      const { data, error } = res.value
      const err = pgErrorKey(error)
      if (err) setPageError(err)
      else {
        setPageError(null)
        setVendors((data ?? []) as Vendor[])
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [orgId, reloadKey]) // eslint-disable-line

  // ── Create / edit ───────────────────────────────────
  const openCreate = () => {
    setEditing(null); setForm(emptyForm); setFormError(null); setFormOpen(true)
  }

  const openEdit = (v: Vendor) => {
    setEditing(v)
    setForm({
      name: v.name ?? '', vendor_type: v.vendor_type ?? '', contact_person: v.contact_person ?? '',
      email: v.email ?? '', phone: v.phone ?? '', address: v.address ?? '',
      registration_no: v.registration_no ?? '', tax_id: v.tax_id ?? '',
      bank_details: v.bank_details ?? '', notes: v.notes ?? '',
    })
    setFormError(null); setFormOpen(true)
  }

  const save = async () => {
    const name = form.name.trim()
    if (!name) return
    setSaving(true); setFormError(null)

    // Only ever send the fields the user edits. Doc numbers, flags and
    // org_id on update are left to the database.
    const payload = {
      name,
      vendor_type: form.vendor_type || null,
      contact_person: form.contact_person.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      registration_no: form.registration_no.trim() || null,
      tax_id: form.tax_id.trim() || null,
      bank_details: form.bank_details.trim() || null,
      notes: form.notes.trim() || null,
    }

    const raced = await withTimeout(Promise.resolve(editing
      ? supabase.from('vendors').update(payload).eq('id', editing.id).select()
      : supabase.from('vendors').insert({ ...payload, org_id: orgId }).select()))
    setSaving(false)
    if (raced.timedOut) return setFormError({ key: 'timeout', params: {} })
    const message = writeErrorKey(raced.value)
    if (message) return setFormError(message)

    setFormOpen(false); setEditing(null); setForm(emptyForm)
    load()
  }

  // ── Approve ─────────────────────────────────────────
  const approve = async (v: Vendor) => {
    setBusyId(v.id); setPageError(null)
    const raced = await withTimeout(Promise.resolve(supabase
      .from('vendors').update({ is_approved: true }).eq('id', v.id).select()))
    setBusyId(null)
    if (raced.timedOut) return setPageError({ key: 'timeout', params: {} })
    const message = writeErrorKey(raced.value)
    if (message) return setPageError(message)
    load()
  }

  // ── Blacklist / un-blacklist ────────────────────────
  const openBlacklist = (v: Vendor) => {
    setBlacklisting(v); setReason(''); setBlacklistError(null)
  }

  const blacklist = async () => {
    if (!blacklisting) return
    const trimmed = reason.trim()
    // The DB enforces this too (vendors_blacklist_needs_reason); the guard
    // here just avoids a round trip we know will fail.
    if (!trimmed) return
    setSaving(true); setBlacklistError(null)
    const raced = await withTimeout(Promise.resolve(supabase
      .from('vendors')
      .update({ is_blacklisted: true, blacklist_reason: trimmed })
      .eq('id', blacklisting.id)
      .select()))
    setSaving(false)
    if (raced.timedOut) return setBlacklistError({ key: 'timeout', params: {} })
    const message = writeErrorKey(raced.value)
    if (message) return setBlacklistError(message)
    setBlacklisting(null); setReason(''); load()
  }

  const unblacklist = async (v: Vendor) => {
    setBusyId(v.id); setPageError(null)
    // Clear the reason alongside the flag or the check constraint is left
    // holding a reason for a vendor that is no longer blacklisted.
    const raced = await withTimeout(Promise.resolve(supabase
      .from('vendors')
      .update({ is_blacklisted: false, blacklist_reason: null })
      .eq('id', v.id)
      .select()))
    setBusyId(null)
    if (raced.timedOut) return setPageError({ key: 'timeout', params: {} })
    const message = writeErrorKey(raced.value)
    if (message) return setPageError(message)
    load()
  }

  // ── Render ──────────────────────────────────────────
  // Tab state is keyed on a stable id, not the translated label, so switching
  // language keeps the current tab selected.
  const tabLabels: Record<TabKey, string> = {
    all: t.all, approved: t.approved, pending: t.pendingApproval, blacklisted: t.blacklisted,
  }
  const shown = vendors.filter(v => {
    if (tab === 'approved') return v.is_approved && !v.is_blacklisted
    if (tab === 'pending') return !v.is_approved && !v.is_blacklisted
    if (tab === 'blacklisted') return v.is_blacklisted
    return true
  })

  const activeCount = vendors.filter(v => v.is_approved && !v.is_blacklisted).length
  const blockedCount = vendors.filter(v => v.is_blacklisted).length

  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">{t.procurement} › {t.vendors}</div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t.vendorRegister}</h1>
          <div className="text-xs text-gray-400">
            {vendors.length} {t.vendors.toLowerCase()} · {activeCount} {t.approved.toLowerCase()} · {blockedCount} {t.blacklisted.toLowerCase()}
            {!canEdit && <> · {t.vendorReadOnly}</>}
          </div>
        </div>
        {canEdit && (
          <Button variant="primary" size="sm" onClick={openCreate}>
            <Plus size={13} />{t.addVendor}
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
          headers={[t.name, t.type, t.contactPerson, t.phone, t.registrationNo, t.status, t.actions]}
          empty={shown.length === 0}
        >
          {shown.map(v => (
            <TR key={v.id}>
              <TD>
                <div className="font-medium text-gray-900">{v.name}</div>
                {v.email && <div className="text-xs text-gray-400">{v.email}</div>}
                {v.is_blacklisted && v.blacklist_reason && (
                  <div className="text-xs text-red-600 mt-0.5">{v.blacklist_reason}</div>
                )}
              </TD>
              <TD className="text-gray-500">{v.vendor_type ?? '—'}</TD>
              <TD className="text-gray-500">{v.contact_person ?? '—'}</TD>
              <TD className="text-gray-500">{v.phone ?? '—'}</TD>
              <TD className="text-gray-400 text-xs">{v.registration_no ?? '—'}</TD>
              <TD>{vendorBadge(v, t)}</TD>
              <TD>
                {canEdit ? (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(v)} disabled={busyId === v.id}>
                      <Pencil size={12} />{t.edit}
                    </Button>
                    {!v.is_approved && !v.is_blacklisted && (
                      <Button variant="secondary" size="sm" onClick={() => approve(v)} disabled={busyId === v.id}>
                        <Check size={12} />{t.approve}
                      </Button>
                    )}
                    {v.is_blacklisted ? (
                      <Button variant="secondary" size="sm" onClick={() => unblacklist(v)} disabled={busyId === v.id}>
                        <RotateCcw size={12} />{t.unblacklist}
                      </Button>
                    ) : (
                      <Button variant="danger" size="sm" onClick={() => openBlacklist(v)} disabled={busyId === v.id}>
                        <Ban size={12} />{t.blacklist}
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-gray-300">—</span>
                )}
              </TD>
            </TR>
          ))}
        </Table>
      )}

      {/* Create / edit vendor */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? t.editVendor : t.newVendor}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>{t.cancel}</Button>
            <Button variant="primary" onClick={save} disabled={saving || !form.name.trim()}>
              {saving ? t.saving : t.save}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t.vendorName}>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Buea Office Supplies Ltd" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.vendorType}>
              <Select value={form.vendor_type} onChange={e => setForm(f => ({ ...f, vendor_type: e.target.value }))}>
                <option value="">—</option>
                {VENDOR_TYPES.map(vt => <option key={vt} value={vt}>{vt}</option>)}
              </Select>
            </Field>
            <Field label={t.contactPerson}>
              <Input value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.email}>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </Field>
            <Field label={t.phone}>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </Field>
          </div>
          <Field label={t.address}>
            <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.registrationNo}>
              <Input value={form.registration_no} onChange={e => setForm(f => ({ ...f, registration_no: e.target.value }))} />
            </Field>
            <Field label={t.taxId}>
              <Input value={form.tax_id} onChange={e => setForm(f => ({ ...f, tax_id: e.target.value }))} />
            </Field>
          </div>
          <Field label={t.bankDetails}>
            <Textarea value={form.bank_details} onChange={e => setForm(f => ({ ...f, bank_details: e.target.value }))} rows={2} />
          </Field>
          <Field label={t.notes}>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </Field>
          <Alert>{renderProcError(formError, t.procErrors)}</Alert>
        </div>
      </Modal>

      {/* Blacklist — reason required */}
      <Modal
        open={blacklisting !== null}
        onClose={() => setBlacklisting(null)}
        title={t.blacklistVendor}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBlacklisting(null)}>{t.cancel}</Button>
            <Button variant="danger" onClick={blacklist} disabled={saving || !reason.trim()}>
              {saving ? t.saving : t.blacklist}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-sm text-gray-700">{blacklisting?.name}</div>
          <Field label={t.blacklistReason}>
            <Textarea value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Repeated late delivery on PO-2026-0014" />
          </Field>
          <div className="text-xs text-gray-400">{t.blacklistReasonHint}</div>
          <Alert>{renderProcError(blacklistError, t.procErrors)}</Alert>
        </div>
      </Modal>
    </div>
  )
}
