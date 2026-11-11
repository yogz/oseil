import { describe, expect, it } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import { GOAL_PRESETS } from '@/lib/catalog'
import { examplePerson } from '@/lib/example/person'
import { parseGoalAllocation } from '@/lib/model/documents'
import { currentShares, goalSquares, misplacedSquares, squaresAtGoals } from '@/lib/model/goals'
import { computeSituation } from '@/lib/model/situation'
import { buildGrid, pocketSquares, type Grid } from '@/lib/model/squares'
import type { GoalAllocation, GoalShares, Profile, Snapshot } from '@/lib/model/types'
import { evolutionView } from '@/lib/screens/evolution'
import { monArgentView } from '@/lib/screens/mon-argent'
import { outsideHome, startGoals } from '@/lib/setup/goals-editor'
import { account, amountEntry, exampleProfile, exampleSnapshot, line, profileOf, snapshotOf } from './fixtures'

type GridOnly = Extract<Grid, { kind: 'grid' }>
const gridOf = (profile: Profile, snapshot: Snapshot): GridOnly => {
  const grid = buildGrid(computeSituation(profile, snapshot))
  if (grid.kind !== 'grid') throw new Error('expected a grid')
  return grid
}

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

const shares = (s: Partial<GoalShares>): GoalShares => ({ available: 0, secured: 0, markets: 0, gold: 0, rental: 0, ...s })

const SHARES: GoalShares[] = [
  GOAL_PRESETS.prudent.shares,
  GOAL_PRESETS.balanced.shares,
  GOAL_PRESETS.dynamic.shares,
  shares({ markets: 100 }),
]

// Every goal figure of one grid, in one string.
const goalShape = (grid: GridOnly): string => {
  const parts = SHARES.map((s) => {
    const targets = goalSquares(s, grid)
    const { real, atGoals } = squaresAtGoals(grid, targets)
    return `${JSON.stringify(targets)}|${misplacedSquares(grid, targets)}|${runs(real)}|${runs(atGoals)}`
  })
  let current = 'none'
  try {
    current = JSON.stringify(currentShares(grid))
  } catch {
    // nothing outside the home
  }
  return [...parts, current, String(outsideHome(grid)), JSON.stringify(startGoals(grid))].join(' ; ')
}

const homeUnderWater = profileOf(
  [account('c', 'current'), account('h', 'home'), account('l', 'loan', { financedLineId: 'house' }), account('m', 'pea')],
  [line('cash', 'c'), line('house', 'h'), line('loan', 'l'), line('etf', 'm')],
)
const otherAccountProperty = profileOf(
  [account('c', 'current'), account('o', 'other'), account('h', 'home', { residence: 'secondary' })],
  [line('cash', 'c'), line('scpi', 'o', { category: 'property' }), line('flat', 'h')],
)
const twoHomes = profileOf(
  [
    account('c', 'current'),
    account('h1', 'home'),
    account('h2', 'home', { residence: 'secondary' }),
    account('l', 'loan', { financedLineId: 'h2-line' }),
  ],
  [line('cash', 'c'), line('h1-line', 'h1'), line('h2-line', 'h2'), line('loan', 'l')],
)

const noRentalGrids = (): GridOnly[] => {
  const person = examplePerson()
  return [
    gridOf(exampleProfile, exampleSnapshot),
    ...person.snapshots.map((s) => gridOf(person.profile!.value, s.value)),
    gridOf(
      homeUnderWater,
      snapshotOf([amountEntry('cash', 50_000), amountEntry('house', 150_000), amountEntry('loan', 180_000), amountEntry('etf', 30_000)]),
    ),
    gridOf(otherAccountProperty, snapshotOf([amountEntry('cash', 10_000), amountEntry('scpi', 20_000), amountEntry('flat', 70_000)])),
    gridOf(
      twoHomes,
      snapshotOf([amountEntry('cash', 10_000), amountEntry('h1-line', 200_000), amountEntry('h2-line', 100_000), amountEntry('loan', 120_000)]),
    ),
  ]
}

// A goal saved before the fifth key: four keys, as every goal in production.
const fourKeys = (allocation: GoalAllocation): GoalAllocation => {
  const { available, secured, markets, gold } = allocation.shares
  const parsed = parseGoalAllocation({ ...allocation, shares: { available, secured, markets, gold } })
  if (!parsed) throw new Error('a four-key goal must be read')
  return parsed
}

const personWithOldGoal = (): Model => {
  const person = examplePerson()
  return { ...person, goals: [{ ...person.goals[0], value: fourKeys(person.goals[0].value) }] }
}

