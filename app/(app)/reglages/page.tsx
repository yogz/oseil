'use client'

import Link from 'next/link'
import { useState } from 'react'
import { RecoveryKey } from '@/components/account/RecoveryKey'
import { SignOutFrame } from '@/components/account/SignOutFrame'
import { FILL } from '@/components/money/HundredSquares'
import { AccountSection } from '@/components/settings/AccountSection'
import { BanksSection } from '@/components/settings/BanksSection'
import { DataSection } from '@/components/settings/DataSection'
import { DisplaySection } from '@/components/settings/DisplaySection'
import { ReminderSection } from '@/components/settings/ReminderSection'
import { SECTION, SECTION_TITLE, SENTENCE, TITLE_LINK } from '@/components/settings/styles'
import { FOCUS } from '@/components/setup/styles'
import { Button } from '@/components/ui/Button'
import { FindCorner } from '@/components/ui/FindLink'
import { PageColumns } from '@/components/ui/PageColumns'
import { TabBar } from '@/components/ui/TabBar'
import { useMenuFromModel } from '@/components/ui/use-menu-from-model'
import { VaultWait } from '@/components/ui/VaultWait'
import { useModel, type Model, type ModelState } from '@/lib/app/use-model'
import { useScrollToAnchor } from '@/lib/app/use-scroll-to-anchor'
import { GOAL_CATEGORIES, GOAL_COLOR, GOAL_LABELS } from '@/lib/catalog'
import { todayIso } from '@/lib/dates'
import { formatEurosShown, formatWholePercent } from '@/lib/format'
import { cushionGoalText } from '@/lib/screens/words'
import { SETTINGS_ANCHORS } from '@/lib/screens/find-words'
import { goalInEffect } from '@/lib/model/goals'
import { shownGoalCategories } from '@/lib/setup/goals-editor'
import {
  BACK_TO_MONEY,
  GOALS_HREF,
  GOALS_NONE,
  GOALS_TITLE,
  LOAD_FAILED,
  RETRY,
  SETTINGS,
  SETTINGS_UNREADABLE,
  SPENDING_HREF,
  SPENDING_NONE,
  SALARY_TITLE,
  SPENDING_TITLE,
} from '@/lib/screens/settings-words'
import { confirmRecoveryKeySeen } from '@/lib/vault/store'

const BACK = `inline-flex min-h-11 items-center self-start text-body text-ink-soft ${FOCUS}`
const TITLE = 'pt-2 text-title font-semibold leading-tight tracking-[-0.01em]'

type Ready = Extract<ModelState, { status: 'ready' }>

const ANCHORS = Object.values(SETTINGS_ANCHORS)

export default function SettingsPage() {
  const state = useModel()
  useMenuFromModel(state)
  // « Trouver » leads to a section by its anchor; the sections come after the vault's wait.
  useScrollToAnchor(state.status === 'ready', ANCHORS)
  return (
    // « Se déconnecter » lives here, under the settings; the tabs stay at the bottom, as everywhere.
    // The title stays in the aside whatever happens below it, a key that could not be erased included.
    <PageColumns
      aside={
        <>
          <FindCorner>
            <Link href="/" className={BACK}>
              {BACK_TO_MONEY}
            </Link>
          </FindCorner>
          <h1 className={TITLE}>{SETTINGS}</h1>
        </>
      }
    >
    <SignOutFrame after={<TabBar />}>
      {state.status === 'loading' ? <VaultWait phase="open" /> : null}
      {state.status === 'ready' ? <ReadyBody state={state} /> : null}
      {state.status === 'failed' || state.status === 'unavailable' ? (
        <div className="mt-4 flex flex-col gap-4">
          <p role="alert" className={SENTENCE}>
            {LOAD_FAILED}
          </p>
          <Button variant="secondary" onClick={state.retry}>
            {RETRY}
          </Button>
        </div>
      ) : null}
    </SignOutFrame>
    </PageColumns>
  )
}

