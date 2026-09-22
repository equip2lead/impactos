// Diffs the client-side error map in src/lib/pgError.ts against what the live
// database can actually raise.
//
//   node scripts/sweep-error-map.mjs
//
// Re-run after any migration that adds or renames a trigger or a constraint.
// The two DB lists below are the output of these two queries — refresh them
// from the database, do not edit them by hand from memory:
//
//   -- every PROC_* key any function can raise
//   SELECT DISTINCT m[1] FROM pg_proc p
//     JOIN pg_namespace n ON n.oid = p.pronamespace
//     CROSS JOIN LATERAL regexp_matches(pg_get_functiondef(p.oid),'(PROC_[A-Z_]+)','g') m
//    WHERE n.nspname='public' ORDER BY 1;
//
//   -- every CHECK / UNIQUE constraint on the procurement tables
//   SELECT c.relname, con.conname FROM pg_constraint con
//     JOIN pg_class c ON c.oid=con.conrelid
//     JOIN pg_namespace n ON n.oid=c.relnamespace
//    WHERE n.nspname='public' AND con.contype IN ('c','u') ORDER BY 1,2;
//
// Exits non-zero when the map and the database disagree.
import { PROC_ERROR_KEYS, PROC_CONSTRAINT_KEYS } from '../src/lib/pgError.ts'

const DB_PROC_KEYS = [
  'PROC_ALREADY_IN_ORG','PROC_APPROVAL_ROLE_REQUIRED','PROC_INSUFFICIENT_QUOTES',
  'PROC_NOT_SIGNED_IN','PROC_NO_QUOTE_SELECTED','PROC_ORG_BIND_FAILED',
  'PROC_ORG_IMMUTABLE','PROC_ORG_NAME_REQUIRED','PROC_PO_NOT_OPEN',
  'PROC_REQUEST_NOT_APPROVED','PROC_REQUESTER_IMMUTABLE','PROC_ROLE_CHANGE_DENIED',
  'PROC_SELF_APPROVAL','PROC_SELF_ROLE_CHANGE','PROC_STATUS_UPDATE_FAILED',
  'PROC_VENDOR_BLACKLISTED','PROC_VENDOR_MISMATCH',
]

// Constraints a client write can violate. Excluded: *_pkey, FKs, the uniques
// on sequence-generated columns (request_no, po_number, grn_number) which no
// client value can collide with, and procurement_settings_org_id_key — the UI
// only ever UPDATEs that row and never sends org_id, so there is no insert
// path from the client to collide on.
const DB_CLIENT_REACHABLE = [
  'goods_received_discrepancy_needs_notes','goods_received_only_incomplete_resolvable',
  'goods_received_resolution_needs_notes','goods_received_items_qty_received_check',
  'procurement_settings_min_quotes_required_check',
  'purchase_orders_one_per_request','purchase_orders_total_usd_check',
  'purchase_request_items_qty_check','purchase_request_items_unit_cost_estimate_usd_check',
  'purchase_requests_estimated_total_usd_check','purchase_requests_rejection_needs_reason',
  'quotes_one_selected_per_request','quotes_purchase_request_id_vendor_id_key',
  'quotes_selected_needs_justification','quotes_total_usd_check',
  'vendors_blacklist_needs_reason','vendors_org_id_name_key',
]

const diff = (a, b) => a.filter(x => !b.includes(x))
const r = {
  proc_unmapped:   diff(DB_PROC_KEYS, [...PROC_ERROR_KEYS]),
  proc_stale:      diff([...PROC_ERROR_KEYS], DB_PROC_KEYS),
  constraint_unmapped: diff(DB_CLIENT_REACHABLE, [...PROC_CONSTRAINT_KEYS]),
  constraint_stale:    diff([...PROC_CONSTRAINT_KEYS], DB_CLIENT_REACHABLE),
}
console.log(JSON.stringify(r, null, 1))
const bad = Object.values(r).some(v => v.length)
console.log(bad ? 'SWEEP: differences found' : 'SWEEP: clean')
process.exit(bad ? 1 : 0)