const screensShape = (model: Model, today: string): string => {
  const view = monArgentView(model, today)
  const goals = view.kind === 'board' && view.goals
  const simulation = goals && goals.simulation
  const board =
    view.kind === 'board'
      ? JSON.stringify({
          goals: goals && {
            ...goals,
            simulation: simulation && { real: runs(simulation.real), blocks: runs(simulation.blocks), misplaced: simulation.misplaced },
          },
          rows: view.categories.map((c) => [c.category, c.goal, c.note]),
          warnings: view.warnings,
        })
      : view.kind
  const evolution = evolutionView(model, today)
  return `${board} ; ${JSON.stringify(evolution.kind === 'history' ? evolution.goals : evolution.kind)}`
}

describe('a person without a rental keeps exactly her goal figures', () => {
  it('on every grid: targets, misplaced squares, simulation, current split, editor start', () => {
    expect(noRentalGrids().map(goalShape)).toEqual(PINNED_GRIDS)
  })

  it('on Mon argent and Évolution, her goal saved with four keys or five', () => {
    expect(screensShape(examplePerson(), '2026-11-10')).toBe(PINNED_SCREENS)
    expect(screensShape(personWithOldGoal(), '2026-11-10')).toBe(PINNED_SCREENS)
  })
})

// Chez toi (a home with its loan) and a rental (with its loan), and some cash.
const withRental = profileOf(
  [
    account('c', 'current'),
    account('h', 'home'),
    account('hl', 'loan', { financedLineId: 'home' }),
    account('r', 'home', { residence: 'rental' }),
    account('rl', 'loan', { financedLineId: 'rent' }),
  ],
  [line('cash', 'c'), line('home', 'h'), line('home-loan', 'hl'), line('rent', 'r'), line('rent-loan', 'rl')],
)
const statement = (cash: number, home: number, homeLoan: number, rent: number, rentLoan: number, takenOn = '2026-09-30') => ({
  ...snapshotOf([
    amountEntry('cash', cash),
    amountEntry('home', home),
    amountEntry('home-loan', homeLoan),
    amountEntry('rent', rent),
    amountEntry('rent-loan', rentLoan),
  ]),
  takenOn,
})
// 20 squares of cash, 20 of the rental, 60 of Chez toi.
const steered = gridOf(withRental, statement(100_000, 300_000, 0, 100_000, 0))
const sum = (record: Record<string, number>) => Object.values(record).reduce((s, n) => s + n, 0)

