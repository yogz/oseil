// The review of the figures (11 November 2026, docs/superpowers/specs/2026-11-11-revue-des-calculs-profils.md):
// eight plausible people, and what each screen must show for them. Every figure below was worked out by
// hand, from the design documents alone, by a reviewer who never read the code; Oseil agreed with all of
// them. A change of a calculation that moves one of them is a change of a rule: it is decided, then the
// figure here is written again, never the other way round.

import { beforeAll, describe, expect, test } from 'vitest'
import { setAmountsHidden } from '@/lib/format'
import type { CategoryId } from '@/lib/model/types'
import { categoryDetailView } from '@/lib/screens/category-detail'
import { evolutionView } from '@/lib/screens/evolution'
import { monArgentView, type Board } from '@/lib/screens/mon-argent'
import { reperesView } from '@/lib/screens/reperes'
import { PROFILES, TODAY } from './profiles'

beforeAll(() => setAmountsHidden(false))

// Text as it is read: the narrow and the plain no-break spaces as spaces.
const plain = (text: string | null | undefined) => (text ?? '').replace(/[  ]/g, ' ')

function board(name: string): Board {
  const view = monArgentView(PROFILES[name](), TODAY)
  if (view.kind !== 'board') throw new Error(`${name}: no board (${view.kind})`)
  return view
}

function squares(name: string): Partial<Record<CategoryId, number>> {
  const grid = board(name).grid
  if (grid.kind !== 'grid') throw new Error(`${name}: no grid`)
  return Object.fromEntries(grid.categories.map((c) => [c.category, c.squares]))
}

function pockets(name: string) {
  const grid = board(name).grid
  if (grid.kind !== 'grid') throw new Error(`${name}: no grid`)
  const property = grid.categories.find((c) => c.category === 'property')
  return property?.pockets ? { chezToi: property.pockets['chez-toi'].squares, location: property.pockets.location.squares } : null
}

function cushion(name: string) {
  const view = reperesView(PROFILES[name](), TODAY)
  if (view.kind !== 'ready' || !('months' in view.cushion)) throw new Error(`${name}: no cushion`)
  return { months: view.cushion.months, sentence: plain(view.cushion.sentence) }
}

function results(name: string, category: CategoryId) {
  const detail = categoryDetailView(PROFILES[name](), category, TODAY)
  return Object.fromEntries((detail?.lines ?? []).map((l) => [l.name, l.result ? [plain(l.result.euros), plain(l.result.percent)] : null]))
}

describe('1. Léa, a first job', () => {
  test('15 500 € hers, a square at 155 €: 73 squares available, 27 in the stock market', () => {
    expect(plain(board('lea').net)).toBe('15 500 €')
    expect(plain(board('lea').squareValue)).toBe('155 €')
    expect(squares('lea')).toEqual({ available: 73, markets: 27 })
  })
  test('63 squares away from her « Dynamique » goals', () => {
    expect(board('lea').goals?.simulation?.misplaced).toBe(63)
  })
  test('her world fund gained 360 €, 9,4 %', () => {
    expect(results('lea', 'markets')['Fonds monde']).toEqual(['a gagné 360 € depuis l’achat', 'a gagné 9,4 % depuis l’achat'])
  })
  test('11 300 € available over 1 600 € a month: about 7 months', () => {
    expect(cushion('lea').months).toBe(7)
  })
})

describe('2. The Martins, owners with a loan', () => {
  test('432 950 € owned, 210 000 € of it lent: 222 950 € theirs', () => {
    expect(plain(board('martin').net)).toBe('222 950 €')
    expect(plain(board('martin').ownedSentence)).toBe('Tu possèdes 432 950 €, dont 210 000 € prêtés pour ton logement.')
  })
  test('16, 16, 19 and 49 squares: the home net of its loan, all of it « Chez toi »', () => {
    expect(squares('martin')).toEqual({ available: 16, secured: 16, markets: 19, property: 49 })
    expect(pockets('martin')).toEqual({ chezToi: 49, location: 0 })
  })
  test('the goals leave « Chez toi » out: 6 squares away', () => {
    expect(board('martin').goals?.simulation?.misplaced).toBe(6)
    expect(plain(board('martin').goals?.headline)).toBe('Hors chez toi, proche de tes objectifs')
  })
  test('the units of the life insurance gained 1 440 €, 8,7 %', () => {
    expect(results('martin', 'markets')['Unités de compte']).toEqual(['a gagné 1 440 € depuis l’achat', 'a gagné 8,7 % depuis l’achat'])
  })
  test('34 950 € available over 4 200 € a month: about 8 and a half months', () => {
    expect(cushion('martin').months).toBe(8.5)
  })
})

describe('3. Karim, a home and a rental, shares in dollars, bitcoin', () => {
  test('the shares at 1 € = 1,08 $: 8 519 €, and 235 519 € his', () => {
    expect(plain(board('karim').net)).toBe('235 519 €')
    expect(squares('karim')).toEqual({ available: 3, markets: 4, gold: 4, property: 89 })
  })
  test('« Chez toi » 81 squares, « En location » 8, each net of its own loan', () => {
    expect(pockets('karim')).toEqual({ chezToi: 81, location: 8 })
  })
  test('the goals, rental share included, on the 19 squares out of « Chez toi »: 5 away', () => {
    expect(board('karim').goals?.detail).toBe('À 5 carrés près.')
    // The simulation moves 4 of them: the rental's one stays (Nicolas, 12 November 2026).
    expect(board('karim').goals?.simulation?.misplaced).toBe(4)
  })
  // A known limit, written in the review: the purchase price in dollars is converted at the
  // snapshot's rate, so the gain leaves out what the dollar itself did since the purchase.
  test('gains: the shares 1 852 € (27,8 %), the bitcoin 3 000 € (50,0 %)', () => {
    expect(results('karim', 'markets')['Actions américaines']).toEqual(['a gagné 1 852 € depuis l’achat', 'a gagné 27,8 % depuis l’achat'])
    expect(results('karim', 'gold')['Bitcoin']).toEqual(['a gagné 3 000 € depuis l’achat', 'a gagné 50,0 % depuis l’achat'])
  })
  test('8 000 € available over 3 500 € a month: about 2 and a half months', () => {
    expect(cushion('karim').months).toBe(2.5)
  })
})

