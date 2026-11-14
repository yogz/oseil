import { describe, expect, it } from 'vitest'
import { exampleProfile, unitsEntry } from '@/lib/model/__tests__/fixtures'
import { splitChange } from '@/lib/model/change'
import { parseProfile } from '@/lib/model/documents'
import { computeSituation } from '@/lib/model/situation'
import type { Cents, IsoDate, Line, Profile, Snapshot, SnapshotEntry } from '@/lib/model/types'
import {
  closeLine,
  closingBounds,
  closingRewrites,
  closingUnfinished,
  correctFigures,
  correctFiguresAt,
  deleteLine,
  finishClosing,
  reopenLine,
} from '../snapshot-changes'
import type { Planned, StoredSnapshot, Write } from '../types'

const s = (id: string, takenOn: IsoDate, entries: SnapshotEntry[], extra: Partial<Snapshot> = {}): StoredSnapshot => ({
  id,
  value: { schema: 1, takenOn, fx: {}, entries, contributions: {}, arrivals: {}, ...extra },
})
const livret = (amount: Cents, seenOn: IsoDate): SnapshotEntry => ({ lineId: 'livret-a-line', kind: 'amount', amount, seenOn })
const amount = (lineId: string, cents: Cents, seenOn: IsoDate): SnapshotEntry => ({ lineId, kind: 'amount', amount: cents, seenOn })
const etf = unitsEntry('etf', 100, 250, 200, '2026-10-01')

type SnapshotWrite = Extract<Write, { kind: 'snapshot' }>
type ProfileWrite = Extract<Write, { kind: 'profile' }>
const ids = (writes: Write[]) => writes.map((w) => (w.kind === 'snapshot' ? w.id : 'profile'))
const snapshotWrites = (writes: Write[]) => writes.filter((w): w is SnapshotWrite => w.kind === 'snapshot')
const profileIn = (write: Write): Profile => (write as ProfileWrite).value
const lineIn = (profile: Profile, lineId: string): Line | undefined => profile.lines.find((l) => l.id === lineId)
function writesOf(planned: Planned): Write[] {
  if ('refused' in planned) throw new Error(`Refused: ${planned.refused}`)
  return planned.writes
}
// The snapshots once the writes are made, by id.
function applied(snapshots: StoredSnapshot[], writes: Write[]): Record<string, Snapshot> {
  const byId = Object.fromEntries(snapshots.map((x) => [x.id, x.value]))
  for (const w of snapshotWrites(writes)) byId[w.id] = w.value
  return byId
}
const afterWrites = (snapshots: StoredSnapshot[], writes: Write[]): StoredSnapshot[] => {
  const byId = applied(snapshots, writes)
  return snapshots.map((x) => ({ id: x.id, value: byId[x.id] }))
}
const closedAt = (profile: Profile, lineId: string, on: IsoDate): Profile => ({
  ...profile,
  lines: profile.lines.map((l) => (l.id === lineId ? { ...l, closedOn: on } : l)),
})

// Used by closeLine, the interrupted close and reopenLine.
const snaps = [s('a', '2026-10-01', [livret(1, '2026-10-01'), etf]), s('b', '2026-11-01', [livret(1, '2026-11-01'), etf])]

