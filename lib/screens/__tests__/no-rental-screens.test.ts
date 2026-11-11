// Pinned on the code before the reading screens learnt about rentals (immobilier locatif, task 4a): a
// person without a rental sees no new row, sub-row, figure, group or editor line. Only the words of
// « ta maison », renamed for everyone, may change here.
import { describe, expect, test } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import { GOAL_PRESETS } from '@/lib/catalog'
import { examplePerson } from '@/lib/example/person'
import { parseGoalAllocation } from '@/lib/model/documents'
import { account, amountEntry, exampleProfile, exampleSnapshot, line, profileOf, snapshotOf } from '@/lib/model/__tests__/fixtures'
import type { CategoryId, GoalAllocation, Profile, Snapshot } from '@/lib/model/types'
import { categoryDetailView } from '@/lib/screens/category-detail'
import { monArgentView } from '@/lib/screens/mon-argent'

const TODAY = '2026-11-10'
const loaded = <T,>(value: T, id = 'x') => ({ id, value, updatedAt: '2026-10-01T00:00:00Z' })
const plain = (text: string | null | undefined) => (text ?? null)?.replace(/[  ]/g, ' ') ?? null

// A goal saved before the fifth key: four keys, as every goal in production.
const fourKeys = (shares: GoalAllocation['shares']): GoalAllocation => {
  const { available, secured, markets, gold } = shares
  const parsed = parseGoalAllocation({ schema: 1, validFrom: '2026-01-01', shares: { available, secured, markets, gold } })
  if (!parsed) throw new Error('a four-key goal must be read')
  return parsed
}

const modelOf = (profile: Profile, snapshot: Snapshot, goals: GoalAllocation[] = [fourKeys(GOAL_PRESETS.balanced.shares)]): Model => ({
  profile: loaded(profile),
  snapshots: [loaded(snapshot, 's0')],
  goals: goals.map((g, i) => loaded(g, `g${i}`)),
  settings: null,
  draft: null,
  unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
})

// Cells in runs: « available*10,property*59 ».
const runs = (cells: readonly string[]): string => {
  const out: string[] = []
  let previous = ''
  let count = 0
  for (const cell of [...cells, '']) {
    if (cell === previous) {
      count += 1
      continue
    }
    if (count > 0) out.push(`${previous}*${count}`)
    previous = cell
    count = 1
  }
  return out.join(',')
}

const homeUnderWater = profileOf(
  [account('c', 'current'), account('h', 'home'), account('l', 'loan', { financedLineId: 'house' }), account('m', 'pea')],
  [line('cash', 'c'), line('house', 'h'), line('loan', 'l'), line('etf', 'm')],
)
const otherAccountProperty = profileOf(
  [account('c', 'current'), account('o', 'other'), account('h', 'home', { residence: 'secondary' })],
  [line('cash', 'c'), line('scpi', 'o', { category: 'property' }), line('flat', 'h')],
)
const noHome = profileOf([account('c', 'current'), account('m', 'pea')], [line('cash', 'c'), line('etf', 'm')])
const onlyHome = profileOf([account('h', 'home')], [line('house', 'h')])

const example = modelOf(exampleProfile, exampleSnapshot)
const exampleFiveKeys = modelOf(exampleProfile, exampleSnapshot, [{ schema: 1, validFrom: '2026-01-01', shares: GOAL_PRESETS.balanced.shares }])
const person = examplePerson()
const underWater = modelOf(
  homeUnderWater,
  snapshotOf([amountEntry('cash', 50_000), amountEntry('house', 150_000), amountEntry('loan', 180_000), amountEntry('etf', 30_000)]),
)
const secondary = modelOf(otherAccountProperty, snapshotOf([amountEntry('cash', 10_000), amountEntry('scpi', 20_000), amountEntry('flat', 70_000)]))
const withoutHome = modelOf(noHome, snapshotOf([amountEntry('cash', 10_000), amountEntry('etf', 30_000)]))
const homeOnly = modelOf(onlyHome, snapshotOf([amountEntry('house', 200_000)]))

