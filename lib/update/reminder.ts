import { todayIso } from '@/lib/dates'
import type { IsoDate } from '@/lib/model/types'

export const REMINDER_MONTHS = 3

// The later of the statement date and the day it was saved (local calendar day):
// an old statement imported today, or a backdated one, still counts as an update today.
export function lastUpdateDay(latest: { takenOn: IsoDate; createdAt?: string }): IsoDate {
  if (!latest.createdAt) return latest.takenOn
  const saved = new Date(latest.createdAt)
  // An unreadable save day says nothing: the statement date stands, never a « NaN » that would
  // compare above every day and hide the reminder forever.
  if (Number.isNaN(saved.getTime())) return latest.takenOn
  const savedOn = todayIso(saved)
  return savedOn > latest.takenOn ? savedOn : latest.takenOn
}

// Adds calendar months, clamping to the last day of the target month.
function addMonths(date: IsoDate, months: number): IsoDate {
  const [year, month, day] = date.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDay)))
    .toISOString()
    .slice(0, 10)
}

// The last update over all snapshots (they are sorted by takenOn, not by the day they were saved:
// a backdated statement saved today is not last), and the latest statement date, the one shown.
export function lastUpdateOf(
  snapshots: readonly { value: { takenOn: IsoDate }; createdAt?: string }[],
): { day: IsoDate; takenOn: IsoDate } | null {
  const last = snapshots.at(-1)
  if (!last) return null
  const day = snapshots.slice(0, -1).reduce<IsoDate>((latest, s) => {
    const saved = lastUpdateDay({ takenOn: s.value.takenOn, createdAt: s.createdAt })
    return saved > latest ? saved : latest
  }, lastUpdateDay({ takenOn: last.value.takenOn, createdAt: last.createdAt }))
  return { day, takenOn: last.value.takenOn }
}

// Whole calendar months from one day to another: from 11 August to 11 November is 3, to 10 November 2.
export function monthsSince(from: IsoDate, today: IsoDate): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = today.split('-').map(Number)
  const months = (ty - fy) * 12 + (tm - fm)
  return addMonths(from, months) > today ? months - 1 : months
}

export function reminderDue(
  lastUpdate: IsoDate,
  today: IsoDate,
  dismissedOn: IsoDate | null,
): boolean {
  return today >= addMonths(lastUpdate, REMINDER_MONTHS) && dismissedOn !== today
}
