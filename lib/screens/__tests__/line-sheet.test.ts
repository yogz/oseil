import { describe, expect, test } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import type { Market } from '@/lib/market/types'
import {
  account,
  amountEntry,
  exampleProfile,
  exampleSnapshot,
  line,
  profileOf,
  snapshotOf,
} from '@/lib/model/__tests__/fixtures'
import type { Profile, Snapshot, UpdateDraft } from '@/lib/model/types'
import { startDraft } from '@/lib/update/draft'
import { categoryDetailView } from '@/lib/screens/category-detail'
import { lineSheetView } from '@/lib/screens/line-sheet'
import { CHANGED_MEANWHILE, NO_HOME, NO_RATE_AMOUNT } from '@/lib/screens/line-words'

const TODAY = '2026-11-08'
const plain = (text: string | null) => text?.replace(/[  ]/g, ' ') ?? null
const loaded = <T,>(value: T, id: string) => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })

function modelOf(
  profile: Profile,
  snapshots: Snapshot[],
  parts: { draft?: UpdateDraft; unreadable?: Partial<Model['unreadable']> } = {},
): Model {
  return {
    profile: loaded(profile, 'p'),
    snapshots: snapshots.map((s, i) => loaded(s, `s${i}`)),
    goals: [],
    settings: null,
    draft: parts.draft ? loaded(parts.draft, 'd') : null,
    unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, ...parts.unreadable, draft: parts.unreadable?.draft ?? 0 },
  }
}

const followed: Profile = {
  ...exampleProfile,
  lines: exampleProfile.lines.map((l) => (l.id === 'etf' ? { ...l, quoteSymbol: 'CW8.PA' } : l)),
}
const marketWith = (price: number): Market => ({
  quotes: { 'CW8.PA': { price, currency: 'EUR', asOf: TODAY } },
  rates: null,
})
const model = modelOf(followed, [exampleSnapshot])

