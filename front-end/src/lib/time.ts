import type { TimePeriod } from '../types'

// Mirrors the backend's derivePeriod: 6-12 morning, 12-16 day, 16-6 evening.
export function derivePeriodFromDate(date: Date): TimePeriod {
  const hour = date.getHours()
  if (hour >= 6 && hour < 12) return 'MORNING'
  if (hour >= 12 && hour < 16) return 'DAY'
  return 'EVENING'
}

export function deriveCurrentPeriod(): TimePeriod {
  return derivePeriodFromDate(new Date())
}

// A representative clock hour for each period, used to build an occurredAt
// timestamp from a (date, period) pair when the exact time doesn't matter.
const PERIOD_ANCHOR_HOUR: Record<TimePeriod, number> = {
  MORNING: 9,
  DAY: 14,
  EVENING: 20,
  WHOLE_DAY: 12,
}

export function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayDateString(): string {
  return toDateInputValue(new Date())
}

export function buildOccurredAt(dateStr: string, period: TimePeriod): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day, PERIOD_ANCHOR_HOUR[period], 0, 0)
  return date.toISOString()
}

export function periodLabel(period: TimePeriod): string {
  return period === 'WHOLE_DAY' ? 'whole day' : period.toLowerCase()
}

export function dayBoundsForDate(dateStr: string): { from: string; to: string } {
  const [year, month, day] = dateStr.split('-').map(Number)
  const from = new Date(year, month - 1, day, 0, 0, 0, 0)
  const to = new Date(year, month - 1, day, 23, 59, 59, 999)
  return { from: from.toISOString(), to: to.toISOString() }
}

// monthIndex is 0-based (JS Date convention).
export function monthBounds(year: number, monthIndex: number): { from: string; to: string } {
  const from = new Date(year, monthIndex, 1, 0, 0, 0, 0)
  const to = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999)
  return { from: from.toISOString(), to: to.toISOString() }
}
