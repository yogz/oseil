import { describe, expect, it } from 'vitest'
import { estimatedInterest, isEstimatedLivret, LIVRET_RATES, yearlyRate } from '@/lib/model/livret-interest'

describe('yearlyRate', () => {
  it('weighs each rate by its days in force, with a change on 1 August', () => {
    // 2015: 1 % from 1 January to 31 July (212 days), 0,75 % from 1 August (153 days).
    expect(yearlyRate('livret-a', 2015)).toBeCloseTo((212 * 0.01 + 153 * 0.0075) / 365, 12)
    // 2025: 3 % in January (31 days), 2,4 % from 1 February (181), 1,7 % from 1 August (153).
    expect(yearlyRate('livret-a', 2025)).toBeCloseTo((31 * 0.03 + 181 * 0.024 + 153 * 0.017) / 365, 12)
  })

  it('counts the 366 days of a leap year', () => {
    // LEP 2024: 6 % in January (31 days), 5 % from 1 February (182), 4 % from 1 August (153).
    expect(yearlyRate('lep', 2024)).toBeCloseTo((31 * 0.06 + 182 * 0.05 + 153 * 0.04) / 366, 12)
  })

  it('keeps a whole year at one rate', () => {
    expect(yearlyRate('livret-a', 2024)).toBeCloseTo(0.03, 12)
    expect(yearlyRate('lep', 2017)).toBeCloseTo(0.0125, 12)
  })

  it('gives the LDDS the Livret A rate', () => {
    expect(yearlyRate('ldds', 2025)).toBe(yearlyRate('livret-a', 2025))
  })

  it('knows nothing of a year that begins before the table', () => {
    expect(yearlyRate('livret-a', 2014)).toBeNull()
    expect(yearlyRate('lep', 2010)).toBeNull()
  })

  it('keeps the last rate after the last date', () => {
    const last = LIVRET_RATES['livret-a'].at(-1)!
    expect(yearlyRate('livret-a', 2030)).toBeCloseTo(last.rate, 12)
  })
})

describe('estimatedInterest', () => {
  it('estimates each 31 December of a period, each on the same balance (two years)', () => {
    // 10 000 € on a Livret A: 2024 at 3 % (300,00 €), then 2025 at its average (215,75 €).
    const y2025 = Math.round(1_000_000 * yearlyRate('livret-a', 2025)!)
    expect(y2025).toBe(21_575)
    expect(estimatedInterest('livret-a', 1_000_000, '2024-11-30', '2026-01-15')).toBe(30_000 + 21_575)
  })

  it('gives a 31 December taken as a relevé to the next period', () => {
    // A relevé taken on 31 December 2025: the 2025 interest is not yet in it.
    expect(estimatedInterest('livret-a', 1_000_000, '2025-06-30', '2025-12-31')).toBe(0)
    expect(estimatedInterest('livret-a', 1_000_000, '2025-12-31', '2026-03-01')).toBe(21_575)
  })

  it('finds nothing in a period with no 31 December', () => {
    expect(estimatedInterest('lep', 500_000, '2026-01-10', '2026-09-30')).toBe(0)
  })

  it('estimates nothing on an empty or negative balance', () => {
    expect(estimatedInterest('livret-a', 0, '2024-11-30', '2025-01-15')).toBe(0)
    expect(estimatedInterest('livret-a', -100, '2024-11-30', '2025-01-15')).toBe(0)
  })

  it('adds nothing for a year before the table', () => {
    // 2014 is unknown; 2015 is estimated.
    const y2015 = Math.round(1_000_000 * yearlyRate('livret-a', 2015)!)
    expect(estimatedInterest('livret-a', 1_000_000, '2014-06-01', '2016-01-10')).toBe(y2015)
  })
})

describe('isEstimatedLivret', () => {
  it('estimates the three livrets whose rate the State sets, and no other', () => {
    expect(isEstimatedLivret('livret-a')).toBe(true)
    expect(isEstimatedLivret('ldds')).toBe(true)
    expect(isEstimatedLivret('lep')).toBe(true)
    for (const type of ['livret-jeune', 'pel-cel', 'other-savings', 'current'] as const) {
      expect(isEstimatedLivret(type)).toBe(false)
    }
  })
})
