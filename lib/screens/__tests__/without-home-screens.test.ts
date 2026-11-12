// « Ta grille : sans chez toi » on the screens (docs/superpowers/specs/2026-11-12-grille-sans-chez-toi-design.md).
import { expect, test } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import { account, amountEntry, line, profileOf, snapshotOf } from '@/lib/model/__tests__/fixtures'
import type { Settings, Snapshot } from '@/lib/model/types'
import { categoryDetailView } from '@/lib/screens/category-detail'
import { evolutionView } from '@/lib/screens/evolution'
import { monArgentView, type Board } from '@/lib/screens/mon-argent'
import { homeChoice } from '@/lib/screens/home-in-grid'

const TODAY = '2026-11-12'
const plain = (text: string | null | undefined) => (text ?? '').replace(/[  ]/g, ' ')
const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })

// 400 000 € in all: a 280 000 € home, 20 000 € of cash, 60 000 € in a securities account, 40 000 € in a livret.
const profile = profileOf(
  [account('c', 'current'), account('h', 'home'), account('s', 'securities'), account('l', 'livret-a')],
  [line('cash', 'c'), line('home', 'h'), line('fund', 's', { kind: 'amount' }), line('livret', 'l')],
)
const at = (takenOn: string, scale = 1): Snapshot => ({
  ...snapshotOf([
    amountEntry('cash', 20_000 * scale),
    amountEntry('home', 280_000),
    amountEntry('fund', 60_000 * scale),
    amountEntry('livret', 40_000 * scale),
  ]),
  takenOn,
})
const settings = (withoutHome: boolean): Settings => ({
  schema: 1,
  budget: null,
  display: 'euros',
  hideAmounts: false,
  ...(withoutHome ? { withoutHome: true as const } : {}),
})
const modelOf = (withoutHome: boolean, snapshots = [at('2026-10-31')]): Model => ({
  profile: loaded(profile),
  snapshots: snapshots.map((s, i) => loaded(s, `s${i}`)),
  goals: [],
  settings: loaded(settings(withoutHome)),
  draft: null,
  unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
})
const board = (model: Model): Board => {
  const view = monArgentView(model, TODAY)
  if (view.kind !== 'board') throw new Error(`expected a board, got ${view.kind}`)
  return view
}

test('everything counted by default: the home is in the grid, nothing said', () => {
  const b = board(modelOf(false))
  expect(plain(b.net)).toBe('400 000 €')
  expect(b.homeAside).toBeNull()
  expect(b.categories.map((c) => c.category)).toContain('property')
})

test('without the home: 100 squares on what is left, the other total said beneath', () => {
  const b = board(modelOf(true))
  expect(plain(b.net)).toBe('120 000 €')
  expect(plain(b.homeAside)).toBe('400 000 € en comptant chez toi')
  expect(plain(b.squareValue)).toBe('1 200 €')
  if (b.grid.kind !== 'grid') throw new Error('expected a grid')
  expect(b.grid.categories.reduce((s, c) => s + c.squares, 0)).toBe(100)
  // No rental: the Immobilier row goes (planche 4, option A).
  expect(b.categories.map((c) => c.category)).not.toContain('property')
})

test('a square was worth, at the first snapshot, what the same rule gives', () => {
  const b = board(modelOf(true, [at('2026-09-30', 0.5), at('2026-10-31')]))
  expect(plain(b.progress?.squareThen)).toBe('600 €')
})

// Immobilier's detail follows the grid too (Nicolas, 12 November 2026): the home is listed under it, out of the
// grid, with its amount only.
test('the shares of a category’s detail follow the grid; Immobilier lists the home out of the grid', () => {
  const available = categoryDetailView(modelOf(true), 'available', TODAY)!
  expect(plain(available.percent)).toBe('50 %')
  const property = categoryDetailView(modelOf(true), 'property', TODAY)!
  expect(property.lines).toEqual([])
  expect(plain(property.header)).toBe('Chez toi est hors de ta grille, comme tu l’as choisi.')
  expect(property.outOfGrid.map((l) => [l.lineId, plain(l.percent), l.squares])).toEqual([['home', '280 000 €', 0]])
  // Left out by choice, not for want of a rate (seen on the e2e capture, 12 November 2026).
  expect(property.note).toBeNull()
  expect(property.leftOut).toEqual([])
  expect(categoryDetailView(modelOf(false), 'property', TODAY)!.outOfGrid).toEqual([])
  expect(property.homeLink).toEqual({ href: '/reglages', label: 'Remettre chez toi dans ma grille ›' })
  expect(categoryDetailView(modelOf(false), 'property', TODAY)!.homeLink).toEqual({ href: '/reglages', label: 'Voir ma grille sans chez toi ›' })
})

test('Évolution follows the same choice over its whole length', () => {
  const view = evolutionView(modelOf(true, [at('2026-09-30', 0.5), at('2026-10-31')]), TODAY)
  if (view.kind !== 'history') throw new Error(`expected history, got ${view.kind}`)
  expect(view.points.map((p) => p.net)).toEqual([60_000 * 100, 120_000 * 100])
  expect(view.withoutHome).toBe(true)
  const whole = evolutionView(modelOf(false, [at('2026-09-30', 0.5), at('2026-10-31')]), TODAY)
  expect(whole.kind === 'history' && whole.withoutHome).toBe(false)
})

