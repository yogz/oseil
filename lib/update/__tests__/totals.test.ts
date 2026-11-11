import { describe, expect, test } from 'vitest'
import { amountEntry, exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import type { Account, Line, Profile, Snapshot } from '@/lib/model/types'
import { linesOf, setValue, startDraft, type UpdateLine } from '../draft'
import { ownValue, shownTotal } from '../totals'

const TODAY = '2026-11-07'
const fresh = () => startDraft('s1')

// Revolut: a current account in dollars, with two lines.
const revolut: Account = { id: 'revolut', establishmentId: 'boursobank', type: 'current', name: 'Revolut' }
const usd = (id: string): Line => ({ id, accountId: 'revolut', name: id, kind: 'amount', currency: 'USD' })
const eur = (id: string): Line => ({ id, accountId: 'revolut', name: id, kind: 'amount', currency: 'EUR' })

function revolutWith(lines: Line[], entries = [amountEntry(lines[0].id, 1_000), amountEntry(lines[1].id, 200)]) {
  const profile: Profile = { ...exampleProfile, accounts: [...exampleProfile.accounts, revolut], lines: [...exampleProfile.lines, ...lines] }
  // No rate at all: the total of the bank is read in the bank's currency, without one.
  const base: Snapshot = { ...exampleSnapshot, fx: {}, entries: [...exampleSnapshot.entries, ...entries] }
  const rows = linesOf(profile, fresh(), 'boursobank').filter((r) => r.account.id === 'revolut')
  return { profile, base, rows }
}

const peaRows = (): UpdateLine[] => linesOf(exampleProfile, fresh(), 'boursobank').filter((r) => r.account.id === 'pea')

// Review Focus 4: what a screen writes for one line never shows 0 and never throws. It is
// written in the line's own currency, as its bank shows it: no rate is needed.
describe('ownValue', () => {
  // Intl writes no-break and narrow no-break spaces; the tests read plain spaces.
  const plain = (s: string | null) => s?.replace(/[\u00a0\u202f]/g, ' ') ?? null

  test('euros: the value in euros', () => {
    expect(plain(ownValue(amountEntry('a', 1_000), eur('a')))).toBe('1 000 €')
  })

  test('dollars: the value in dollars, with no rate at all', () => {
    expect(plain(ownValue(amountEntry('a', 200), usd('a')))).toBe('200 $US')
  })

  test('parts in pounds: the parts at their price, in pounds', () => {
    const entry = { lineId: 'a', kind: 'units' as const, units: 10, unitPrice: 5, averagePrice: null, seenOn: TODAY }
    expect(plain(ownValue(entry, { ...usd('a'), kind: 'units', currency: 'GBP' }))).toBe('50 £GB')
  })

  test('an entry of another kind than its line: nothing to write', () => {
    expect(ownValue(amountEntry('a', 1_000), { ...usd('a'), kind: 'units' })).toBeNull()
  })
})

// Decision 14: « Total : 1 200 $US », what the bank shows.
describe('shownTotal', () => {
  test('two dollar lines: the total in dollars, with no rate needed', () => {
    const { base, rows } = revolutWith([usd('a'), usd('b')])
    expect(shownTotal(rows, base, fresh(), {})).toEqual({ minor: 120_000, currency: 'USD' })
  })

  test('a value typed counts instead of the base one', () => {
    const { base, rows } = revolutWith([usd('a'), usd('b')])
    const typed = setValue(fresh(), base, 'b', { kind: 'amount', amount: 30_000 }, TODAY, {})
    expect(shownTotal(rows, base, typed, {})).toEqual({ minor: 130_000, currency: 'USD' })
  })

  test('a dollar line and a euro line: no total', () => {
    const { base, rows } = revolutWith([usd('a'), eur('b')])
    expect(shownTotal(rows, base, fresh(), {})).toBeNull()
  })

  test('a line with no value yet: no total, never a total that leaves it out', () => {
    const { base, rows } = revolutWith([usd('a'), usd('b')], [amountEntry('a', 1_000)])
    expect(shownTotal(rows, base, fresh(), {})).toBeNull()
  })

  test('an entry of another kind than its line: no total', () => {
    const { base, rows } = revolutWith([usd('a'), { ...usd('b'), kind: 'units' }])
    expect(shownTotal(rows, base, fresh(), {})).toBeNull()
  })

  test('a units line reads today’s price, as its box does', () => {
    expect(shownTotal(peaRows(), exampleSnapshot, fresh(), {})).toEqual({ minor: 2_500_000, currency: 'EUR' })
    expect(shownTotal(peaRows(), exampleSnapshot, fresh(), { etf: 260 })).toEqual({ minor: 2_600_000, currency: 'EUR' })
  })

  test('a line closed now is left out', () => {
    const { base, rows } = revolutWith([usd('a'), eur('b')])
    const open = rows.map((r) => (r.line.id === 'b' ? { ...r, closed: true } : r))
    expect(shownTotal(open, base, fresh(), {})).toEqual({ minor: 100_000, currency: 'USD' })
  })

  test('no row: no total', () => {
    expect(shownTotal([], exampleSnapshot, fresh(), {})).toBeNull()
  })

  test('nothing throws, even with no rate in the base snapshot for any currency', () => {
    const { base, rows } = revolutWith([usd('a'), { ...usd('b'), currency: 'GBP' }])
    expect(() => shownTotal(rows, base, fresh(), {})).not.toThrow()
    expect(shownTotal(rows, base, fresh(), {})).toBeNull()
  })
})
