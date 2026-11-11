'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { FILL } from '@/components/money/HundredSquares'
import { useReducedMotion } from '@/lib/app/use-reduced-motion'
import type { CategoryId } from '@/lib/model/types'

// The one wait of the site (chosen by Nicolas on 10 November 2026): a grid of ten squares by ten,
// grey and scrambled, that takes its colours row after row while the vault opens, or loses them
// while it locks, and a sentence under it. It stops as soon as what it waits for is there: the
// screen unmounts it. Its colours are a fixed pattern, never the shares of the person.

export type WaitPhase = 'open' | 'lock' | 'create' | 'prices'

export const WAIT_WORDS: Record<WaitPhase, string> = {
  open: 'Ouverture de ton coffre…',
  lock: 'Mise sous clé…',
  create: 'Création de ton coffre…',
  // Nothing is decrypted here: the site only waits for Yahoo, and says so.
  prices: 'Derniers cours…',
}

// Under a third of a second, nothing: a wait that short would only flash.
export const WAIT_DELAY_MS = 333

const PATTERN: CategoryId[] = (
  [
    ['available', 22],
    ['secured', 18],
    ['property', 35],
    ['markets', 20],
    ['gold', 5],
  ] as const
).flatMap(([category, count]) => Array<CategoryId>(count).fill(category))

// One step every 110 ms; a cycle is 14 steps of scramble, one row settling every 3 steps, then
// 12 steps still, and again.
const STEP_MS = 110
const SCRAMBLE_STEPS = 14
const ROW_STEPS = 3
const CYCLE_STEPS = SCRAMBLE_STEPS + ROW_STEPS * 10 + 12

const SQUARE = 'size-square-s rounded-square'
const MOTION = 'transition-colors duration-(--motion-mid) ease-(--motion-enter)'

/** True once `active` has lasted WAIT_DELAY_MS; false again as soon as it stops. */
function useAfterDelay(active: boolean): boolean {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => setShown(true), WAIT_DELAY_MS)
    return () => {
      clearTimeout(timer)
      setShown(false)
    }
  }, [active])
  return active && shown
}

function scramble(): boolean[] {
  return PATTERN.map(() => Math.random() < 1 / 3)
}

function Grid({ phase }: { phase: WaitPhase }) {
  const reduced = useReducedMotion()
  const [frame, setFrame] = useState(() => ({ step: 0, bright: scramble() }))
  useEffect(() => {
    if (reduced) return
    const timer = setInterval(
      () => setFrame(({ step }) => ({ step: (step + 1) % CYCLE_STEPS, bright: scramble() })),
      STEP_MS,
    )
    return () => clearInterval(timer)
  }, [reduced])

  const locking = phase === 'lock'
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-5 py-16">
      <div aria-hidden="true" className="grid w-max grid-cols-[repeat(10,var(--spacing-square-s))] gap-px">
        {PATTERN.map((category, index) => {
          const settled = frame.step > SCRAMBLE_STEPS + Math.floor(index / 10) * ROW_STEPS
          const coloured = reduced || (locking ? !settled : settled)
          const fill = coloured ? FILL[category] : frame.bright[index] ? 'bg-rule-strong' : 'bg-hairline'
          return <span key={index} className={`${SQUARE} ${fill} ${reduced ? '' : MOTION}`} />
        })}
      </div>
      <p className="text-body text-ink-muted">{WAIT_WORDS[phase]}</p>
    </div>
  )
}

/** The wait of a whole screen: nothing for a third of a second, then the grid and its sentence. */
export function VaultWait({ phase }: { phase: WaitPhase }) {
  const shown = useAfterDelay(true)
  return shown ? <Grid phase={phase} /> : null
}

/**
 * A form that works (signs in, saves): after a third of a second it gives its place to the wait,
 * but stays mounted, hidden, so that a refusal brings it back as it was, its fields filled.
 */
export function WaitCover({ active, phase, children }: { active: boolean; phase: WaitPhase; children: ReactNode }) {
  const shown = useAfterDelay(active)
  return (
    <>
      <div hidden={shown} className={shown ? undefined : 'contents'}>
        {children}
      </div>
      {shown ? <Grid phase={phase} /> : null}
    </>
  )
}
