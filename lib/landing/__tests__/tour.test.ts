import { expect, test } from 'vitest'
import { exampleBoard } from '@/lib/example/views'
import { curveOf, landingTour } from '../tour'

test('the tour tells five steps, in the order of a first month', () => {
  expect(landingTour().steps.map((s) => s.id)).toEqual(['comptes', 'repartition', 'objectifs', 'cours', 'evolution'])
})

// The memory « Pas de grille partielle »: the grid is empty, then whole, never half filled.
test('the grid starts empty, then shows the whole example, its legend taking its colours', () => {
  const steps = landingTour().steps
  expect(steps[0].picture).toEqual({ visual: { kind: 'empty' }, panel: { kind: 'legend', coloured: false } })
  expect(steps[1].picture).toEqual({ visual: { kind: 'grid', cells: 'real' }, panel: { kind: 'legend', coloured: true } })
})

// The spec of the landing: no amount there, a figure would be read as someone's money.
test('no word of the tour holds a figure', () => {
  const tour = landingTour()
  for (const step of tour.steps) {
    const panel = step.picture.panel
    const words = 'words' in panel ? panel.words : ''
    expect([step.title, step.text, step.fact ?? '', words].join(' ')).not.toMatch(/\d|€/)
  }
})

// What the landing shows of the example is what /exemple shows: read from it, never written twice.
test('the goals step shows the example at its goals, the places still to fill outlined', () => {
  const tour = landingTour()
  const board = exampleBoard()
  const simulation = board.goals!.simulation!
  expect(tour.steps[2].picture).toEqual({ visual: { kind: 'grid', cells: 'goals', todo: true }, panel: { kind: 'goals' } })
  expect(tour.cells).toEqual({ real: simulation.real, goals: simulation.blocks, todo: simulation.arrivals })
  expect(simulation.arrivals.length).toBeGreaterThan(0)
  expect(tour.steps[2].fact).toBe(`Dans l’exemple : ${board.goals!.headline.charAt(0).toLowerCase()}${board.goals!.headline.slice(1)}.`)
  // « Chez toi » has no goal: the bar holds only what the goals cover.
  expect(tour.goals.map((g) => g.category)).not.toContain('property')
  expect(tour.goals.length).toBeGreaterThan(0)
  expect(tour.squares.reduce((sum, s) => sum + s.count, 0)).toBe(100)
})

// The price step promises no change of the day: the app shows none.
test('the price step lights the stock market and says nothing the app does not do', () => {
  const step = landingTour().steps[3]
  expect(step.picture.visual).toEqual({ kind: 'grid', cells: 'real', lit: 'markets', pulse: true })
  expect(step.text).toContain('L’or reste à la main.')
})

// As Évolution: the scale starts at 0, it is never stretched to flatter a gap.
test('the curve starts its scale at 0 and ends at the highest point on the right', () => {
  const { line, end } = curveOf([
    { date: '2025-01-01', net: 50 },
    { date: '2025-07-01', net: 75 },
    { date: '2026-01-01', net: 100 },
  ])
  expect(line).toBe('0,50 49.6,25 100,0')
  expect(end).toEqual({ x: 100, y: 0 })
})

test('a net under 0 sits at the bottom, never under it', () => {
  expect(curveOf([{ date: '2025-01-01', net: -10 }, { date: '2026-01-01', net: 10 }]).line).toBe('0,100 100,0')
})
