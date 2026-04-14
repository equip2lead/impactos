import { cn } from '@/lib/utils'
import { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

// ── Badge ─────────────────────────────────────────────
type BadgeVariant = 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'violet' | 'cyan'
const badgeStyles: Record<BadgeVariant, string> = {
  blue:   'bg-indigo-50 text-indigo-700',
  green:  'bg-emerald-50 text-emerald-700',
  amber:  'bg-amber-50 text-amber-700',
  red:    'bg-red-50 text-red-700',
  gray:   'bg-gray-100 text-gray-600',
  violet: 'bg-violet-50 text-violet-700',
  cyan:   'bg-cyan-50 text-cyan-700',
}

export function Badge({ variant = 'gray', children, className }: {
  variant?: BadgeVariant; children: ReactNode; className?: string
}) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold', badgeStyles[variant], className)}>
      {children}
    </span>
  )
}

export function statusBadge(status: string) {
  const s = status?.toLowerCase()
  if (['active','submitted','approved','present','done'].includes(s)) return <Badge variant="green">{status}</Badge>
  if (['upcoming','pending','in_progress'].includes(s)) return <Badge variant="amber">{status}</Badge>
  if (['overdue','absent','denied','cancelled','terminated'].includes(s)) return <Badge variant="red">{status}</Badge>
  if (['completed','graduated'].includes(s)) return <Badge variant="violet">{status}</Badge>
  if (['prospect','part-time','contractor'].includes(s)) return <Badge variant="blue">{status}</Badge>
  return <Badge variant="gray">{status}</Badge>
}

// ── Button ────────────────────────────────────────────
type BtnVariant = 'primary' | 'secondary' | 'danger' | 'finance' | 'ghost'
const btnStyles: Record<BtnVariant, string> = {
  primary:   'bg-gray-900 text-white border-gray-900 hover:bg-gray-800',
  secondary: 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50',
  danger:    'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
  finance:   'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  ghost:     'bg-transparent text-gray-500 border-transparent hover:bg-gray-50',
}

export function Button({ variant = 'secondary', size = 'md', children, className, ...props }: {
  variant?: BtnVariant; size?: 'sm' | 'md' | 'lg'; children: ReactNode; className?: string
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' }
  return (
    <button className={cn('inline-flex items-center gap-1.5 font-medium border rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed', sizes[size], btnStyles[variant], className)} {...props}>
      {children}
    </button>
  )
}

// ── Card ──────────────────────────────────────────────
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white border border-gray-100 rounded-xl p-4', className)}>
      {children}
    </div>
  )
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {action}
    </div>
  )
}

// ── MetricCard ────────────────────────────────────────
export function MetricCard({ label, value, sub, trend, icon, iconBg }: {
  label: string; value: string | number; sub?: string; trend?: { label: string; color: string }
  icon?: ReactNode; iconBg?: string
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium text-gray-400">{label}</span>
        {icon && (
          <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', iconBg || 'bg-gray-50')}>
            {icon}
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-900 tracking-tight leading-none mb-1">{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
      {trend && (
        <div className={cn('inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded mt-2', trend.color)}>
          {trend.label}
        </div>
      )}
    </div>
  )
}

// ── Progress bar ──────────────────────────────────────
export function ProgressBar({ value, max, color = '#4338CA', height = 5 }: {
  value: number; max: number; color?: string; height?: number
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="w-full bg-gray-100 rounded-full overflow-hidden" style={{ height }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

// ── Form fields ───────────────────────────────────────
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label className="text-xs font-medium text-gray-500">{label}</label>
      {children}
    </div>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input className={cn('w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-indigo-400 transition-colors placeholder:text-gray-300', className)} {...props} />
  )
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select className={cn('w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-indigo-400 transition-colors', className)} {...props}>
      {children}
    </select>
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn('w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-indigo-400 transition-colors resize-none', className)} rows={3} {...props} />
  )
}

// ── Empty state ───────────────────────────────────────
export function EmptyState({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{title}</div>
      {sub && <div className="text-sm text-gray-400 mb-3">{sub}</div>}
      {action}
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────
export function Tabs({ tabs, active, onChange }: {
  tabs: string[]; active: string; onChange: (t: string) => void
}) {
  return (
    <div className="flex gap-1 bg-gray-50 border border-gray-200 p-1 rounded-xl w-fit mb-4">
      {tabs.map(t => (
        <button key={t} onClick={() => onChange(t)}
          className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            active === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
          {t}
        </button>
      ))}
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────
export function Modal({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-16 px-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl border border-gray-200 p-5 w-full max-w-md max-h-[80vh] overflow-y-auto shadow-xl">
        <div className="text-base font-bold text-gray-900 mb-4">{title}</div>
        {children}
        {footer && <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-100">{footer}</div>}
      </div>
    </div>
  )
}

// ── Table ─────────────────────────────────────────────
export function Table({ headers, children, empty }: {
  headers: string[]; children: ReactNode; empty?: boolean
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 bg-gray-50 border-b border-gray-100">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty && (
        <div className="py-10 text-center text-sm text-gray-400">No records yet</div>
      )}
    </div>
  )
}

export function TR({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn('hover:bg-gray-50 border-b border-gray-50 last:border-0', className)}>{children}</tr>
}

export function TD({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 text-gray-700', className)}>{children}</td>
}