function ReadyBody({ state }: { state: Ready }) {
  // The new recovery key is shown once and replaces the page until the person has put it aside.
  const [recovery, setRecovery] = useState<string | null>(null)
  const [recoveryDone, setRecoveryDone] = useState(false)

  if (recovery !== null) {
    return (
      <div className="mt-4">
        <RecoveryKey
          display={recovery}
          subtitle
          onContinue={async () => {
            await confirmRecoveryKeySeen(state.client, recovery)
            setRecovery(null)
            setRecoveryDone(true)
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <GoalsRow model={state.model} />
      <SpendingRow model={state.model} />
      <BanksSection state={state} />
      <DisplaySection state={state} />
      <DataSection state={state} />
      <ReminderSection client={state.client} />
      <AccountSection client={state.client} onRecoveryKey={setRecovery} recoveryDone={recoveryDone} />
    </div>
  )
}

// The split of the goal in force as one small bar, a segment per category as wide as its share. A goal in
// months (docs/superpowers/specs/2026-11-11-coussin-objectif-design.md) says the available money in months,
// never « 0 % », and the bar holds the other shares, parts of what the cushion leaves.
function GoalsRow({ model }: { model: Model }) {
  const goal = goalInEffect(
    model.goals.map((g) => g.value),
    todayIso(),
  )
  const budget = model.settings?.value.budget ?? null
  const months = goal?.cushionMonths
  const cushion =
    months === undefined
      ? null
      : budget && budget.monthly > 0
        ? cushionGoalText({ months, euros: formatEurosShown(months * budget.monthly), basis: budget.basis })
        : `${String(months).replace('.', ',')}\u00A0mois`
  const shown = goal ? shownGoalCategories(goal.shares).filter((c) => !(cushion && c === 'available')) : []
  const label = goal
    ? [
        ...(cushion ? [`${GOAL_LABELS.available} ${cushion}`] : []),
        ...shown.map((c) => `${GOAL_LABELS[c]} ${formatWholePercent(goal.shares[c])}`),
      ].join(', ')
    : null
  return (
    <section id={SETTINGS_ANCHORS.goals} aria-label={GOALS_TITLE} className={`relative ${SECTION}`}>
      <TitleLink title={GOALS_TITLE} href={GOALS_HREF} />
      {goal && label ? (
        <>
          <div role="img" aria-label={`${GOALS_TITLE}\u00A0: ${label}`} className="flex h-1.5 overflow-hidden rounded-square">
            {GOAL_CATEGORIES.filter((c) => goal.shares[c] > 0).map((c) => (
              <span key={c} data-part="share" className={`h-full ${FILL[GOAL_COLOR[c]]}`} style={{ width: `${goal.shares[c]}%` }} />
            ))}
          </div>
          {/* The same shares, written: the bar alone does not say « or 5 % ». VoiceOver reads the bar's name. */}
          <ul aria-hidden="true" className="flex flex-col gap-1">
            {cushion ? (
              <li className="flex items-center gap-2 text-caption text-ink-soft">
                <span className={`size-square-s shrink-0 rounded-square ${FILL.available}`} />
                <span className="flex-1">{GOAL_LABELS.available}</span>
                <span className="tabular-nums">{cushion}</span>
              </li>
            ) : null}
            {shown.map((c) => (
              <li key={c} className="flex items-center gap-2 text-caption text-ink-soft">
                <span className={`size-square-s shrink-0 rounded-square ${FILL[GOAL_COLOR[c]]}`} />
                <span className="flex-1">{GOAL_LABELS[c]}</span>
                <span className="tabular-nums">{formatWholePercent(goal.shares[c])}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className={SENTENCE}>{GOALS_NONE}</p>
      )}
    </section>
  )
}

function SpendingRow({ model }: { model: Model }) {
  const budget = model.settings?.value.budget ?? null
  const title = budget?.basis === 'salary' ? SALARY_TITLE : SPENDING_TITLE
  return (
    <section id={SETTINGS_ANCHORS.spending} aria-label={title} className={`relative ${SECTION}`}>
      <TitleLink title={title} href={SPENDING_HREF} />
      {model.unreadable.settings > 0 ? (
        <p role="alert" className={SENTENCE}>
          {SETTINGS_UNREADABLE}
        </p>
      ) : budget ? (
        <>
          <p className="text-subtitle font-semibold tabular-nums text-ink">{formatEurosShown(budget.monthly)}</p>
        </>
      ) : (
        <p className={SENTENCE}>{SPENDING_NONE}</p>
      )}
    </section>
  )
}

// Planche 3B (chosen by Nicolas on 12 November 2026): the title opens the screen, « Mes objectifs › », and no
// « Modifier » row under it. The heading holds the link, so the link is named by the title alone; its
// after-layer stretches over the whole section (`relative`), so the bar, the legend or the amount open it too.
function TitleLink({ title, href }: { title: string; href: string }) {
  return (
    <h2 className={SECTION_TITLE}>
      <Link href={href} className={TITLE_LINK}>
        {title}
        <span aria-hidden="true" className="font-normal text-ink-muted">
          ›
        </span>
      </Link>
    </h2>
  )
}
