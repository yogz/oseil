// An exported file always comes back identical. The comparison goes through one documented
// normalisation, and nothing else is set aside:
//   - the establishments' ids are not in the file: they are replaced by their position;
//   - `firstLaunch` keeps only `complete` (the import writes `planned: []` and every bank as
//     finished, which nothing reads once the first launch is complete);
//   - a rate in `fx` that no line of its snapshot uses is not in the file;
//   - a contribution of zero is not written (the site never stores one, and it counts for nothing);
//   - `settings: null` comes back as DEFAULT_SETTINGS;
//   - accounts and lines come back in the order of the « Comptes » rows: bank, then account, then
//     line (each in its order in the profile). An update appends what it adds (lib/update/build.ts),
//     so a restored profile can hold them in another order. Three lists follow that order and so
//     come back in bank order: the rows of lib/screens/ranging.ts, and in lib/update/result.ts the
//     lines with no amount and the « Rien n’est noté comme versé » notes.
// The ids of accounts and lines, the snapshots and their order, the goals and their order are
// compared as they are.
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@/lib/model/documents'
import { computeSituation } from '@/lib/model/situation'
import type { Profile, Settings, Snapshot } from '@/lib/model/types'
import { exportSheets, type ExportInput } from '../export'
import { readImport, type ImportResult } from '../import'
import { formatError } from '../import-types'
import { readWorkbook, writeWorkbook, type Cell } from '../xlsx'
import { fixtureInput } from './fixtures'

type Comparable = { profile: Profile; snapshots: Snapshot[]; goals: ExportInput['goals']; settings: Settings }

function normalise(data: { profile: Profile; snapshots: Snapshot[]; goals: ExportInput['goals']; settings: Settings | null }): Comparable {
  const { profile } = data
  const position = new Map(profile.establishments.map((e, index) => [e.id, `establishment-${index}`]))
  const lines = new Map(profile.lines.map((l) => [l.id, l]))
  // The export's row order: bank, then account, then line; a stable sort keeps the rest as it is.
  const bankRank = (accountEstablishment: string) => {
    const index = profile.establishments.findIndex((e) => e.id === accountEstablishment)
    return index === -1 ? profile.establishments.length : index
  }
  const accounts = [...profile.accounts].sort((a, b) => bankRank(a.establishmentId) - bankRank(b.establishmentId))
  const accountRank = new Map(accounts.map((a, index) => [a.id, index]))
  const orderedLines = [...profile.lines].sort((a, b) => (accountRank.get(a.accountId) ?? 0) - (accountRank.get(b.accountId) ?? 0))
  return {
    profile: {
      ...profile,
      establishments: profile.establishments.map((e) => ({ ...e, id: position.get(e.id)! })),
      accounts: accounts.map((a) => ({ ...a, establishmentId: position.get(a.establishmentId) ?? a.establishmentId })),
      lines: orderedLines,
      ...(profile.firstLaunch ? { firstLaunch: { complete: profile.firstLaunch.complete } as never } : {}),
    },
    snapshots: data.snapshots.map((s) => {
      const used = new Set(s.entries.map((e) => lines.get(e.lineId)?.currency))
      return {
        ...s,
        fx: Object.fromEntries(Object.entries(s.fx).filter(([currency]) => used.has(currency as never))),
        contributions: Object.fromEntries(Object.entries(s.contributions).filter(([, cents]) => cents !== 0)),
      }
    }),
    goals: data.goals,
    settings: data.settings ?? DEFAULT_SETTINGS,
  }
}

function success(result: ImportResult) {
  if (!result.ok) throw new Error(result.errors.map(formatError).join('\n'))
  return result
}

const counter = () => {
  let n = 0
  return () => `new-${++n}`
}

async function throughFile(input: ExportInput): Promise<Map<string, Cell[][]>> {
  return readWorkbook(await writeWorkbook(exportSheets(input)))
}

// The same book after a tableur saved it again: every number a text with a comma decimal, every
// date a serial number, every empty cell an empty text.
const EXCEL_EPOCH = Date.UTC(1899, 11, 30)
function resaved(book: Map<string, Cell[][]>): Map<string, Cell[][]> {
  const cell = (value: Cell): Cell => {
    if (value instanceof Date) return (value.getTime() - EXCEL_EPOCH) / 86_400_000
    if (typeof value === 'number') return String(value).replace('.', ',')
    if (value === null) return ''
    return value
  }
  return new Map([...book].map(([name, rows]) => [name, rows.map((row) => row.map(cell))]))
}

