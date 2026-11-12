// « Compté en »: a line's kind or currency corrected, its history following
// (docs/superpowers/specs/2026-11-11-tout-corriger-depuis-la-fiche-design.md, § 6).
import { describe, expect, it } from 'vitest'
import { account, amountEntry, line, profileOf, snapshotOf, unitsEntry } from '@/lib/model/__tests__/fixtures'
import type { Profile, Snapshot } from '@/lib/model/types'
import type { StoredSnapshot, Write } from '../types'
import { finishRecount, recountChoices, recountLine, recountPreview, recountUnfinished } from '../recount'

const profile: Profile = profileOf(
  [account('pea', 'pea'), account('liv', 'livret-a'), account('loan', 'loan'), account('house', 'home')],
  [
    line('fund', 'pea', { kind: 'amount' }),
    line('other', 'pea', { kind: 'amount' }),
    line('liv-l', 'liv'),
    line('loan-l', 'loan'),
    line('house-l', 'house'),
  ],
)
const at = (takenOn: string, snapshot: Snapshot): Snapshot => ({ ...snapshot, takenOn })
const stored = (snapshots: Snapshot[]): StoredSnapshot[] => snapshots.map((value, i) => ({ id: `s${i}`, value }))
const history = stored([
  at('2026-08-31', snapshotOf([amountEntry('fund', 800), amountEntry('other', 100)])),
  at('2026-09-30', snapshotOf([amountEntry('other', 100)])), // the fund was not held then
  at('2026-10-31', snapshotOf([amountEntry('fund', 1_000), amountEntry('other', 100)], { USD: 0.9 })),
])
const snapshotWrites = (writes: Write[]) => writes.filter((w) => w.kind === 'snapshot') as Extract<Write, { kind: 'snapshot' }>[]
const profileWrite = (writes: Write[]) => (writes.find((w) => w.kind === 'profile') as Extract<Write, { kind: 'profile' }>).value
const writesOf = (planned: ReturnType<typeof recountLine>) => {
  if ('refused' in planned) throw new Error(planned.refused)
  return planned.writes
}

describe('what can be recounted', () => {
  it('a line of a PEA: parts or an amount, in any currency', () => {
    expect(recountChoices(profile, 'fund')).toEqual({ kinds: ['amount', 'units'], currencies: ['EUR', 'USD', 'GBP', 'CHF'] })
  })
  it('a livret: an amount only; a loan and a home: nothing', () => {
    expect(recountChoices(profile, 'liv-l')!.kinds).toEqual(['amount'])
    expect(recountChoices(profile, 'loan-l')).toBeNull()
    expect(recountChoices(profile, 'house-l')).toBeNull()
  })
})

describe('a currency corrected keeps the numbers', () => {
  it('1 000 € become 1 000 $: the snapshots that hold it get today’s rate where they had none', () => {
    const writes = writesOf(recountLine(profile, history, 'fund', { kind: 'amount', currency: 'USD' }, 0.95))
    const snaps = snapshotWrites(writes)
    // The latest first, then the older ones; the one that does not hold the line is left alone.
    expect(snaps.map((w) => w.id)).toEqual(['s0'])
    expect(snaps[0].value.fx).toEqual({ USD: 0.95 })
    expect(snaps[0].value.entries).toEqual(history[0].value.entries)
    expect(profileWrite(writes).lines.find((l) => l.id === 'fund')!.currency).toBe('USD')
    expect(writes.at(-1)!.kind).toBe('profile')
  })
  it('says what the latest becomes, and how many snapshots took today’s rate', () => {
    expect(recountPreview(profile, history, 'fund', { kind: 'amount', currency: 'USD' }, 0.95)).toEqual({
      snapshots: 2,
      before: 100_000,
      after: 90_000,
      todayRates: 1,
    })
  })
  it('without today’s rate where one is needed, nothing is written', () => {
    expect(recountLine(profile, history, 'fund', { kind: 'amount', currency: 'USD' }, null)).toEqual({ refused: 'no-rate' })
    expect(recountPreview(profile, history, 'fund', { kind: 'amount', currency: 'USD' }, null)).toBe('no-rate')
  })
  it('back to euros drops the rate of its purchases', () => {
    const usd: Profile = {
      ...profile,
      lines: profile.lines.map((l) => (l.id === 'fund' ? { ...l, kind: 'units' as const, currency: 'USD', purchase: { perEuro: 1.1 } } : l)),
    }
    const units = stored([snapshotOf([unitsEntry('fund', 2, 50, 40)], { USD: 0.9 })])
    const after = profileWrite(writesOf(recountLine(usd, units, 'fund', { kind: 'units', currency: 'EUR' }, null)))
    expect(after.lines.find((l) => l.id === 'fund')).not.toHaveProperty('purchase')
  })
})

describe('an amount counted in parts', () => {
  it('asks today’s parts; each snapshot keeps its value, its price drawn from it', () => {
    const writes = writesOf(recountLine(profile, history, 'fund', { kind: 'units', currency: 'EUR', units: 4 }, null))
    const snaps = snapshotWrites(writes)
    expect(snaps.map((w) => w.id)).toEqual(['s2', 's0'])
    const latest = snaps[0].value.entries.find((e) => e.lineId === 'fund')!
    expect(latest).toMatchObject({ kind: 'units', units: 4, unitPrice: 250, averagePrice: null })
    const oldest = snaps[1].value.entries.find((e) => e.lineId === 'fund')!
    expect(oldest).toMatchObject({ kind: 'units', units: 4, unitPrice: 200, averagePrice: null })
    expect(profileWrite(writes).lines.find((l) => l.id === 'fund')!.kind).toBe('units')
    expect(recountPreview(profile, history, 'fund', { kind: 'units', currency: 'EUR', units: 4 }, null)).toEqual({
      snapshots: 2,
      before: 100_000,
      after: 100_000,
      todayRates: 0,
    })
  })
  it('refuses no parts, or parts that are not a number', () => {
    expect(recountLine(profile, history, 'fund', { kind: 'units', currency: 'EUR', units: 0 }, null)).toEqual({ refused: 'not-allowed' })
    expect(recountLine(profile, history, 'fund', { kind: 'units', currency: 'EUR' }, null)).toEqual({ refused: 'not-allowed' })
  })
  it('a livret cannot hold parts', () => {
    expect(recountLine(profile, history, 'liv-l', { kind: 'units', currency: 'EUR', units: 1 }, null)).toEqual({ refused: 'not-allowed' })
  })
})