describe('the fiche of a line', () => {
  test('describes a fund of a PEA at today’s price, as the category detail does', () => {
    const view = lineSheetView(model, 'etf', TODAY, marketWith(260))!
    // « Cette ligne », then « Son compte » (11 November 2026, « tout corriger depuis la fiche »).
    expect(view.rows.map((r) => r.kind)).toEqual(['name', 'figures', 'category', 'group', 'slow', 'counted', 'price'])
    expect(view.accountTitle).toBe('PEA · BoursoBank')
    expect(view.accountRows.map((r) => r.kind)).toEqual(['accountType', 'bank'])
    expect(view.rows).toContainEqual({ kind: 'category', category: 'markets', value: 'Placements en bourse' })
    expect(view.rows).toContainEqual({ kind: 'counted', value: 'parts · €' })
    expect(view.close.label).toBe('Fermé ou tout vendu')
    expect(plain(view.detail)).toBe('100 parts · prix du jour 260,00 € · relevé du 30 septembre')
    expect(plain(view.amount)).toBe('26 000 €')
    expect(view.back).toEqual({ href: '/categorie/markets', label: 'Placements en bourse' })
    expect(view.rows).toContainEqual({ kind: 'price', following: true })
    expect(view.accountRows).toContainEqual({ kind: 'bank', value: 'BoursoBank' })
    expect(view.rows).toContainEqual({ kind: 'figures', label: 'Ses parts et son prix moyen', value: 'au 30 sept.' })
  })

  test('without a price of the day, the price is the snapshot’s own', () => {
    const view = lineSheetView(model, 'etf', TODAY, null)!
    expect(plain(view.detail)).toContain('dernier prix connu 250,00 €')
    expect(plain(view.amount)).toBe('25 000 €')
  })

  test('offers to file a loan held at home in its bank, under Immobilier, never in red words', () => {
    const view = lineSheetView(model, 'mortgage-line', TODAY, null)!
    expect(view.loanAtHome).toBe(true)
    expect(view.close.label).toBe('Remboursé')
    expect(view.rows.map((r) => r.kind)).toEqual(['name', 'figures', 'financed'])
    expect(view.accountRows).toEqual([{ kind: 'bank', value: 'Chez toi' }])
    expect(view.rows).toContainEqual({ kind: 'figures', label: 'Ce qui reste à rembourser', value: 'au 30 sept.' })
    expect(view.rows).toContainEqual({ kind: 'financed', value: 'Maison' })
    expect(view.back.href).toBe('/categorie/property')
    expect(view.category).toBeNull()
    expect(plain(view.amount)).toBe('180 000 €')
    expect(plain(view.amount)).not.toContain('-')
    expect(plain(view.where)).toContain('il finance « Maison »')
    expect(view.detail).toContain('reste à rembourser')
  })

  test('a loan whose home is not held lowers the available money, and says it finances nothing', () => {
    const profile = profileOf(
      [account('cur', 'current'), account('loan', 'loan')],
      [line('cur-l', 'cur'), line('loan-l', 'loan')],
    )
    const view = lineSheetView(modelOf(profile, [snapshotOf([amountEntry('cur-l', 100), amountEntry('loan-l', 50)])]), 'loan-l', TODAY, null)!
    expect(view.back.href).toBe('/categorie/available')
    expect(view.rows).toContainEqual({ kind: 'financed', value: NO_HOME })
  })

  // The category a loan lowers is read from one place, on the snapshot the figures come from.
  test('a loan whose house has no rate today goes back to the available money, where the detail lists it', () => {
    const profile: Profile = {
      ...exampleProfile,
      lines: exampleProfile.lines.map((l) => (l.id === 'house-line' ? { ...l, currency: 'USD' } : l)),
    }
    const noRate = modelOf(profile, [exampleSnapshot])
    const view = lineSheetView(noRate, 'mortgage-line', TODAY, null)!
    expect(view.back.href).toBe('/categorie/available')
    expect(categoryDetailView(noRate, 'available', TODAY)!.debts.map((d) => d.lineId)).toContain('mortgage-line')
    // The house is not counted: Immobilier would not open.
    expect(categoryDetailView(noRate, 'property', TODAY)).toBeNull()
  })

  test('a loan that finances something else than a home goes back to the category of what it finances', () => {
    const profile: Profile = {
      ...exampleProfile,
      accounts: exampleProfile.accounts.map((a) => (a.id === 'mortgage' ? { ...a, financedLineId: 'gold-line' } : a)),
    }
    const onGold = modelOf(profile, [exampleSnapshot])
    expect(lineSheetView(onGold, 'mortgage-line', TODAY, null)!.back.href).toBe('/categorie/gold')
    expect(categoryDetailView(onGold, 'gold', TODAY)!.debts.map((d) => d.lineId)).toEqual(['mortgage-line'])
  })

  test('a financed house says what is owed on it, as the detail of Immobilier does', () => {
    const view = lineSheetView(model, 'house-line', TODAY, null)!
    // The figure at the top is the one the category gives this line: its value less the loan.
    expect(plain(view.amount)).toBe('120 000 €')
    expect(view.amount).toBe(categoryDetailView(model, 'property', TODAY)!.lines.find((l) => l.lineId === 'house-line')!.euros)
    expect(plain(view.debt)).toBe('300 000 € dont 180 000 € dus à la banque')
    expect(plain(categoryDetailView(model, 'property', TODAY)!.debtSentence)).toBe(plain(view.debt))
  })

  test('says nothing of a loan that does not fit in the house, that the snapshot does not hold, or that is not there', () => {
    const tooMuch = { ...exampleSnapshot, entries: exampleSnapshot.entries.map((e) => (e.lineId === 'mortgage-line' ? amountEntry('mortgage-line', 400_000) : e)) }
    expect(lineSheetView(modelOf(followed, [tooMuch]), 'house-line', TODAY, null)!.debt).toBeNull()
    const noLoan = { ...exampleSnapshot, entries: exampleSnapshot.entries.filter((e) => e.lineId !== 'mortgage-line') }
    expect(lineSheetView(modelOf(followed, [noLoan]), 'house-line', TODAY, null)!.debt).toBeNull()
    const unlinked: Profile = { ...followed, accounts: followed.accounts.map((a) => (a.id === 'mortgage' ? { ...a, financedLineId: undefined } : a)) }
    expect(lineSheetView(modelOf(unlinked, [exampleSnapshot]), 'house-line', TODAY, null)!.debt).toBeNull()
    // Neither the loan's own fiche nor a line no loan finances.
    expect(lineSheetView(model, 'mortgage-line', TODAY, null)!.debt).toBeNull()
    expect(lineSheetView(model, 'etf', TODAY, null)!.debt).toBeNull()
  })

  test('adds up the loans that finance the same house', () => {
    const twoLoans: Profile = {
      ...followed,
      accounts: [...followed.accounts, { id: 'loan-2', establishmentId: 'home', type: 'loan', name: 'Prêt à taux zéro', financedLineId: 'house-line' }],
      lines: [...followed.lines, line('loan-2-line', 'loan-2')],
    }
    const snapshot = { ...exampleSnapshot, entries: [...exampleSnapshot.entries, amountEntry('loan-2-line', 20_000)] }
    expect(plain(lineSheetView(modelOf(twoLoans, [snapshot]), 'house-line', TODAY, null)!.debt)).toBe('300 000 € dont 200 000 € dus à la banque')
  })

  test('closes a house with « Vendu »', () => {
    expect(lineSheetView(model, 'house-line', TODAY, null)!.close.label).toBe('Vendu')
    expect(lineSheetView(model, 'house-line', TODAY, null)!.rows.some((r) => r.kind === 'place')).toBe(false)
  })

  test('says the euro amount is unknown for a line with no rate, never 0, and still lets its figures be corrected', () => {
    const profile = profileOf([account('usd', 'current')], [line('usd-line', 'usd', { currency: 'USD' }), line('eur-line', 'usd')])
    const snapshot = snapshotOf([amountEntry('usd-line', 100), amountEntry('eur-line', 5)])
    const view = lineSheetView(modelOf(profile, [snapshot]), 'usd-line', TODAY, null)!
    expect(view.amount).toBeNull()
    expect(view.amountNote).toBe(NO_RATE_AMOUNT)
    expect(view.rows.some((r) => r.kind === 'figures')).toBe(true)
  })

  test('is read only during an update, and on unreadable data', () => {
    expect(lineSheetView(model, 'etf', TODAY, null)!.locked).toBeNull()
    const running = modelOf(followed, [exampleSnapshot], { draft: startDraft('s0') })
    expect(lineSheetView(running, 'etf', TODAY, null)!.locked).toBe('update-running')
    const stale = modelOf(followed, [exampleSnapshot], { draft: startDraft('older') })
    expect(lineSheetView(stale, 'etf', TODAY, null)!.locked).toBeNull()
    const draftLost = modelOf(followed, [exampleSnapshot], { unreadable: { draft: 1 } })
    expect(lineSheetView(draftLost, 'etf', TODAY, null)!.locked).toBe('update-running')
    const badProfile = modelOf(followed, [exampleSnapshot], { unreadable: { profile: 1 } })
    expect(lineSheetView(badProfile, 'etf', TODAY, null)!.locked).toBe('unreadable')
    const badSnapshots = modelOf(followed, [exampleSnapshot], { unreadable: { snapshots: 2 } })
    expect(lineSheetView(badSnapshots, 'etf', TODAY, null)!.locked).toBe('unreadable')
  })

  test('shows a line closed after the last snapshot as closed, with no rows', () => {
    const profile = { ...followed, lines: followed.lines.map((l) => (l.id === 'gold-line' ? { ...l, closedOn: '2026-11-01' } : l)) }
    const view = lineSheetView(modelOf(profile, [exampleSnapshot]), 'gold-line', TODAY, null)!
    expect(view.state).toEqual({ kind: 'closed', on: '1er novembre' })
    expect(view.rows).toEqual([])
  })

  test('shows an interrupted close as unfinished', () => {
    const profile = { ...followed, lines: followed.lines.map((l) => (l.id === 'gold-line' ? { ...l, closedOn: '2026-09-30' } : l)) }
    const view = lineSheetView(modelOf(profile, [exampleSnapshot]), 'gold-line', TODAY, null)!
    expect(view.state).toEqual({ kind: 'closing-unfinished', on: '30 septembre' })
    expect(view.rows).toEqual([])
  })

  test('offers only deletion for a line whose first snapshot is today', () => {
    const todayOnly = modelOf(followed, [{ ...exampleSnapshot, takenOn: TODAY }])
    expect(lineSheetView(todayOnly, 'livret-a-line', TODAY, null)!.close.possible).toBe(false)
    expect(lineSheetView(model, 'livret-a-line', TODAY, null)!.close.possible).toBe(true)
    expect(lineSheetView(model, 'livret-a-line', TODAY, null)!.canDelete).toBe(true)
  })

  test('cannot delete the only line of a snapshot', () => {
    const profile = profileOf([account('cur', 'current')], [line('cur-l', 'cur')])
    const view = lineSheetView(modelOf(profile, [snapshotOf([amountEntry('cur-l', 100)])]), 'cur-l', TODAY, null)!
    expect(view.canDelete).toBe(false)
  })

  test('gives the unlock year of employee savings, and no unlock row elsewhere', () => {
    const profile = profileOf(
      [account('es', 'employee-savings', { unlockOn: '2029-01-01' }), account('es2', 'employee-savings'), account('cur', 'current')],
      [line('es-l', 'es'), line('es2-l', 'es2'), line('cur-l', 'cur')],
    )
    const m = modelOf(profile, [snapshotOf([amountEntry('es-l', 1), amountEntry('es2-l', 1), amountEntry('cur-l', 1)])])
    // An account's year: under « Son compte ».
    expect(lineSheetView(m, 'es-l', TODAY, null)!.accountRows).toContainEqual({ kind: 'unlock', year: 2029 })
    expect(lineSheetView(m, 'es2-l', TODAY, null)!.accountRows).toContainEqual({ kind: 'unlock', year: null })
    expect(lineSheetView(m, 'cur-l', TODAY, null)!.accountRows.some((r) => r.kind === 'unlock')).toBe(false)
  })

  test('asks whether it is quick to get back, except for a home, a PER, employee savings and a loan', () => {
    const profile = profileOf(
      [
        account('cur', 'current'),
        account('oth', 'other', { slow: true }),
        account('house', 'home'),
        account('per', 'per'),
        account('es', 'employee-savings'),
        account('loan', 'loan'),
      ],
      [
        line('cur-l', 'cur'),
        line('oth-l', 'oth', { category: 'markets' }),
        line('house-l', 'house'),
        line('per-l', 'per'),
        line('es-l', 'es'),
        line('loan-l', 'loan'),
      ],
    )
    const m = modelOf(
      profile,
      [snapshotOf(['cur-l', 'oth-l', 'house-l', 'per-l', 'es-l', 'loan-l'].map((id) => amountEntry(id, 1)))],
    )
    const slowRow = (id: string) => lineSheetView(m, id, TODAY, null)!.rows.find((r) => r.kind === 'slow')
    expect(slowRow('cur-l')).toEqual({ kind: 'slow', slow: false, wholeAccount: false })
    expect(slowRow('oth-l')).toEqual({ kind: 'slow', slow: true, wholeAccount: false })
    for (const id of ['house-l', 'per-l', 'es-l', 'loan-l']) expect(slowRow(id)).toBeUndefined()
  })

  test('gives the type of a home, a home without one being a main residence, and no type elsewhere', () => {
    const profile = profileOf(
      [account('house', 'home'), account('flat', 'home', { residence: 'rental' }), account('cottage', 'home', { residence: 'secondary' }), account('cur', 'current')],
      [line('house-l', 'house'), line('flat-l', 'flat'), line('cottage-l', 'cottage'), line('cur-l', 'cur')],
    )
    const m = modelOf(profile, [snapshotOf(['house-l', 'flat-l', 'cottage-l', 'cur-l'].map((id) => amountEntry(id, 1)))])
    const typeRow = (id: string) => lineSheetView(m, id, TODAY, null)!.rows.find((r) => r.kind === 'residence')
    expect(typeRow('house-l')).toEqual({ kind: 'residence', residence: 'main' })
    expect(typeRow('flat-l')).toEqual({ kind: 'residence', residence: 'rental' })
    expect(typeRow('cottage-l')).toEqual({ kind: 'residence', residence: 'secondary' })
    expect(typeRow('cur-l')).toBeUndefined()
    // The house of the example: its name, its figures, then its type.
    expect(lineSheetView(model, 'house-line', TODAY, null)!.rows.map((r) => r.kind)).toEqual(['name', 'figures', 'residence'])
  })

  test('gives the chapter of an open line of a ranged category, « Zone » for markets and « Type » for secured', () => {
    const profile = profileOf(
      [account('cur', 'current'), account('m', 'other'), account('s', 'other'), account('g', 'gold'), account('house', 'home'), account('x', 'other')],
      [
        line('cur-l', 'cur'),
        line('m-l', 'm', { category: 'markets', group: 'us' }),
        line('s-l', 's', { category: 'secured' }),
        line('g-l', 'g'),
        line('house-l', 'house'),
        line('x-l', 'x', { category: 'markets', group: 'bonds' }),
      ],
    )
    const m = modelOf(profile, [snapshotOf(['cur-l', 'm-l', 's-l', 'g-l', 'house-l', 'x-l'].map((id) => amountEntry(id, 1)))])
    const row = (id: string) => lineSheetView(m, id, TODAY, null)!.rows.find((r) => r.kind === 'group')
    expect(row('m-l')).toEqual({ kind: 'group', label: 'Zone', value: 'États-Unis', group: 'us' })
    expect(row('s-l')).toEqual({ kind: 'group', label: 'Type', value: 'Je ne sais pas', group: 'unknown' })
    expect(row('x-l')).toEqual({ kind: 'group', label: 'Zone', value: 'Je ne sais pas', group: 'unknown' })
    for (const id of ['cur-l', 'g-l', 'house-l']) expect(row(id)).toBeUndefined()
  })

  test('has no chapter row for a closed line', () => {
    const closed = { ...exampleProfile, lines: exampleProfile.lines.map((l) => (l.id === 'etf' ? { ...l, closedOn: '2026-09-01' } : l)) }
    const view = lineSheetView(modelOf(closed, [exampleSnapshot]), 'etf', TODAY, null)!
    expect(view.rows.some((r) => r.kind === 'group')).toBe(false)
  })

  test('is null for a line the latest snapshot does not hold, or without profile or snapshot', () => {
    const without = { ...exampleSnapshot, entries: exampleSnapshot.entries.filter((e) => e.lineId !== 'gold-line') }
    expect(lineSheetView(modelOf(followed, [exampleSnapshot, without]), 'gold-line', TODAY, null)).toBeNull()
    expect(lineSheetView(model, 'nope', TODAY, null)).toBeNull()
    expect(lineSheetView({ ...model, profile: null }, 'etf', TODAY, null)).toBeNull()
    expect(lineSheetView({ ...model, snapshots: [] }, 'etf', TODAY, null)).toBeNull()
  })

  test('has the controller’s copy for a line changed meanwhile', () => {
    expect(CHANGED_MEANWHILE).toBe('Cette ligne a changé entre-temps\u00A0: rien n’a été modifié.')
  })
})

