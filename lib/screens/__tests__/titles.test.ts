import { describe, expect, test } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import { account, exampleProfile, exampleSnapshot, line, profileOf, snapshotOf, unitsEntry } from '@/lib/model/__tests__/fixtures'
import { parseProfile } from '@/lib/model/documents'
import type { Profile } from '@/lib/model/types'
import { categoryDetailView } from '@/lib/screens/category-detail'
import { monArgentView } from '@/lib/screens/mon-argent'
import {
  attachSymbol,
  couldFollow,
  detachSymbol,
  titlesBack,
  titlesFromCategory,
  titlesFromLine,
  titlesPageView,
  titleRows,
  TITLES_FROM_REPERES,
} from '@/lib/screens/titles'
import { toComplete } from '@/lib/screens/to-complete'
import { veryDifferent } from '@/lib/screens/words'
import type { Market } from '@/lib/market/types'

const plain = (text: string | null) => text?.replace(/[  ]/g, ' ') ?? null
const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const TODAY = '2026-10-15'

function modelOf(profile: Profile, snapshots = [exampleSnapshot]): Model {
  return {
    profile: loaded(profile),
    snapshots: snapshots.map((s, i) => loaded(s, `s${i}`)),
    goals: [],
    settings: null,
    draft: null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
  }
}

// R8: units lines inside gold and crypto accounts. Yahoo has no price for a gold coin; it has one for a crypto.
const withCoins: Profile = {
  ...exampleProfile,
  accounts: [...exampleProfile.accounts, account('coins', 'crypto', { establishmentId: 'home' })],
  lines: [
    ...exampleProfile.lines,
    line('gold-units', 'gold', { kind: 'units' }),
    line('coin-units', 'coins', { kind: 'units' }),
  ],
}

describe('titleRows', () => {
  test('lists the etf and the unit-linked line of the example, with where and the last price', () => {
    const rows = titleRows(exampleProfile, exampleSnapshot)
    expect(rows.map((r) => r.lineId)).toEqual(['etf', 'life-uc'])
    expect(rows[0].where).toBe('PEA chez BoursoBank')
    expect(rows[0].name).toBe('ETF')
    expect(plain(rows[0].lastPrice)).toMatch(/^250,00 €$/)
    expect(rows[0].symbol).toBeNull()
  })

  test('C16: the search opens with the line’s name only when it says more than its account’s name', () => {
    const rows = titleRows(exampleProfile, exampleSnapshot)
    // « ETF » in « PEA »: a name of its own, worth searching for.
    expect(rows[0].searchText).toBe('ETF')
    // A line named like its account (« PEA » in « PEA ») names no title: the box opens empty.
    const sameName: Profile = {
      ...exampleProfile,
      lines: exampleProfile.lines.map((l) => (l.id === 'etf' ? { ...l, name: ' pea ' } : l)),
    }
    expect(titleRows(sameName, exampleSnapshot)[0].searchText).toBe('')
  })

  test('R8: a units line inside a gold account is excluded; one inside a crypto account is listed, as a coin', () => {
    const rows = titleRows(withCoins, exampleSnapshot)
    expect(rows.map((r) => r.lineId).sort()).toEqual(['coin-units', 'etf', 'life-uc'])
    expect(rows.find((r) => r.lineId === 'coin-units')?.accountType).toBe('crypto')
    expect(rows.find((r) => r.lineId === 'etf')?.accountType).toBe('pea')
    expect(() => attachSymbol(withCoins, 'coin-units', 'BTC-EUR')).not.toThrow()
  })

  test('amount lines and closed lines are not listed', () => {
    const closed: Profile = {
      ...exampleProfile,
      lines: exampleProfile.lines.map((l) => (l.id === 'etf' ? { ...l, closedOn: '2026-10-01' } : l)),
    }
    expect(titleRows(closed, exampleSnapshot).map((r) => r.lineId)).toEqual(['life-uc'])
  })

  test('a line that already has a symbol is listed with it', () => {
    const followed = attachSymbol(exampleProfile, 'etf', 'CW8.PA')
    expect(titleRows(followed, exampleSnapshot)[0].symbol).toBe('CW8.PA')
  })

  test('without a snapshot, or without an entry for the line, the last price is null', () => {
    expect(titleRows(exampleProfile, undefined)[0].lastPrice).toBeNull()
    expect(titleRows(exampleProfile, snapshotOf([]))[0].lastPrice).toBeNull()
  })

  test('the price is written in the line’s own currency', () => {
    const usd = profileOf([account('pea', 'pea')], [line('a', 'pea', { kind: 'units', currency: 'USD' })])
    const rows = titleRows(usd, snapshotOf([unitsEntry('a', 1, 12.5, null)]))
    expect(plain(rows[0].lastPrice)).toContain('12,50')
    expect(rows[0].lastPrice).not.toContain('€')
  })
})