describe('the goals with a rental', () => {
  it('share out 100 − the Chez toi squares, the rental squares included', () => {
    expect(pocketSquares(steered, 'chez-toi')).toBe(60)
    const targets = goalSquares(shares({ available: 50, rental: 50 }), steered)
    expect(targets).toEqual(shares({ available: 20, rental: 20 }))
    expect(misplacedSquares(steered, targets)).toBe(0)
    expect(squaresAtGoals(steered, targets).atGoals).toEqual(squaresAtGoals(steered, targets).real)
  })

  it('count the rental squares held beyond its target as misplaced', () => {
    const targets = goalSquares(shares({ available: 100 }), steered)
    expect(targets).toEqual(shares({ available: 40 }))
    expect(misplacedSquares(steered, targets)).toBe(20)
  })

  it('the simulation can recolour the rental squares, never the Chez toi ones', () => {
    const toCash = squaresAtGoals(steered, goalSquares(shares({ available: 100 }), steered))
    expect(runs(toCash.real)).toBe('available*20,property*80')
    expect(runs(toCash.atGoals)).toBe('available*40,property*60')

    const toRental = squaresAtGoals(steered, goalSquares(shares({ rental: 100 }), steered))
    expect(runs(toRental.atGoals)).toBe('property*100')

    // Whatever the goal, the last 60 cells (Chez toi) stay as they are.
    for (const s of [...SHARES, shares({ available: 100 }), shares({ rental: 100 })]) {
      const { real, atGoals } = squaresAtGoals(steered, goalSquares(s, steered))
      expect(atGoals.slice(40)).toEqual(real.slice(40))
      expect(real.filter((c, i) => c !== atGoals[i]).length).toBe(misplacedSquares(steered, goalSquares(s, steered)))
    }
  })

  it('read the current split and start the editor with the rental share', () => {
    expect(currentShares(steered)).toEqual(shares({ available: 50, rental: 50 }))
    expect(outsideHome(steered)).toBe(20_000_000)
    expect(startGoals(steered)).toEqual(shares({ available: 50, rental: 50 }))
  })

  it('a rental worth less than its loan holds nothing, and Chez toi still keeps its room', () => {
    const grid = gridOf(withRental, statement(20_000, 300_000, 180_000, 100_000, 150_000))
    const chezToi = pocketSquares(grid, 'chez-toi')
    const targets = goalSquares(shares({ available: 50, rental: 50 }), grid)
    expect(sum(targets)).toBe(100 - chezToi)
    expect(currentShares(grid)).toEqual(shares({ available: 100 }))
    expect(outsideHome(grid)).toBe(2_000_000)
    expect(misplacedSquares(grid, targets)).toBe(100 - chezToi - targets.available)
    const { real, atGoals } = squaresAtGoals(grid, targets)
    expect(atGoals.slice(100 - chezToi)).toEqual(real.slice(100 - chezToi))
  })

  it('a rental exactly paid by its loan: no rental square, Chez toi as without it', () => {
    const grid = gridOf(withRental, statement(20_000, 300_000, 180_000, 150_000, 150_000))
    const without = gridOf(exampleLike, snapshotOf([amountEntry('cash', 20_000), amountEntry('home', 300_000), amountEntry('home-loan', 180_000)]))
    expect(pocketSquares(grid, 'location')).toBe(0)
    expect(pocketSquares(grid, 'chez-toi')).toBe(pocketSquares(without, 'chez-toi'))
    expect(grid.excludedPockets).toEqual([])
    expect(goalSquares(GOAL_PRESETS.balanced.shares, grid)).toEqual(goalSquares(GOAL_PRESETS.balanced.shares, without))
    expect(currentShares(grid).rental).toBe(0)
  })

  it('a goal with a rental share but no rental: its target has no square yet, and it still sums', () => {
    const grid = gridOf(exampleProfile, exampleSnapshot)
    const targets = goalSquares(shares({ available: 20, secured: 20, markets: 30, gold: 10, rental: 20 }), grid)
    expect(sum(targets)).toBe(100 - 59)
    expect(targets.rental).toBeGreaterThan(0)
    expect(misplacedSquares(grid, targets)).toBeGreaterThanOrEqual(targets.rental)
    const { real, atGoals } = squaresAtGoals(grid, targets)
    // Chez toi, the last 59 cells, never moves.
    expect(atGoals.slice(41)).toEqual(real.slice(41))
    expect(atGoals.slice(0, 41).filter((c) => c === 'property').length).toBe(targets.rental)
    expect(currentShares(grid).rental).toBe(0)
  })
})

// The same person without the rental.
const exampleLike = profileOf(
  [account('c', 'current'), account('h', 'home'), account('hl', 'loan', { financedLineId: 'home' })],
  [line('cash', 'c'), line('home', 'h'), line('home-loan', 'hl')],
)

const modelOf = (profile: Profile, snapshots: Snapshot[], goals: GoalAllocation[]): Model => ({
  profile: { id: 'p', value: profile, updatedAt: '2026-10-01T00:00:00Z' },
  snapshots: snapshots.map((s, i) => ({ id: `s${i}`, value: s, updatedAt: '2026-10-01T00:00:00Z' })),
  goals: goals.map((g, i) => ({ id: `g${i}`, value: g, updatedAt: '2026-10-01T00:00:00Z' })),
  settings: null,
  draft: null,
  unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
})

