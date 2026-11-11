'use client'

import { useCallback, useEffect, useState } from 'react'
import { BoardLeft } from '@/components/money/BoardLeft'
import { CategoryRow } from '@/components/money/CategoryRow'
import { GoalsMoves, useGoalsSimulation } from '@/components/money/GoalsSimulation'
import { GearIcon } from '@/components/ui/GearIcon'
import { useOpenAfterDim, useSquareHint } from '@/lib/app/board-motion'
import { useIsDesktop } from '@/lib/app/use-desktop'
import { exampleGridArrival, exampleSquareHint } from '@/lib/example/arrival'
import { useReducedMotion } from '@/lib/app/use-reduced-motion'
import { thirdPerson } from '@/lib/example/third-person'
import { exampleBoard, exampleDetail, exampleEvolution } from '@/lib/example/views'
import type { CategoryId } from '@/lib/model/types'
import { squareOwner, squareTold } from '@/lib/screens/grid-pick'
import type { Board as BoardView } from '@/lib/screens/mon-argent'
import { SETTINGS_LINK } from '@/lib/screens/settings-words'
import { SQUARE_HINT_SENTENCE } from '@/lib/screens/words'
import {
  GOALS_SHOW,
  GOALS_SHOW_BACK,
  GOALS_SIMULATION_TAG,
  GOALS_SIMULATION_TITLE,
} from '@/lib/screens/words'
import { ExampleDisplayMode } from './ExampleDisplayMode'
import { ExampleEvolutionCard } from './ExampleEvolutionCard'
import { ExampleSheet } from './ExampleSheet'
import { EXAMPLE_EVOLUTION, exampleCategory } from './links'
import { EXAMPLE_LABEL, exampleGridName } from './words'

// Mon argent of the example: the real screen's bricks (the amount, the grid, the goals, the rows of
// the categories) over the invented person. What would save something (« Mettre à jour », the gear)
// opens the sheet that says the example keeps nothing. Composed here rather than reusing the real
// page, which reads the vault and links to private screens.

const TITLE = 'text-title font-semibold leading-tight tracking-[-0.01em]'
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const PILL = 'inline-flex min-h-11 items-center rounded-full border border-rule-strong px-4 text-body'

export function ExampleMonArgent() {
  const [board] = useState(exampleBoard)
  const [sheet, setSheet] = useState(false)
  const closeSheet = useCallback(() => setSheet(false), [])
  return (
    <ExampleDisplayMode>
      {/* The title, « Mettre à jour » and the gear share a line, as in the site; on a computer too,
          where the example has no menu at the top to carry them. The date is under the grid (A2). */}
      <div className="flex items-center gap-3">
        <h1 className={`${TITLE} whitespace-nowrap max-[22.5rem]:sr-only`}>Mon argent</h1>
        <button
          type="button"
          onClick={() => setSheet(true)}
          className={`${PILL} ml-auto shrink-0 whitespace-nowrap text-ink ${FOCUS}`}
        >
          Mettre à jour
        </button>
        <button
          type="button"
          aria-label={SETTINGS_LINK}
          onClick={() => setSheet(true)}
          className={`-mr-2.5 inline-flex size-11 shrink-0 items-center justify-center text-ink-muted ${FOCUS}`}
        >
          <GearIcon className="size-5.5" />
        </button>
      </div>
      <Board board={board} />
      <ExampleSheet open={sheet} onClose={closeSheet} />
    </ExampleDisplayMode>
  )
}

