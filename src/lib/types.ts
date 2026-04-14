// ─── Core entities ───────────────────────────────────────────────────────────

export interface Organisation {
  id: string
  name: string
  slug: string
  logo_url?: string
  country?: string
  city?: string
  email?: string
  phone?: string
  website?: string
  description?: string
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  org_id?: string
  first_name: string
  last_name: string
  email: string
  avatar_url?: string
  role: 'owner' | 'finance_officer' | 'coordinator' | 'staff' | 'viewer'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  org_id: string
  name: string
  project_type: string
  description?: string
  start_date?: string
  end_date?: string
  budget_usd: number
  target_count: number
  color: string
  status: 'Active' | 'Completed' | 'Paused' | 'Draft'
  created_by?: string
  created_at: string
  updated_at: string
}

export interface Staff {
  id: string
  org_id: string
  first_name: string
  last_name: string
  email?: string
  phone?: string
  role_title?: string
  staff_type: 'full-time' | 'part-time' | 'volunteer' | 'contractor'
  base_salary_usd: number
  contract_start?: string
  contract_end?: string
  status: 'active' | 'inactive' | 'pending'
  pd_events: number
  notes?: string
  created_at: string
  updated_at: string
}

export interface StaffProjectAssignment {
  id: string
  staff_id: string
  project_id: string
  role_in_project?: string
  commitment_pct: number
  salary_usd: number
  start_date?: string
  end_date?: string
  is_active: boolean
  created_at: string
  staff?: Staff
}

export interface Participant {
  id: string
  project_id: string
  first_name: string
  last_name: string
  age?: number
  gender: 'F' | 'M' | 'O'
  group_name?: string
  baseline_level?: string
  exit_level?: string
  status: 'Active' | 'Withdrawn' | 'Graduated'
  notes?: string
  enrolled_at?: string
  created_at: string
  updated_at: string
}

export interface AttendanceSession {
  id: string
  project_id: string
  session_date: string
  session_type?: string
  total_present: number
  total_absent: number
  rate_pct: number
  recorded_by?: string
  notes?: string
  created_at: string
}

export interface AttendanceRecord {
  id: string
  session_id: string
  participant_id: string
  status: 'present' | 'absent'
  created_at: string
}

export interface StaffAttendanceSession {
  id: string
  org_id: string
  project_id: string
  session_date: string
  session_type?: string
  recorded_by?: string
  notes?: string
  created_at: string
}

export interface StaffAttendanceRecord {
  id: string
  session_id: string
  staff_id: string
  status: 'present' | 'absent'
  created_at: string
}

export interface BulkBeneficiaryEntry {
  id: string
  project_id: string
  entry_date: string
  location?: string
  category: string
  count: number
  notes?: string
  recorded_by?: string
  created_at: string
}

export interface Donor {
  id: string
  project_id: string
  name: string
  donor_type?: string
  contact_person?: string
  email?: string
  phone?: string
  grant_amount_usd: number
  status: 'active' | 'prospect' | 'completed'
  report_due?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface Income {
  id: string
  project_id: string
  source: string
  amount_usd: number
  income_date: string
  income_type: string
  reference?: string
  donor_id?: string
  recorded_by?: string
  created_at: string
}

export interface BudgetCategory {
  id: string
  project_id: string
  code: string
  name: string
  alloc_usd: number
  sort_order: number
  created_at: string
}

export interface Expense {
  id: string
  project_id: string
  budget_cat_id?: string
  description: string
  amount_usd: number
  expense_date: string
  receipt_ref?: string
  recorded_by?: string
  created_at: string
  budget_category?: BudgetCategory
}

export interface Payroll {
  id: string
  org_id: string
  staff_id: string
  project_id?: string
  amount_usd: number
  period: string
  paid_date: string
  notes?: string
  recorded_by?: string
  created_at: string
  staff?: Staff
}

export interface LeaveRequest {
  id: string
  org_id: string
  staff_id: string
  leave_type: string
  from_date: string
  to_date: string
  status: 'pending' | 'approved' | 'denied'
  approved_by?: string
  notes?: string
  created_at: string
  staff?: Staff
}

export interface KPI {
  id: string
  project_id: string
  name: string
  target_val: number
  current_val: number
  unit: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Milestone {
  id: string
  project_id: string
  title: string
  due_date?: string
  status: 'upcoming' | 'in_progress' | 'done' | 'overdue'
  completed_at?: string
  created_at: string
}

export interface SchedulePhase {
  id: string
  project_id: string
  name: string
  period_text?: string
  tag: string
  sort_order: number
  created_at: string
  activities?: PhaseActivity[]
}

export interface PhaseActivity {
  id: string
  phase_id: string
  description: string
  sort_order: number
  created_at: string
}

export interface Report {
  id: string
  project_id: string
  name: string
  frequency: string
  due_date?: string
  recipient?: string
  status: 'upcoming' | 'submitted' | 'overdue'
  submitted_at?: string
  submitted_by?: string
  created_at: string
}

export interface InventoryItem {
  id: string
  project_id: string
  name: string
  unit: string
  qty_received: number
  qty_distributed: number
  donor_source?: string
  received_date?: string
  created_at: string
  updated_at: string
}

export interface DistributionEvent {
  id: string
  project_id: string
  item_id: string
  event_date: string
  location?: string
  qty_distributed: number
  beneficiaries: number
  notes?: string
  recorded_by?: string
  created_at: string
}

// ─── App state ────────────────────────────────────────────────────────────────

export type UserRole = 'owner' | 'finance_officer' | 'coordinator' | 'staff' | 'viewer'

export interface AppUser {
  id: string
  email: string
  profile?: Profile
  org?: Organisation
  role: UserRole
}
