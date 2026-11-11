import { expect, test } from 'vitest'
import { addDays, todayIso } from '@/lib/dates'

test('uses the local calendar date, not UTC', () => {
  expect(todayIso(new Date(2026, 10, 6, 23, 30))).toBe('2026-11-06')
  expect(todayIso(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01')
})

test('defaults to now', () => {
  expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

test('addDays counts calendar days, across months, years and leap days', () => {
  expect(addDays('2026-11-08', -7)).toBe('2026-11-01')
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  expect(addDays('2026-11-08', 0)).toBe('2026-11-08')
})

test('addDays does not shift a day across a change of summer time', () => {
  expect(addDays('2026-10-26', -1)).toBe('2026-10-25')
  expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
})
