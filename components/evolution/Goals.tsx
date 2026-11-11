import { useState } from 'react'
import { GOAL_COLOR, GOAL_LABELS } from '@/lib/catalog'
import { formatMonthYear } from '@/lib/format'
import { FILL } from '@/components/money/HundredSquares'
import { TraceComet } from '@/components/evolution/TraceComet'
import { Unfold } from '@/components/ui/Unfold'
import type { EvolutionView } from '@/lib/screens/evolution'
import {
  COMPARED_TO_FIRST_GOALS,
  GOALS_ALL_IN_PLACE,
  GOALS_BY_CATEGORY,
  GOALS_BY_CATEGORY_HIDE,
  GOALS_BY_CATEGORY_SHOW,
  GOALS_LEGEND,
  goalsLead,
  misplacedRowLabel,
  traceLabel,
} from '@/lib/screens/evolution-words'

type Goals = NonNullable<Extract<EvolutionView, { kind: 'history' }>['goals']>

const total = (row: Goals['rows'][number]) => row.misplaced.reduce((s, m) => s + m.count, 0)

// « Tes objectifs » (planches 16-17): the squares that are not in their place snapshot by
// snapshot, each in the colour of the category that holds too much, then one trace per category.
// `words`: the sentences said to the reader; the example passes them in its own words.
export function GoalsHistory({
  goals,
  words = { lead: goalsLead, comparedToFirst: COMPARED_TO_FIRST_GOALS },
}: {
  goals: Goals
  words?: { lead: (first: number, last: number) => string; comparedToFirst: string }
}) {
  // The four traces are a detail one goes looking for: folded behind one row.
  const [open, setOpen] = useState(false)
  const first = total(goals.rows[0])
  const last = total(goals.rows[goals.rows.length - 1])

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body leading-relaxed text-ink-soft">{words.lead(first, last)}</p>
      {goals.comparedToFirst ? <p className="text-caption text-ink-muted">{words.comparedToFirst}</p> : null}

      <ul className="flex flex-col">
        {goals.rows.map((row) => (
          <li key={row.snapshotId} className="grid min-h-9 grid-cols-[7.5rem_1fr_1.5rem] items-center gap-2 py-1 text-caption text-ink-soft">
            <span className="whitespace-nowrap">{formatMonthYear(row.date)}</span>
            <span className="flex flex-wrap gap-0.5" role="img" aria-label={total(row) === 0 ? GOALS_ALL_IN_PLACE : misplacedRowLabel(total(row))}>
              {row.misplaced.flatMap((m) =>
                Array.from({ length: m.count }, (_, i) => (
                  <i key={`${m.category}-${i}`} className={`size-square-s rounded-square ${FILL[GOAL_COLOR[m.category]]}`} />
                )),
              )}
            </span>
            <span className="text-right text-ink">{total(row)}</span>
          </li>
        ))}
      </ul>
      <p className="text-caption text-ink-muted">{GOALS_LEGEND}</p>

      {goals.traces.length > 0 ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((now) => !now)}
          className="flex min-h-11 w-full items-center justify-between gap-3 border-y border-hairline py-3 text-left text-body text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {open ? GOALS_BY_CATEGORY_HIDE : GOALS_BY_CATEGORY_SHOW}
          <span aria-hidden="true" className={`text-ink-muted ${open ? 'rotate-90' : ''}`}>
            ›
          </span>
        </button>
      ) : null}
      <Unfold open={open && goals.traces.length > 0}>
        <div className="flex flex-col gap-3">
          <h3 className="text-body font-semibold">{GOALS_BY_CATEGORY}</h3>
          <GoalTraces traces={goals.traces} />
        </div>
      </Unfold>
    </div>
  )
}

// Mounted when « Catégorie par catégorie » opens: its dots start travelling then, all on one clock.
function GoalTraces({ traces }: { traces: Goals['traces'] }) {
  const [startedAt] = useState(() => performance.now())
  return (
    <ul className="flex flex-col divide-y divide-hairline">
      {traces.map((trace) => {
        // Each dot sits at its own gap from the target, drawn against the latest target.
        const positions = trace.gaps.map((gap) => Math.max(0, trace.target + gap))
        const scale = Math.max(1, trace.target, ...positions)
        const percent = (n: number) => (n / scale) * 100
        return (
          <li key={trace.category} className="grid grid-cols-[8rem_1fr] items-center gap-3 py-3">
            <span className="flex flex-col text-body">
              {GOAL_LABELS[trace.category]}
              <small className="text-caption text-ink-muted">{trace.word}</small>
            </span>
            <span className="relative block h-3" role="img" aria-label={traceLabel(trace.word, trace.target)}>
              <span className="absolute inset-x-0 top-1.5 h-px bg-hairline" />
              {positions.map((n, i) => (
                <span
                  key={i}
                  className={`absolute top-0.5 size-2 -translate-x-1/2 rounded-full ${FILL[GOAL_COLOR[trace.category]]}`}
                  style={{ left: `${percent(n)}%`, opacity: 0.3 + (0.7 * i) / Math.max(1, positions.length - 1) }}
                />
              ))}
              <TraceComet positions={positions.map(percent)} color={GOAL_COLOR[trace.category]} startedAt={startedAt} />
              <span className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 bg-ink" style={{ left: `${percent(trace.target)}%` }} />
            </span>
          </li>
        )
      })}
    </ul>
  )
}