describe('correctFigures', () => {
  // 5 000 € in September, then 3 400 € typed in October for 34 000 €, carried forward by « Inchangé ».
  const typo = [
    s('a', '2026-09-01', [livret(500_000, '2026-09-01')]),
    s('b', '2026-10-01', [livret(340_000, '2026-10-01')], { fx: { USD: 1.08 }, arrivals: { 'livret-a-line': 'existing' } }),
    s('c', '2026-11-01', [livret(340_000, '2026-10-01')]),
    s('d', '2026-11-08', [livret(340_000, '2026-10-01')]),
  ]
  const fixed = { kind: 'amount', amount: 3_400_000 } as const

  it('corrects a typo carried forward by « Inchangé », and stops where the value differs', () => {
    const before = structuredClone(typo)
    const writes = correctFigures(typo, 'livret-a-line', fixed)
    expect(writes.map((w) => (w.kind === 'snapshot' ? w.id : 'profile'))).toEqual(['b', 'c', 'd'])
    for (const w of writes) {
      const entry = (w as SnapshotWrite).value.entries[0]
      expect(entry).toEqual(livret(3_400_000, '2026-10-01')) // seenOn untouched
    }
    expect(typo).toEqual(before) // the snapshots read are left as they were
  })

  it('never touches the date, the rates, the arrivals or the contributions', () => {
    for (const w of snapshotWrites(correctFigures(typo, 'livret-a-line', fixed))) {
      const original = typo.find((x) => x.id === w.id)!.value
      expect({ ...w.value, entries: [] }).toEqual({ ...original, entries: [] })
    }
  })

  it('leaves no gain between the last two snapshots once corrected', () => {
    const rewritten = applied(typo, correctFigures(typo, 'livret-a-line', fixed))
    expect(splitChange(exampleProfile, rewritten.c, rewritten.d).total).toBe(0)
    expect(splitChange(exampleProfile, rewritten.b, rewritten.c).total).toBe(0)
    // Correcting the latest alone would have shown the typo as 30 600 € put aside.
    expect(splitChange(exampleProfile, typo[2].value, rewritten.d).effort).toBe(3_060_000)
  })

  it('changes only the field that changed on a units line', () => {
    const fund = (id: string, takenOn: IsoDate, units: number, unitPrice: number) =>
      s(id, takenOn, [unitsEntry('etf', units, unitPrice, 200, takenOn)])
    const funds = [
      fund('a', '2026-09-01', 90, 230),
      fund('b', '2026-10-01', 100, 240),
      fund('c', '2026-11-01', 100, 245),
      fund('d', '2026-11-08', 100, 250),
    ]
    const writes = correctFigures(funds, 'etf', { kind: 'units', units: 120, unitPrice: 250, averagePrice: 200 })
    expect(ids(writes)).toEqual(['b', 'c', 'd'])
    expect(snapshotWrites(writes).map((w) => w.value.entries[0])).toEqual([
      unitsEntry('etf', 120, 240, 200, '2026-10-01'),
      unitsEntry('etf', 120, 245, 200, '2026-11-01'),
      unitsEntry('etf', 120, 250, 200, '2026-11-08'),
    ])
  })

  // An average price never given is not « the same figure »: it is no figure at all.
  const unknownAverage = (id: string, takenOn: IsoDate, units: number, unitPrice: number) =>
    s(id, takenOn, [unitsEntry('etf', units, unitPrice, null, takenOn)])

  it('never fills an unknown average price in backwards, even where the parts changed', () => {
    // Monthly buying in a PEA, the average price never typed, then given once on the fiche.
    const funds = [
      unknownAverage('b', '2026-09-01', 100, 250),
      unknownAverage('c', '2026-10-01', 120, 260),
      unknownAverage('d', '2026-11-01', 120, 270),
    ]
    const writes = correctFigures(funds, 'etf', { kind: 'units', units: 120, unitPrice: 270, averagePrice: 210 })
    expect(ids(writes)).toEqual(['d'])
    expect(snapshotWrites(writes)[0].value.entries[0]).toEqual(unitsEntry('etf', 120, 270, 210, '2026-11-01'))
    // The 20 parts bought in October stay money put aside: no gain appears between September and October.
    const rewritten = applied(funds, writes)
    expect(splitChange(exampleProfile, rewritten.b, rewritten.c)).toEqual(splitChange(exampleProfile, funds[0].value, funds[1].value))
  })

  it('follows each other field back on its own, the unknown average price corrected in the latest only', () => {
    const funds = [
      unknownAverage('a', '2026-09-01', 90, 230),
      unknownAverage('b', '2026-10-01', 100, 240),
      unknownAverage('c', '2026-11-01', 100, 250),
      unknownAverage('d', '2026-11-08', 100, 250),
    ]
    const writes = correctFigures(funds, 'etf', { kind: 'units', units: 120, unitPrice: 260, averagePrice: 210 })
    expect(ids(writes)).toEqual(['b', 'c', 'd'])
    expect(snapshotWrites(writes).map((w) => w.value.entries[0])).toEqual([
      unitsEntry('etf', 120, 240, null, '2026-10-01'),
      unitsEntry('etf', 120, 260, null, '2026-11-01'),
      unitsEntry('etf', 120, 260, 210, '2026-11-08'),
    ])
  })

  it('a redo after a cut part-way through the writes ends where the whole correction would have', () => {
    const funds = [
      s('a', '2026-09-01', [unitsEntry('etf', 90, 230, 200, '2026-09-01'), livret(500_000, '2026-09-01')]),
      s('b', '2026-10-01', [unitsEntry('etf', 100, 240, 200, '2026-10-01'), livret(340_000, '2026-10-01')]),
      s('c', '2026-11-01', [unitsEntry('etf', 100, 250, null, '2026-11-01'), livret(340_000, '2026-10-01')]),
      s('d', '2026-11-08', [unitsEntry('etf', 100, 250, null, '2026-11-08'), livret(340_000, '2026-10-01')]),
    ]
    const figures = { kind: 'units', units: 120, unitPrice: 260, averagePrice: 210 } as const
    const whole = correctFigures(funds, 'etf', figures)
    const done = afterWrites(funds, whole)
    expect(whole.length).toBeGreaterThan(1)
    for (let cut = 1; cut < whole.length; cut++) {
      const afterCut = afterWrites(funds, whole.slice(0, cut))
      expect(afterWrites(afterCut, correctFigures(afterCut, 'etf', figures))).toEqual(done)
    }
    // Once done, a redo writes nothing more.
    expect(correctFigures(done, 'etf', figures)).toEqual([])
  })

  it('stops at a snapshot that does not hold the line, and leaves the other lines alone', () => {
    const gap = [
      s('a', '2026-09-01', [livret(340_000, '2026-09-01'), etf]),
      s('b', '2026-10-01', [etf]),
      s('c', '2026-11-01', [livret(340_000, '2026-09-01'), etf]),
      s('d', '2026-11-08', [livret(340_000, '2026-09-01'), etf]),
    ]
    const writes = correctFigures(gap, 'livret-a-line', fixed)
    expect(ids(writes)).toEqual(['c', 'd'])
    for (const w of snapshotWrites(writes)) expect(w.value.entries).toEqual([livret(3_400_000, '2026-09-01'), etf])
  })

  it('returns no write when nothing changes', () => {
    expect(correctFigures([s('d', '2026-11-08', [livret(340_000, '2026-11-08')])], 'livret-a-line', { kind: 'amount', amount: 340_000 })).toEqual([])
  })

  it('throws when the latest snapshot does not hold the line, or holds it as another kind', () => {
    expect(() => correctFigures(snaps, 'gold-line', { kind: 'amount', amount: 1 })).toThrow()
    expect(() => correctFigures(snaps, 'etf', { kind: 'amount', amount: 1 })).toThrow()
    expect(() => correctFigures(snaps, 'livret-a-line', { kind: 'units', units: 1, unitPrice: 1, averagePrice: null })).toThrow()
  })
})

