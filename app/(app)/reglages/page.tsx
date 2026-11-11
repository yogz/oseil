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
import { NOTE, ROW_LINK, SECTION, SECTION_TITLE, SENTENCE } from '@/components/settings/styles'
import { FOCUS } from '@/components/setup/styles'
import { Button } from '@/components/ui/Button'
import { PageColumns } from '@/components/ui/PageColumns'
import { TabBar } from '@/components/ui/TabBar'
import { useMenuFromModel } from '@/components/ui/use-menu-from-model'
import { VaultWait } from '@/components/ui/VaultWait'
import { useModel, type Model, type ModelState } from '@/lib/app/use-model'
import { GOAL_CATEGORIES, GOAL_COLOR, GOAL_LABELS } from '@/lib/catalog'
import { todayIso } from '@/lib/dates'
import { formatEurosShown, formatWholePercent } from '@/lib/format'
import { cushionGoalText } from '@/lib/screens/words'
import { goalInEffect } from '@/lib/model/goals'
import { shownGoalCategories } from '@/lib/setup/goals-editor'
import {
  BACK_TO_MONEY,
  CHANGE,
  GOALS_HREF,
  GOALS_NONE,
  GOALS_TITLE,
  LOAD_FAILED,
  RETRY,
  SETTINGS,
  SETTINGS_UNREADABLE,
  SPENDING_EXPENSES,
  SPENDING_HREF,
  SPENDING_NONE,
  SPENDING_SALARY,
  SPENDING_TITLE,
} from '@/lib/screens/settings-words'
import { confirmRecoveryKeySeen } from '@/lib/vault/store'

const BACK = `inline-flex min-h-11 items-center self-start text-body text-ink-soft ${FOCUS}`
const TITLE = 'pt-2 text-title font-semibold leading-tight tracking-[-0.01em]'

type Ready = Extract<ModelState, { status: 'ready' }>

export default function SettingsPage() {
  const state = useModel()
  useMenuFromModel(state)
  return (
    // « Se déconnecter » lives here, under the settings; the tabs stay at the bottom, as everywhere.
    // The title stays in the aside whatever happens below it, a key that could not be erased included.
    <PageColumns
      aside={
        <>
          <Link href="/" className={BACK}>
            {BACK_TO_MONEY}
          </Link>
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
    <section aria-label={GOALS_TITLE} className={SECTION}>
      <h2 className={SECTION_TITLE}>{GOALS_TITLE}</h2>
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
      <Link href={GOALS_HREF} className={ROW_LINK}>
        {CHANGE}
        <span aria-hidden="true" className="text-ink-muted">
          ›
        </span>
      </Link>
    </section>
  )
}

function SpendingRow({ model }: { model: Model }) {
  const budget = model.settings?.value.budget ?? null
  return (
    <section aria-label={SPENDING_TITLE} className={SECTION}>
      <h2 className={SECTION_TITLE}>{SPENDING_TITLE}</h2>
      {model.unreadable.settings > 0 ? (
        <p role="alert" className={SENTENCE}>
          {SETTINGS_UNREADABLE}
        </p>
      ) : budget ? (
        <>
          <p className="text-subtitle font-semibold tabular-nums text-ink">{formatEurosShown(budget.monthly)}</p>
          <p className={NOTE}>{budget.basis === 'expenses' ? SPENDING_EXPENSES : SPENDING_SALARY}</p>
        </>
      ) : (
        <p className={SENTENCE}>{SPENDING_NONE}</p>
      )}
      <Link href={SPENDING_HREF} className={ROW_LINK}>
        {CHANGE}
        <span aria-hidden="true" className="text-ink-muted">
          ›
        </span>
      </Link>
    </section>
  )
}