describe('4. Sophie, a home worth less than its loan', () => {
  test('−10 800 €: no grid, and the sentence that says why', () => {
    const view = board('sophie')
    expect(plain(view.net)).toBe('−10 800 €')
    expect(view.grid.kind).toBe('none')
    expect(plain(view.ownedSentence)).toBe('Tu possèdes 244 200 € et tu dois encore 255 000 €.')
    expect(view.noGridSentence).not.toBeNull()
  })
  test('the cushion still counts what is available: about 2 months', () => {
    expect(cushion('sophie').months).toBe(2)
  })
})

describe('5. Jean, retired', () => {
  test('632 950 € his: 4, 29, 10, 2 and 55 squares', () => {
    expect(plain(board('jean').net)).toBe('632 950 €')
    expect(squares('jean')).toEqual({ available: 4, secured: 29, markets: 10, gold: 2, property: 55 })
  })
  test('14 squares away from his « Prudent » goals, out of « Chez toi »', () => {
    expect(board('jean').goals?.simulation?.misplaced).toBe(14)
  })
  test('a pension: about 10 months of income, never « of salary »', () => {
    expect(cushion('jean')).toEqual({
      months: 10,
      sentence: 'Si tes revenus s’arrêtaient, ton argent disponible couvrirait environ 10 mois de revenus.',
    })
  })
})

describe('6. Lucie, small amounts', () => {
  test('14 520 €: 6, 41, 37 and 16 squares, the largest remainders making 100', () => {
    expect(plain(board('lucie').net)).toBe('14 520 €')
    expect(squares('lucie')).toEqual({ available: 6, secured: 41, markets: 37, gold: 16 })
  })
  test('27 squares away from her goals', () => {
    expect(board('lucie').goals?.simulation?.misplaced).toBe(27)
  })
  test('her shares lost 400 €, 20,0 %; the ether, with no purchase price, says nothing of a gain', () => {
    expect(results('lucie', 'markets')['Titres']).toEqual(['a perdu 400 € depuis l’achat', 'a perdu 20,0 % depuis l’achat'])
    expect(results('lucie', 'gold')['Ether']).toBeNull()
  })
  test('the money locked up is not counted as quick: 4 820 € of 14 520 €', () => {
    const view = reperesView(PROFILES.lucie(), TODAY)
    if (view.kind !== 'ready' || !view.quick) throw new Error('no quick money')
    expect(view.quick.lit).toBe(33)
    expect(plain(view.quick.sentence)).toContain('4 820 €')
  })
  test('900 € over 1 400 € a month: half a month', () => {
    expect(cushion('lucie').months).toBe(0.5)
  })
})

describe('7. The Roberts, four homes', () => {
  test('814 950 € theirs: 4, 10 and 86 squares', () => {
    expect(plain(board('robert').net)).toBe('814 950 €')
    expect(squares('robert')).toEqual({ available: 4, secured: 10, property: 86 })
  })
  test('the second home is « Chez toi »; the two rentals share their pocket: 55 and 31 squares', () => {
    expect(pockets('robert')).toEqual({ chezToi: 55, location: 31 })
  })
  test('13 squares away from their goals', () => {
    expect(board('robert').goals?.detail).toBe('À 13 carrés près.')
    // The simulation moves 5 of them: the rentals' squares stay (Nicolas, 12 November 2026).
    expect(board('robert').goals?.simulation?.misplaced).toBe(5)
  })
  test('34 950 € available over 5 500 € a month: about 6 and a half months', () => {
    expect(cushion('robert').months).toBe(6.5)
  })
})

describe('8. Thomas, over a year', () => {
  const history = () => {
    const view = evolutionView(PROFILES.thomas(), TODAY)
    if (view.kind !== 'history') throw new Error('no history')
    return view
  }
  test('27 500, 34 000, 25 800 then 30 800 €: +3 300 €, +12,0 % since the first', () => {
    expect(history().points.map((p) => p.net / 100)).toEqual([27_500, 34_000, 25_800, 30_800])
    expect(plain(history().sinceFirst.euros)).toBe('+3 300 €')
    expect(plain(history().sinceFirst.percent)).toBe('+12,0 %')
  })
  // Estimated livret interest, decided by Nicolas on 14 November 2026: 215,75 € on his 10 000 € Livret A over 31 December 2025.
  test('what he put in is no gain: his effort +4 084 €, the markets −784 €', () => {
    const rows = history().split.rows.map((r) => [r.part, plain(r.amount)])
    expect(rows).toEqual([
      ['effort', '4 084 €'],
      ['markets', '−784 €'],
    ])
  })
  test('35, 34, 27 then 25 squares away from his goals', () => {
    const rows = history().goals?.rows ?? []
    expect(rows.map((r) => r.misplaced.reduce((sum, m) => sum + m.count, 0))).toEqual([35, 34, 27, 25])
  })
})