// docs/superpowers/specs/2026-11-11-tout-corriger-depuis-la-fiche-design.md
describe('everything corrected from the fiche', () => {
  const crowd: Profile = {
    ...exampleProfile,
    lines: [
      ...exampleProfile.lines,
      line('villa', 'pea', { kind: 'amount', category: 'secured', group: 'unknown', slow: true }),
      line('reaumur', 'pea', { kind: 'amount', category: 'secured' }),
    ],
  }
  const snapshot = { ...exampleSnapshot, entries: [...exampleSnapshot.entries, amountEntry('villa', 1_000), amountEntry('reaumur', 1_000)] }
  test('a line among others of its account: where it is filed, its own slow answer, « Pour tout le compte »', () => {
    const view = lineSheetView(modelOf(crowd, [snapshot]), 'villa', TODAY, null)!
    expect(view.rows.map((r) => r.kind)).toEqual(['name', 'figures', 'category', 'group', 'place', 'slow', 'counted'])
    expect(view.rows).toContainEqual({ kind: 'place', value: 'PEA' })
    expect(view.rows).toContainEqual({ kind: 'slow', slow: true, wholeAccount: true })
    expect(view.rows).toContainEqual({ kind: 'counted', value: 'montant · €' })
  })
  test('a home has no category to choose, no account rows', () => {
    const view = lineSheetView(modelOf(crowd, [snapshot]), 'house-line', TODAY, null)!
    expect(view.rows.some((r) => r.kind === 'category' || r.kind === 'counted')).toBe(false)
    expect(view.accountTitle).toBeNull()
  })
  test('a recount cut short: no figure computed, « Terminer » offered', () => {
    const cut = { ...snapshot, entries: snapshot.entries.map((e) => (e.lineId === 'villa' ? { lineId: 'villa', kind: 'units' as const, units: 4, unitPrice: 250, averagePrice: null, seenOn: e.seenOn } : e)) }
    const view = lineSheetView(modelOf(crowd, [cut]), 'villa', TODAY, null)!
    expect(view.state).toEqual({ kind: 'recount-unfinished' })
    expect(view.amount).toBeNull()
    expect(view.amountNote).toBeNull()
    expect(view.rows).toEqual([])
  })
})

// The UI pass of 12 November 2026: the fiche opens on the title its list gave it.
test('a current account listed under its bank opens on its bank', () => {
  const view = lineSheetView(modelOf(exampleProfile, [exampleSnapshot]), 'current-line', TODAY, null)!
  expect(view.name).toBe('BoursoBank')
  expect(view.rows).toContainEqual({ kind: 'name', value: 'Compte courant' })
  expect(lineSheetView(modelOf(exampleProfile, [exampleSnapshot]), 'livret-a-line', TODAY, null)!.name).toBe('Livret A')
})
