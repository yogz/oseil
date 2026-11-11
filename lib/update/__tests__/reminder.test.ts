import { describe, expect, it } from 'vitest'
import { lastUpdateDay, lastUpdateOf, monthsSince, reminderDue } from '@/lib/update/reminder'

describe('reminderDue', () => {
  it('is due exactly three calendar months later', () => {
    expect(reminderDue('2026-02-11', '2026-05-10', null)).toBe(false)
    expect(reminderDue('2026-02-11', '2026-05-11', null)).toBe(true)
  })

  it('clamps to the last day of a shorter month', () => {
    expect(reminderDue('2025-11-30', '2026-02-28', null)).toBe(true)
    expect(reminderDue('2025-11-30', '2026-02-27', null)).toBe(false)
  })

  it('stays quiet for the day it was dismissed, not the next', () => {
    expect(reminderDue('2026-01-01', '2026-11-11', '2026-11-11')).toBe(false)
    expect(reminderDue('2026-01-01', '2026-11-11', '2026-11-10')).toBe(true)
  })

  it('does not fire right after an old statement is imported', () => {
    const today = '2026-11-11'
    const day = lastUpdateDay({ takenOn: '2024-03-01', createdAt: '2026-11-11T09:00:00Z' })
    expect(reminderDue(day, today, null)).toBe(false)
  })
})

describe('lastUpdateDay', () => {
  it('takes the save day over an old takenOn', () => {
    expect(lastUpdateDay({ takenOn: '2024-03-01', createdAt: '2026-11-11T09:00:00Z' })).toBe('2026-11-11')
  })
  it('takes the save day over a backdated takenOn', () => {
    expect(lastUpdateDay({ takenOn: '2026-07-01', createdAt: '2026-11-11T09:00:00Z' })).toBe('2026-11-11')
  })
  it('keeps takenOn when it is the later one or createdAt is absent', () => {
    expect(lastUpdateDay({ takenOn: '2026-11-11' })).toBe('2026-11-11')
    expect(lastUpdateDay({ takenOn: '2026-11-11', createdAt: '2026-01-01T09:00:00Z' })).toBe('2026-11-11')
  })
  it('falls back to takenOn when the save day cannot be read, instead of hiding the reminder forever', () => {
    expect(lastUpdateDay({ takenOn: '2026-07-01', createdAt: 'not a date' })).toBe('2026-07-01')
    expect(reminderDue(lastUpdateDay({ takenOn: '2026-07-01', createdAt: 'not a date' }), '2026-11-11', null)).toBe(true)
  })
})

describe('lastUpdateOf', () => {
  const snap = (takenOn: string, createdAt?: string) => ({ value: { takenOn }, createdAt })

  it('is null without any snapshot', () => {
    expect(lastUpdateOf([])).toBeNull()
  })

  it('takes the latest update over all snapshots, not only the last by takenOn', () => {
    // Sorted by takenOn: the backdated one, saved later, is not last.
    const snapshots = [snap('2026-01-05', '2026-11-10T09:00:00Z'), snap('2026-07-01', '2026-07-01T09:00:00Z')]
    expect(lastUpdateOf(snapshots)).toEqual({ day: '2026-11-10', takenOn: '2026-07-01' })
  })
})

describe('monthsSince', () => {
  it('counts whole calendar months', () => {
    expect(monthsSince('2026-08-11', '2026-11-11')).toBe(3)
    expect(monthsSince('2026-08-11', '2026-11-10')).toBe(2)
    expect(monthsSince('2025-11-30', '2026-02-28')).toBe(3)
    expect(monthsSince('2025-11-11', '2026-11-11')).toBe(12)
  })
})
