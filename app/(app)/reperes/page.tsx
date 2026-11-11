'use client'

// The Repères tab (interface spec §3, planche 9): the cushion, what can be had back quickly, a few
// facts to know, and where the money is. Statements, not marks; the loan is never red.

import { useRouter } from 'next/navigation'
import { useEffect, useRef, type ReactNode } from 'react'
import { cushionArrival, recoverArrival } from '@/lib/app/arrival'
import { useInViewOnce } from '@/lib/app/use-in-view-once'
import { FirstLaunchState, isFirstLaunchView } from '@/components/money/FirstLaunchState'
import { DIM_FILL, FILL } from '@/components/money/HundredSquares'
import { Button } from '@/components/ui/Button'
import { PageColumns } from '@/components/ui/PageColumns'
import { TabBar } from '@/components/ui/TabBar'
import { useMenuFromModel } from '@/components/ui/use-menu-from-model'
import { VaultWait } from '@/components/ui/VaultWait'
import { useModel } from '@/lib/app/use-model'
import { todayIso } from '@/lib/dates'
import { quotedSymbols } from '@/lib/market/live'
import { useMarket } from '@/lib/market/use-market'
import { monArgentView } from '@/lib/screens/mon-argent'
import { reperesView, type ReperesView } from '@/lib/screens/reperes'
import {
  CUSHION_BOXES,
  CUSHION_TITLE,
  CUSHION_ZONE,
  cushionBeyond,
  DIM_KEY,
  GOOD_TO_KNOW_TITLE,
  LIT_KEY,
  NO_FACTS,
  NO_GRID_FOR_QUICK,
  OWES,
  RECOVER_TITLE,
  REPERES_LOAD_FAILED,
  REPERES_RETRY,
  REPERES_TITLE,
  REPERES_UNREADABLE,
  WHERE_TITLE,
} from '@/lib/screens/reperes-words'

const TITLE = 'pt-2 text-title font-semibold leading-tight tracking-[-0.01em]'
const SENTENCE = 'text-body leading-relaxed text-ink-soft'
const MONTHS = CUSHION_BOXES
// The motions of 10 November 2026 (planche « mouvement des carrés »). The cushion: one month after the
// other, 80 ms apart. What cannot be had back quickly: the grid held lit 400 ms (the planche Nicolas
// approved live), then a square every 15 to 18 ms from the end. The ceiling of --motion-long (1200 ms)
// applies to the dimming itself, from the first square to the last, the 400 ms hold excluded.
const MONTH_STEP_MS = 80
const DIM_HOLD_MS = 400
const DIM_STEP_MS = 18
const DIM_SPREAD_MS = 1200 - 350

type Board = Extract<ReperesView, { kind: 'ready' }>

export default function ReperesPage() {
  const state = useModel()
  const today = todayIso()
  // The view without prices is known as soon as the model is: it says whether there is anything to price.
  const base = state.status === 'ready' ? reperesView(state.model, today) : null
  const symbols =
    state.status === 'ready' && base?.kind === 'ready' && state.model.profile
      ? quotedSymbols(state.model.profile.value, state.model.snapshots[state.model.snapshots.length - 1].value)
      : []
  const market = useMarket(symbols, { rates: symbols.length > 0 })
  // Like Mon argent: it waits for the prices (8 s at most, then the snapshot's own); nothing is drawn meanwhile.
  const waiting = base?.kind === 'ready' && market.status === 'loading'
  const view =
    state.status === 'ready' && base?.kind === 'ready' && market.status === 'ready'
      ? reperesView(state.model, today, market.market)
      : base

  // Until the first round is done, the same words as Mon argent and Évolution: where one is, « Continuer ».
  const launch = state.status === 'ready' ? monArgentView(state.model, today) : null
  useMenuFromModel(state)

  return (
    <>
      <PageColumns aside={<h1 className={TITLE}>{REPERES_TITLE}</h1>}>
      {/* One wait at one place: the vault opening, then the prices, without starting again. */}
      {state.status === 'loading' || waiting ? <VaultWait phase={waiting ? 'prices' : 'open'} /> : null}
      {state.status === 'ready' && launch && isFirstLaunchView(launch) ? <FirstLaunchState view={launch} /> : null}
      {state.status === 'ready' && view && !waiting && !(launch && isFirstLaunchView(launch)) ? <ReadyBody view={view} /> : null}
      {state.status === 'failed' || state.status === 'unavailable' ? (
        <div className="mt-4 flex flex-col gap-4">
          <p role="alert" className="text-body leading-relaxed text-ink">
            {REPERES_LOAD_FAILED}
          </p>
          <Button variant="secondary" onClick={state.retry}>
            {REPERES_RETRY}
          </Button>
        </div>
      ) : null}
      </PageColumns>
      <TabBar current="reperes" />
    </>
  )
}