function expectSame(input: ExportInput, result: ImportResult) {
  const { data } = success(result)
  const imported = normalise({ ...data, snapshots: data.snapshots.map((s) => s.value) })
  expect(imported).toEqual(normalise(input))
  // The figures the site shows at every relevé.
  input.snapshots.forEach((snapshot, index) => {
    expect(computeSituation(data.profile, data.snapshots[index].value)).toEqual(computeSituation(input.profile, snapshot))
  })
}

// Each variant adds to the fixture a case the file must carry back.
const VARIANTS: Record<string, () => ExportInput> = {
  'the fixture': fixtureInput,
  'a loan financing a house that was sold': () => {
    const input = fixtureInput()
    input.profile.lines = input.profile.lines.map((l) => (l.id === 'l-home' ? { ...l, closedOn: '2026-10-15' } : l))
    input.snapshots = input.snapshots.map((s) =>
      s.takenOn === '2026-09-30' ? s : { ...s, entries: s.entries.filter((e) => e.lineId !== 'l-home') },
    )
    return input
  },
  'a closing left unfinished (the latest relevé still holds the closed line)': () => {
    const input = fixtureInput()
    input.profile.lines = input.profile.lines.map((l) => (l.id === 'l-livret1' ? { ...l, closedOn: '2026-10-31' } : l))
    return input
  },
  'employee savings held and paid into': () => {
    const input = fixtureInput()
    const last = input.snapshots[2]
    input.snapshots[2] = {
      ...last,
      entries: [...last.entries, { lineId: 'l-pee', kind: 'units', units: 7.5, unitPrice: 31.42, averagePrice: null, seenOn: '2026-10-31' }],
      contributions: { 'a-pee': 15000 },
      arrivals: { ...last.arrivals, 'l-pee': 'opened' },
    }
    return input
  },
  'a profile not grouped by bank, as updates leave it': () => {
    const input = fixtureInput()
    const { profile } = input
    // An account added later at BoursoBank, appended after « Chez toi », and a line added later
    // to the older Compte-titres, appended after every other line.
    profile.accounts = [...profile.accounts, { id: 'a-ldds', establishmentId: 'e-bourso', type: 'ldds', name: 'LDDS' }]
    profile.lines = [
      ...profile.lines,
      { id: 'l-ldds', accountId: 'a-ldds', name: 'LDDS', kind: 'amount', currency: 'EUR' },
      { id: 'l-msft', accountId: 'a-cto', name: 'Microsoft', kind: 'units', currency: 'EUR' },
    ]
    const last = input.snapshots[2]
    input.snapshots[2] = {
      ...last,
      entries: [
        ...last.entries,
        { lineId: 'l-ldds', kind: 'amount', amount: 300000, seenOn: '2026-10-31' },
        { lineId: 'l-msft', kind: 'units', units: 2, unitPrice: 380.5, averagePrice: null, seenOn: '2026-10-31' },
      ],
      arrivals: { ...last.arrivals, 'l-ldds': 'opened', 'l-msft': 'existing' },
    }
    return input
  },
  'a rental, a second home and a goal with a rental share': () => {
    const input = fixtureInput()
    const { profile } = input
    profile.accounts = [
      ...profile.accounts,
      { id: 'a-studio', establishmentId: 'e-home', type: 'home', name: 'Studio', residence: 'rental' },
      // A second home with no line yet: its type is on its own row.
      { id: 'a-chalet', establishmentId: 'e-home', type: 'home', name: 'Chalet', residence: 'secondary' },
    ]
    profile.lines = [...profile.lines, { id: 'l-studio', accountId: 'a-studio', name: 'Studio', kind: 'amount', currency: 'EUR' }]
    const last = input.snapshots[2]
    input.snapshots[2] = {
      ...last,
      entries: [...last.entries, { lineId: 'l-studio', kind: 'amount', amount: 15000000, seenOn: '2026-10-31' }],
      arrivals: { ...last.arrivals, 'l-studio': 'existing' },
    }
    input.goals = [...input.goals, { schema: 1, validFrom: '2026-11-01', shares: { available: 10, secured: 30, markets: 25, gold: 5, rental: 30 } }]
    return input
  },
  // docs/superpowers/specs/2026-11-11-coussin-objectif-design.md: the available money in months.
  'a goal with the available money in months': () => {
    const input = fixtureInput()
    input.goals = [
      ...input.goals,
      { schema: 1, validFrom: '2026-11-11', shares: { available: 0, secured: 33, markets: 60, gold: 7, rental: 0 }, cushionMonths: 2.5 },
    ]
    return input
  },
  'two goals on the same day': () => {
    const input = fixtureInput()
    input.goals = [
      { schema: 1, validFrom: '2026-10-01', shares: { available: 20, secured: 60, markets: 15, gold: 5, rental: 0 } },
      { schema: 1, validFrom: '2026-10-01', shares: { available: 10, secured: 15, markets: 65, gold: 10, rental: 0 } },
    ]
    return input
  },
  // « J’ai fini avec … » needs no account, and the révélation completes the first launch all the
  // same: its one relevé holds no placement.
  'a first launch finished with no account (a relevé with no placement)': () => ({
    profile: {
      schema: 1,
      establishments: [{ id: 'e-bourso', name: 'BoursoBank', kind: 'institution', catalogId: 'boursobank' }],
      accounts: [],
      lines: [],
      firstLaunch: { planned: [], finished: ['e-bourso'], complete: true },
    },
    snapshots: [{ schema: 1, takenOn: '2026-10-31', fx: {}, entries: [], contributions: {}, arrivals: {} }],
    goals: [],
    settings: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0 },
  }),
  // An update keeps no entry for a line it closes (lib/update/build.ts).
  'an update that closed everything (a last relevé with no placement)': () => {
    const input = fixtureInput()
    input.profile.lines = input.profile.lines.map((l) => (l.closedOn ? l : { ...l, closedOn: '2026-11-08' }))
    input.snapshots = [...input.snapshots, { schema: 1, takenOn: '2026-11-08', fx: {}, entries: [], contributions: {}, arrivals: {} }]
    return input
  },
  'no settings, no goals': () => ({ ...fixtureInput(), settings: null, goals: [] }),
  'settings without a budget': () => ({ ...fixtureInput(), settings: { schema: 1, budget: null, display: 'euros', hideAmounts: false } }),
  'a rate no line uses': () => {
    const input = fixtureInput()
    input.snapshots[0] = { ...input.snapshots[0], fx: { USD: 0.92, GBP: 1.15 } }
    return input
  },
}

