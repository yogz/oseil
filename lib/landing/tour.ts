// « Ton tableur de suivi, en mieux »: the tour of the landing, under the promises (Nicolas, 11 November
// 2026, maquette A). Five steps, each one a title and a sentence; and what the picture beside them
// shows at that step: a grid (or the curve) and, beside it, a few words or the goals' bar.
//
// The picture is the example's (lib/example), read through the same pure views as /exemple: what the
// landing shows of the example is what the example shows, and it follows it when it changes. Never
// an amount, nor any figure: the landing shows none (docs/superpowers/specs/2026-11-10-accueil-design.md,
// « Un chiffre inventé pris pour un vrai »); the example's own pages show them, with their banner.
// Pure: no React, no browser.

import { exampleBoard, exampleEvolution } from '@/lib/example/views'
import type { CategoryId } from '@/lib/model/types'

export type TourVisual =
  // Step 1: nothing noted yet, every square still to fill. Never a grid half filled: the grid is
  // empty, then whole.
  | { kind: 'empty' }
  // `real`: the example's grid as it is; `goals`: as it would be at its goals, the places still to
  // fill outlined (« Montre-moi mes objectifs »). `pulse`: the squares of `lit` beat a few times.
  | { kind: 'grid'; cells: 'real' | 'goals'; lit?: CategoryId; todo?: boolean; pulse?: boolean }
  // Step 5: the example's curve, drawn on a scale that starts at 0, as Évolution (never stretched).
  | { kind: 'curve' }

export type TourPanel =
  // The categories, their squares grey until the grid takes its colours.
  | { kind: 'legend'; coloured: boolean }
  // The goals as a bar, one part per category, in their colours.
  | { kind: 'goals' }
  // One category, with what is said of it.
  | { kind: 'category'; category: CategoryId; words: string }
  | { kind: 'words'; words: string }

export type TourStep = {
  id: string
  title: string
  text: string
  fact: string | null
  picture: { visual: TourVisual; panel: TourPanel }
}

export type Tour = {
  squares: Array<{ category: CategoryId; count: number }>
  // The example's grid in reading order, as it is and as it would be at its goals, and the places
  // still to fill there.
  cells: { real: CategoryId[]; goals: CategoryId[]; todo: number[] }
  legend: Array<{ category: CategoryId; name: string }>
  // The goals, in squares, of every category that has one.
  goals: Array<{ category: CategoryId; target: number }>
  curve: { line: string; end: { x: number; y: number } }
  steps: TourStep[]
}

// The curve in a 100 × 100 box: x by date, y from 0 (the bottom) to the highest net (the top).
export function curveOf(points: ReadonlyArray<{ date: string; net: number }>): Tour['curve'] {
  if (points.length < 2) throw new Error('a curve needs two points')
  const times = points.map((p) => Date.parse(p.date))
  const first = times[0]
  const span = times[times.length - 1] - first
  const top = Math.max(...points.map((p) => p.net))
  const xy = points.map((p, i) => ({
    x: Math.round(((times[i] - first) / span) * 1000) / 10,
    y: Math.round((1 - Math.max(p.net, 0) / top) * 1000) / 10,
  }))
  return { line: xy.map(({ x, y }) => `${x},${y}`).join(' '), end: xy[xy.length - 1] }
}

export function landingTour(): Tour {
  const board = exampleBoard()
  const evolution = exampleEvolution()
  // The example is written once for all and tested: anything missing here is a bug in it.
  if (board.grid.kind !== 'grid' || !board.goals?.simulation || evolution.kind !== 'history') {
    throw new Error('the example gives no grid, no goals or no history')
  }
  const simulation = board.goals.simulation
  const markets = board.categories.find((c) => c.category === 'markets')
  return {
    squares: board.grid.categories.map((c) => ({ category: c.category, count: c.squares })),
    cells: { real: simulation.real, goals: simulation.blocks, todo: simulation.arrivals },
    legend: board.categories.map((c) => ({ category: c.category, name: c.name })),
    goals: board.categories.flatMap((c) => (c.goal && c.goal.target > 0 ? [{ category: c.category, target: c.goal.target }] : [])),
    curve: curveOf(evolution.points),
    steps: [
      {
        id: 'comptes',
        title: 'Tu notes tes comptes une fois',
        text: 'Livrets, PEA, assurance-vie, logement, crédits. Ou tu remplis notre modèle Excel, et tu récupères tout en Excel quand tu veux.',
        fact: null,
        picture: { visual: { kind: 'empty' }, panel: { kind: 'legend', coloured: false } },
      },
      {
        id: 'repartition',
        title: 'Tu vois où est ton argent',
        text: 'Cent carrés, une couleur par catégorie. Un carré, c’est un centième de ce qui est à toi.',
        fact: null,
        picture: { visual: { kind: 'grid', cells: 'real' }, panel: { kind: 'legend', coloured: true } },
      },
      {
        id: 'objectifs',
        title: 'Tu choisis tes objectifs, on te dit où tu en es',
        text: 'Ta répartition idéale, catégorie par catégorie, puis ce qui manque et ce qui dépasse. Rien de plus, rien à vendre.',
        // Mon argent's own headline, without its count of squares: a figure, which the landing never shows.
        fact: `Dans l’exemple : ${board.goals.headline.charAt(0).toLowerCase()}${board.goals.headline.slice(1)}.`,
        picture: { visual: { kind: 'grid', cells: 'goals', todo: true }, panel: { kind: 'goals' } },
      },
      {
        id: 'cours',
        title: 'Les cours se mettent à jour seuls',
        text: 'Relie tes actions, tes fonds et tes cryptos à leur cours : leur prix du jour arrive sans que tu y touches. L’or reste à la main.',
        fact: null,
        picture: {
          visual: { kind: 'grid', cells: 'real', lit: 'markets', pulse: true },
          panel: { kind: 'category', category: 'markets', words: `${markets?.name ?? 'Placements en bourse'}, au prix du jour` },
        },
      },
      {
        id: 'evolution',
        title: 'Tu le suis relevé après relevé',
        text: 'Chaque mise à jour ajoute un relevé à ta courbe : tu vois comment ton patrimoine bouge.',
        fact: null,
        picture: { visual: { kind: 'curve' }, panel: { kind: 'words', words: 'Relevé après relevé, depuis le premier' } },
      },
    ],
  }
}
