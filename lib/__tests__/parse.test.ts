import { describe, expect, test } from 'vitest'
import { parseDecimal, parseEuros } from '@/lib/parse'

describe('parseEuros', () => {
  test.each([
    ['10 000', 1_000_000],
    ['10000,50', 1_000_050],
    ['10 000,50', 1_000_050],
    ['1\u0020500\u0020€', 150_000],
    ['1\u00A0500\u00A0€', 150_000],
    ['200 €', 20_000],
    ['-200 €', -20_000],
    ['1 500,5', 150_050],
    ['10 000 000 000', 1_000_000_000_000],
    ['-200', -20_000],
    ['12.5', 1_250],
    ['0', 0],
    ['1 500 €', 150_000],
  ])('%s', (text, cents) => {
    expect(parseEuros(text)).toBe(cents)
  })
  test.each(['', '  ', 'abc', '12,345', '1,2,3', '-', '12abc', '1.500', '1€500', '€200', '-€200', '99999999999999999999'])('refuses %j', (text) => {
    expect(parseEuros(text)).toBeNull()
  })
})

describe('parseDecimal', () => {
  test.each([
    ['4,65', 4.65],
    ['4.65', 4.65],
    ['3 800', 3800],
    ['0,00123', 0.00123],
    ['0', 0],
    ['0.123', 0.123],
    ['4,651', 4.651],
    ['3800', 3800],
  ])('%s', (text, value) => {
    expect(parseDecimal(text)).toBe(value)
  })
  test.each(['', 'abc', '-3', '1,2,3', '3 €', '3.800', '12.500', '999.000', '9'.repeat(310)])('refuses %j', (text) => {
    expect(parseDecimal(text)).toBeNull()
  })
})