describe('the goal screens with a rental', () => {
  const oldGoal = fourKeys({ schema: 1, validFrom: '2026-01-01', shares: shares({ available: 100 }) })

  it('Évolution reads an old four-key goal, and counts the rental squares beyond it', () => {
    const view = evolutionView(
      modelOf(withRental, [statement(100_000, 300_000, 0, 100_000, 0, '2026-03-31'), statement(100_000, 300_000, 0, 100_000, 0)], [oldGoal]),
      '2026-11-10',
    )
    if (view.kind !== 'history' || !view.goals) throw new Error('expected a goal history')
    expect(view.goals.rows.map((r) => r.misplaced)).toEqual([
      [{ category: 'rental', count: 20 }],
      [{ category: 'rental', count: 20 }],
    ])
    const rental = view.goals.traces.find((t) => t.category === 'rental')
    expect(rental).toMatchObject({ gaps: [50, 50], target: 0 })
  })

  it('Mon argent: the headline speaks of the home only when Chez toi has squares', () => {
    const rentalOnly = profileOf(
      [account('c', 'current'), account('r', 'home', { residence: 'rental' })],
      [line('cash', 'c'), line('rent', 'r')],
    )
    const view = monArgentView(
      modelOf(rentalOnly, [snapshotOf([amountEntry('cash', 50_000), amountEntry('rent', 50_000)])], [oldGoal]),
      '2026-11-10',
    )
    if (view.kind !== 'board' || !view.goals) throw new Error('expected goals on the board')
    expect(view.goals.headline).toBe('En route vers tes objectifs')
    expect(view.goals.detail).toBe('À 50 carrés près sur 100.')
    expect(view.goals.simulation?.misplaced).toBe(50)
  })

  it('Mon argent: a rental alone outside Chez toi is something to compare', () => {
    const homes = profileOf(
      [account('h', 'home'), account('r', 'home', { residence: 'rental' })],
      [line('home', 'h'), line('rent', 'r')],
    )
    const goal: GoalAllocation = { schema: 1, validFrom: '2026-01-01', shares: shares({ rental: 100 }) }
    const view = monArgentView(
      modelOf(homes, [snapshotOf([amountEntry('home', 300_000), amountEntry('rent', 100_000)])], [goal]),
      '2026-11-10',
    )
    if (view.kind !== 'board') throw new Error('expected a board')
    expect(view.goals).not.toBeNull()
    expect(view.goals?.headline).toBe('Hors chez toi, pile à tes objectifs.')
    expect(view.warnings.some((w) => w.includes('rien à comparer'))).toBe(false)
  })
})

