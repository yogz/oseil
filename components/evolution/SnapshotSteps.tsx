'use client'

import { useEffect, useRef, useState } from 'react'
import { HundredSquares } from '@/components/money/HundredSquares'
import { useReducedMotion } from '@/lib/app/use-reduced-motion'
import type { CategoryId } from '@/lib/model/types'
import type { EvolutionView } from '@/lib/screens/evolution'
import {
  STEPS_NEXT,
  STEPS_PREVIOUS,
  STEPS_REPLAY,
  STEPS_STOP,
  stepChanged,
  stepDate,
  stepGridLabel,
  stepSquare,
} from '@/lib/screens/evolution-words'

type Steps = NonNullable<Extract<EvolutionView, { kind: 'history' }>['steps']>

// Planche 4: the replay stays this long on each snapshot; the squares that change do it lightly
// one after the other.
export const STEP_HOLD_MS = 3500
const STEP_STAGGER_MS = 25

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const PILL = `inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-rule-strong px-4 text-body text-ink disabled:opacity-40 ${FOCUS}`
const ASK = `inline-flex min-h-11 items-center self-start text-caption text-ink-soft underline decoration-rule-strong underline-offset-4 ${FOCUS}`

// C2 (decided by Nicolas on 9 November 2026): the result of an update opens on the grid of the
// snapshot before, then the squares whose category changes take their new colour, one after the
// other, as in « Ta grille, relevé par relevé ». No amount rolls: the figures around it are already
// the new ones. With fewer animations asked, the new grid is there at once.
export const REPLAY_HOLD_MS = 1200 // --motion-long: the old grid is seen before it changes

export function SnapshotReplay({
  before,
  after,
  beforeHome = null,
  afterHome = null,
  beforeDay,
  afterDay,
}: {
  before: CategoryId[]
  after: CategoryId[]
  beforeHome?: { from: number; to: number } | null
  afterHome?: { from: number; to: number } | null
  beforeDay: string
  afterDay: string
}) {
  const reduced = useReducedMotion()
  const [moved, setMoved] = useState(false)
  const done = moved || reduced
  useEffect(() => {
    if (reduced) return
    const timer = setTimeout(() => setMoved(true), REPLAY_HOLD_MS)
    return () => clearTimeout(timer)
  }, [reduced])
  const changed = after.filter((c, i) => c !== before[i]).length

  return (
    <div className="flex flex-col gap-2">
      <p className="whitespace-nowrap text-caption text-ink-muted">{stepDate(done ? afterDay : beforeDay, false)}</p>
      <HundredSquares
        squares={[]}
        cells={done ? after : before}
        home={done ? afterHome : beforeHome}
        from={done && !reduced ? before : undefined}
        step={STEP_STAGGER_MS}
        size="medium"
        label={stepGridLabel(done ? afterDay : beforeDay)}
      />
      {/* Two lines held, the longest sentence: the buttons below never move (A1). */}
      <p aria-live="polite" className="min-h-10 text-caption text-ink-soft">
        {done ? stepChanged(changed) : ''}
      </p>
    </div>
  )
}

// The grid from one real snapshot to the next: the squares never move, only those whose category
// changes take their new colour; the amount and the date pass at once to the snapshot's own, never
// through a value in between. It opens on the latest snapshot and plays nothing by itself.
// `gridLabelOf`: what VoiceOver calls the grid of a snapshot; the example says it in its own words.
export function SnapshotSteps({
  steps,
  gridLabelOf = stepGridLabel,
}: {
  steps: Steps
  gridLabelOf?: (date: string) => string
}) {
  const reduced = useReducedMotion()
  const last = steps.length - 1
  // `from`: the snapshot shown just before, whose colours the squares leave.
  const [shown, setShown] = useState<{ index: number; from: number | null }>({ index: last, from: null })
  const [playing, setPlaying] = useState(false)
  // A replay starts from the first snapshot at once, on a grid drawn anew: nothing fades into it.
  const [replays, setReplays] = useState(0)

  useEffect(() => {
    if (!playing) return
    const timer = setTimeout(() => {
      setShown({ index: shown.index + 1, from: shown.index })
      if (shown.index + 1 >= last) setPlaying(false)
    }, STEP_HOLD_MS)
    return () => clearTimeout(timer)
  }, [playing, shown.index, last])

  // A button that reaches an end is disabled under the keyboard's focus, which would fall back to the
  // top of the page: it passes to the other button, the one that still leads somewhere.
  const previous = useRef<HTMLButtonElement>(null)
  const next = useRef<HTMLButtonElement>(null)
  const refocus = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    // Once drawn: the button left is disabled and the other one enabled by the same render.
    refocus.current?.focus()
    refocus.current = null
  }, [shown.index])
  const go = (index: number) => {
    setPlaying(false)
    if (index !== shown.index) setShown({ index, from: shown.index })
    const leaving = index === 0 ? previous.current : index === last ? next.current : null
    if (leaving !== null && document.activeElement === leaving) refocus.current = index === 0 ? next.current : previous.current
  }
  const replay = () => {
    setReplays((n) => n + 1)
    setShown({ index: 0, from: null })
    setPlaying(true)
  }

  const step = steps[shown.index]
  const from = shown.from === null ? null : steps[shown.from].cells
  const changed = from === null ? null : step.cells.filter((c, i) => c !== from[i]).length

  return (
    <div className="flex flex-col gap-2">
      {/* Always two lines, each on one line: a longer date never pushes the grid down (a clock does
          not move its dial). */}
      <div className="flex flex-col text-caption text-ink-muted">
        <p className="whitespace-nowrap">{stepDate(step.date, shown.index === last)}</p>
        <p className="whitespace-nowrap tabular-nums">{stepSquare(step.squareValue)}</p>
      </div>
      <p className="text-title font-semibold leading-tight tracking-[-0.02em] tabular-nums text-ink">{step.net}</p>
      <div>
        <HundredSquares
          key={replays}
          squares={[]}
          cells={step.cells}
          home={step.home}
          from={from ?? undefined}
          step={STEP_STAGGER_MS}
          size="medium"
          label={gridLabelOf(step.date)}
        />
      </div>
      {/* Two lines held, the longest sentence: the buttons below never move (A1). */}
      <p aria-live="polite" className="min-h-10 text-caption text-ink-soft">
        {changed === null ? '' : stepChanged(changed)}
      </p>
      <div className="flex gap-2">
        <button ref={previous} type="button" className={PILL} disabled={shown.index === 0} onClick={() => go(shown.index - 1)}>
          {STEPS_PREVIOUS}
        </button>
        <button ref={next} type="button" className={PILL} disabled={shown.index === last} onClick={() => go(shown.index + 1)}>
          {STEPS_NEXT}
        </button>
      </div>
      {/* With fewer animations asked, there is nothing to replay: the latest snapshot is the final state. */}
      {reduced ? null : (
        <button type="button" className={ASK} onClick={playing ? () => setPlaying(false) : replay}>
          {playing ? STEPS_STOP : STEPS_REPLAY}
        </button>
      )}
    </div>
  )
}