test('the setting is offered with a home and something else; greyed with a home alone; absent without a home', () => {
  expect(homeChoice(modelOf(false))).toBe('choose')
  const onlyHome: Model = {
    ...modelOf(false),
    profile: loaded(profileOf([account('h', 'home')], [line('home', 'h')])),
    snapshots: [loaded(snapshotOf([amountEntry('home', 280_000)]), 's0')],
  }
  expect(homeChoice(onlyHome)).toBe('only-home')
  const noHome: Model = {
    ...modelOf(false),
    profile: loaded(profileOf([account('c', 'current')], [line('cash', 'c')])),
    snapshots: [loaded(snapshotOf([amountEntry('cash', 1_000)]), 's0')],
  }
  expect(homeChoice(noHome)).toBe('none')
})

// Found by the review of 12 November 2026.
const homeOwner = profileOf(
  [account('c', 'current'), account('h', 'home'), account('hl', 'loan', { financedLineId: 'home' }), account('car', 'loan')],
  [line('cash', 'c'), line('home', 'h'), line('home-loan', 'hl'), line('car-loan', 'car')],
)
const ownerModel = (snapshots: Snapshot[]): Model => ({
  ...modelOf(true, snapshots),
  profile: loaded(homeOwner),
})
const dated = (takenOn: string, entries: Parameters<typeof snapshotOf>[0]): Snapshot => ({ ...snapshotOf(entries), takenOn })

test('an old snapshot with nothing but the home is never counted whole among the others: no made-up loss', () => {
  const snapshots = [
    dated('2026-08-31', [amountEntry('cash', 0), amountEntry('home', 300_000), amountEntry('home-loan', 100_000)]),
    dated('2026-10-31', [amountEntry('cash', 10_000), amountEntry('home', 300_000), amountEntry('home-loan', 100_000)]),
  ]
  const b = board(ownerModel(snapshots))
  expect(plain(b.net)).toBe('10 000 €')
  expect(b.progress?.change?.euros ?? '').not.toMatch(/−/)
  const view = evolutionView(ownerModel(snapshots), TODAY)
  if (view.kind !== 'history') throw new Error(`expected history, got ${view.kind}`)
  expect(view.points.map((p) => p.net)).toEqual([0, 10_000 * 100])
})

test('Évolution’s split leaves the home out too: its re-estimate and its repaid loan are not in it', () => {
  const snapshots = [
    dated('2026-08-31', [amountEntry('cash', 10_000), amountEntry('home', 280_000), amountEntry('home-loan', 100_000)]),
    dated('2026-10-31', [amountEntry('cash', 11_000), amountEntry('home', 300_000), amountEntry('home-loan', 95_000)]),
  ]
  const view = evolutionView(ownerModel(snapshots), TODAY)
  if (view.kind !== 'history') throw new Error(`expected history, got ${view.kind}`)
  const said = plain(JSON.stringify(view.split))
  expect(said).not.toMatch(/20 000/)
  expect(said).not.toMatch(/6 000/)
  expect(said).not.toMatch(/crédit remboursé/)
})

test('a home and a loan bigger than the rest: « Sans chez toi » is not offered, and not applied', () => {
  const snapshots = [dated('2026-10-31', [amountEntry('cash', 5_000), amountEntry('home', 300_000), amountEntry('car-loan', 10_000)])]
  expect(homeChoice(ownerModel(snapshots))).toBe('only-home')
  const b = board(ownerModel(snapshots))
  expect(b.homeAside).toBeNull()
  expect(plain(b.net)).toBe('295 000 €')
})

test('without the home, Immobilier stays reachable under « Voir ses lignes », with or without a loan', () => {
  const noLoan = [dated('2026-10-31', [amountEntry('cash', 10_000), amountEntry('home', 300_000)])]
  const b = board(ownerModel(noLoan))
  expect(b.homeAside).not.toBeNull()
  expect(b.withoutSquares.map((c) => c.category)).toContain('property')
})

test('with a rental, Immobilier’s detail gives the rental its share of the grid without the home', () => {
  const withRental = profileOf(
    [account('c', 'current'), account('h', 'home'), account('r', 'home', { residence: 'rental' })],
    [line('cash', 'c'), line('home', 'h'), line('rent', 'r')],
  )
  const snap = dated('2026-10-31', [amountEntry('cash', 50_000), amountEntry('home', 300_000), amountEntry('rent', 50_000)])
  const model: Model = { ...modelOf(true, [snap]), profile: loaded(withRental) }
  const property = categoryDetailView(model, 'property', TODAY)!
  expect(plain(property.percent)).toBe('50 %')
  const listed = [...(property.chapters?.flatMap((c) => c.lines) ?? []), ...property.lines]
  expect([...new Set(listed.map((l) => l.lineId))]).toEqual(['rent'])
  expect(property.outOfGrid.map((l) => l.lineId)).toEqual(['home'])
})