describe('correctFiguresAt', () => {
  const unlocked = { latestLocked: false }
  const locked = { latestLocked: true }
  type At = ReturnType<typeof correctFiguresAt>
  function done(result: At): { writes: Write[]; others: number; latestToo: boolean } {
    if ('refused' in result) throw new Error(`Refused: ${result.refused}`)
    return result
  }
  const fixed = { kind: 'amount', amount: 3_400_000 } as const

  it('corrects the chosen relevé and its identical neighbours, before and after, and stops where the value differs', () => {
    const history = [
      s('a', '2026-08-01', [livret(500_000, '2026-08-01')]),
      s('b', '2026-09-01', [livret(340_000, '2026-09-01')]),
      s('c', '2026-10-01', [livret(340_000, '2026-09-01')]),
      s('d', '2026-11-01', [livret(340_000, '2026-09-01')]),
      s('e', '2026-11-08', [livret(360_000, '2026-11-08')]),
    ]
    const before = structuredClone(history)
    const result = done(correctFiguresAt(history, 'c', 'livret-a-line', fixed, unlocked))
    // The farthest first, the chosen relevé last: a cut in between leaves a correction a redo finishes.
    expect(ids(result.writes)).toEqual(['b', 'd', 'c'])
    for (const w of snapshotWrites(result.writes)) expect(w.value.entries).toEqual([livret(3_400_000, '2026-09-01')])
    expect(result.others).toBe(2)
    expect(result.latestToo).toBe(false)
    expect(history).toEqual(before)
  })

  it('never touches the date, the rates, the arrivals or the contributions', () => {
    const history = [
      s('a', '2026-09-01', [livret(340_000, '2026-09-01')], { fx: { USD: 1.08 }, contributions: { acc: 100 } }),
      s('b', '2026-10-01', [livret(340_000, '2026-09-01')], { arrivals: { 'livret-a-line': 'existing' } }),
      s('c', '2026-11-01', [livret(1, '2026-11-01')]),
    ]
    for (const w of snapshotWrites(done(correctFiguresAt(history, 'a', 'livret-a-line', fixed, unlocked)).writes)) {
      const original = history.find((x) => x.id === w.id)!.value
      expect({ ...w.value, entries: [] }).toEqual({ ...original, entries: [] })
    }
  })

  // The same wrong figure carried forward up to today.
  const toToday = [
    s('a', '2026-09-01', [livret(500_000, '2026-09-01')]),
    s('b', '2026-10-01', [livret(340_000, '2026-10-01')]),
    s('c', '2026-11-01', [livret(340_000, '2026-10-01')]),
    s('d', '2026-11-08', [livret(340_000, '2026-10-01')]),
  ]

  it('corrects the latest relevé too when the same figure reaches it, and says so', () => {
    const result = done(correctFiguresAt(toToday, 'b', 'livret-a-line', fixed, unlocked))
    expect(ids(result.writes)).toEqual(['d', 'c', 'b'])
    expect(result.others).toBe(2)
    expect(result.latestToo).toBe(true)
  })

  it('never writes the latest relevé while an update is running', () => {
    const result = done(correctFiguresAt(toToday, 'b', 'livret-a-line', fixed, locked))
    expect(ids(result.writes)).toEqual(['c', 'b'])
    expect(result.others).toBe(1)
    expect(result.latestToo).toBe(false)
    // Every field of a units line, carried forward up to today: still nothing written in the latest.
    const funds = ['a', 'b', 'c'].map((id, i) => s(id, `2026-0${7 + i}-01` as IsoDate, [unitsEntry('etf', 100, 250, 200, '2026-07-01')]))
    const units = done(correctFiguresAt(funds, 'a', 'etf', { kind: 'units', units: 1, unitPrice: 2, averagePrice: 3 }, locked))
    expect(ids(units.writes)).not.toContain('c')
    expect(ids(units.writes)).toEqual(['b', 'a'])
  })

  it('throws when asked for the latest relevé while an update is running', () => {
    expect(() => correctFiguresAt(toToday, 'd', 'livret-a-line', fixed, locked)).toThrow(/locked/)
  })

  describe('two relevés taken the same day', () => {
    // The latest is the last in the repository's order, not the one with a later date.
    const sameDay = [
      s('a', '2026-10-01', [livret(340_000, '2026-10-01')]),
      s('b', '2026-11-01', [livret(340_000, '2026-10-01')]),
      s('c', '2026-11-01', [livret(340_000, '2026-10-01')]),
    ]

    it('stops before the last of them while an update is running', () => {
      const result = done(correctFiguresAt(sameDay, 'b', 'livret-a-line', fixed, locked))
      expect(ids(result.writes)).toEqual(['a', 'b'])
      expect(result.latestToo).toBe(false)
    })

    it('reaches the last of them otherwise, and corrects it as the fiche does when it is the one chosen', () => {
      expect(done(correctFiguresAt(sameDay, 'b', 'livret-a-line', fixed, unlocked)).latestToo).toBe(true)
      expect(done(correctFiguresAt(sameDay, 'c', 'livret-a-line', fixed, unlocked)).writes).toEqual(
        correctFigures(sameDay, 'livret-a-line', fixed),
      )
    })
  })

  // Monthly buying: the price moves every relevé, the parts stay.
  const fund = (id: string, takenOn: IsoDate, units: number, unitPrice: number, averagePrice: number | null = 200) =>
    s(id, takenOn, [unitsEntry('etf', units, unitPrice, averagePrice, takenOn)])
  const funds = [
    fund('a', '2026-07-01', 90, 230),
    fund('b', '2026-08-01', 100, 240),
    fund('c', '2026-09-01', 100, 245),
    fund('d', '2026-10-01', 100, 250),
    fund('e', '2026-11-01', 100, 255),
  ]

  it('carries only the parts on a units line whose price changed every relevé', () => {
    const result = done(correctFiguresAt(funds, 'c', 'etf', { kind: 'units', units: 120, unitPrice: 245, averagePrice: 200 }, unlocked))
    expect(ids(result.writes)).toEqual(['e', 'b', 'd', 'c'])
    expect(applied(funds, result.writes)).toEqual({
      a: funds[0].value,
      b: fund('b', '2026-08-01', 120, 240).value,
      c: fund('c', '2026-09-01', 120, 245).value,
      d: fund('d', '2026-10-01', 120, 250).value,
      e: fund('e', '2026-11-01', 120, 255).value,
    })
    expect(result.others).toBe(3)
    expect(result.latestToo).toBe(true)
  })

  it('corrects the price in the chosen relevé alone when its neighbours had another', () => {
    const result = done(correctFiguresAt(funds, 'c', 'etf', { kind: 'units', units: 100, unitPrice: 247, averagePrice: 200 }, unlocked))
    expect(ids(result.writes)).toEqual(['c'])
    expect(snapshotWrites(result.writes)[0].value.entries[0]).toEqual(unitsEntry('etf', 100, 247, 200, '2026-09-01'))
    expect(result.others).toBe(0)
  })

  it('never carries an unknown average price to the neighbours', () => {
    const unknown = [fund('a', '2026-08-01', 100, 240, null), fund('b', '2026-09-01', 100, 245, null), fund('c', '2026-10-01', 100, 250, null)]
    const result = done(correctFiguresAt(unknown, 'b', 'etf', { kind: 'units', units: 120, unitPrice: 245, averagePrice: 210 }, unlocked))
    expect(applied(unknown, result.writes)).toEqual({
      a: fund('a', '2026-08-01', 120, 240, null).value,
      b: fund('b', '2026-09-01', 120, 245, 210).value,
      c: fund('c', '2026-10-01', 120, 250, null).value,
    })
  })

  it('refuses to erase a figure known on a past relevé', () => {
    expect(correctFiguresAt(funds, 'c', 'etf', { kind: 'units', units: 100, unitPrice: 245, averagePrice: null }, unlocked)).toEqual({
      refused: 'erase',
    })
    // An average price that was never known may stay unknown.
    const unknown = [fund('a', '2026-08-01', 100, 240, null), fund('b', '2026-09-01', 100, 245, null)]
    const kept = done(correctFiguresAt(unknown, 'a', 'etf', { kind: 'units', units: 110, unitPrice: 240, averagePrice: null }, unlocked))
    expect(ids(kept.writes)).toEqual(['b', 'a'])
  })

  it('on the latest relevé, does what the fiche does today, erasing included', () => {
    const typo = [
      s('a', '2026-09-01', [livret(500_000, '2026-09-01')]),
      s('b', '2026-10-01', [livret(340_000, '2026-10-01')]),
      s('c', '2026-11-01', [livret(340_000, '2026-10-01')]),
    ]
    const result = done(correctFiguresAt(typo, 'c', 'livret-a-line', fixed, unlocked))
    expect(result).toEqual({ writes: correctFigures(typo, 'livret-a-line', fixed), others: 1, latestToo: false })
    const erase = { kind: 'units', units: 100, unitPrice: 255, averagePrice: null } as const
    expect(done(correctFiguresAt(funds, 'e', 'etf', erase, unlocked)).writes).toEqual(correctFigures(funds, 'etf', erase))
  })

  it('announces as « others » exactly the relevés written besides the chosen one', () => {
    for (const [history, id] of [
      [toToday, 'a'],
      [toToday, 'b'],
      [toToday, 'c'],
      [funds, 'b'],
      [funds, 'd'],
    ] as const) {
      for (const options of [locked, unlocked]) {
        const result = done(correctFiguresAt(history, id, history === toToday ? 'livret-a-line' : 'etf', history === toToday ? fixed : { kind: 'units', units: 1, unitPrice: 2, averagePrice: 3 }, options))
        expect(result.others).toBe(result.writes.length - 1)
        expect(ids(result.writes).at(-1)).toBe(id)
      }
    }
  })

  it('counts differently once a neighbour was retyped in between: the save can tell', () => {
    const announced = done(correctFiguresAt(toToday, 'b', 'livret-a-line', fixed, unlocked)).others
    const retyped = toToday.map((x) => (x.id === 'c' ? s('c', '2026-11-01', [livret(350_000, '2026-11-01')]) : x))
    expect(done(correctFiguresAt(retyped, 'b', 'livret-a-line', fixed, unlocked)).others).not.toBe(announced)
  })

  it('a redo after a cut part-way through the writes ends where the whole correction would have', () => {
    const figures = { kind: 'units', units: 120, unitPrice: 245, averagePrice: 200 } as const
    for (const options of [locked, unlocked]) {
      const whole = done(correctFiguresAt(funds, 'c', 'etf', figures, options)).writes
      const finished = afterWrites(funds, whole)
      expect(whole.length).toBeGreaterThan(2)
      for (let cut = 1; cut < whole.length; cut++) {
        const afterCut = afterWrites(funds, whole.slice(0, cut))
        expect(afterWrites(afterCut, done(correctFiguresAt(afterCut, 'c', 'etf', figures, options)).writes)).toEqual(finished)
      }
      expect(done(correctFiguresAt(finished, 'c', 'etf', figures, options))).toEqual({ writes: [], others: 0, latestToo: false })
    }
  })

  it('stops at a relevé that does not hold the line, and leaves the other lines alone', () => {
    const gap = [
      s('a', '2026-08-01', [livret(340_000, '2026-08-01'), etf]),
      s('b', '2026-09-01', [etf]),
      s('c', '2026-10-01', [livret(340_000, '2026-08-01'), etf]),
      s('d', '2026-11-01', [etf]),
    ]
    const result = done(correctFiguresAt(gap, 'c', 'livret-a-line', fixed, unlocked))
    expect(ids(result.writes)).toEqual(['c'])
    expect(snapshotWrites(result.writes)[0].value.entries).toEqual([livret(3_400_000, '2026-08-01'), etf])
  })

  it('throws on an unknown relevé, a relevé without the line, or another kind', () => {
    expect(() => correctFiguresAt(snaps, 'zz', 'livret-a-line', fixed, unlocked)).toThrow(/No snapshot/)
    const without = [s('a', '2026-09-01', [etf]), ...snaps.slice(1)]
    expect(() => correctFiguresAt(without, 'a', 'livret-a-line', fixed, unlocked)).toThrow(/does not hold/)
    expect(() => correctFiguresAt(snaps, 'a', 'etf', fixed, unlocked)).toThrow(/is not a amount line/)
  })
})