function ReadyBody({ view }: { view: ReperesView }) {
  const router = useRouter()
  useEffect(() => {
    // Nothing to read yet, or a first launch not finished: Mon argent knows what to do.
    if (view.kind === 'none') router.replace('/')
  }, [view.kind, router])

  if (view.kind === 'none') return null
  if (view.kind === 'unreadable') {
    return (
      <p role="alert" className="mt-4 text-body leading-relaxed text-ink">
        {REPERES_UNREADABLE}
      </p>
    )
  }
  return <Sections view={view} />
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="mt-5 flex flex-col gap-2.5 border-t border-hairline pt-4">
      <h2 className="text-subtitle font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Sections({ view }: { view: Board }) {
  return (
    <div className="flex flex-col">
      {/* The date of the figures, under the title on a phone, at the top of the reading on a computer (A2). */}
      <p className="mt-1 text-caption text-ink-muted">{view.dateLabel}</p>
      <Section title={CUSHION_TITLE}>
        <Cushion cushion={view.cushion} />
      </Section>
      <Section title={RECOVER_TITLE}>
        {view.quick ? (
          <>
            <p className={SENTENCE}>{view.quick.sentence}</p>
            <RecoverGrid quick={view.quick} />
          </>
        ) : (
          <p className={SENTENCE}>{NO_GRID_FOR_QUICK}</p>
        )}
      </Section>
      <Section title={GOOD_TO_KNOW_TITLE}>
        {view.facts.length > 0 ? (
          <ul className="flex flex-col">
            {view.facts.map((fact) => (
              <li key={fact} className="border-t border-hairline py-3 text-body leading-relaxed text-ink-soft first:border-t-0 first:pt-0">
                {fact}
              </li>
            ))}
          </ul>
        ) : (
          <p className={SENTENCE}>{NO_FACTS}</p>
        )}
      </Section>
      <Section title={WHERE_TITLE}>
        <Places places={view.places} />
        {view.notes.map((note) => (
          <p key={note} className="text-caption leading-relaxed text-ink-soft">
            {note}
          </p>
        ))}
      </Section>
    </div>
  )
}

function Cushion({ cushion }: { cushion: Board['cushion'] }) {
  if ('missing' in cushion) return <p className={SENTENCE}>{cushion.missing}</p>
  return <CushionMonths cushion={cushion} />
}

// The months fill (planche of 10 November 2026): the first time they come into view, each covered
// month fills from the left in 350 ms, 80 ms after the one before; a half month stops at its half.
function CushionMonths({ cushion }: { cushion: Exclude<Board['cushion'], { missing: string }> }) {
  const ref = useRef<HTMLDivElement>(null)
  const motion = useInViewOnce(cushionArrival, ref)
  const beyond = cushionBeyond(cushion.months)
  return (
    <>
      <p className={SENTENCE}>{cushion.sentence}</p>
      {cushion.note ? <p className="text-caption leading-relaxed text-ink-soft">{cushion.note}</p> : null}
      <div ref={ref} role="img" aria-label={`${cushion.sentence}`} className="flex gap-[3px]">
        {Array.from({ length: MONTHS }, (_, i) => {
          const fill = Math.max(0, Math.min(1, cushion.months - i))
          // Only a covered month moves: it grows from its left edge, never from elsewhere.
          const moving = motion !== 'still' && fill > 0
          return (
            <span
              key={i}
              data-month=""
              data-fill={fill >= 1 ? 'full' : fill > 0 ? 'half' : 'empty'}
              className="relative size-square-m shrink-0 overflow-hidden rounded-square border border-rule-strong"
            >
              <i
                className={`absolute inset-y-0 left-0 bg-cat-available ${moving ? 'origin-left transition-transform duration-(--motion-mid) ease-(--motion-enter) motion-reduce:transition-none' : ''}`}
                style={{
                  width: `${fill * 100}%`,
                  ...(moving && motion === 'waiting' ? { transform: 'scaleX(0)' } : {}),
                  ...(moving && motion === 'playing' ? { transitionDelay: `${i * MONTH_STEP_MS}ms` } : {}),
                }}
              />
            </span>
          )
        })}
      </div>
      {/* Under the boxes, in their own columns: the reference, a white trait under months 4 to 6 (the
          spec's trait, back on 11 November 2026), and its sentence on one line from the trait's start
          (C14, 9 November). Past twelve months, what the boxes cannot draw, at the end of the row: a
          phone has no room after the twelfth box. */}
      <div className="grid w-max grid-cols-[repeat(12,var(--spacing-square-m))] gap-x-[3px] gap-y-1.5">
        <span aria-hidden="true" data-zone="" className="col-start-4 col-end-7 row-start-1 h-0.5 self-center bg-ink" />
        {beyond ? (
          <span className="col-start-7 col-end-13 row-start-1 self-center justify-self-end whitespace-nowrap text-caption leading-none text-ink-soft">
            {beyond}
          </span>
        ) : null}
        <p className="col-start-4 col-end-13 row-start-2 whitespace-nowrap text-caption text-ink-muted">{CUSHION_ZONE}</p>
      </div>
    </>
  )
}

