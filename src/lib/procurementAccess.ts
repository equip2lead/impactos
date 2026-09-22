import type { UserRole } from '@/types'

/**
 * Mirrors the RLS write policies on the procurement tables. UI actions are
 * gated on these so users are not shown buttons whose writes the database
 * will refuse. A single isAdmin flag is too coarse here: staff and
 * coordinators can raise requests and enter quotes, but cannot issue POs.
 *
 * profiles.role is TEXT with a CHECK constraint permitting exactly
 * owner | finance | coordinator | staff | viewer. It does NOT use the
 * user_role enum that exists elsewhere in the schema.
 */

export type ProcurementTable =
  | 'vendors'
  | 'procurement_settings'
  | 'purchase_requests'
  | 'purchase_request_items'
  | 'quotes'
  | 'purchase_orders'
  | 'goods_received'

const EXCEPT_VIEWER: UserRole[] = ['owner', 'finance', 'coordinator', 'staff']
const FINANCE: UserRole[] = ['owner', 'finance']

const WRITE_ROLES: Record<ProcurementTable, UserRole[]> = {
  vendors: ['owner', 'finance', 'coordinator'],
  procurement_settings: FINANCE,
  purchase_requests: EXCEPT_VIEWER,
  purchase_request_items: EXCEPT_VIEWER,
  quotes: EXCEPT_VIEWER,
  purchase_orders: FINANCE,
  goods_received: EXCEPT_VIEWER,
}

/** Tables whose delete policy is narrower than their write policy. */
const DELETE_ROLES: Partial<Record<ProcurementTable, UserRole[]>> = {
  purchase_requests: FINANCE,
}

export function canWrite(role: UserRole, table: ProcurementTable): boolean {
  return WRITE_ROLES[table].includes(role)
}

export function canDelete(role: UserRole, table: ProcurementTable): boolean {
  return (DELETE_ROLES[table] ?? WRITE_ROLES[table]).includes(role)
}
