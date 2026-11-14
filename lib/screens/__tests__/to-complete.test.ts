import { describe, expect, test } from 'vitest'
import { account, amountEntry, line, profileOf, snapshotOf, unitsEntry } from '@/lib/model/__tests__/fixtures'
import type { Model } from '@/lib/app/use-model'
import type { Account, Line, Profile, SnapshotEntry } from '@/lib/model/types'
import { lineGaps, toComplete, type GapKind } from '@/lib/screens/to-complete'

const TODAY = '2026-11-12'
const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })

function modelOf(profile: Profile | null, entries: SnapshotEntry[] | null): Model {
  return {
    profile: profile === null ? null : loaded(profile),
    snapshots: entries === null ? [] : [loaded(snapshotOf(entries), 's0')],
    goals: [],
    settings: null,
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  }
}

// A profile with nothing left to complete: a followed, ranged title with its purchase price, a dated
// employee savings, a home and its linked loan.
const complete = {
  accounts: [
    account('pea', 'pea', { name: 'PEA' }),
    account('pee', 'employee-savings', { name: 'PEE', unlockOn: '2029-01-01' }),
    account('house', 'home', { name: 'Maison' }),
    account('mortgage', 'loan', { name: 'Crédit immo', financedLineId: 'house-line' }),
  ],
  lines: [
    line('etf', 'pea', { kind: 'units', quoteSymbol: 'CW8.PA', group: 'world' }),
    line('pee-line', 'pee', { group: 'world' }),
    line('house-line', 'house'),
    line('mortgage-line', 'mortgage'),
  ],
  entries: [
    unitsEntry('etf', 100, 250, 200), // 25 000 €
    amountEntry('pee-line', 5_000),
    amountEntry('house-line', 300_000),
    amountEntry('mortgage-line', 180_000),
  ],
}

type Change = { accounts?: (a: Account) => Account; lines?: (l: Line) => Line; add?: { accounts?: Account[]; lines?: Line[] } }

function build(change: Change = {}, entries: SnapshotEntry[] = complete.entries): Model {
  const accounts = complete.accounts.map(change.accounts ?? ((a) => a)).concat(change.add?.accounts ?? [])
  const lines = complete.lines.map(change.lines ?? ((l) => l)).concat(change.add?.lines ?? [])
  return modelOf(profileOf(accounts, lines), entries)
}

const withEntry = (lineId: string, replacement: SnapshotEntry | null, extra: SnapshotEntry[] = []) =>
  complete.entries.flatMap((e) => (e.lineId === lineId ? (replacement ? [replacement] : []) : [e])).concat(extra)

const kinds = (model: Model) => toComplete(model, TODAY).map((i) => i.kind)
const only = (model: Model, kind: GapKind) => toComplete(model, TODAY).filter((i) => i.kind === kind)

describe('nothing to complete', () => {
  test('a complete profile has no gap', () => {
    expect(toComplete(build(), TODAY)).toEqual([])
  })

  test('no snapshot, or no profile: nothing', () => {
    expect(toComplete(modelOf(profileOf(complete.accounts, complete.lines), null), TODAY)).toEqual([])
    expect(toComplete(modelOf(null, complete.entries), TODAY)).toEqual([])
  })
})

describe('purchase: a title with no purchase price', () => {
  const noPrice = withEntry('etf', unitsEntry('etf', 100, 250, null))

  test('one title: its sheet, its value as weight', () => {
    expect(toComplete(build({}, noPrice), TODAY)).toEqual([
      {
        kind: 'purchase',
        what: '1 titre sans prix d’achat',
        why: 'pour savoir ce que tes placements ont vraiment rapporté',
        href: '/ligne/etf',
        weight: 2_500_000,
        category: 'markets',
        lineIds: ['etf'],
      },
    ])
  })

  test('several titles: the markets page, the plural, the sum of their values', () => {
    const model = build(
      { add: { lines: [line('etf2', 'pea', { kind: 'units', quoteSymbol: 'PAEEM.PA', group: 'emerging' })] } },
      withEntry('etf', unitsEntry('etf', 100, 250, null), [unitsEntry('etf2', 10, 30, null)]),
    )
    const [item] = only(model, 'purchase')
    expect(item.what).toBe('2 titres sans prix d’achat')
    expect(item.href).toBe('/categorie/markets')
    expect(item.weight).toBe(2_530_000)
    expect(item.lineIds).toEqual(['etf', 'etf2'])
  })

  test('a cost of zero counts as missing', () => {
    expect(kinds(build({}, withEntry('etf', unitsEntry('etf', 100, 250, 0))))).toEqual(['purchase'])
  })

  test('answered: a price typed, or « Je ne sais pas »', () => {
    expect(kinds(build({}, complete.entries))).toEqual([])
    expect(kinds(build({ lines: (l) => (l.id === 'etf' ? { ...l, purchaseUnknown: true } : l) }, noPrice))).toEqual([])
  })

  test('Review Focus 2: a price typed later closes the gap, even with the flag still set', () => {
    const model = build({ lines: (l) => (l.id === 'etf' ? { ...l, purchaseUnknown: true } : l) }, complete.entries)
    expect(kinds(model)).toEqual([])
  })

  test('a markets amount line is no gap: it can never take a price', () => {
    const model = build({ add: { lines: [line('fund', 'pea', { group: 'world' })] } }, withEntry('etf', unitsEntry('etf', 100, 250, 200), [amountEntry('fund', 4_000)]))
    expect(only(model, 'purchase')).toEqual([])
  })

  test('only in Placements en bourse: a units line of secured savings is no gap', () => {
    const model = build(
      { add: { accounts: [account('life', 'life-insurance')], lines: [line('uc', 'life', { kind: 'units', category: 'secured', group: 'bonds', quoteSymbol: 'X.PA' })] } },
      withEntry('etf', unitsEntry('etf', 100, 250, 200), [unitsEntry('uc', 10, 100, null)]),
    )
    expect(kinds(model)).toEqual([])
  })
})

