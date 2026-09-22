import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Procurement writes are governed by DB triggers, check constraints and RLS.
 *
 * The triggers carry a stable key in DETAIL and JSON interpolation params in
 * HINT — PostgREST surfaces these as error.details and error.hint. MESSAGE
 * stays English for the server logs and is never shown to the user.
 */

/** Trigger keys raised by the procurement functions. */
export const PROC_ERROR_KEYS = [
  'PROC_VENDOR_BLACKLISTED',
  'PROC_REQUEST_NOT_APPROVED',
  'PROC_INSUFFICIENT_QUOTES',
  'PROC_NO_QUOTE_SELECTED',
  'PROC_VENDOR_MISMATCH',
  'PROC_APPROVAL_ROLE_REQUIRED',
  'PROC_SELF_APPROVAL',
  'PROC_REQUESTER_IMMUTABLE',
  'PROC_PO_NOT_OPEN',
  'PROC_STATUS_UPDATE_FAILED',
  // protect_profile_identity — the tenant anchor is not self-writable.
  'PROC_SELF_ROLE_CHANGE',
  'PROC_ROLE_CHANGE_DENIED',
  'PROC_ORG_IMMUTABLE',
  // Onboarding.
  'PROC_ORG_NAME_REQUIRED',
  'PROC_ALREADY_IN_ORG',
  'PROC_NOT_SIGNED_IN',
  // Should be unreachable: the creator's profile vanished mid-transaction.
  // Mapped anyway — an unmapped key renders as the catch-all, and this one
  // would leave someone owning nothing with no owner able to readmit them.
  'PROC_ORG_BIND_FAILED',
] as const

/** Check / unique constraints we have user-facing copy for. */
export const PROC_CONSTRAINT_KEYS = [
  'quotes_selected_needs_justification',
  'quotes_one_selected_per_request',
  'vendors_blacklist_needs_reason',
  'vendors_org_id_name_key',
  'purchase_requests_rejection_needs_reason',
  'quotes_purchase_request_id_vendor_id_key',
  'purchase_orders_one_per_request',
  'goods_received_discrepancy_needs_notes',
  'goods_received_resolution_needs_notes',
  'goods_received_only_incomplete_resolvable',
  // Range checks on numbers the UI lets the user type. The inputs carry min=
  // but that only styles the spinner — a typed -1 still reaches the database,
  // and without these the refusal renders as the catch-all.
  'purchase_request_items_qty_check',
  'purchase_request_items_unit_cost_estimate_usd_check',
  'purchase_requests_estimated_total_usd_check',
  'quotes_total_usd_check',
  'purchase_orders_total_usd_check',
  'goods_received_items_qty_received_check',
  'procurement_settings_min_quotes_required_check',
] as const

export type ProcErrorKey =
  | (typeof PROC_ERROR_KEYS)[number]
  | (typeof PROC_CONSTRAINT_KEYS)[number]
  | 'denied'
  | 'timeout'
  | 'generic'

/**
 * The translated copy, supplied by the caller from LangContext so that
 * messages follow the user's language. Templates use {param} placeholders
 * filled from the trigger's HINT payload.
 */
export type ProcErrorStrings = Record<ProcErrorKey, string>

/** Replaces {param} placeholders; unknown placeholders are left in place. */
function interpolate(template: string, params: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    key in params ? String(params[key]) : placeholder
  )
}

/** HINT is JSON, but never let a malformed payload break the UI. */
function parseHint(hint: string | null | undefined): Record<string, unknown> {
  if (!hint) return {}
  try {
    const parsed = JSON.parse(hint)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    console.error('[procurement] trigger hint was not valid JSON', hint)
    return {}
  }
}

/** DETAIL carries the key; tolerate surrounding whitespace or wrapping text. */
function triggerKey(details: string | null | undefined): ProcErrorKey | null {
  if (!details) return null
  const trimmed = details.trim()
  return (
    PROC_ERROR_KEYS.find(key => key === trimmed) ??
    PROC_ERROR_KEYS.find(key => trimmed.includes(key)) ??
    null
  )
}