describe('the round trip: export, write, read, import', () => {
  for (const [name, variant] of Object.entries(VARIANTS)) {
    it(`gives back ${name}`, async () => {
      const input = variant()
      expectSame(input, readImport(await throughFile(input), counter()))
    })

    it(`gives back ${name}, after a tableur saved the file again`, async () => {
      const input = variant()
      expectSame(input, readImport(resaved(await throughFile(input)), counter()))
    })
  }

  it('keeps the two relevés of one day in their order', async () => {
    const { data } = success(readImport(await throughFile(fixtureInput()), counter()))
    const [, second, third] = data.snapshots.map((s) => s.value)
    expect(second.takenOn).toBe(third.takenOn)
    expect(second.entries.find((e) => e.lineId === 'l-euro')).toMatchObject({ amount: 2985000, seenOn: '2026-10-15' })
    expect(third.entries.find((e) => e.lineId === 'l-euro')).toMatchObject({ amount: 2990000, seenOn: '2026-10-31' })
  })

  it('gives a profile that was not grouped back in bank, account, line order', async () => {
    const input = VARIANTS['a profile not grouped by bank, as updates leave it']()
    const { data } = success(readImport(await throughFile(input), counter()))
    expect(data.profile.accounts.map((a) => a.id).slice(0, 6)).toEqual(['a-current', 'a-livret1', 'a-livret2', 'a-cto', 'a-pea', 'a-ldds'])
    expect(data.profile.lines.map((l) => l.id).slice(0, 7)).toEqual(['l-current', 'l-livret1', 'l-livret2', 'l-usd', 'l-closed', 'l-msft', 'l-ldds'])
  })

  it('keeps the « Épargne salariale » establishment as the first launch makes it', async () => {
    const { data } = success(readImport(await throughFile(fixtureInput()), counter()))
    expect(data.profile.establishments.find((e) => e.name === 'Épargne salariale')).toMatchObject({ kind: 'institution', catalogId: 'employee-savings' })
  })

  it('the re-saved book reads exactly as the original', async () => {
    const book = await throughFile(fixtureInput())
    const cells = (b: Map<string, Cell[][]>) => [...b.values()].flat(2)
    // The transformation does change the cells: the original holds dates, numbers and empty cells.
    expect(cells(book).some((c) => c instanceof Date)).toBe(true)
    expect(cells(book).some((c) => typeof c === 'number' && !Number.isInteger(c))).toBe(true)
    expect(cells(book).some((c) => c === null)).toBe(true)
    expect(cells(resaved(book)).some((c) => c instanceof Date || c === null)).toBe(false)
    expect(cells(resaved(book)).some((c) => typeof c === 'string' && /^\d+,\d+$/.test(c))).toBe(true)
    expect(readImport(resaved(book), counter())).toEqual(readImport(book, counter()))
  })
})
