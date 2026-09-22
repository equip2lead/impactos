export type UserRole = 'owner' | 'finance' | 'coordinator' | 'staff' | 'viewer'

export interface Organisation {
  id: string; name: string; slug: string; logo_url?: string
  country?: string; city?: string; email?: string; phone?: string; website?: string; description?: string; created_at: string
}
export interface Profile {
  id: string; org_id?: string; first_name: string; last_name: string; email: string
  phone?: string; avatar_url?: string; role: UserRole; is_active: boolean; created_at: string
}
export interface Project {
  id: string; org_id: string; name: string; project_type: string; description?: string
  start_date?: string; end_date?: string; budget_usd?: number; target_count?: number
  color?: string; status: string; created_by?: string; created_at: string; updated_at: string
}
export interface Staff {
  id: string; org_id: string; first_name: string; last_name: string; email?: string; phone?: string
  role_title?: string; staff_type?: string; status?: string; base_salary_usd?: number
  contract_start?: string; contract_end?: string; pd_events?: number; notes?: string; created_at: string
  assignments?: StaffAssignment[]
}
export interface StaffAssignment {
  id: string; staff_id: string; project_id: string; role_in_project?: string
  commitment_pct?: number; salary_usd?: number; start_date?: string; end_date?: string; is_active?: boolean
}
export interface Participant {
  id: string; project_id: string; first_name: string; last_name: string; age?: number
  gender?: string; group_location?: string; baseline_level?: string; status?: string; created_at: string
}
export interface BulkEntry {
  id: string; project_id: string; entry_date: string; location?: string; count: number; category?: string; notes?: string; created_at: string
}
export interface AttendanceSession {
  id: string; project_id: string; session_date: string; session_type?: string; notes?: string; created_at: string
  present_count?: number; absent_count?: number; rate?: number
}
export interface AttendanceRecord {
  id: string; session_id: string; participant_id: string; status: string
}
export interface StaffAttendanceSession {
  id: string; project_id: string; session_date: string; session_type?: string; created_at: string
  present_count?: number; absent_count?: number; rate?: number
}
export interface Donor {
  id: string; project_id: string; name: string; donor_type?: string; contact_person?: string
  email?: string; phone?: string; grant_amount_usd?: number; status?: string; report_due?: string; notes?: string; created_at: string
}
export interface Income {
  id: string; project_id: string; source: string; amount_usd: number; income_date: string
  income_type?: string; reference?: string; donor_id?: string; created_at: string
}
export interface Expense {
  id: string; project_id: string; description: string; amount_usd: number; expense_date: string
  budget_cat_id?: string; reference?: string; created_at: string
  budget_categories?: BudgetCategory
}
export interface BudgetCategory {
  id: string; project_id: string; code: string; name: string; alloc_usd: number; sort_order?: number
}
export interface KPI {
  id: string; project_id: string; name: string; target_val: number; current_val: number; unit?: string; sort_order?: number; updated_at: string
}
export interface Milestone {
  id: string; project_id: string; title: string; due_date?: string; status: string; completed_at?: string
}
export interface Report {
  id: string; project_id: string; name: string; frequency?: string; due_date?: string; recipient?: string; status: string; submitted_at?: string
}
export interface SchedulePhase {
  id: string; project_id: string; name: string; period?: string; tag?: string; sort_order?: number; activities?: PhaseActivity[]
}
export interface PhaseActivity {
  id: string; phase_id: string; description: string; sort_order?: number
}
export interface InventoryItem {
  id: string; project_id: string; name: string; unit?: string; quantity_received: number; quantity_distributed: number; donor_source?: string; created_at: string
}
export interface DistributionEvent {
  id: string; project_id: string; event_date: string; location?: string; item_id?: string
  quantity_out: number; beneficiaries?: number; notes?: string; created_at: string
  inventory_items?: InventoryItem
}
export interface Payroll {
  id: string; staff_id: string; project_id?: string; amount_usd: number; period?: string; paid_date?: string; notes?: string; created_at: string; staff?: Staff
}
export interface LeaveRequest {
  id: string; staff_id: string; from_date?: string; to_date?: string; leave_type?: string; status: string; notes?: string; created_at: string; staff?: Staff
}
export interface Vendor {
  id: string; org_id: string; name: string; vendor_type?: string | null
  contact_person?: string | null; email?: string | null; phone?: string | null; address?: string | null
  registration_no?: string | null; tax_id?: string | null; bank_details?: string | null; notes?: string | null
  is_approved: boolean; is_blacklisted: boolean; blacklist_reason?: string | null
  created_at: string; updated_at: string
}
/** Mirrors the purchase_request_status enum. Approval lands in step 3. */
export type PurchaseRequestStatus =
  | 'draft' | 'submitted' | 'approved' | 'rejected' | 'cancelled' | 'ordered' | 'completed'

