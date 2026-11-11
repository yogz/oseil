import { describe, expect, it } from 'vitest'
import { parseQuote } from '../types'

const BASE = { price: 1, currency: 'EUR', asOf: '2026-11-10' }

describe('parseQuote', () => {
  it('keeps a valid kind', () => {
    expect(parseQuote({ ...BASE, kind: 'action' })).toEqual({ ...BASE, kind: 'action' })
    expect(parseQuote({ ...BASE, kind: 'crypto' })).toEqual({ ...BASE, kind: 'crypto' })
  })

  it.each(['bond', 3])('drops an unknown kind %j but keeps the quote', (kind) => {
    const quote = parseQuote({ ...BASE, kind })
    expect(quote).toEqual(BASE)
    expect('kind' in (quote as object)).toBe(false)
  })
})
