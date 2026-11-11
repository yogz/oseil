import type { IsoDate } from '@/lib/model/types'

// The device's local calendar date. toISOString() would give the UTC date,
// which is already tomorrow late in the evening in France.
export function todayIso(now: Date = new Date()): IsoDate {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

// Counted on the calendar in UTC, so a change of summer time never shifts a day.
export function addDays(date: IsoDate, days: number): IsoDate {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}