describe('attachSymbol and detachSymbol', () => {
  test('attach sets only the symbol, keeps the currency, returns new objects, and stays a valid profile', () => {
    const next = attachSymbol(exampleProfile, 'etf', 'CW8.PA')
    const etf = next.lines.find((l) => l.id === 'etf')!
    expect(etf.quoteSymbol).toBe('CW8.PA')
    expect(etf.currency).toBe('EUR')
    expect(next).not.toBe(exampleProfile)
    expect(next.lines).not.toBe(exampleProfile.lines)
    expect(exampleProfile.lines.find((l) => l.id === 'etf')!.quoteSymbol).toBeUndefined()
    expect(next.lines.filter((l) => l.id !== 'etf')).toEqual(exampleProfile.lines.filter((l) => l.id !== 'etf'))
    expect(parseProfile(next)).not.toBeNull()
  })

  test('attach clears « unquoted »: a followed price is an answer', () => {
    const unquoted: Profile = {
      ...exampleProfile,
      lines: exampleProfile.lines.map((l) => (l.id === 'etf' ? { ...l, unquoted: true as const } : l)),
    }
    const next = attachSymbol(unquoted, 'etf', 'CW8.PA')
    expect(next.lines.find((l) => l.id === 'etf')).not.toHaveProperty('unquoted')
  })

  test('refuses a line not in titleRows and a symbol outside SYMBOL', () => {
    expect(() => attachSymbol(exampleProfile, 'gold-line', 'CW8.PA')).toThrow()
    expect(() => attachSymbol(withCoins, 'gold-units', 'CW8.PA')).toThrow()
    expect(() => attachSymbol(withCoins, 'coin-units', 'BTC EUR')).toThrow()
    expect(() => attachSymbol(exampleProfile, 'etf', 'CW8 PA')).toThrow()
    expect(() => attachSymbol(exampleProfile, 'nope', 'CW8.PA')).toThrow()
  })

  test('detach removes quoteSymbol and nothing else', () => {
    const followed = attachSymbol(exampleProfile, 'etf', 'CW8.PA')
    const back = detachSymbol(followed, 'etf')
    const etf = back.lines.find((l) => l.id === 'etf')!
    expect('quoteSymbol' in etf).toBe(false)
    expect(back).toEqual(exampleProfile)
    expect(back).not.toBe(followed)
    expect(followed.lines.find((l) => l.id === 'etf')!.quoteSymbol).toBe('CW8.PA')
  })

  test('detach refuses a line not in titleRows', () => {
    expect(() => detachSymbol(exampleProfile, 'gold-line')).toThrow()
  })
})

describe('couldFollow', () => {
  test('the example: none followed, two possible; one attach later, one followed', () => {
    expect(couldFollow(exampleProfile, exampleSnapshot)).toEqual({ following: 0, possible: 2 })
    expect(couldFollow(attachSymbol(exampleProfile, 'etf', 'CW8.PA'), exampleSnapshot)).toEqual({ following: 1, possible: 2 })
  })
})

describe('the hint on Mon argent and the link on the category', () => {
  const hint = (profile: Profile, snapshot = exampleSnapshot) => {
    const view = monArgentView(modelOf(profile, [snapshot]), TODAY)
    if (view.kind !== 'board') throw new Error(view.kind)
    return view.titlesHint
  }

  test('the hint shows while nothing is followed and something could be', () => {
    expect(hint(exampleProfile)).toBe(true)
  })
  test('the hint goes once a line is followed', () => {
    expect(hint(attachSymbol(exampleProfile, 'etf', 'CW8.PA'))).toBe(false)
  })
  test('no hint when no line could be followed', () => {
    const none: Profile = { ...exampleProfile, lines: exampleProfile.lines.filter((l) => l.kind === 'amount') }
    const snapshot = { ...exampleSnapshot, entries: exampleSnapshot.entries.filter((e) => e.kind === 'amount') }
    expect(hint(none, snapshot)).toBe(false)
  })
  test('the category link shows when the category holds a line that could be followed', () => {
    expect(categoryDetailView(modelOf(exampleProfile), 'markets', TODAY)!.titlesLink).toBe(true)
  })
  test('and not for a category without one', () => {
    expect(categoryDetailView(modelOf(exampleProfile), 'available', TODAY)!.titlesLink).toBe(false)
  })
})

