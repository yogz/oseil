// The boundaries of the categories (docs/superpowers/specs/2026-11-12-frontieres-des-categories-design.md).
import { expect, test } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import { GROUP_LABELS } from '@/lib/catalog'
import { lineSlow, setLineSlow } from '@/lib/correct/account-changes'
import { account, amountEntry, line, profileOf, snapshotOf, unitsEntry } from '@/lib/model/__tests__/fixtures'
import type { Profile, Snapshot } from '@/lib/model/types'
import { categoryDetailView } from '@/lib/screens/category-detail'
import { monArgentView } from '@/lib/screens/mon-argent'

const TODAY = '2026-11-12'
const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const modelOf = (profile: Profile, snapshot: Snapshot): Model => ({
  profile: loaded(profile),
  snapshots: [loaded(snapshot, 's0')],
  goals: [],
  settings: null,
  draft: null,
  unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
})

test('the loans leave the secured savings: « Obligations », and « Hors bourse (non coté, prêts) » in the markets', () => {
  expect(GROUP_LABELS.bonds).toBe('Obligations')
  expect(GROUP_LABELS.unlisted).toBe('Hors bourse (non coté, prêts)')
})

test('a line « Hors bourse » is slow to get back by default, until its fiche says otherwise', () => {
  const pea = account('pea', 'pea')
  const crowd = line('crowd', 'pea', { category: 'markets', group: 'unlisted' })
  expect(lineSlow(crowd, pea)).toBe(true)
  expect(lineSlow({ ...crowd, slow: false }, pea)).toBe(false)
  expect(lineSlow(line('fund', 'pea', { category: 'markets', group: 'world' }), pea)).toBe(false)
  // « Oui » on its fiche writes its own answer, since it differs from the default.
  const profile = profileOf([pea], [crowd])
  expect(setLineSlow(profile, 'crowd', false, 'line').lines[0].slow).toBe(false)
  expect(setLineSlow(profile, 'crowd', true, 'line').lines[0]).not.toHaveProperty('slow')
})

test('its chapter says what it is; « Obligations » says it can go down', () => {
  const profile = profileOf(
    [account('pea', 'pea'), account('av', 'life-insurance')],
    [
      line('crowd', 'pea', { category: 'markets', group: 'unlisted' }),
      line('fund', 'pea', { category: 'markets', group: 'world', kind: 'units' }),
      line('bond', 'av', { category: 'secured', group: 'bonds' }),
      line('fe', 'av', { category: 'secured', group: 'euro-fund' }),
    ],
  )
  const snap = snapshotOf([amountEntry('crowd', 1_000), unitsEntry('fund', 10, 100, null), amountEntry('bond', 1_000), amountEntry('fe', 1_000)])
  const markets = categoryDetailView(modelOf(profile, snap), 'markets', TODAY)!
  expect(markets.chapters!.find((c) => c.id === 'unlisted')!.note).toBe(
    'Pas en bourse, long à revendre : tu peux perdre une partie de ce que tu y as mis.',
  )
  const secured = categoryDetailView(modelOf(profile, snap), 'secured', TODAY)!
  expect(secured.chapters!.find((c) => c.id === 'bonds')!.note).toBe('Peut baisser un peu : une obligation ne garantit pas ton capital.')
  expect(secured.chapters!.find((c) => c.id === 'euro-fund')!.note).toBeNull()
})

// Gold and crypto: one category, its two chapters always shown, and said when the crypto is most of it.
const coins = profileOf(
  [account('c', 'current'), account('w', 'crypto'), account('g', 'gold')],
  [line('cash', 'c'), line('btc', 'w', { kind: 'units' }), line('coin', 'g')],
)
test('a category of crypto alone still shows its chapter « Crypto », and says it is mostly crypto', () => {
  const snap = snapshotOf([amountEntry('cash', 10_000), unitsEntry('btc', 1, 3_000, null)])
  const gold = categoryDetailView(modelOf(coins, snap), 'gold', TODAY)!
  expect(gold.chapters!.map((c) => c.id)).toEqual(['crypto'])
  expect(gold.cryptoNote).toBe('Surtout de la crypto : elle varie bien plus que l’or.')
  const view = monArgentView(modelOf(coins, snap), TODAY)
  if (view.kind !== 'board') throw new Error('expected a board')
  expect(view.categories.find((c) => c.category === 'gold')!.note).toBe('Surtout de la crypto : elle varie bien plus que l’or.')
})

test('mostly gold: no sentence', () => {
  const snap = snapshotOf([amountEntry('cash', 10_000), unitsEntry('btc', 1, 1_000, null), amountEntry('coin', 3_000)])
  expect(categoryDetailView(modelOf(coins, snap), 'gold', TODAY)!.cryptoNote).toBeNull()
  const view = monArgentView(modelOf(coins, snap), TODAY)
  if (view.kind !== 'board') throw new Error('expected a board')
  expect(view.categories.find((c) => c.category === 'gold')!.note).toBeNull()
})
