import { describe, expect, test } from 'vitest'
import {
  formatDayMonth,
  formatEuros,
  formatEurosShown,
  formatMoney,
  formatMoneyShown,
  formatMonthYear,
  setAmountsHidden,
  formatPercent1,
  formatWholePercent,
  formatPrice,
  formatShortDayMonth,
  formatUnits,
} from '@/lib/format'

const NNBSP = ' '
const NBSP = ' '

describe('formatEuros', () => {
  test('rounds to the euro with exact separators', () => {
    expect(formatEuros(17_200_000)).toBe(`172${NNBSP}000${NBSP}€`)
  })
  test('negative amounts', () => {
    expect(formatEuros(-20_000)).toBe(`−200${NBSP}€`)
  })
  test('rounds symmetrically', () => {
    expect(formatEuros(150)).toBe(`2${NBSP}€`)
    expect(formatEuros(-150)).toBe(`−2${NBSP}€`)
    expect(formatEuros(-20)).toBe(`0${NBSP}€`)
  })
  test('zero', () => {
    expect(formatEuros(0)).toBe(`0${NBSP}€`)
  })
})

describe('formatPrice', () => {
  test('two decimals', () => {
    expect(formatPrice(4.65)).toBe(`4,65${NBSP}€`)
    expect(formatPrice(692.3)).toMatch(/^692,30\s€$/)
  })
  test('in the currency of the line', () => {
    expect(formatPrice(10.392, 'GBP')).toMatch(/^10,39\s£GB$/)
    expect(formatPrice(692.3, 'EUR')).toBe(formatPrice(692.3))
  })
})

describe('formatMoney', () => {
  test('whole units, in the currency of the line', () => {
    expect(formatMoney(120_000, 'USD')).toMatch(/^1\s200\s\$US$/)
    expect(formatMoney(120_000, 'CHF')).toMatch(/^1\s200\sCHF$/)
  })
  test('rounds like formatEuros', () => {
    expect(formatMoney(-150, 'EUR')).toBe(formatEuros(-150))
    expect(formatMoney(17_200_000, 'EUR')).toBe(formatEuros(17_200_000))
    expect(formatMoney(-150, 'USD')).toMatch(/^−2\s\$US$/)
    expect(formatMoney(-20, 'USD')).toMatch(/^0\s\$US$/)
  })
})

describe('formatUnits', () => {
  test('integers and decimals', () => {
    expect(formatUnits(3800)).toBe(`3${NNBSP}800`)
    expect(formatUnits(0.5)).toBe('0,5')
    expect(formatUnits(0.12345678)).toBe('0,12345678')
    expect(formatUnits(-0)).toBe('0')
  })
})

describe('formatPercent1', () => {
  test('one decimal, narrow no-break space before the sign', () => {
    expect(formatPercent1(18.75)).toBe(`18,8${NNBSP}%`)
    expect(formatPercent1(-0.04)).toBe(`0,0${NNBSP}%`)
    expect(formatPercent1(25)).toBe(`25,0${NNBSP}%`)
    expect(formatPercent1(0)).toBe(`0,0${NNBSP}%`)
  })
})

describe('formatWholePercent', () => {
  test('a whole number, zero included, narrow no-break space before the sign', () => {
    expect(formatWholePercent(15)).toBe(`15${NNBSP}%`)
    expect(formatWholePercent(0)).toBe(`0${NNBSP}%`)
    expect(formatWholePercent(100)).toBe(`100${NNBSP}%`)
  })
})

describe('dates', () => {
  test('formatDayMonth omits the year when it is the current one', () => {
    expect(formatDayMonth('2026-09-30', '2026-11-06')).toBe('30 septembre')
  })
  test('formatDayMonth adds the year when different', () => {
    expect(formatDayMonth('2025-09-30', '2026-11-06')).toBe('30 septembre 2025')
  })
  test('formatDayMonth writes the first of the month as 1er', () => {
    expect(formatDayMonth('2026-10-01', '2026-11-06')).toBe('1er octobre')
    expect(formatDayMonth('2025-01-01', '2026-11-06')).toBe('1er janvier 2025')
  })
  test('formatShortDayMonth writes the first of the month as 1er', () => {
    expect(formatShortDayMonth('2026-06-01')).toBe('1er juin')
    expect(formatShortDayMonth('2026-10-01')).toBe('1er oct.')
    expect(formatShortDayMonth('2026-10-11')).toBe('11 oct.')
  })
  test('formatShortDayMonth', () => {
    expect(formatShortDayMonth('2026-09-30')).toBe('30 sept.')
  })
  test('formatMonthYear', () => {
    expect(formatMonthYear('2024-01-15')).toBe('janvier 2024')
  })
})

describe('hidden amounts', () => {
  test('the Shown formatters read « ••• »; the plain ones, prices and percents never do', () => {
    setAmountsHidden(true)
    try {
      expect(formatEurosShown(123_456)).toBe('•••')
      expect(formatMoneyShown(5_000, 'USD')).toBe('•••')
      expect(formatEuros(150_000)).toBe(`1${NNBSP}500${NBSP}€`)
      expect(formatMoney(5_000, 'USD')).toMatch(/^50\s\$US$/)
      expect(formatPrice(10.39, 'GBP')).toContain('10,39')
      expect(formatWholePercent(40)).toContain('40')
    } finally {
      setAmountsHidden(false)
    }
    expect(formatEurosShown(150_000)).toBe(`1${NNBSP}500${NBSP}€`)
  })
})