describe('veryDifferent', () => {
  test('flags prices further apart than a third, either way, and never a missing one', () => {
    expect(veryDifferent(12.46, 250)).toBe(true)
    expect(veryDifferent(700, 250)).toBe(true)
    expect(veryDifferent(255, 250)).toBe(false)
    expect(veryDifferent(0, 250)).toBe(false)
  })
})

describe('the way back of « Tes titres »', () => {
  test('goes back to where it was opened from, and says its name', () => {
    expect(titlesBack(null, exampleProfile)).toEqual({ href: '/', label: 'Mon argent' })
    expect(titlesBack('categorie/markets', exampleProfile)).toEqual({
      href: '/categorie/markets',
      label: 'Placements en bourse',
    })
    expect(titlesBack('ligne/etf', exampleProfile)).toEqual({ href: '/ligne/etf', label: 'ETF' })
  })

  test('an address typed by hand falls back to Mon argent', () => {
    expect(titlesBack('categorie/nope', exampleProfile)).toEqual({ href: '/', label: 'Mon argent' })
    expect(titlesBack('ligne/unknown', exampleProfile)).toEqual({ href: '/', label: 'Mon argent' })
    expect(titlesBack('https://elsewhere.example', exampleProfile)).toEqual({ href: '/', label: 'Mon argent' })
    expect(titlesBack('ligne/etf', null)).toEqual({ href: '/', label: 'Mon argent' })
  })

  test('the links that open it say where from', () => {
    expect(titlesFromCategory('markets')).toBe('/titres?depuis=categorie/markets')
    expect(titlesFromLine('etf')).toBe('/titres?depuis=ligne/etf')
  })

  test('from the Repères, back to the Repères', () => {
    expect(titlesBack('reperes', exampleProfile)).toEqual({ href: '/reperes', label: 'Repères' })
    expect(titlesBack('reperes', null)).toEqual({ href: '/reperes', label: 'Repères' })
    expect(TITLES_FROM_REPERES).toBe('/titres?depuis=reperes')
  })
})