describe('closingBounds', () => {
  it('runs from the day after the first snapshot that holds the line to today', () => {
    expect(closingBounds(snaps, 'livret-a-line', '2026-11-08')).toEqual({ earliest: '2026-10-02', latest: '2026-11-08' })
    const later = [s('a', '2026-10-01', [etf]), s('b', '2026-11-01', [livret(1, '2026-11-01'), etf])]
    expect(closingBounds(later, 'livret-a-line', '2026-11-08')).toEqual({ earliest: '2026-11-02', latest: '2026-11-08' })
  })
  it('is null when the line was first seen today: only a deletion is possible', () => {
    expect(closingBounds([s('a', '2026-11-08', [livret(1, '2026-11-08'), etf])], 'livret-a-line', '2026-11-08')).toBeNull()
  })
})

describe('closeLine', () => {
  it('after the last snapshot: only the profile, and nothing to confirm', () => {
    const planned = closeLine(exampleProfile, snaps, 'livret-a-line', '2026-11-05', '2026-11-08')
    // A single write, the profile, with the line closed on that day and nothing else changed.
    expect(planned).toEqual({ writes: [{ kind: 'profile', value: closedAt(exampleProfile, 'livret-a-line', '2026-11-05') }] })
    expect(lineIn(profileIn(writesOf(planned)[0]), 'livret-a-line')?.closedOn).toBe('2026-11-05')
    expect(closingRewrites(snaps, 'livret-a-line', '2026-11-05')).toBe(0)
  })

  it('before the last snapshot: the profile first, then the snapshots from that day, oldest first', () => {
    const planned = closeLine(exampleProfile, snaps, 'livret-a-line', '2026-10-15', '2026-11-08') as { writes: Write[] }
    expect(planned.writes.map((w) => (w.kind === 'snapshot' ? w.id : 'profile'))).toEqual(['profile', 'b'])
    expect(profileIn(planned.writes[0])).toEqual(closedAt(exampleProfile, 'livret-a-line', '2026-10-15'))
    expect((planned.writes[1] as SnapshotWrite).value).toEqual({ ...snaps[1].value, entries: [etf] })
    expect(closingRewrites(snaps, 'livret-a-line', '2026-10-15')).toBe(1)
  })

  it('rewrites the snapshot taken on the closing day itself', () => {
    expect(ids(writesOf(closeLine(exampleProfile, snaps, 'livret-a-line', '2026-11-01', '2026-11-08')))).toEqual(['profile', 'b'])
    expect(closingRewrites(snaps, 'livret-a-line', '2026-11-01')).toBe(1)
    expect(closingRewrites(snaps, 'livret-a-line', '2026-11-02')).toBe(0)
  })

  it('refuses a day in the future, and a day before the line ever had a value', () => {
    expect(closeLine(exampleProfile, snaps, 'livret-a-line', '2026-11-09', '2026-11-08')).toEqual({ refused: 'in-the-future' })
    expect(closeLine(exampleProfile, snaps, 'livret-a-line', '2026-10-01', '2026-11-08')).toEqual({ refused: 'too-early' })
    const firstSeenToday = [s('a', '2026-11-08', [livret(1, '2026-11-08'), etf])]
    expect(closeLine(exampleProfile, firstSeenToday, 'livret-a-line', '2026-11-08', '2026-11-08')).toEqual({ refused: 'too-early' })
    // Both ends are allowed.
    expect('writes' in closeLine(exampleProfile, snaps, 'livret-a-line', '2026-10-02', '2026-11-08')).toBe(true)
    expect('writes' in closeLine(exampleProfile, snaps, 'livret-a-line', '2026-11-08', '2026-11-08')).toBe(true)
  })

  it('refuses a line it does not know, or one already closed', () => {
    expect(closeLine(exampleProfile, snaps, 'nowhere', '2026-11-05', '2026-11-08')).toEqual({ refused: 'not-held' })
    const closed = closedAt(exampleProfile, 'livret-a-line', '2026-11-05')
    expect(closeLine(closed, snaps, 'livret-a-line', '2026-11-06', '2026-11-08')).toEqual({ refused: 'not-held' })
  })

  it('refuses to leave a rewritten snapshot with no entry', () => {
    const alone = [s('a', '2026-10-01', [livret(1, '2026-10-01'), etf]), s('b', '2026-11-01', [livret(1, '2026-11-01')])]
    expect(closeLine(exampleProfile, alone, 'livret-a-line', '2026-10-15', '2026-11-08')).toEqual({ refused: 'only-line' })
    // After the last snapshot, nothing is rewritten: nothing is left empty.
    expect('writes' in closeLine(exampleProfile, alone, 'livret-a-line', '2026-11-05', '2026-11-08')).toBe(true)
  })

  it('drops the arrival and the contributions of an account left empty in a rewritten snapshot', () => {
    const euroFund = amount('euro-fund', 3_000_000, '2026-11-01')
    const withFund = [
      s('a', '2026-10-01', [livret(1, '2026-10-01'), amount('euro-fund', 2_900_000, '2026-10-01')]),
      s('b', '2026-11-01', [livret(1, '2026-11-01'), euroFund], {
        fx: { USD: 1.08 },
        contributions: { life: 50_000 },
        arrivals: { 'euro-fund': 'opened', 'livret-a-line': 'existing' },
      }),
    ]
    const writes = writesOf(closeLine(exampleProfile, withFund, 'euro-fund', '2026-10-15', '2026-11-08'))
    expect(ids(writes)).toEqual(['profile', 'b'])
    expect((writes[1] as SnapshotWrite).value).toEqual({
      schema: 1,
      takenOn: '2026-11-01',
      fx: { USD: 1.08 }, // the rates stay
      entries: [livret(1, '2026-11-01')],
      contributions: {},
      arrivals: { 'livret-a-line': 'existing' },
    })
  })

  it('keeps the contributions of an account that still holds a line in that snapshot', () => {
    const withTwoFunds = [
      s('a', '2026-10-01', [amount('euro-fund', 2_900_000, '2026-10-01'), unitsEntry('life-uc', 10, 500, 450, '2026-10-01')]),
      s('b', '2026-11-01', [amount('euro-fund', 3_000_000, '2026-11-01'), unitsEntry('life-uc', 10, 510, 450, '2026-11-01')], {
        contributions: { life: 50_000 },
        arrivals: { 'euro-fund': 'opened', 'life-uc': 'opened' },
      }),
    ]
    const writes = writesOf(closeLine(exampleProfile, withTwoFunds, 'euro-fund', '2026-10-15', '2026-11-08'))
    const rewritten = (writes[1] as SnapshotWrite).value
    expect(rewritten.entries).toEqual([unitsEntry('life-uc', 10, 510, 450, '2026-11-01')])
    expect(rewritten.contributions).toEqual({ life: 50_000 })
    expect(rewritten.arrivals).toEqual({ 'life-uc': 'opened' })
  })

  it('never touches a loan’s link: a sold house keeps its loan, as in the update', () => {
    const withHouse = [
      s('a', '2026-10-01', [livret(1, '2026-10-01'), amount('house-line', 30_000_000, '2026-10-01'), amount('mortgage-line', 18_000_000, '2026-10-01')]),
      s('b', '2026-11-01', [livret(1, '2026-11-01'), amount('house-line', 30_000_000, '2026-10-01'), amount('mortgage-line', 17_900_000, '2026-11-01')]),
    ]
    const writes = writesOf(closeLine(exampleProfile, withHouse, 'house-line', '2026-10-15', '2026-11-08'))
    const profile = profileIn(writes[0])
    expect(profile.accounts.find((a) => a.id === 'mortgage')?.financedLineId).toBe('house-line')
    expect(profile.accounts.find((a) => a.id === 'house')).toBeDefined()
    expect(lineIn(profile, 'house-line')?.closedOn).toBe('2026-10-15')
    expect((writes[1] as SnapshotWrite).value.entries.map((e) => e.lineId)).toEqual(['livret-a-line', 'mortgage-line'])
    expect(parseProfile(profile)).not.toBeNull()
  })
})