const boardShape = (model: Model): unknown => {
  const view = monArgentView(model, TODAY)
  if (view.kind !== 'board') return view.kind
  const goals = view.goals
  return {
    ownedSentence: plain(view.ownedSentence),
    goals: goals && {
      headline: goals.headline,
      detail: goals.detail,
      scale: goals.scale,
      simulation: goals.simulation && {
        misplaced: goals.simulation.misplaced,
        real: runs(goals.simulation.real),
        blocks: runs(goals.simulation.blocks),
      },
    },
    // Every key of a row, as it is: a new field (a sub-row) would show here.
    rows: view.categories.map((c) => ({ ...c, euros: plain(c.euros), percent: plain(c.percent), note: plain(c.note) })),
    excluded: view.excluded.map((e) => ({ ...e, sentence: plain(e.sentence) })),
    warnings: view.warnings.map(plain),
  }
}

const DETAIL_KEYS = [
  'chapters',
  'debtSentence',
  'debts',
  'euros',
  'goal',
  'header',
  'leftOut',
  'lines',
  'name',
  'note',
  'percent',
  'purchaseGain',
  'ranging',
  'squares',
  'titlesLink',
  'tooSmall',
  'worldNote',
]

const detailShape = (model: Model, category: CategoryId): unknown => {
  const view = categoryDetailView(model, category, TODAY)
  if (!view) return null
  // A new field (the groups of Immobilier) would show here.
  expect(Object.keys(view).sort()).toEqual(DETAIL_KEYS)
  return {
    header: plain(view.header),
    goal: view.goal,
    euros: plain(view.euros),
    percent: plain(view.percent),
    lines: view.lines.map((l) => [l.name, plain(l.percent), l.squares, l.chapter]),
    tooSmall: view.tooSmall.map((l) => l.name),
    chapters: view.chapters && view.chapters.map((c) => [c.id, plain(c.sub)]),
  }
}

const row = (category: string, name: string, euros: string, percent: string, goal: unknown, note: string | null = null, linked = true) => ({
  category,
  name,
  euros,
  percent,
  goal,
  note,
  linked,
})
const goal = (actual: number, target: number, words: string) => ({ actual, target, words })

const EXAMPLE_BOARD = {
  ownedSentence: 'Tu possèdes 382 000 €, dont 180 000 € prêtés pour ton logement.',
  goals: {
    headline: 'Hors chez toi, proche de tes objectifs',
    detail: 'À 5 carrés près.',
    scale: 19,
    simulation: {
      misplaced: 5,
      real: 'available*10,secured*15,markets*15,gold*1,property*59',
      blocks: 'available*10,secured*10,markets*19,gold*2,property*59',
    },
  },
  rows: [
    row('available', 'Argent disponible', '20 000 €', '10 %', goal(10, 10, 'pile à ton objectif')),
    row('secured', 'Épargne sécurisée', '30 000 €', '15 %', goal(15, 10, 'un peu au-dessus de ton objectif')),
    row('markets', 'Placements en bourse', '30 000 €', '15 %', goal(15, 19, 'un peu en dessous de ton objectif')),
    row('gold', 'Or et crypto', '2 000 €', '1 %', goal(1, 2, 'presque à ton objectif')),
    row('property', 'Immobilier', '120 000 €', '59 %', null, 'estimée le 30 septembre · pas d’objectif pour chez toi'),
  ],
  excluded: [],
  warnings: [],
}