describe('quote: a title that does not follow its price', () => {
  const unfollowed = (l: Line) => (l.id === 'etf' ? { ...l, quoteSymbol: undefined } : l)

  test('one title: singular words, /titres from the Repères', () => {
    expect(only(build({ lines: unfollowed }), 'quote')).toEqual([
      {
        kind: 'quote',
        what: '1 titre qui ne suit pas son cours',
        why: 'pour qu’il se mette à jour tout seul',
        href: '/titres?depuis=reperes',
        weight: 2_500_000,
        lineIds: ['etf'],
      },
    ])
  })

  test('several titles: plural words', () => {
    const model = build(
      { lines: unfollowed, add: { lines: [line('etf2', 'pea', { kind: 'units', group: 'emerging' })] } },
      [...complete.entries, unitsEntry('etf2', 10, 30, 25)],
    )
    const [item] = only(model, 'quote')
    expect(item.what).toBe('2 titres qui ne suivent pas leur cours')
    expect(item.why).toBe('pour qu’ils se mettent à jour tout seuls')
    expect(item.lineIds).toEqual(['etf', 'etf2'])
  })

  test('answered: a symbol, or « Pas coté »', () => {
    expect(kinds(build())).toEqual([])
    expect(kinds(build({ lines: (l) => (l.id === 'etf' ? { ...unfollowed(l), unquoted: true } : l) }))).toEqual([])
  })
})

describe('ranging: a line never ranged', () => {
  test('a markets line with no group: by zone', () => {
    expect(only(build({ lines: (l) => (l.id === 'etf' ? { ...l, group: undefined } : l) }), 'ranging')).toEqual([
      {
        kind: 'ranging',
        what: '1 ligne de bourse pas rangée par zone',
        why: 'pour voir où ta bourse est placée dans le monde',
        href: '/categorie/markets/ranger',
        weight: 2_500_000,
        category: 'markets',
        lineIds: ['etf'],
      },
    ])
  })

  test('a group of another category counts as never ranged; « Je ne sais pas » is an answer', () => {
    expect(kinds(build({ lines: (l) => (l.id === 'etf' ? { ...l, group: 'euro-fund' } : l) }))).toEqual(['ranging'])
    expect(kinds(build({ lines: (l) => (l.id === 'etf' ? { ...l, group: 'unknown' } : l) }))).toEqual([])
  })

  test('secured savings: by type, one item per category, plural', () => {
    const model = build(
      {
        lines: (l) => (l.id === 'etf' ? { ...l, group: undefined } : l),
        add: { accounts: [account('life', 'life-insurance')], lines: [line('fund', 'life'), line('fund2', 'life')] },
      },
      [...complete.entries, amountEntry('fund', 30_000), amountEntry('fund2', 1_000)],
    )
    const items = only(model, 'ranging')
    expect(items.map((i) => [i.category, i.what, i.why, i.href, i.weight])).toEqual([
      ['secured', '2 lignes d’épargne sécurisée pas rangées par type', 'pour voir de quoi elle est faite', '/categorie/secured/ranger', 3_100_000],
      ['markets', '1 ligne de bourse pas rangée par zone', 'pour voir où ta bourse est placée dans le monde', '/categorie/markets/ranger', 2_500_000],
    ])
    const markets = build(
      { add: { lines: [line('etf2', 'pea', { kind: 'units', quoteSymbol: 'X.PA' }), line('etf3', 'pea', { kind: 'units', quoteSymbol: 'Y.PA' })] } },
      [...complete.entries, unitsEntry('etf2', 1, 10, 10), unitsEntry('etf3', 1, 10, 10)],
    )
    expect(only(markets, 'ranging')[0].what).toBe('2 lignes de bourse pas rangées par zone')
  })
})