describe('an interrupted close', () => {
  it('is seen as unfinished, and « Terminer » removes the line from the snapshots left', () => {
    const closed = { ...exampleProfile, lines: exampleProfile.lines.map((l) => (l.id === 'livret-a-line' ? { ...l, closedOn: '2026-10-15' } : l)) }
    expect(closingUnfinished(closed, snaps, 'livret-a-line')).toBe(true)
    const planned = finishClosing(closed, snaps, 'livret-a-line') as { writes: Write[] }
    expect(planned.writes.map((w) => (w.kind === 'snapshot' ? w.id : 'profile'))).toEqual(['b'])
    expect((planned.writes[0] as SnapshotWrite).value.entries).toEqual([etf])
  })

  it('a cut after the profile write: « Terminer » makes the very snapshot writes the close would have', () => {
    const [profileWrite, ...rest] = writesOf(closeLine(exampleProfile, snaps, 'livret-a-line', '2026-10-15', '2026-11-08'))
    const afterCut = profileIn(profileWrite)
    expect(closingUnfinished(afterCut, snaps, 'livret-a-line')).toBe(true)
    expect(finishClosing(afterCut, snaps, 'livret-a-line')).toEqual({ writes: rest })
    // Once finished, it is no longer unfinished.
    expect(closingUnfinished(afterCut, afterWrites(snaps, rest), 'livret-a-line')).toBe(false)
  })

  it('closing again on the same day finishes the close it left cut short, instead of a refusal', () => {
    const [profileWrite, ...rest] = writesOf(closeLine(exampleProfile, snaps, 'livret-a-line', '2026-10-15', '2026-11-08'))
    const afterCut = profileIn(profileWrite)
    expect(closeLine(afterCut, snaps, 'livret-a-line', '2026-10-15', '2026-11-08')).toEqual({ writes: rest })
    expect(closeLine(afterCut, snaps, 'livret-a-line', '2026-10-15', '2026-11-08')).toEqual(finishClosing(afterCut, snaps, 'livret-a-line'))
    // Another day is another close: refused, the line is closed already.
    expect(closeLine(afterCut, snaps, 'livret-a-line', '2026-10-20', '2026-11-08')).toEqual({ refused: 'not-held' })
    // Once finished, nothing is left to finish.
    expect(closeLine(afterCut, afterWrites(snaps, rest), 'livret-a-line', '2026-10-15', '2026-11-08')).toEqual({ refused: 'not-held' })
    // A close no snapshot felt is not unfinished: the same day again is refused too.
    const closedLater = closedAt(exampleProfile, 'livret-a-line', '2026-11-05')
    expect(closeLine(closedLater, snaps, 'livret-a-line', '2026-11-05', '2026-11-08')).toEqual({ refused: 'not-held' })
  })

  it('a line closed by the update is never unfinished', () => {
    // closedOn = latest.takenOn and the latest snapshot does not hold it
    const byUpdate = [s('a', '2026-10-01', [livret(1, '2026-10-01'), etf]), s('b', '2026-11-01', [etf])]
    const closed = closedAt(exampleProfile, 'livret-a-line', '2026-11-01')
    expect(closingUnfinished(closed, byUpdate, 'livret-a-line')).toBe(false)
    expect(finishClosing(closed, byUpdate, 'livret-a-line')).toEqual({ refused: 'not-allowed' })
  })

  it('a line closed after the last snapshot, or not closed, is not unfinished either', () => {
    expect(closingUnfinished(closedAt(exampleProfile, 'livret-a-line', '2026-11-05'), snaps, 'livret-a-line')).toBe(false)
    expect(closingUnfinished(exampleProfile, snaps, 'livret-a-line')).toBe(false)
    expect(finishClosing(exampleProfile, snaps, 'livret-a-line')).toEqual({ refused: 'not-allowed' })
  })
})