describe('a person without a rental sees Mon argent as before', () => {
  test('the example profile, its goal saved with four keys or five', () => {
    expect(boardShape(example)).toEqual(EXAMPLE_BOARD)
    expect(boardShape(exampleFiveKeys)).toEqual(EXAMPLE_BOARD)
  })

  test('the invented person of the example pages', () => {
    expect(boardShape(person)).toEqual({
      ownedSentence: 'Tu possèdes 250 000 €, dont 150 000 € prêtés pour ton logement.',
      goals: {
        headline: 'Hors chez toi, proche de tes objectifs',
        detail: 'À 4 carrés près.',
        scale: 32,
        simulation: {
          misplaced: 4,
          real: 'available*12,secured*23,markets*30,gold*5,property*30',
          blocks: 'available*10,secured*25,markets*32,gold*3,property*30',
        },
      },
      rows: [
        row('available', 'Argent disponible', '12 000 €', '12 %', goal(12, 10, 'un peu au-dessus de ton objectif')),
        row('secured', 'Épargne sécurisée', '23 000 €', '23 %', goal(23, 25, 'un peu en dessous de ton objectif')),
        row('markets', 'Placements en bourse', '30 000 €', '30 %', goal(30, 32, 'un peu en dessous de ton objectif')),
        row('gold', 'Or et crypto', '5 000 €', '5 %', goal(5, 3, 'un peu au-dessus de ton objectif')),
        row('property', 'Immobilier', '30 000 €', '30 %', null, 'estimée le 31 octobre · pas d’objectif pour chez toi'),
      ],
      excluded: [],
      warnings: [],
    })
  })

  test('a home under its loan', () => {
    expect(boardShape(underWater)).toEqual({
      ownedSentence: 'Tu possèdes 230 000 €, dont 180 000 € prêtés pour ton logement.',
      goals: {
        headline: 'En route vers tes objectifs',
        detail: 'À 38 carrés près sur 100.',
        scale: 63,
        simulation: { misplaced: 38, real: 'available*63,markets*37', blocks: 'available*25,secured*25,markets*45,gold*5' },
      },
      rows: [
        row('available', 'Argent disponible', '50 000 €', '63 %', goal(63, 25, 'au-dessus de ton objectif')),
        row('secured', 'Épargne sécurisée', '0 €', '0 %', goal(0, 25, 'rien pour l’instant'), null, false),
        row('markets', 'Placements en bourse', '30 000 €', '37 %', goal(37, 45, 'en dessous de ton objectif')),
        row('gold', 'Or et crypto', '0 €', '0 %', goal(0, 5, 'rien pour l’instant'), null, false),
      ],
      excluded: [{ category: 'property', sentence: 'Ton immobilier vaut moins que ce qu’il reste à rembourser : il n’a pas de carré pour l’instant.' }],
      warnings: ['La grille montre ce qui est positif.'],
    })
  })

  test('a secondary home and an SCPI', () => {
    expect(boardShape(secondary)).toEqual({
      ownedSentence: null,
      goals: {
        headline: 'Hors chez toi, proche de tes objectifs',
        detail: 'À 7 carrés près.',
        scale: 10,
        simulation: { misplaced: 7, real: 'available*10,property*90', blocks: 'available*3,secured*2,markets*5,property*90' },
      },
      rows: [
        row('available', 'Argent disponible', '10 000 €', '10 %', goal(10, 3, 'au-dessus de ton objectif')),
        row('secured', 'Épargne sécurisée', '0 €', '0 %', goal(0, 2, 'rien pour l’instant'), null, false),
        row('markets', 'Placements en bourse', '0 €', '0 %', goal(0, 5, 'rien pour l’instant'), null, false),
        row('property', 'Immobilier', '90 000 €', '90 %', null, 'estimée le 30 septembre · pas d’objectif pour chez toi'),
      ],
      excluded: [],
      warnings: [],
    })
  })

  test('no home at all', () => {
    expect(boardShape(withoutHome)).toEqual({
      ownedSentence: null,
      goals: {
        headline: 'En route vers tes objectifs',
        detail: 'À 30 carrés près sur 100.',
        scale: 75,
        simulation: { misplaced: 30, real: 'available*25,markets*75', blocks: 'available*25,secured*25,markets*45,gold*5' },
      },
      rows: [
        row('available', 'Argent disponible', '10 000 €', '25 %', goal(25, 25, 'pile à ton objectif')),
        row('secured', 'Épargne sécurisée', '0 €', '0 %', goal(0, 25, 'rien pour l’instant'), null, false),
        row('markets', 'Placements en bourse', '30 000 €', '75 %', goal(75, 45, 'au-dessus de ton objectif')),
        row('gold', 'Or et crypto', '0 €', '0 %', goal(0, 5, 'rien pour l’instant'), null, false),
      ],
      excluded: [],
      warnings: [],
    })
  })

  test('only a home: nothing to compare', () => {
    expect(boardShape(homeOnly)).toEqual({
      ownedSentence: null,
      goals: null,
      rows: [row('property', 'Immobilier', '200 000 €', '100 %', null, 'estimée le 30 septembre')],
      excluded: [],
      warnings: ['Tes objectifs portent sur ce qui n’est pas chez toi : rien à comparer pour l’instant.'],
    })
  })
})

