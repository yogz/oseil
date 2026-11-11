'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { EvolutionChart } from '@/components/evolution/EvolutionChart'
import { GoalsHistory } from '@/components/evolution/Goals'
import { SnapshotSteps } from '@/components/evolution/SnapshotSteps'
import { Figure } from '@/components/money/Figure'
import { PageColumns } from '@/components/ui/PageColumns'
import { useIsDesktop } from '@/lib/app/use-desktop'
import { ChangeSplit } from '@/components/update/ChangeSplit'
import { exampleEvolution } from '@/lib/example/views'
import { thirdPerson } from '@/lib/example/third-person'
import {
  COMES_FROM_NOTE,
  COMES_FROM_TITLE,
  COMPARED_TO_FIRST_GOALS,
  CURVE_LABEL,
  CURVE_TITLE,
  EVOLUTION_SINCE_FIRST,
  EVOLUTION_TITLE,
  GOALS_TITLE,
  goalsLead,
  NO_SQUARE_VALUE,
  STATEMENTS_TITLE,
  STEPS_TITLE,
  sinceSquare,
  stepGridLabel,
} from '@/lib/screens/evolution-words'
import { ExampleDisplayMode } from './ExampleDisplayMode'
import { EXAMPLE_HOME } from './links'

// The evolution of the example: the real screen's sections (the progress since the first snapshot,
// the curve over a year, the grid snapshot by snapshot, the goals over time, where it comes from,
// the snapshots), over the invented person. Re-composed here: the real page reads the vault.

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const BACK = `inline-flex min-h-11 items-center self-start text-body text-ink-soft ${FOCUS}`
const TITLE = 'pt-2 text-title font-semibold leading-tight tracking-[-0.01em]'
const SENTENCE = 'text-body leading-relaxed text-ink-soft'
// « sur ce qui est à toi » would be false here, as above the amount of Mon argent.
const ON_THE_PERSON = 'sur ce qui est à la personne de l’exemple'
// The site's words of this screen, of the person of the example (lib/example/third-person.ts).
const GOALS_WORDS = {
  lead: (first: number, last: number) => thirdPerson(goalsLead(first, last)),
  comparedToFirst: thirdPerson(COMPARED_TO_FIRST_GOALS),
}
const stepGridName = (date: string) => thirdPerson(stepGridLabel(date))

export function ExampleEvolution() {
  const [view] = useState(exampleEvolution)
  // C2, as the real screen: on a computer the grid snapshot by snapshot fills the left column.
  const desktop = useIsDesktop()
  const steps = desktop && view.kind === 'history' ? view.steps : null
  return (
    <PageColumns
      aside={
        <>
          <Link href={EXAMPLE_HOME} className={BACK}>
            ‹ Mon argent
          </Link>
          <h1 className={TITLE}>{EVOLUTION_TITLE}</h1>
          {steps ? (
            <section aria-label={thirdPerson(STEPS_TITLE)} className="mt-6 flex flex-col gap-3">
              <h2 className="text-subtitle font-semibold">{thirdPerson(STEPS_TITLE)}</h2>
              <SnapshotSteps steps={steps} gridLabelOf={stepGridName} />
            </section>
          ) : null}
        </>
      }
    >
      {/* The person is written with four snapshots over a year (tested): a history, with its curve. */}
      {view.kind === 'history' ? (
        <ExampleDisplayMode>
          <History view={view} stepsAside={steps !== null} />
        </ExampleDisplayMode>
      ) : null}
    </PageColumns>
  )
}

// The site's section titles (« Tes relevés »), of the person (« Ses relevés »).
function Section({ title: siteTitle, children }: { title: string; children: ReactNode }) {
  const title = thirdPerson(siteTitle)
  return (
    <section aria-label={title} className="mt-6 flex flex-col gap-3 border-t border-hairline pt-5">
      <h2 className="text-subtitle font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function History({ view, stepsAside }: { view: Extract<ReturnType<typeof exampleEvolution>, { kind: 'history' }>; stepsAside: boolean }) {
  const { sinceFirst } = view
  return (
    <div className="flex flex-col">
      <p className="mt-1 text-caption text-ink-muted">{view.dateLabel}</p>
      <Section title={EVOLUTION_SINCE_FIRST}>
        <p data-testid="since-first" className="text-hero font-semibold leading-tight hero-figure text-ink">
          {sinceFirst.percent !== null ? <Figure quiet euros={sinceFirst.euros} percent={sinceFirst.percent} /> : sinceFirst.euros}{' '}
          {/* On a line of its own: longer than the site's « sur ce qui est à toi », it would break
              in the middle of the hero's tall line. */}
          <small className="block text-body leading-relaxed font-normal tracking-normal text-ink-soft">{ON_THE_PERSON}</small>
        </p>
        {sinceFirst.squareThen !== null && sinceFirst.squareNow !== null ? (
          <p className={SENTENCE}>{sinceSquare(sinceFirst.squareThen, sinceFirst.squareNow, sinceFirst.firstLabel)}</p>
        ) : null}
      </Section>

      {view.curve === 'chart' ? (
        <Section title={CURVE_TITLE}>
          <EvolutionChart points={view.points} nextCap={view.nextCap} label={thirdPerson(CURVE_LABEL)} />
          {view.capSentence ? <p className="text-caption text-ink-muted">{view.capSentence}</p> : null}
        </Section>
      ) : null}

      {view.steps && !stepsAside ? (
        <Section title={STEPS_TITLE}>
          <SnapshotSteps steps={view.steps} gridLabelOf={stepGridName} />
        </Section>
      ) : null}

      {view.goals ? (
        <Section title={GOALS_TITLE}>
          <GoalsHistory goals={view.goals} words={GOALS_WORDS} />
        </Section>
      ) : null}

      <Section title={COMES_FROM_TITLE}>
        <p className="text-caption text-ink-muted">{thirdPerson(COMES_FROM_NOTE)}</p>
        <ChangeSplit split={view.split} />
      </Section>

      <Section title={STATEMENTS_TITLE}>
        <ul className="flex flex-col">
          {view.snapshots.map((s) => (
            <li key={s.id} className="grid grid-cols-[1fr_auto_auto] gap-4 border-t border-hairline py-3 text-body first:border-t-0">
              <span>{s.date}</span>
              <span className="tabular-nums">{s.net}</span>
              <span className="min-w-24 text-right text-ink-muted">{s.squareValue ?? NO_SQUARE_VALUE}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
