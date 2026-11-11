'use client'

import { useRef, type ComponentProps, type ReactNode } from 'react'
import { useGridFit } from '@/lib/app/grid-fit'
import { CATEGORIES } from '@/lib/catalog'
import { homeRange } from '@/lib/model/squares'
import type { CategoryId } from '@/lib/model/types'
import type { Told } from '@/lib/screens/grid-pick'
import type { Board } from '@/lib/screens/mon-argent'
import { GRID_SIMULATION_MARK, progressSince, squareSentence } from '@/lib/screens/words'
import { useDisplayMode } from './display-mode-context'
import { Figure } from './Figure'
import { FILL, HOME_FILL, HundredSquares } from './HundredSquares'
import { NetAmount } from './NetAmount'

const SENTENCE = 'mt-4 text-body leading-relaxed text-ink'

export type ShownGrid = {
  cells: CategoryId[]
  from?: CategoryId[]
  label: string
  simulated?: boolean
  spotlight?: { lit: ReadonlyArray<number>; todo: ReadonlyArray<number> }
}

export const gridLabel = (grid: Extract<Board['grid'], { kind: 'grid' }>) =>
  `Ta grille : ${grid.categories
    .map((c) => `${CATEGORIES[c.category].label} ${c.squares} ${c.squares > 1 ? 'carrés' : 'carré'}`)
    .join(', ')}`

// What is his and the grid: the left column of Mon argent, and of a category (above its detail, on
// a phone). `lit`: only that category's squares stay lit (the one under the mouse, or the one
// opened). `dateLabel`: the date of the figures, under the grid (on a computer too since A2, 11 November 2026).
export function BoardLeft({
  board,
  lit,
  animate = false,
  shown,
  dateLabel,
  after,
  progress = false,
  fit = false,
  onSquare,
  focus,
  echo,
  said = null,
  onSquareHover,
  told = null,
  label = 'Ce qui est vraiment à toi',
  gridName,
}: {
  board: Board
  lit?: CategoryId
  // The grid arrives (planche 1): Mon argent says when.
  animate?: boolean
  // The grid in other colours than its own (the simulation at the goals), and what it is called then.
  shown?: ShownGrid
  dateLabel?: string
  // Under the grid: what is secondary, so it never pushes the grid down the first screen.
  after?: ReactNode
  // C3: the progress since the first snapshot under the big amount; a computer has it in its glance.
  progress?: boolean
  // C1, on a phone: the grid never goes under the tab bar (lib/app/grid-fit.ts).
  fit?: boolean
  // A square touched or clicked, by its place in the grid (lib/screens/grid-pick.ts says whose).
  onSquare?: (index: number) => void
  // A line lit alone, with no change to the label or the amount (a category's page).
  focus?: { from: number; to: number }
  // The echo of the bank just updated, on Mon argent (HundredSquares says how it dims).
  echo?: ComponentProps<typeof HundredSquares>['echo']
  // A sentence said in the place of the legend for a moment: the hint that a square can be touched,
  // on Mon argent (lib/app/square-hint.ts). The legend keeps its room, so nothing below moves.
  said?: string | null
  // On a computer, the square under the mouse, and what it tells in the place of « Un carré vaut… »
  // (lib/screens/grid-pick.ts).
  onSquareHover?: (index: number | null) => void
  told?: Told | null
  // Above the amount. The example says whose it is: « vraiment à toi » would be false there.
  label?: string
  // What VoiceOver calls the grid; « Ta grille : … » (gridLabel) by default, the example's in its own words.
  gridName?: string
}) {
  const grid = board.grid
  const change = progress ? board.progress?.change : null
  const ref = useRef<HTMLDivElement>(null)
  const fitWidth = useGridFit(ref, fit)
  return (
    // B and 2 (decided by Nicolas on 9 November 2026): above the grid only the label in small grey, the
    // amount and the progress; what is owned opens from the amount; under the grid, in small print,
    // the legend of the grid and the date of the figures. The whole grid stays in a phone's first screen.
    <div className="flex flex-col">
      <p className="text-caption text-ink-muted">{label}</p>
      {board.net !== null ? <NetAmount net={board.net} owned={board.ownedSentence} /> : null}
      {change && board.progress ? (
        <p data-testid="progress" className="text-body text-ink lg:hidden">
          {change.percent !== null ? <Figure quiet euros={change.euros} percent={change.percent} /> : change.euros}{' '}
          <span className="text-ink-soft">{progressSince(board.progress.firstLabel)}</span>
        </p>
      ) : null}

      {grid.kind === 'grid' ? (
        // `data-grid`: a touch here, even between two squares, is a touch on the grid.
        <div ref={ref} data-grid="" style={fitWidth === null ? undefined : { maxWidth: fitWidth }} className="relative mt-3">
          <HundredSquares
            squares={grid.categories.map((c) => ({ category: c.category, count: c.squares }))}
            lit={lit}
            focus={focus}
            echo={echo}
            onSquare={onSquare}
            onSquareHover={onSquareHover}
            animate={animate}
            cells={shown?.cells}
            from={shown?.from}
            spotlight={shown?.spotlight}
            home={homeRange(grid.categories)}
            label={shown?.label ?? gridName ?? gridLabel(grid)}
          />
          <SimulationMark on={shown?.simulated === true} />
        </div>
      ) : null}
      {board.squareValue || told || said ? (
        // The square under the mouse is told in the place of the legend, which keeps its room
        // (both in the same cell): nothing below moves while the mouse runs over the grid.
        <div className="mt-2 grid">
          {board.squareValue ? (
            <p className={`col-start-1 row-start-1 text-caption leading-snug text-ink-muted ${told || said ? 'invisible' : ''}`}>
              {squareSentence(board.squareValue, board.progress?.squareThen ?? null, board.progress?.firstLabel ?? null)}
            </p>
          ) : null}
          {told ? (
            <ToldLine told={told} />
          ) : said ? (
            <p data-said="" className="col-start-1 row-start-1 animate-board-in text-caption leading-snug text-ink motion-reduce:animate-none">
              {said}
            </p>
          ) : null}
        </div>
      ) : null}
      {board.net === null && board.ownedSentence ? (
        <p className="mt-1 text-caption leading-snug text-ink-soft">{board.ownedSentence}</p>
      ) : null}
      {dateLabel ? <p className="mt-1 text-caption leading-snug text-ink-muted">{dateLabel}</p> : null}
      {board.noGridSentence ? <p className={SENTENCE}>{board.noGridSentence}</p> : null}
      {after}
    </div>
  )
}