/** Postgres names the constraint in message, and sometimes only in details. */
function constraintKey(error: PostgrestError): ProcErrorKey | null {
  const haystack = `${error.message ?? ''} ${error.details ?? ''}`
  return PROC_CONSTRAINT_KEYS.find(name => haystack.includes(name)) ?? null
}

/**
 * An unresolved error: the key plus the params from the trigger's HINT.
 *
 * Pages store THIS in state, never a resolved string. The PROC_* design puts a
 * stable key in DETAIL and params in HINT precisely so the wording is chosen at
 * render time; resolving to text at catch time freezes it in whichever language
 * happened to be active when the error occurred, and a later EN/FR switch then
 * re-renders the whole screen around a message stuck in the old language.
 */
export type ProcError = { key: ProcErrorKey; params: Record<string, unknown> }

/** Classifies an error without choosing any wording. */
export function pgErrorKey(
  error: PostgrestError | null | undefined
): ProcError | null {
  if (!error) return null

  const fromTrigger = triggerKey(error.details)
  if (fromTrigger) return { key: fromTrigger, params: parseHint(error.hint) }

  if (error.code === '23505' || error.code === '23514') {
    const fromConstraint = constraintKey(error)
    if (fromConstraint) return { key: fromConstraint, params: {} }
    console.error('[procurement] unmapped constraint violation', error)
    return { key: 'generic', params: {} }
  }

  if (error.code === '42501') return { key: 'denied', params: {} }

  console.error('[procurement] unhandled postgrest error', error)
  return { key: 'generic', params: {} }
}

/**
 * Resolves a stored ProcError to text in the caller's current language.
 *
 * HINT carries raw enum values by design — it is machine-readable, and putting
 * translatable keys in the database would mean a migration per status. So a
 * {status} param arrives as e.g. 'partially_received' and is mapped here.
 * Callers pass the map for the enum their error refers to: request and order
 * statuses share values ('cancelled') but not translations, since in French
 * they disagree on gender.
 */
export function renderProcError(
  err: ProcError | null | undefined,
  strings: ProcErrorStrings,
  statusLabels?: Record<string, string>
): string | null {
  if (!err) return null
  // Badge strings are title-case; both messages that interpolate a status do so
  // mid-sentence ("the order is closed"), so lower-case it here rather than
  // keeping a second set of strings that differ only in capitalisation.
  const label = statusLabels && typeof err.params.status === 'string'
    ? statusLabels[err.params.status]
    : undefined
  const params = label
    ? { ...err.params, status: label.toLocaleLowerCase() }
    : err.params
  return interpolate(strings[err.key], params)
}

/**
 * Zero-row equivalent of pgErrorKey. RLS denials frequently surface as zero
 * affected rows rather than an error, so a mutation that comes back empty is a
 * permission failure. Every mutation must chain .select() for this to work.
 */
export function writeErrorKey<T>(
  result: { data: T[] | null; error: PostgrestError | null }
): ProcError | null {
  const fromError = pgErrorKey(result.error)
  if (fromError) return fromError

  if (!result.data || result.data.length === 0) {
    console.error('[procurement] mutation affected no rows — treating as an RLS denial', result)
    return { key: 'denied', params: {} }
  }
  return null
}

/**
 * Resolve-immediately convenience wrappers over the key-based API above.
 *
 * Use these only where the result is consumed at once (a log line, a one-shot
 * read). Anything stored in component state must keep the ProcError and resolve
 * with renderProcError at render, or the wording freezes in one language.
 */
export function pgErrorMessage(
  error: PostgrestError | null | undefined,
  strings: ProcErrorStrings
): string | null {
  return renderProcError(pgErrorKey(error), strings)
}

export function writeError<T>(
  result: { data: T[] | null; error: PostgrestError | null },
  strings: ProcErrorStrings
): string | null {
  return renderProcError(writeErrorKey(result), strings)
}
