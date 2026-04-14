export type UserRole = 'owner' | 'finance_officer' | 'coordinator' | 'staff' | 'viewer'

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
export interface ProjectSummary extends Project {
  participant_count: number; staff_count: number; total_income: number; total_expenses: number; avg_attendance: number | null; donor_count: number
}