describe('reopenLine', () => {
  it('reopens a line closed after the last snapshot', () => {
    const closed = closedAt(exampleProfile, 'livret-a-line', '2026-11-05')
    const writes = writesOf(reopenLine(closed, snaps, 'livret-a-line'))
    expect(writes).toEqual([{ kind: 'profile', value: exampleProfile }])
    expect('closedOn' in lineIn(profileIn(writes[0]), 'livret-a-line')!).toBe(false)
  })

  it('refuses once a snapshot was rewritten', () => {
    // Closed before the last snapshot, or on its day as the update does: a snapshot no longer holds it.
    expect(reopenLine(closedAt(exampleProfile, 'livret-a-line', '2026-10-15'), snaps, 'livret-a-line')).toEqual({ refused: 'not-allowed' })
    expect(reopenLine(closedAt(exampleProfile, 'livret-a-line', '2026-11-01'), snaps, 'livret-a-line')).toEqual({ refused: 'not-allowed' })
    // Nothing to reopen.
    expect(reopenLine(exampleProfile, snaps, 'livret-a-line')).toEqual({ refused: 'not-allowed' })
    expect(reopenLine(exampleProfile, snaps, 'nowhere')).toEqual({ refused: 'not-allowed' })
  })
})

describe('deleteLine', () => {
  it('closes at its first day, removes it from every snapshot, then from the profile, with its empty account', () => {
    // expect order: profile (closedOn = first takenOn), a, b, profile (no line, no account)
    const writes = writesOf(deleteLine(exampleProfile, snaps, 'livret-a-line'))
    expect(ids(writes)).toEqual(['profile', 'a', 'b', 'profile'])
    expect(profileIn(writes[0])).toEqual(closedAt(exampleProfile, 'livret-a-line', '2026-10-01'))
    expect(snapshotWrites(writes).map((w) => w.value)).toEqual([
      { ...snaps[0].value, entries: [etf] },
      { ...snaps[1].value, entries: [etf] },
    ])
    expect(profileIn(writes[3])).toEqual({
      ...exampleProfile,
      accounts: exampleProfile.accounts.filter((a) => a.id !== 'livret-a'),
      lines: exampleProfile.lines.filter((l) => l.id !== 'livret-a-line'),
    })
  })

  it('keeps an account that still holds another line', () => {
    const withFunds = [
      s('a', '2026-10-01', [amount('euro-fund', 2_900_000, '2026-10-01'), unitsEntry('life-uc', 10, 500, 450, '2026-10-01')]),
    ]
    const writes = writesOf(deleteLine(exampleProfile, withFunds, 'euro-fund'))
    const profile = profileIn(writes[writes.length - 1])
    expect(profile.accounts).toEqual(exampleProfile.accounts)
    expect(lineIn(profile, 'euro-fund')).toBeUndefined()
  })

  it('unlinks a loan that financed the deleted line', () => {
    // delete house-line: the mortgage account loses financedLineId; computeSituation on the result does not throw
    const withHouse = [
      s('a', '2026-10-01', [livret(1, '2026-10-01'), amount('house-line', 30_000_000, '2026-10-01'), amount('mortgage-line', 18_000_000, '2026-10-01')]),
      s('b', '2026-11-01', [livret(1, '2026-11-01'), amount('house-line', 30_000_000, '2026-10-01'), amount('mortgage-line', 17_900_000, '2026-11-01')]),
    ]
    const writes = writesOf(deleteLine(exampleProfile, withHouse, 'house-line'))
    expect(ids(writes)).toEqual(['profile', 'a', 'b', 'profile'])
    const profile = profileIn(writes[3])
    const mortgage = profile.accounts.find((a) => a.id === 'mortgage')!
    expect('financedLineId' in mortgage).toBe(false)
    expect(profile.accounts.find((a) => a.id === 'house')).toBeUndefined()
    expect(parseProfile(profile)).not.toBeNull()
    const latest = applied(withHouse, writes).b
    expect(() => computeSituation(profile, latest)).not.toThrow()
    // The loan no longer lowers a house: it lowers the available money.
    expect(computeSituation(profile, latest).categories.find((c) => c.category === 'available')?.value).toBe(1 - 17_900_000)
  })

  it('a cut after the first write is an unfinished close, and « Terminer » completes it', () => {
    const writes = writesOf(deleteLine(exampleProfile, snaps, 'livret-a-line'))
    const afterCut = profileIn(writes[0])
    expect(closingUnfinished(afterCut, snaps, 'livret-a-line')).toBe(true)
    expect(finishClosing(afterCut, snaps, 'livret-a-line')).toEqual({ writes: writes.slice(1, -1) })
  })

  it('a cut before the last write leaves a closed line no snapshot holds', () => {
    const writes = writesOf(deleteLine(exampleProfile, snaps, 'livret-a-line'))
    const afterCut = profileIn(writes[0])
    const rewritten = afterWrites(snaps, writes)
    expect(rewritten.every((x) => x.value.entries.every((e) => e.lineId !== 'livret-a-line'))).toBe(true)
    expect(closingUnfinished(afterCut, rewritten, 'livret-a-line')).toBe(false)
  })

  it('refuses to leave a snapshot empty', () => {
    expect(deleteLine(exampleProfile, [s('a', '2026-11-01', [livret(1, '2026-11-01')])], 'livret-a-line')).toEqual({ refused: 'only-line' })
  })

  it('refuses a line it does not know', () => {
    expect(deleteLine(exampleProfile, snaps, 'nowhere')).toEqual({ refused: 'not-held' })
  })
})
