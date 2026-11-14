'use client'

// The Évolution tab (interface spec §4, planches 15 to 17 and 21): since the first snapshot, the
// curve, the grid snapshot by snapshot (planche 4 of the motion), the goals over time, where the
// progress comes from, and the list of snapshots.
// With one snapshot there is no curve yet (planche 15, right).

import Link from 'next/link'
import type { ReactNode } from 'react'
import { DisplayModeProvider } from '@/components/money/DisplayMode'
import { Figure } from '@/components/money/Figure'
import { FirstLaunchState, isFirstLaunchView } from '@/components/money/FirstLaunchState'
import { ChangeSplit } from '@/components/update/ChangeSplit'
import { EvolutionChart } from '@/components/evolution/EvolutionChart'
import { GoalsHistory } from '@/components/evolution/Goals'
import { SnapshotSteps } from '@/components/evolution/SnapshotSteps'
import { Button } from '@/components/ui/Button'
import { PageColumns } from '@/components/ui/PageColumns'
import { FindCorner } from '@/components/ui/FindLink'
import { TabBar } from '@/components/ui/TabBar'
import { useMenuFromModel } from '@/components/ui/use-menu-from-model'
import { VaultWait } from '@/components/ui/VaultWait'
import { useIsDesktop } from '@/lib/app/use-desktop'
import { useModel, type ModelState } from '@/lib/app/use-model'
import { todayIso } from '@/lib/dates'
import { formatEurosShown } from '@/lib/format'
import { evolutionView, type EvolutionView } from '@/lib/screens/evolution'
import { monArgentView } from '@/lib/screens/mon-argent'
import {
  COMES_FROM_NOTE,
  COMES_FROM_TITLE,
  CURVE_NOT_POSITIVE,
  CURVE_ONE_DAY,
  CURVE_TITLE,
  CURVE_WAITING,
  EVOLUTION_LOAD_FAILED,
  EVOLUTION_ON_YOURS,
  EVOLUTION_RETRY,
  EVOLUTION_SINCE_MONTH,
  EVOLUTION_SINCE_FIRST,
  EVOLUTION_TITLE,
  EVOLUTION_UNREADABLE,
  GOALS_TITLE,
  NONE_TEXT,
  SINGLE_ACTION,
  SINGLE_TEXT,
  SINGLE_TITLE,
  STATEMENTS_TITLE,
  STEPS_TITLE,
  sinceSquare,
} from '@/lib/screens/evolution-words'
import { LAST_STATEMENT } from '@/lib/screens/statement-words'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const TITLE = 'pt-2 text-title font-semibold leading-tight tracking-[-0.01em]'
const SENTENCE = 'text-body leading-relaxed text-ink-soft'

type Ready = Extract<ModelState, { status: 'ready' }>

export default function EvolutionPage() {
  const state = useModel()
  useMenuFromModel(state)
  // C2 (Nicolas, 11 November 2026): on a computer the grid snapshot by snapshot fills the left
  // column under the title, as the grid of Mon argent does; on a phone it stays in the reading.
  const desktop = useIsDesktop()
  const view = state.status === 'ready' ? readyView(state) : null
  const steps = desktop && view?.kind === 'history' ? view.steps : null
  return (
    <>
      <PageColumns
        aside={
          <>
            <FindCorner>
              <h1 className={TITLE}>{EVOLUTION_TITLE}</h1>
            </FindCorner>
            {steps ? (
              <section aria-label={STEPS_TITLE} className="mt-6 flex flex-col gap-3">
                <h2 className="text-subtitle font-semibold">{STEPS_TITLE}</h2>
                <SnapshotSteps steps={steps} />
              </section>
            ) : null}
          </>
        }
      >
      {state.status === 'loading' ? <VaultWait phase="open" /> : null}
      {state.status === 'ready' && view ? <ReadyBody state={state} view={view} stepsAside={steps !== null} /> : null}
      {state.status === 'failed' || state.status === 'unavailable' ? (
        <div className="mt-4 flex flex-col gap-4">
          <p role="alert" className="text-body leading-relaxed text-ink">
            {EVOLUTION_LOAD_FAILED}
          </p>
          <Button variant="secondary" onClick={state.retry}>
            {EVOLUTION_RETRY}
          </Button>
        </div>
      ) : null}
      </PageColumns>
      <TabBar current="evolution" />
    </>
  )
}

// Until the first round is done, no curve and no total: the same words as Mon argent and Repères.
function readyView(state: Ready) {
  const launch = monArgentView(state.model, todayIso())
  if (isFirstLaunchView(launch)) return { kind: 'first-launch' as const, launch }
  return evolutionView(state.model, todayIso())
}

function ReadyBody({ state, view, stepsAside }: { state: Ready; view: ReturnType<typeof readyView>; stepsAside: boolean }) {
  if (view.kind === 'first-launch') return <FirstLaunchState view={view.launch} />
  if (view.kind === 'none') return <p className={`${SENTENCE} mt-4`}>{NONE_TEXT}</p>
  if (view.kind === 'unreadable') {
    return (
      <div className="mt-4 flex flex-col gap-2">
        <p className="text-body leading-relaxed text-ink">{EVOLUTION_UNREADABLE}</p>
        <Notes notes={view.notes} />
      </div>
    )
  }
  if (view.kind === 'single') return <Single view={view} />
  return (
    <DisplayModeProvider state={state}>
      <History view={view} stepsAside={stepsAside} />
    </DisplayModeProvider>
  )
}