describe('parts counted as an amount', () => {
  const followed: Profile = {
    ...profile,
    lines: profile.lines.map((l) => (l.id === 'fund' ? { ...l, kind: 'units' as const, quoteSymbol: 'CW8.PA' } : l)),
  }
  const units = stored([snapshotOf([unitsEntry('fund', 3, 33.333, 30)])])
  it('keep their value; the average price and the followed price go', () => {
    const writes = writesOf(recountLine(followed, units, 'fund', { kind: 'amount', currency: 'EUR' }, null))
    expect(snapshotWrites(writes)[0].value.entries[0]).toEqual({ lineId: 'fund', kind: 'amount', amount: 10_000, seenOn: '2026-09-30' })
    expect(profileWrite(writes).lines.find((l) => l.id === 'fund')).not.toHaveProperty('quoteSymbol')
  })
})

describe('a recount cut short', () => {
  it('is seen when a snapshot disagrees with the line, and finished in the latest snapshot’s direction', () => {
    const writes = writesOf(recountLine(profile, history, 'fund', { kind: 'units', currency: 'EUR', units: 4 }, null))
    // Only the latest snapshot was written before the cut.
    const cut = history.map((s) => (s.id === 's2' ? { ...s, value: (writes[0] as Extract<Write, { kind: 'snapshot' }>).value } : s))
    expect(recountUnfinished(profile, history, 'fund')).toBe(false)
    expect(recountUnfinished(profile, cut, 'fund')).toBe(true)
    const finish = finishRecount(profile, cut, 'fund')
    if ('refused' in finish) throw new Error(finish.refused)
    expect(snapshotWrites(finish.writes).map((w) => w.id)).toEqual(['s0'])
    expect(profileWrite(finish.writes).lines.find((l) => l.id === 'fund')!.kind).toBe('units')
  })
  it('recounting again the same way changes nothing more', () => {
    const writes = writesOf(recountLine(profile, history, 'fund', { kind: 'units', currency: 'EUR', units: 4 }, null))
    const after = profileWrite(writes)
    const done = history.map((s) => snapshotWrites(writes).find((w) => w.id === s.id) ?? s)
    expect(snapshotWrites(writesOf(recountLine(after, done, 'fund', { kind: 'units', currency: 'EUR', units: 4 }, null)))).toEqual([])
  })
})

// Found by the review of the branch (11 November 2026).
describe('what the review found', () => {
  it('a line with a negative amount in a snapshot is never counted in parts: the snapshot would be unreadable', () => {
    const negative = stored([at('2026-08-31', snapshotOf([amountEntry('fund', -500)])), at('2026-10-31', snapshotOf([amountEntry('fund', 1_000)]))])
    expect(recountChoices(profile, 'fund', negative)!.kinds).toEqual(['amount'])
    expect(recountLine(profile, negative, 'fund', { kind: 'units', currency: 'EUR', units: 10 }, null)).toEqual({ refused: 'not-allowed' })
  })
  it('one change at a time: the kind and the currency together are refused, so a cut can always be finished', () => {
    expect(recountLine(profile, history, 'fund', { kind: 'units', currency: 'USD', units: 4 }, 0.9)).toEqual({ refused: 'not-allowed' })
  })
  it('the category a line took from its kind stays, written, in a life insurance', () => {
    const life: Profile = profileOf([account('av', 'life-insurance')], [line('fe', 'av', { kind: 'amount', group: 'euro-fund' })])
    const snaps = stored([snapshotOf([amountEntry('fe', 1_000)])])
    const after = profileWrite(writesOf(recountLine(life, snaps, 'fe', { kind: 'units', currency: 'EUR', units: 10 }, null)))
    expect(after.lines[0]).toMatchObject({ category: 'secured', group: 'euro-fund' })
  })
  it('from one foreign currency to another, the rate of its purchases goes', () => {
    const usd: Profile = {
      ...profile,
      lines: profile.lines.map((l) => (l.id === 'fund' ? { ...l, kind: 'units' as const, currency: 'USD', purchase: { perEuro: 1.08 } } : l)),
    }
    const units = stored([snapshotOf([unitsEntry('fund', 2, 50, 40)], { USD: 0.9, GBP: 1.15 })])
    expect(profileWrite(writesOf(recountLine(usd, units, 'fund', { kind: 'units', currency: 'GBP' }, null))).lines.find((l) => l.id === 'fund')).not.toHaveProperty('purchase')
  })
  it('a rate that is there but unusable is replaced by today’s', () => {
    const broken = stored([snapshotOf([amountEntry('fund', 1_000)], { USD: 0 })])
    const snaps = snapshotWrites(writesOf(recountLine(profile, broken, 'fund', { kind: 'amount', currency: 'USD' }, 0.95)))
    expect(snaps[0].value.fx).toEqual({ USD: 0.95 })
  })
})