const AVAILABLE_OF_EXAMPLE = {
  header: '10 carrés sur 100, pile à ton objectif (10 carrés)',
  goal: { actual: 10, target: 10 },
  euros: '20 000 €',
  percent: '10 %',
  lines: [
    ['Livret A', '6 %', 6, 'savings-books'],
    ['Compte courant', '4 %', 4, 'current-accounts'],
  ],
  tooSmall: [],
  chapters: [
    ['savings-books', '6 carrés sur 10 · 1 ligne'],
    ['current-accounts', '4 carrés sur 10 · 1 ligne'],
  ],
}
const PROPERTY_OF_EXAMPLE = {
  header: '59 carrés sur 100',
  goal: null,
  euros: '120 000 €',
  percent: '59 %',
  lines: [['Maison', '59 %', 59, null]],
  tooSmall: [],
  chapters: null,
}

describe('a person without a rental sees the detail of a category as before', () => {
  test('the example profile, its goal saved with four keys or five', () => {
    for (const model of [example, exampleFiveKeys]) {
      expect(detailShape(model, 'property')).toEqual(PROPERTY_OF_EXAMPLE)
      expect(detailShape(model, 'available')).toEqual(AVAILABLE_OF_EXAMPLE)
    }
  })

  test('the invented person', () => {
    expect(detailShape(person, 'property')).toEqual({
      header: '30 carrés sur 100',
      goal: null,
      euros: '30 000 €',
      percent: '30 %',
      lines: [['Appartement d’exemple', '30 %', 30, null]],
      tooSmall: [],
      chapters: null,
    })
    expect(detailShape(person, 'available')).toEqual({
      header: '12 carrés sur 100, un peu au-dessus de ton objectif (10 carrés)',
      goal: { actual: 12, target: 10 },
      euros: '12 000 €',
      percent: '12 %',
      lines: [
        ['Livret d’exemple', '8 %', 8, 'savings-books'],
        ['Compte courant d’exemple', '4 %', 4, 'current-accounts'],
      ],
      tooSmall: [],
      chapters: [
        ['savings-books', '8 carrés sur 12 · 1 ligne'],
        ['current-accounts', '4 carrés sur 12 · 1 ligne'],
      ],
    })
  })

  test('a home under its loan', () => {
    expect(detailShape(underWater, 'property')).toEqual({
      header: 'Ton immobilier vaut moins que ce qu’il reste à rembourser : il n’a pas de carré pour l’instant.',
      goal: null,
      euros: '−30 000 €',
      percent: '−30 000 €',
      lines: [['house', '−30 000 €', 0, null]],
      tooSmall: [],
      chapters: null,
    })
    expect(detailShape(underWater, 'available')).toEqual({
      header: '63 carrés sur 100, au-dessus de ton objectif (25 carrés)',
      goal: { actual: 63, target: 25 },
      euros: '50 000 €',
      percent: '63 %',
      lines: [['cash', '63 %', 63, 'current-accounts']],
      tooSmall: [],
      chapters: null,
    })
  })

  test('a secondary home and an SCPI', () => {
    expect(detailShape(secondary, 'property')).toEqual({
      header: '90 carrés sur 100',
      goal: null,
      euros: '90 000 €',
      percent: '90 %',
      lines: [
        ['flat', '70 %', 70, null],
        ['scpi', '20 %', 20, null],
      ],
      tooSmall: [],
      chapters: null,
    })
    expect(detailShape(secondary, 'available')).toEqual({
      header: '10 carrés sur 100, au-dessus de ton objectif (3 carrés)',
      goal: { actual: 10, target: 3 },
      euros: '10 000 €',
      percent: '10 %',
      lines: [['cash', '10 %', 10, 'current-accounts']],
      tooSmall: [],
      chapters: null,
    })
  })

  test('no home, and only a home', () => {
    expect(detailShape(withoutHome, 'property')).toBeNull()
    expect(detailShape(withoutHome, 'available')).toEqual({
      header: '25 carrés sur 100, pile à ton objectif (25 carrés)',
      goal: { actual: 25, target: 25 },
      euros: '10 000 €',
      percent: '25 %',
      lines: [['cash', '25 %', 25, 'current-accounts']],
      tooSmall: [],
      chapters: null,
    })
    expect(detailShape(homeOnly, 'property')).toEqual({
      header: '100 carrés sur 100',
      goal: null,
      euros: '200 000 €',
      percent: '100 %',
      lines: [['house', '100 %', 100, null]],
      tooSmall: [],
      chapters: null,
    })
    expect(detailShape(homeOnly, 'available')).toBeNull()
  })
})