// Read from the code before the rental goal (10 November 2026), and never rewritten since.
const PINNED_GRIDS: string[] = [
  "{\"available\":16,\"secured\":19,\"markets\":6,\"gold\":0,\"rental\":0}|10|available*10,secured*15,markets*15,gold*1,property*59|available*10,secured*15,markets*6,available*6,secured*4,property*59 ; {\"available\":10,\"secured\":10,\"markets\":19,\"gold\":2,\"rental\":0}|5|available*10,secured*15,markets*15,gold*1,property*59|available*10,secured*10,markets*4,gold*1,markets*15,gold*1,property*59 ; {\"available\":4,\"secured\":6,\"markets\":27,\"gold\":4,\"rental\":0}|15|available*10,secured*15,markets*15,gold*1,property*59|available*4,markets*6,secured*6,markets*6,gold*3,markets*15,gold*1,property*59 ; {\"available\":0,\"secured\":0,\"markets\":41,\"gold\":0,\"rental\":0}|26|available*10,secured*15,markets*15,gold*1,property*59|markets*41,property*59 ; {\"available\":24.390243902439025,\"secured\":36.58536585365854,\"markets\":36.58536585365854,\"gold\":2.4390243902439024,\"rental\":0} ; 8200000 ; {\"available\":24,\"secured\":37,\"markets\":37,\"gold\":2,\"rental\":0}",
  "{\"available\":29,\"secured\":33,\"markets\":11,\"gold\":0,\"rental\":0}|18|available*21,secured*23,markets*23,gold*6,property*27|available*21,secured*23,markets*11,available*8,secured*10,property*27 ; {\"available\":18,\"secured\":18,\"markets\":33,\"gold\":4,\"rental\":0}|10|available*21,secured*23,markets*23,gold*6,property*27|available*18,markets*3,secured*18,markets*28,gold*4,markets*2,property*27 ; {\"available\":7,\"secured\":11,\"markets\":48,\"gold\":7,\"rental\":0}|26|available*21,secured*23,markets*23,gold*6,property*27|available*7,markets*14,secured*11,markets*11,gold*1,markets*23,gold*6,property*27 ; {\"available\":0,\"secured\":0,\"markets\":73,\"gold\":0,\"rental\":0}|50|available*21,secured*23,markets*23,gold*6,property*27|markets*73,property*27 ; {\"available\":29.357798165137616,\"secured\":31.19266055045872,\"markets\":31.55963302752294,\"gold\":7.889908256880735,\"rental\":0} ; 5450000 ; {\"available\":29,\"secured\":31,\"markets\":32,\"gold\":8,\"rental\":0}",
  "{\"available\":29,\"secured\":32,\"markets\":11,\"gold\":0,\"rental\":0}|16|available*24,secured*21,markets*22,gold*5,property*28|available*24,secured*21,markets*11,available*5,secured*11,property*28 ; {\"available\":18,\"secured\":18,\"markets\":32,\"gold\":4,\"rental\":0}|10|available*24,secured*21,markets*22,gold*5,property*28|available*18,markets*6,secured*18,markets*25,gold*4,markets*1,property*28 ; {\"available\":7,\"secured\":11,\"markets\":47,\"gold\":7,\"rental\":0}|27|available*24,secured*21,markets*22,gold*5,property*28|available*7,markets*17,secured*11,markets*8,gold*2,markets*22,gold*5,property*28 ; {\"available\":0,\"secured\":0,\"markets\":72,\"gold\":0,\"rental\":0}|50|available*24,secured*21,markets*22,gold*5,property*28|markets*72,property*28 ; {\"available\":32.83338767525269,\"secured\":29.670687968699056,\"markets\":29.996739484838603,\"gold\":7.499184871209651,\"rental\":0} ; 6134000 ; {\"available\":33,\"secured\":30,\"markets\":30,\"gold\":7,\"rental\":0}",
  "{\"available\":28,\"secured\":32,\"markets\":11,\"gold\":0,\"rental\":0}|26|available*10,secured*24,markets*32,gold*5,property*29|available*10,secured*24,markets*11,available*18,secured*8,property*29 ; {\"available\":18,\"secured\":18,\"markets\":32,\"gold\":3,\"rental\":0}|8|available*10,secured*24,markets*32,gold*5,property*29|available*10,secured*18,available*6,markets*32,gold*3,available*2,property*29 ; {\"available\":7,\"secured\":11,\"markets\":46,\"gold\":7,\"rental\":0}|16|available*10,secured*24,markets*32,gold*5,property*29|available*7,markets*3,secured*11,markets*11,gold*2,markets*32,gold*5,property*29 ; {\"available\":0,\"secured\":0,\"markets\":71,\"gold\":0,\"rental\":0}|39|available*10,secured*24,markets*32,gold*5,property*29|markets*71,property*29 ; {\"available\":14.43609022556391,\"secured\":33.23308270676692,\"markets\":45.11278195488722,\"gold\":7.218045112781955,\"rental\":0} ; 6650000 ; {\"available\":15,\"secured\":33,\"markets\":45,\"gold\":7,\"rental\":0}",
  "{\"available\":28,\"secured\":32,\"markets\":10,\"gold\":0,\"rental\":0}|25|available*12,secured*23,markets*30,gold*5,property*30|available*12,secured*23,markets*10,available*16,secured*9,property*30 ; {\"available\":18,\"secured\":17,\"markets\":32,\"gold\":3,\"rental\":0}|8|available*12,secured*23,markets*30,gold*5,property*30|available*12,secured*17,available*6,markets*30,gold*3,markets*2,property*30 ; {\"available\":7,\"secured\":10,\"markets\":46,\"gold\":7,\"rental\":0}|18|available*12,secured*23,markets*30,gold*5,property*30|available*7,markets*5,secured*10,markets*11,gold*2,markets*30,gold*5,property*30 ; {\"available\":0,\"secured\":0,\"markets\":70,\"gold\":0,\"rental\":0}|40|available*12,secured*23,markets*30,gold*5,property*30|markets*70,property*30 ; {\"available\":17.142857142857142,\"secured\":32.857142857142854,\"markets\":42.857142857142854,\"gold\":7.142857142857142,\"rental\":0} ; 7000000 ; {\"available\":17,\"secured\":33,\"markets\":43,\"gold\":7,\"rental\":0}",
  "{\"available\":40,\"secured\":45,\"markets\":15,\"gold\":0,\"rental\":0}|45|available*63,markets*37|available*40,secured*23,markets*15,secured*22 ; {\"available\":25,\"secured\":25,\"markets\":45,\"gold\":5,\"rental\":0}|38|available*63,markets*37|available*25,secured*25,markets*8,gold*5,markets*37 ; {\"available\":10,\"secured\":15,\"markets\":65,\"gold\":10,\"rental\":0}|53|available*63,markets*37|available*10,secured*15,markets*28,gold*10,markets*37 ; {\"available\":0,\"secured\":0,\"markets\":100,\"gold\":0,\"rental\":0}|63|available*63,markets*37|markets*100 ; {\"available\":62.5,\"secured\":0,\"markets\":37.5,\"gold\":0,\"rental\":0} ; 8000000 ; {\"available\":63,\"secured\":0,\"markets\":37,\"gold\":0,\"rental\":0}",
  "{\"available\":4,\"secured\":5,\"markets\":1,\"gold\":0,\"rental\":0}|6|available*10,property*90|available*4,secured*5,markets*1,property*90 ; {\"available\":3,\"secured\":2,\"markets\":5,\"gold\":0,\"rental\":0}|7|available*10,property*90|available*3,secured*2,markets*5,property*90 ; {\"available\":1,\"secured\":1,\"markets\":7,\"gold\":1,\"rental\":0}|9|available*10,property*90|available*1,secured*1,markets*7,gold*1,property*90 ; {\"available\":0,\"secured\":0,\"markets\":10,\"gold\":0,\"rental\":0}|10|available*10,property*90|markets*10,property*90 ; {\"available\":100,\"secured\":0,\"markets\":0,\"gold\":0,\"rental\":0} ; 1000000 ; {\"available\":100,\"secured\":0,\"markets\":0,\"gold\":0,\"rental\":0}",
  "{\"available\":2,\"secured\":2,\"markets\":1,\"gold\":0,\"rental\":0}|3|available*5,property*95|available*2,secured*2,markets*1,property*95 ; {\"available\":1,\"secured\":1,\"markets\":3,\"gold\":0,\"rental\":0}|4|available*5,property*95|available*1,secured*1,markets*3,property*95 ; {\"available\":1,\"secured\":1,\"markets\":3,\"gold\":0,\"rental\":0}|4|available*5,property*95|available*1,secured*1,markets*3,property*95 ; {\"available\":0,\"secured\":0,\"markets\":5,\"gold\":0,\"rental\":0}|5|available*5,property*95|markets*5,property*95 ; {\"available\":100,\"secured\":0,\"markets\":0,\"gold\":0,\"rental\":0} ; 1000000 ; {\"available\":100,\"secured\":0,\"markets\":0,\"gold\":0,\"rental\":0}",
]
const PINNED_SCREENS =
  "{\"goals\":{\"headline\":\"Hors chez toi, proche de tes objectifs\",\"detail\":\"À 4 carrés près.\",\"scale\":32,\"simulation\":{\"real\":\"available*12,secured*23,markets*30,gold*5,property*30\",\"blocks\":\"available*10,secured*25,markets*32,gold*3,property*30\",\"misplaced\":4}},\"rows\":[[\"available\",{\"actual\":12,\"target\":10,\"words\":\"un peu au-dessus de ton objectif\"},null],[\"secured\",{\"actual\":23,\"target\":25,\"words\":\"un peu en dessous de ton objectif\"},null],[\"markets\",{\"actual\":30,\"target\":32,\"words\":\"un peu en dessous de ton objectif\"},null],[\"gold\",{\"actual\":5,\"target\":3,\"words\":\"un peu au-dessus de ton objectif\"},null],[\"property\",null,\"estimée le 31 octobre · pas d’objectif pour chez toi\"]],\"warnings\":[]} ; {\"rows\":[{\"snapshotId\":\"exemple-releve-1\",\"date\":\"2025-11-30\",\"misplaced\":[{\"category\":\"available\",\"count\":10},{\"category\":\"gold\",\"count\":2}]},{\"snapshotId\":\"exemple-releve-2\",\"date\":\"2026-03-31\",\"misplaced\":[{\"category\":\"available\",\"count\":13},{\"category\":\"gold\",\"count\":1}]},{\"snapshotId\":\"exemple-releve-3\",\"date\":\"2026-07-31\",\"misplaced\":[{\"category\":\"gold\",\"count\":2}]},{\"snapshotId\":\"exemple-releve-4\",\"date\":\"2026-10-31\",\"misplaced\":[{\"category\":\"available\",\"count\":2},{\"category\":\"gold\",\"count\":2}]}],\"comparedToFirst\":false,\"comparedWords\":\"comparé à tes premiers objectifs\",\"traces\":[{\"category\":\"available\",\"gaps\":[14.357798165137616,17.833387675252688,-0.5639097744360893,2.1428571428571423],\"target\":15,\"word\":\"presque atteint\"},{\"category\":\"secured\",\"gaps\":[-3.8073394495412813,-5.329312031300944,-1.7669172932330781,-2.142857142857146],\"target\":35,\"word\":\"presque atteint\"},{\"category\":\"markets\",\"gaps\":[-13.440366972477062,-15.003260515161397,0.1127819548872182,-2.142857142857146],\"target\":45,\"word\":\"presque atteint\"},{\"category\":\"gold\",\"gaps\":[2.8899082568807346,2.4991848712096507,2.2180451127819554,2.1428571428571423],\"target\":5,\"word\":\"presque atteint\"}]}"