function RecoverGrid({ quick }: { quick: NonNullable<Board['quick']> }) {
  // What cannot be had back quickly dims (planche of 10 November 2026, « s’éteindre »): the grid is
  // seen whole and lit, then those squares take their dimmed colour one by one from the end.
  const ref = useRef<HTMLDivElement>(null)
  const motion = useInViewOnce(recoverArrival, ref)
  const cells = quick.squares.flatMap(({ category, lit, dim }) => [
    ...Array.from({ length: lit }, (_, i) => ({ key: `${category}-lit-${i}`, category, dim: false })),
    ...Array.from({ length: dim }, (_, i) => ({ key: `${category}-dim-${i}`, category, dim: true })),
  ])
  const dims = cells.filter((c) => c.dim).length
  // 15 to 20 ms apart, fewer when there are many, so that the whole stays under --motion-long.
  const step = dims > 1 ? Math.min(DIM_STEP_MS, Math.floor(DIM_SPREAD_MS / (dims - 1))) : 0
  // Each dimmed square's rank from the end of the grid: the last one goes first.
  const fromEnd = cells.map((_, i) => cells.slice(i + 1).filter((c) => c.dim).length)
  const moving = motion !== 'still'
  return (
    <>
      <div
        ref={ref}
        role="img"
        aria-label={`${quick.lit} carrés sur ${quick.total} se récupèrent vite`}
        className="grid w-max grid-cols-[repeat(10,var(--spacing-square-m))] gap-[3px]"
      >
        {cells.map(({ key, category, dim }, i) =>
          dim ? (
            <span
              key={key}
              data-dim=""
              className={`aspect-square rounded-square ${motion === 'waiting' ? FILL[category] : DIM_FILL[category]} ${moving ? 'transition-colors duration-(--motion-mid) ease-(--motion-leave) motion-reduce:transition-none' : ''}`}
              style={motion === 'playing' ? { transitionDelay: `${DIM_HOLD_MS + fromEnd[i] * step}ms` } : undefined}
            />
          ) : (
            <span key={key} data-lit="" className={`aspect-square rounded-square ${FILL[category]}`} />
          ),
        )}
      </div>
      {/* The key shows exactly what is drawn: the colours of the categories that are in the grid, lit
          and dimmed, never a white square standing for them. */}
      <p className="flex gap-4 text-caption text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" data-key="lit" className="flex gap-0.5">
            {quick.squares
              .filter((s) => s.lit > 0)
              .map((s) => (
                <i key={s.category} className={`size-square-s rounded-square ${FILL[s.category]}`} />
              ))}
          </span>
          {LIT_KEY}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" data-key="dim" className="flex gap-0.5">
            {quick.squares
              .filter((s) => s.dim > 0)
              .map((s) => (
                <i key={s.category} className={`size-square-s rounded-square ${DIM_FILL[s.category]}`} />
              ))}
          </span>
          {DIM_KEY}
        </span>
      </p>
    </>
  )
}

function Places({ places }: { places: Board['places'] }) {
  return (
    <ul className="flex flex-col">
      {places.map((place) => (
        <li key={place.id} className="flex flex-col gap-1.5 border-t border-hairline py-3 first:border-t-0 first:pt-0">
          <div className="flex items-baseline justify-between gap-3 text-body">
            <span>{place.name}</span>
            {place.amount ? <span className="tabular-nums">{place.amount}</span> : null}
          </div>
          {place.bar && place.bar.length > 0 ? (
            <div className="h-1.5 overflow-hidden rounded-square" aria-hidden="true">
              <div className="flex h-full" style={{ width: `${place.scale * 100}%` }}>
                {place.bar.map((part) => (
                  <span key={part.category} className={FILL[part.category]} style={{ width: `${part.share * 100}%` }} />
                ))}
              </div>
            </div>
          ) : null}
          {place.loans.map((loan) => (
            <p key={loan.id} className="flex justify-between gap-3 text-caption text-ink-soft">
              <span>{loan.name}</span>
              <span>
                {loan.owed} {OWES}
              </span>
            </p>
          ))}
        </li>
      ))}
    </ul>
  )
}