describe('the page « Tes titres »: what to find first', () => {
  const RATES = { on: '2026-10-14', perEuro: { USD: 1.1 } }
  const market = (quotes: Market['quotes'] = {}): Market => ({ quotes, rates: RATES })
  // Three titles of a PEA, in this order: one to find, one followed, one said not listed.
  const three: Profile = {
    ...exampleProfile,
    lines: [
      ...exampleProfile.lines.filter((l) => l.id !== 'life-uc'),
      line('fund', 'pea', { kind: 'units', name: 'Fonds maison', quoteSymbol: 'CW8.PA' }),
      line('pme', 'pea', { kind: 'units', name: 'PME locale', unquoted: true }),
    ],
  }
  const view = (profile: Profile, m: Market | 'loading' | null = market()) => {
    const v = titlesPageView(modelOf(profile), m, TODAY)
    if (v.kind !== 'titles') throw new Error(v.kind)
    return v
  }

  test('the titles in three groups: to find, followed, not listed', () => {
    const v = view(three)
    expect(v.toFind.map((r) => r.lineId)).toEqual(['etf'])
    expect(v.followed?.rows.map((r) => r.lineId)).toEqual(['fund'])
    expect(v.unquoted?.rows.map((r) => r.lineId)).toEqual(['pme'])
  })

  test('« À retrouver » is exactly the quote gap of « À compléter »', () => {
    const model = modelOf(exampleProfile)
    const v = titlesPageView(model, market(), TODAY)
    if (v.kind !== 'titles') throw new Error(v.kind)
    const gap = toComplete(model, TODAY).find((item) => item.kind === 'quote')!
    expect(v.toFind.map((r) => r.lineId)).toEqual(gap.lineIds)
    expect(gap.href).toBe(TITLES_FROM_REPERES)
  })

  test('a row to find says where, and that its price does not move by itself', () => {
    const [etf] = view(three).toFind
    expect(etf.name).toBe('ETF')
    expect(etf.caption).toBe('PEA chez BoursoBank · son prix ne bouge pas tout seul')
    expect(etf.searchText).toBe('ETF')
    expect(etf.currency).toBe('EUR')
    expect(etf.lastValue).toBe(250)
    expect(etf.findLabel).toBe('Le retrouver : ETF')
    expect(etf.unquotedLabel).toBe('Pas coté : ETF')
  })

  test('the counts, singular and plural', () => {
    const v = view(three)
    expect(v.followed?.summary).toBe('1 titre suit son cours')
    expect(v.unquoted?.summary).toBe('1 placement pas coté')
    const more: Profile = {
      ...three,
      lines: [
        ...three.lines,
        line('fund2', 'pea', { kind: 'units', name: 'Autre fonds', quoteSymbol: 'ESE.PA' }),
        line('pme2', 'pea', { kind: 'units', name: 'Autre PME', unquoted: true }),
      ],
    }
    const w = view(more)
    expect(w.followed?.summary).toBe('2 titres suivent leur cours')
    expect(w.unquoted?.summary).toBe('2 placements pas cotés')
  })

  test('a group with nothing in it is not shown', () => {
    const v = view(exampleProfile)
    expect(v.followed).toBeNull()
    expect(v.unquoted).toBeNull()
  })

  test('the lead: plural, singular, then all in order', () => {
    expect(view(exampleProfile).lead).toBe(
      '2 titres ne suivent pas leur cours. Retrouve-les, ou dis-nous s’ils ne sont pas cotés.',
    )
    expect(view(three).lead).toBe('1 titre ne suit pas son cours. Retrouve-le, ou dis-nous s’il n’est pas coté.')
    const done = view({ ...three, lines: three.lines.filter((l) => l.id !== 'etf') })
    expect(done.lead).toBe('Tous tes titres sont en ordre.')
    expect(done.toFind).toEqual([])
    expect(done.strip.map((s) => s.state)).toEqual(['followed', 'unquoted'])
  })

  test('the strip: one square per title, followed first, then not listed, then to find', () => {
    expect(view(three).strip).toEqual([
      { lineId: 'fund', state: 'followed', category: 'markets' },
      { lineId: 'pme', state: 'unquoted', category: 'markets' },
      { lineId: 'etf', state: 'to-find', category: 'markets' },
    ])
  })

  test('a followed title says where and today’s price, never its symbol, and leads to its sheet', () => {
    const [fund] = view(three, market({ 'CW8.PA': { price: 342.37, currency: 'USD', asOf: TODAY } })).followed!.rows
    expect(fund.name).toBe('Fonds maison')
    expect(plain(fund.detail)).toBe('PEA chez BoursoBank · 311,25 €')
    expect(fund.detail).not.toContain('CW8')
    expect(fund.href).toBe('/ligne/fund')
  })

  test('a followed title whose price is missing or stale says so, never 0; loading says …', () => {
    const stale = view(three, market({ 'CW8.PA': { price: 342.37, currency: 'EUR', asOf: '2026-09-01' } }))
    expect(stale.followed!.rows[0].detail).toBe('PEA chez BoursoBank · Son prix n’a pas pu être récupéré pour l’instant.')
    expect(view(three, null).followed!.rows[0].detail).toBe(
      'PEA chez BoursoBank · Son prix n’a pas pu être récupéré pour l’instant.',
    )
    expect(view(three, 'loading').followed!.rows[0].detail).toBe('PEA chez BoursoBank · …')
  })

  test('a title not listed is named, with « Changer » saying which', () => {
    expect(view(three).unquoted!.rows).toEqual([{ lineId: 'pme', name: 'PME locale', changeLabel: 'Changer : PME locale' }])
  })

  test('no title at all: nothing to list', () => {
    const none: Profile = { ...exampleProfile, lines: exampleProfile.lines.filter((l) => l.kind === 'amount') }
    expect(titlesPageView(modelOf(none), market(), TODAY).kind).toBe('none')
  })

  test('an unreadable profile says so', () => {
    expect(titlesPageView({ ...modelOf(exampleProfile), profile: null }, market(), TODAY).kind).toBe('unreadable')
  })
})
