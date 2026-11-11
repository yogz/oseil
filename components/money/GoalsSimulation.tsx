'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Unfold } from '@/components/ui/Unfold'
import { useReducedMotion } from '@/lib/app/use-reduced-motion'
import type { CategoryId } from '@/lib/model/types'
import type { Board } from '@/lib/screens/mon-argent'
import {
  GOALS_SHOW,
  GOALS_SHOW_BACK,
  GOALS_SIMULATION_GRID,
  GOALS_SIMULATION_TAG,
  GOALS_SIMULATION_TITLE,
} from '@/lib/screens/words'
import { useDisplayMode } from './display-mode-context'
import { FILL } from './HundredSquares'

type Simulation = NonNullable<NonNullable<Board['goals']>['simulation']>

// « Montre-moi mes objectifs », option F (Nicolas, 10 November 2026, after three specialists: interface,
// art direction, motion). The squares never move; only their colour and their light change:
// 1. `departure`: the squares that are not in their place are seen, in their own colour, the rest dims;
// 2. `places`: the grid takes its blocks at the goals, dimmed, and the places they go to appear as an
//    outline over a pale veil, the sign of what is missing in a goal bar;
// 3. `filling`: the places fill, one after the other;
// 4. `held`: the grid at the goals, the places filled, and what goes where, in euros;
// 5. `back`: the real grid again, every square lit, still announced as a simulation until it is done.
// With fewer animations asked, the grid at the goals is shown at once (`held`), then the real one.
type Phase = 'real' | 'departure' | 'places' | 'filling' | 'held' | 'back'

const DEPARTURE_MS = 1200 // --motion-long: long enough to see where they leave from
const PLACES_MS = 600 // the grid recolours (--motion-mid), then the places are seen a moment
const FILL_STEP_MS = 150 // --motion-short between two places
const SQUARE_MS = 350 // --motion-mid
const HOLD_MS = 4000

export type GoalsGrid =
  | { cells: CategoryId[]; label: string; simulated: true; spotlight?: { lit: number[]; todo: number[] } }
  | undefined

export function useGoalsSimulation(simulation: Simulation | null) {
  const reduced = useReducedMotion()
  const [phase, setPhase] = useState<Phase>('real')
  const [filled, setFilled] = useState(0)
  const places = simulation?.arrivals.length ?? 0

  useEffect(() => {
    if (phase === 'real') return
    const next: [() => void, number] | null =
      phase === 'departure'
        ? [() => setPhase('places'), DEPARTURE_MS]
        : phase === 'places'
          ? [() => setPhase('filling'), PLACES_MS]
          : phase === 'filling'
            ? filled < places
              ? [() => setFilled((n) => n + 1), FILL_STEP_MS]
              : [() => setPhase('held'), SQUARE_MS]
            : phase === 'held'
              ? [() => setPhase(reduced ? 'real' : 'back'), HOLD_MS]
              : [() => setPhase('real'), SQUARE_MS]
    const timer = setTimeout(next[0], next[1])
    return () => clearTimeout(timer)
  }, [phase, filled, places, reduced])

  const active = simulation !== null && phase !== 'real'
  let grid: GoalsGrid
  if (active) {
    const base = { label: GOALS_SIMULATION_GRID, simulated: true as const }
    grid =
      phase === 'departure'
        ? { ...base, cells: simulation.real, spotlight: { lit: simulation.sources, todo: [] } }
        : phase === 'places'
          ? { ...base, cells: simulation.blocks, spotlight: { lit: [], todo: simulation.arrivals } }
          : phase === 'filling'
            ? { ...base, cells: simulation.blocks, spotlight: { lit: simulation.arrivals.slice(0, filled), todo: simulation.arrivals.slice(filled) } }
            : phase === 'held'
              ? { ...base, cells: simulation.blocks, spotlight: { lit: simulation.arrivals, todo: [] } }
              : { ...base, cells: simulation.real }
  }
  const toggle = () => {
    setFilled(0)
    setPhase((p) => (p === 'real' || p === 'back' ? (reduced ? 'held' : 'departure') : reduced ? 'real' : 'back'))
  }
  return { active, showing: active && phase !== 'back', movesShown: phase === 'held', grid, toggle }
}

const ASK =
  'inline-flex min-h-11 items-center self-start text-caption text-ink-soft underline decoration-rule-strong underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

// What goes where, once the places are filled: « environ 4 900 € d’argent disponible › en bourse »,
// a small square of each colour. In percent with the other figures; in squares when amounts are hidden.
export function GoalsMoves({ moves, shown }: { moves: Simulation['moves'] | undefined; shown: boolean }) {
  const { mode } = useDisplayMode()
  return (
    <Unfold open={shown && (moves?.length ?? 0) > 0}>
      <ul className="flex flex-col gap-1 pt-2">
        {(moves ?? []).map((move) => (
          <li key={`${move.from}-${move.to}`} className="flex flex-wrap items-center gap-x-2 text-body text-ink">
            <span aria-hidden="true" className={`size-square-s shrink-0 rounded-square ${FILL[move.from]}`} />
            <span>{`${mode === 'percent' ? move.percent : move.euros} ${move.fromWords}`}</span>
            <span aria-hidden="true" className="text-ink-muted">
              ›
            </span>
            <span aria-hidden="true" className={`size-square-s shrink-0 rounded-square ${FILL[move.to]}`} />
            <span>{move.toWords}</span>
          </li>
        ))}
      </ul>
    </Unfold>
  )
}

// The goals headline, or, while the simulation is on screen, the words that announce it: in the
// same place and on as many lines, so that nothing moves.
export function GoalsHeadline({
  goals,
  simulation,
}: {
  goals: NonNullable<Board['goals']>
  simulation: ReturnType<typeof useGoalsSimulation>
}) {
  return (
    <div className="mt-5 flex flex-col">
      <div aria-live="polite">
        {simulation.active ? (
          <>
            <p className="text-body font-medium text-ink">{GOALS_SIMULATION_TITLE}</p>
            <p className="text-caption text-ink-muted">{GOALS_SIMULATION_TAG}</p>
          </>
        ) : (
          <>
            <p className="text-body font-medium text-ink">{goals.headline}</p>
            {goals.detail ? <p className="text-caption text-ink-muted">{goals.detail}</p> : null}
            {goals.link ? (
              <Link href={goals.link.href} className={`${ASK} self-start`}>
                {goals.link.label}
              </Link>
            ) : null}
          </>
        )}
        <GoalsMoves moves={goals.simulation?.moves} shown={simulation.movesShown} />
      </div>
      {goals.simulation ? (
        <button type="button" className={ASK} onClick={simulation.toggle}>
          {simulation.showing ? GOALS_SHOW_BACK : GOALS_SHOW}
        </button>
      ) : null}
    </div>
  )
}