describe('unlock: employee savings with no unlock date', () => {
  const undated = (a: Account) => (a.id === 'pee' ? { ...a, unlockOn: undefined } : a)

  test('one item per account, to the sheet of its first open line', () => {
    expect(only(build({ accounts: undated }), 'unlock')).toEqual([
      {
        kind: 'unlock',
        what: 'PEE, sans date de déblocage',
        why: 'pour savoir quand cet argent se libère',
        href: '/ligne/pee-line',
        weight: 500_000,
        lineIds: ['pee-line'],
      },
    ])
  })

  test('answered: a date, or « Je ne sais pas »', () => {
    expect(kinds(build())).toEqual([])
    expect(kinds(build({ accounts: (a) => (a.id === 'pee' ? { ...undated(a), unlockUnknown: true } : a) }))).toEqual([])
  })

  test('holding nothing: no gap', () => {
    expect(kinds(build({ accounts: undated }, withEntry('pee-line', amountEntry('pee-line', 0))))).toEqual([])
  })

  test('Review Focus 1: an account with no open line never appears', () => {
    const model = build({ accounts: undated, lines: (l) => (l.id === 'pee-line' ? { ...l, closedOn: '2026-10-01' } : l) })
    expect(kinds(model)).toEqual([])
  })
})

describe('loan: a loan linked to no home', () => {
  const unlinked = (a: Account) => (a.id === 'mortgage' ? { ...a, financedLineId: undefined } : a)

  test('one item per account, its amount owed as weight', () => {
    expect(only(build({ accounts: unlinked }), 'loan')).toEqual([
      {
        kind: 'loan',
        what: 'Crédit immo, relié à aucun logement',
        why: 'pour que ton logement soit compté net de son crédit',
        href: '/ligne/mortgage-line',
        weight: 18_000_000,
        lineIds: ['mortgage-line'],
      },
    ])
  })

  test('answered: « Ce crédit ne finance pas de logement »', () => {
    expect(kinds(build({ accounts: (a) => (a.id === 'mortgage' ? { ...unlinked(a), noHome: true } : a) }))).toEqual([])
  })

  test('Review Focus 3: no home in the profile, or a loan already linked: never a gap', () => {
    const noHouse = modelOf(
      profileOf(
        complete.accounts.filter((a) => a.id !== 'house').map(unlinked),
        complete.lines.filter((l) => l.id !== 'house-line'),
      ),
      complete.entries.filter((e) => e.lineId !== 'house-line'),
    )
    expect(kinds(noHouse)).toEqual([])
    const homeClosed = build({ accounts: unlinked, lines: (l) => (l.id === 'house-line' ? { ...l, closedOn: '2026-10-01' } : l) })
    expect(kinds(homeClosed)).toEqual([])
    expect(kinds(build())).toEqual([])
  })

  test('Review Focus 1: a closed loan never appears', () => {
    const model = build({ accounts: unlinked, lines: (l) => (l.id === 'mortgage-line' ? { ...l, closedOn: '2026-10-01' } : l) })
    expect(kinds(model)).toEqual([])
  })
})

describe('Review Focus 1: a closed line is never a gap', () => {
  test('a closed title with no price, no symbol, no group', () => {
    const model = build(
      { lines: (l) => (l.id === 'etf' ? { ...l, quoteSymbol: undefined, group: undefined, closedOn: '2026-10-01' } : l) },
      withEntry('etf', unitsEntry('etf', 100, 250, null)),
    )
    expect(kinds(model)).toEqual([])
  })
})

describe('the order', () => {
  test('the biggest amount first; at equal amounts, the order of the kinds', () => {
    const model = build(
      {
        accounts: (a) => (a.id === 'pee' ? { ...a, unlockOn: undefined } : a.id === 'mortgage' ? { ...a, financedLineId: undefined } : a),
        lines: (l) => (l.id === 'etf' ? { ...l, quoteSymbol: undefined } : l),
      },
      withEntry('etf', unitsEntry('etf', 100, 250, null)),
    )
    // loan 180 000 €, then the title's purchase and quote (25 000 € each, purchase before quote), then PEE.
    expect(kinds(model)).toEqual(['loan', 'purchase', 'quote', 'unlock'])
  })
})

describe('lineGaps', () => {
  test('a line with a purchase gap, on an account with an unlock gap', () => {
    const model = build(
      {
        accounts: (a) => (a.id === 'pee' ? { ...a, unlockOn: undefined } : a),
        add: { lines: [line('pee-fund', 'pee', { kind: 'units', quoteSymbol: 'Z.PA', group: 'world' })] },
      },
      [...complete.entries, unitsEntry('pee-fund', 10, 100, null)],
    )
    expect(lineGaps(model, 'pee-fund')).toEqual(['purchase', 'unlock'])
    expect(lineGaps(model, 'pee-line')).toEqual(['unlock'])
    expect(lineGaps(model, 'etf')).toEqual([])
  })
})