export interface PurchaseRequest {
  id: string
  /** Requests are project-scoped; the table has no org_id — RLS reaches org via projects. */
  project_id: string
  budget_cat_id?: string | null
  /** Server-generated from a sequence default. Never sent by the client. */
  request_no: string
  title: string
  justification?: string | null
  status: PurchaseRequestStatus
  estimated_total_usd: number
  needed_by?: string | null
  requested_by?: string | null
  approved_by?: string | null
  approved_at?: string | null
  rejection_reason?: string | null
  created_at: string
  updated_at: string
  purchase_request_items?: PurchaseRequestItem[]
  budget_categories?: BudgetCategory | null
}

export interface PurchaseRequestItem {
  id: string
  purchase_request_id: string
  description: string
  qty: number
  unit?: string | null
  unit_cost_estimate_usd: number
  /** Generated column: round(qty * unit_cost_estimate_usd, 2). Display only. */
  line_total_usd?: number | null
  sort_order: number
  created_at: string
}

export interface Quote {
  id: string
  purchase_request_id: string
  vendor_id: string
  quote_ref?: string | null
  quote_date: string
  total_usd: number
  valid_until?: string | null
  is_selected: boolean
  /** Required by quotes_selected_needs_justification whenever is_selected. */
  selection_justification?: string | null
  attachment_ref?: string | null
  created_at: string
  vendors?: Vendor | null
}

export type PurchaseOrderStatus =
  | 'issued' | 'partially_received' | 'received' | 'cancelled' | 'closed'

export interface PurchaseOrder {
  id: string
  purchase_request_id: string
  vendor_id: string
  /** Server-generated from a sequence default. Never sent by the client. */
  po_number: string
  status: PurchaseOrderStatus
  issue_date: string
  expected_delivery?: string | null
  total_usd: number
  delivery_terms?: string | null
  payment_terms?: string | null
  /** Stamped by enforce_po_controls from auth.uid(). Never sent. */
  issued_by?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
  vendors?: Vendor | null
}

export interface GoodsReceived {
  id: string
  purchase_order_id: string
  /** Server-generated from a sequence default. Never sent by the client. */
  grn_number: string
  received_date: string
  /** Stamped by block_receipt_on_closed_po from auth.uid(). Never sent. */
  received_by?: string | null
  condition_notes?: string | null
  /** Required by goods_received_discrepancy_needs_notes when not complete. */
  discrepancy_notes?: string | null
  is_complete: boolean
  /**
   * Set when a shortfall has been closed out. While this is null on any
   * incomplete delivery the order stays partially_received — recompute_po_status
   * reads exactly this. Only an incomplete delivery may carry it
   * (goods_received_only_incomplete_resolvable).
   */
  resolved_at?: string | null
  /** Stamped by stamp_discrepancy_resolver from auth.uid(). Never sent. */
  resolved_by?: string | null
  /** Required by goods_received_resolution_needs_notes whenever resolved_at is set. */
  resolution_notes?: string | null
  created_at: string
  goods_received_items?: GoodsReceivedItem[]
  /** Embedded via the resolved_by FK so the record names who closed it. */
  resolver?: { id: string; first_name: string; last_name: string } | null
}

export interface GoodsReceivedItem {
  id: string
  goods_received_id: string
  request_item_id?: string | null
  description: string
  qty_ordered?: number | null
  qty_received: number
  unit?: string | null
  created_at: string
}

export interface ProcurementSettings {
  id: string
  org_id: string
  quotes_required_threshold_usd: number
  min_quotes_required: number
  finance_approval_threshold_usd: number
  created_at: string
  /** Maintained by the procurement_touch_updated_at trigger. Never sent. */
  updated_at: string
}

export interface ProjectSummary extends Project {
  participant_count: number; staff_count: number; total_income: number; total_expenses: number; avg_attendance: number | null; donor_count: number
}