function Board({ board }: { board: ReturnType<typeof exampleBoard> }) {
  const desktop = useIsDesktop()
  // The grid arrives once per opening of the example (lib/example/arrival.ts).
  const [animate] = useState(() => exampleGridArrival.due())
  const [evolution] = useState(exampleEvolution)
  useEffect(() => {
    exampleGridArrival.shown()
  }, [])
  const [hoveredRow, setHovered] = useState<CategoryId | null>(null)
  const hovered = desktop ? hoveredRow : null
  const [pressed, setPressed] = useState<CategoryId | null>(null)
  const simulation = useGoalsSimulation(board.goals?.simulation ?? null)
  const squares = board.grid.kind === 'grid' ? board.grid.categories : null

  // A square opens its category's detail, as in the site: the category lights, the list fades,
  // then the page changes, after the same wait as there (lib/app/board-motion.ts).
  const reduced = useReducedMotion()
  const [leaving, setLeaving] = useState<CategoryId | null>(null)
  useOpenAfterDim(leaving === null ? null : exampleCategory(leaving))
  const onSquare =
    squares && !simulation.active
      ? (index: number) => {
          const owner = squareOwner(squares, index)
          if (owner) setLeaving((current) => current ?? owner.category)
        }
      : undefined
  // The hint of the site, after the arrival (Nicolas, 11 November 2026): on every opening of the
  // example, counted nowhere. A square touched, a row under the finger or the mouse, or the
  // simulation on screen, ends it, as there.
  const hinting = useSquareHint(squares, animate, false, reduced, exampleSquareHint)
  const hint = hinting !== null && leaving === null && pressed === null && hovered === null && !simulation.active ? hinting : null
  const lit = simulation.active ? null : (leaving ?? pressed ?? hovered ?? hint)
  // On a computer, the square under the mouse is told under the grid.
  const [hoveredSquare, setHoveredSquare] = useState<number | null>(null)
  const told =
    desktop && squares !== null && !simulation.active && hoveredSquare !== null
      ? squareTold(squares, hoveredSquare, exampleDetail)
      : null

  return (
    <div className="flex animate-board-in flex-col motion-reduce:animate-none">
      <div data-columns="" className="mt-4 flex flex-col lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-14">
        <BoardLeft
          board={board}
          label={EXAMPLE_LABEL}
          lit={lit ?? undefined}
          animate={animate}
          said={hint !== null ? SQUARE_HINT_SENTENCE : null}
          shown={simulation.grid ? { ...simulation.grid, label: thirdPerson(simulation.grid.label) } : undefined}
          gridName={exampleGridName(board)}
          dateLabel={board.dateLabel}
          onSquare={onSquare}
          onSquareHover={desktop ? setHoveredSquare : undefined}
          told={told}
          progress
        />
        <div
          className={`flex flex-col transition-opacity duration-(--motion-short) ease-(--motion-leave) motion-reduce:transition-none lg:[&>*:first-child]:mt-0 ${leaving ? 'pointer-events-none opacity-0' : ''}`}
        >
          {/* Piste B (Nicolas, 10 November 2026): the evolution, right under the grid on a phone. */}
          {evolution.kind === 'history' ? (
            <ExampleEvolutionCard href={EXAMPLE_EVOLUTION} points={evolution.points} gain={evolution.sinceFirst.euros} />
          ) : null}
          {board.goals ? <GoalsHeadline goals={board.goals} simulation={simulation} /> : null}
          <ul className="mt-3 flex flex-col divide-y divide-hairline">
            {board.categories.map((row) => (
              <CategoryRow
                key={row.category}
                row={row}
                href={exampleCategory(row.category)}
                scale={board.goals?.scale ?? null}
                hovered={hovered === row.category || told?.category === row.category || hint === row.category}
                onHover={desktop ? setHovered : undefined}
                onPress={setPressed}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

const ASK =
  'inline-flex min-h-11 items-center self-start text-caption text-ink-soft underline decoration-rule-strong underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

// The goals headline of the site (components/money/GoalsSimulation.tsx), re-composed with the same
// layout: its words speak to the visitor (« Si tu étais pile à tes objectifs », « Montre-moi mes
// objectifs »); here they speak of the person.
function GoalsHeadline({
  goals,
  simulation,
}: {
  goals: NonNullable<BoardView['goals']>
  simulation: ReturnType<typeof useGoalsSimulation>
}) {
  return (
    <div className="mt-5 flex flex-col">
      <div aria-live="polite">
        {simulation.active ? (
          <>
            <p className="text-body font-medium text-ink">{thirdPerson(GOALS_SIMULATION_TITLE)}</p>
            <p className="text-caption text-ink-muted">{thirdPerson(GOALS_SIMULATION_TAG)}</p>
          </>
        ) : (
          <>
            <p className="text-body font-medium text-ink">{goals.headline}</p>
            {goals.detail ? <p className="text-caption text-ink-muted">{goals.detail}</p> : null}
          </>
        )}
        <GoalsMoves moves={goals.simulation?.moves} shown={simulation.movesShown} />
      </div>
      {goals.simulation ? (
        <button type="button" className={ASK} onClick={simulation.toggle}>
          {thirdPerson(simulation.showing ? GOALS_SHOW_BACK : GOALS_SHOW)}
        </button>
      ) : null}
    </div>
  )
}
