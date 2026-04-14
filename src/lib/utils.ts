import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function pct(a: number, b: number): number {
  if (!b) return 0
  return Math.round((a / b) * 100)
}

export function initials(first: string, last: string): string {
  return (first[0] || '') + (last[0] || '')
}

export function fmtDate(d?: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