// The square under the mouse, in the place of the legend: « ● PEA · Placements en bourse · 68 893 € ».
// Its figure follows the screen's € / % mode, as the line's does in the detail; a line a loan
// finances says the loan is already taken off. A long name gives way; the figure never does.
function ToldLine({ told }: { told: Told }) {
  const { mode } = useDisplayMode()
  return (
    <p data-told="" className="col-start-1 row-start-1 flex min-w-0 items-center gap-2 text-caption leading-snug text-ink-muted">
      <span aria-hidden="true" className={`size-square-s shrink-0 rounded-square ${told.home ? HOME_FILL : FILL[told.category]}`} />
      <span className="flex min-w-0 gap-1">
        <span className="truncate">
          {told.name} · {told.categoryName} ·{' '}
        </span>
        <span className="shrink-0 tabular-nums">
          {mode === 'percent' ? told.percent : told.euros}
          {told.note ? `, ${told.note}` : null}
        </span>
      </span>
    </p>
  )
}

// On the grid itself, astride its top edge, while it shows a simulation: never a simulated grid
// without its word. It fades with the vocabulary's short pace, at once with fewer animations.
export function SimulationMark({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-simulation-mark={on ? '' : undefined}
      className={`pointer-events-none absolute left-2 top-0 -translate-y-1/2 rounded-full border border-rule-strong bg-ground px-2.5 text-caption leading-5 text-ink transition-opacity duration-(--motion-short) ease-(--motion-enter) motion-reduce:transition-none ${on ? 'opacity-100' : 'opacity-0'}`}
    >
      {GRID_SIMULATION_MARK}
    </span>
  )
}