function Single({ view }: { view: Extract<EvolutionView, { kind: 'single' }> }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 rounded-control border border-dashed border-rule-strong px-5 py-6 text-center">
      <span aria-hidden="true" className="size-3 rounded-full bg-ink" />
      <h2 className="text-subtitle font-semibold">{SINGLE_TITLE}</h2>
      <p className={SENTENCE}>
        {view.dateLabel}
        {view.withoutHome ? ' · hors chez toi' : null}
        <span className="block text-title font-semibold tracking-[-0.02em] tabular-nums text-ink">{formatEurosShown(view.point.net)}</span>
      </p>
      <p className={SENTENCE}>{SINGLE_TEXT}</p>
      <Notes notes={view.notes} />
      <Link
        href="/mise-a-jour"
        className={`mt-2 inline-flex min-h-13 w-full items-center justify-center rounded-full bg-ink px-6 text-body font-semibold text-ground ${FOCUS}`}
      >
        {SINGLE_ACTION}
      </Link>
    </div>
  )
}

function Notes({ notes }: { notes: string[] }) {
  return notes.map((note) => (
    <p key={note} className="text-caption leading-relaxed text-ink-soft">
      {note}
    </p>
  ))
}

function Section({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} aria-label={title} className="mt-6 flex flex-col gap-3 border-t border-hairline pt-5">
      <h2 className="text-subtitle font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function History({ view, stepsAside }: { view: Extract<EvolutionView, { kind: 'history' }>; stepsAside: boolean }) {
  const { sinceFirst } = view
  const flat = view.curve === 'flat'
  return (
    <div className="flex flex-col">
      {/* The date of the figures, under the title on a phone, at the top of the reading on a computer (A2). */}
      <p className="mt-1 text-caption text-ink-muted">
        {view.dateLabel}
        {/* « Ta grille : sans chez toi »: the whole curve leaves Chez toi out, and says so. */}
        {view.withoutHome ? ' · hors chez toi' : null}
      </p>
      <Section title={EVOLUTION_SINCE_FIRST}>
        <p data-testid="since-first" className="text-hero font-semibold leading-tight hero-figure text-ink">
          {/* Touched, it passes in percent like the other figures of progress; none when the first net was not positive. */}
          {sinceFirst.percent !== null ? <Figure quiet euros={sinceFirst.euros} percent={sinceFirst.percent} /> : sinceFirst.euros}
          {/* A real space, not a margin: a screen reader would read « €sur ». */}{' '}
          <small className="text-body font-normal tracking-normal text-ink-soft">
            {flat ? EVOLUTION_SINCE_MONTH(sinceFirst.sinceLabel) : EVOLUTION_ON_YOURS}
          </small>
        </p>
        {sinceFirst.squareThen !== null && sinceFirst.squareNow !== null ? (
          <p className={SENTENCE}>{sinceSquare(sinceFirst.squareThen, sinceFirst.squareNow, sinceFirst.firstLabel)}</p>
        ) : null}
        {/* The gap is too small to show on a scale that starts at 0: said, not drawn. */}
        {flat ? <p className="text-caption leading-relaxed text-ink-muted">{CURVE_WAITING}</p> : null}
        {flat ? <Notes notes={view.notes} /> : null}
      </Section>

      {flat ? null : <Section title={CURVE_TITLE}>
        {view.curve === 'chart' ? (
          <>
            <EvolutionChart points={view.points} nextCap={view.nextCap} />
            {view.capSentence ? <p className="text-caption text-ink-muted">{view.capSentence}</p> : null}
          </>
        ) : (
          <p className={SENTENCE}>{view.curve === 'one-day' ? CURVE_ONE_DAY : CURVE_NOT_POSITIVE}</p>
        )}
        <Notes notes={view.notes} />
      </Section>}

      {view.steps && !stepsAside ? (
        <Section title={STEPS_TITLE}>
          <SnapshotSteps steps={view.steps} />
        </Section>
      ) : null}

      {view.goals ? (
        <Section title={GOALS_TITLE}>
          <GoalsHistory goals={view.goals} />
        </Section>
      ) : null}

      <Section title={COMES_FROM_TITLE}>
        <p className="text-caption text-ink-muted">{COMES_FROM_NOTE}</p>
        <ChangeSplit split={view.split} />
        {view.split.unknownPayments.map((sentence) => (
          <p key={sentence} className="text-caption leading-relaxed text-ink-soft">
            {sentence}
          </p>
        ))}
      </Section>

      {/* Each relevé opens its page (planche 8B); its square value lives there now. `releves`: the
          anchor a line's fiche leads to (« Ses relevés précédents »). */}
      <Section title={STATEMENTS_TITLE} id="releves">
        <ul className="flex flex-col">
          {view.snapshots.map((s) => (
            <li key={s.id} className="border-t border-hairline first:border-t-0">
              <Link href={s.href} className={`flex min-h-13 items-center justify-between gap-4 py-3 text-body ${FOCUS}`}>
                <span className="flex flex-col">
                  <span>{s.date}</span>
                  {s.last ? <span className="text-caption text-ink-soft">{LAST_STATEMENT}</span> : null}
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">{s.net}</span>
                  <span aria-hidden="true">›</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
